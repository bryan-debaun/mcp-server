import { prisma } from '../db/index.js'
import crypto from 'crypto'
import { invitesCreatedTotal, invitesAcceptedTotal } from '../http/metrics-route.js'

export async function listUsers() {
    return prisma.user.findMany({ include: { role: true } })
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
    const existing = await prisma.user.findUnique({ where: { email: invite.email } })
    if (existing) throw new Error('user already exists')

    // Optional Supabase provisioning path
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseKey) {
        const supabaseUrl = process.env.SUPABASE_ISS
        if (!supabaseUrl) throw new Error('SUPABASE_ISS missing')
        try {
            const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
                body: JSON.stringify({ email: invite.email, password: opts?.password, user_metadata: { name: opts?.name }, email_confirm: true })
            })
            if (!res.ok) {
                const txt = await res.text()
                await prisma.auditLog.create({ data: { action: 'accept-invite-supabase-failed', metadata: { inviteId: invite.id, reason: txt } } })
                throw new Error('supabase provisioning failed')
            }
        } catch (err) {
            console.error('supabase provisioning error', err)
            throw err
        }
    }

    // Create local user and set default role
    let role = await prisma.role.findUnique({ where: { name: 'user' } })
    if (!role) role = await prisma.role.create({ data: { name: 'user' } })

    const user = await prisma.user.create({ data: { email: invite.email, name: opts?.name, roleId: role.id } })

    await prisma.invite.update({ where: { id: invite.id }, data: { accepted: true, acceptedAt: new Date() } })

    await prisma.auditLog.create({ data: { action: 'accept-invite', metadata: { inviteId: invite.id, userId: user.id } } })

    try { invitesAcceptedTotal.inc() } catch (e) { /* noop for tests */ }
    console.error(`invite accepted for ${invite.email} (inviteId=${invite.id} userId=${user.id})`)

    return user
}

export async function setUserRole(userId: number, roleName: string, actorId?: number) {
    let role = await prisma.role.findUnique({ where: { name: roleName } })
    if (!role) {
        role = await prisma.role.create({ data: { name: roleName } })
    }

    const user = await prisma.user.update({ where: { id: userId }, data: { roleId: role.id } })

    await prisma.auditLog.create({ data: { action: 'set-role', actorId, actor: undefined as any, metadata: { userId, role: roleName } } })

    return user
}

export async function listAccessRequests() {
    return prisma.accessRequest.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function approveAccessRequest(id: number, reviewerId: number) {
    const ar = await prisma.accessRequest.update({ where: { id }, data: { reviewed: true, reviewerId, reviewedAt: new Date() } })
    await prisma.auditLog.create({ data: { action: 'approve-access-request', actorId: reviewerId, metadata: { accessRequestId: id } } })
    return ar
}
