import { prisma } from '../db/index.js'
import crypto from 'crypto'

export async function listUsers() {
    return prisma.user.findMany({ include: { role: true } })
}

export async function createInvite(email: string, invitedBy?: number) {
    const token = crypto.randomBytes(24).toString('hex')
    const invite = await prisma.invite.create({ data: { email, token, invitedBy } })
    return invite
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
