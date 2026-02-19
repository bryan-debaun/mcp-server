import { prisma } from '../db/index.js'
import crypto from 'crypto'
import { invitesCreatedTotal, invitesAcceptedTotal } from '../http/metrics-route.js'

export async function listUsers() {
    return prisma.profile.findMany({ include: { role: true } })
}

export async function createInvite(email: string, invitedBy?: number) {
    const token = crypto.randomBytes(24).toString('hex')
    const ttlHours = process.env.INVITE_TTL_HOURS ? Number(process.env.INVITE_TTL_HOURS) : undefined
    const expiresAt = ttlHours ? new Date(Date.now() + ttlHours * 3600 * 1000) : undefined
    const invite = await prisma.invite.create({ data: { email, token, invitedBy, expiresAt } })

    // Observability
    try { invitesCreatedTotal.inc() } catch (e) { /* noop for tests */ }
    console.error(`invite created for ${email} (id=${invite.id})`)

    return invite
}

export async function acceptInvite(token: string, opts?: { name?: string, password?: string }) {
    const invite = await prisma.invite.findUnique({ where: { token } })
    if (!invite) throw new Error('invalid token')
    if (invite.accepted) throw new Error('already accepted')
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
        await prisma.auditLog.create({ data: { action: 'accept-invite-expired', metadata: { inviteId: invite.id } } })
        throw new Error('expired token')
    }

    // Prevent duplicate users
    const existing = await prisma.profile.findUnique({ where: { email: invite.email } })
    if (existing) throw new Error('user already exists')

    // Optional Supabase provisioning path (prefer PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY)
    let supabaseId: string | undefined
    const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseKey) {
        const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_ISS
        if (!supabaseUrl) throw new Error('PUBLIC_SUPABASE_URL or SUPABASE_ISS missing')
        try {
            const res = await fetch(`${String(supabaseUrl).replace(/\/$/, '')}/auth/v1/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}`, apikey: supabaseKey },
                body: JSON.stringify({ email: invite.email, password: opts?.password, user_metadata: { name: opts?.name }, email_confirm: true })
            })
            if (!res.ok) {
                const txt = await res.text()
                await prisma.auditLog.create({ data: { action: 'accept-invite-supabase-failed', metadata: { inviteId: invite.id, reason: txt } } })
                throw new Error('supabase provisioning failed')
            }

            // If Supabase created the user, capture the external id to link local record
            try {
                const body: any = await res.json().catch(() => null)
                supabaseId = body?.id
            } catch (e) { /* ignore */ }
        } catch (err) {
            console.error('supabase provisioning error', err)
            throw err
        }
    }

    // Create local user and set default role
    let role = await prisma.role.findUnique({ where: { name: 'user' } })
    if (!role) role = await prisma.role.create({ data: { name: 'user' } })

    const user = await prisma.profile.create({ data: { email: invite.email, name: opts?.name, roleId: role.id, external_id: supabaseId ?? null } })

    await prisma.invite.update({ where: { id: invite.id }, data: { accepted: true, acceptedAt: new Date() } })

    await prisma.auditLog.create({ data: { action: 'accept-invite', metadata: { inviteId: invite.id, userId: user.id } } })

    try { invitesAcceptedTotal.inc() } catch (e) { /* noop for tests */ }
    console.error(`invite accepted for ${invite.email} (inviteId=${invite.id} userId=${user.id})`)

    return user
}

export async function registerUser(email: string, name?: string, password?: string) {
    // Prevent duplicate users
    const existing = await prisma.profile.findUnique({ where: { email } })
    if (existing) throw new Error('user already exists')

    // Optional Supabase provisioning if a password is provided (prefers SUPABASE_SECRET_KEY)
    let supabaseId: string | undefined
    if (password) {
        const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseKey) throw new Error('password not supported')
        const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_ISS
        if (!supabaseUrl) throw new Error('PUBLIC_SUPABASE_URL or SUPABASE_ISS missing')
        try {
            const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}`, apikey: supabaseKey },
                body: JSON.stringify({ email, password, user_metadata: { name }, email_confirm: true })
            })
            if (!res.ok) {
                const txt = await res.text()
                await prisma.auditLog.create({ data: { action: 'register-supabase-failed', metadata: { email, reason: txt } } })
                throw new Error('supabase provisioning failed')
            }

            try { const body: any = await res.json().catch(() => null); supabaseId = body?.id } catch (e) { /* noop */ }
        } catch (err) {
            console.error('supabase provisioning error', err)
            throw err
        }
    }

    let role = await prisma.role.findUnique({ where: { name: 'user' } })
    if (!role) role = await prisma.role.create({ data: { name: 'user' } })

    const user = await prisma.profile.create({ data: { email, name, roleId: role.id, external_id: supabaseId ?? null } })

    await prisma.auditLog.create({ data: { action: 'register-user', metadata: { email, userId: user.id } } })

    return user
}

export async function setUserRole(userId: number, roleName: string, actorId?: number) {
    let role = await prisma.role.findUnique({ where: { name: roleName } })
    if (!role) {
        role = await prisma.role.create({ data: { name: roleName } })
    }

    const user = await prisma.profile.update({ where: { id: userId }, data: { roleId: role.id } })

    await prisma.auditLog.create({ data: { action: 'set-role', actorId, actor: undefined as any, metadata: { userId, role: roleName } } })

    return user
}

export async function setUserBlocked(userId: number, blocked: boolean, actorId?: number) {
    const user = await prisma.profile.update({ where: { id: userId }, data: { blocked } })
    await prisma.auditLog.create({ data: { action: 'set-blocked', actorId, metadata: { userId, blocked } } })
    return user
}

export async function deleteUser(userId: number, actorId?: number, opts?: { hard?: boolean }) {
    if (opts?.hard) {
        // Attempt hard delete; may fail due to FK constraints in which case caller should handle/report
        await prisma.profile.delete({ where: { id: userId } })
        await prisma.auditLog.create({ data: { action: 'delete-user', actorId, metadata: { userId, hard: true } } })
        return { success: true }
    }

    // Soft-delete by default: anonymize and mark blocked and deletedAt
    const timestamp = new Date()
    const anonEmail = `deleted-${userId}-${timestamp.getTime()}@deleted.local`
    await prisma.profile.update({ where: { id: userId }, data: { blocked: true, deletedAt: timestamp, email: anonEmail, name: null, external_id: null } })
    await prisma.auditLog.create({ data: { action: 'delete-user', actorId, metadata: { userId, hard: false } } })
    return { success: true }
}

export async function listAccessRequests() {
    return prisma.accessRequest.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function approveAccessRequest(id: number, reviewerId: number) {
    const ar = await prisma.accessRequest.update({ where: { id }, data: { reviewed: true, reviewerId, reviewedAt: new Date() } })
    await prisma.auditLog.create({ data: { action: 'approve-access-request', actorId: reviewerId, metadata: { accessRequestId: id } } })
    return ar
}
