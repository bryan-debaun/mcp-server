import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma client used in admin-service
vi.mock('../../src/db', () => ({
    prisma: {
        invite: { findUnique: vi.fn(), update: vi.fn() },
        user: { findUnique: vi.fn(), create: vi.fn() },
        role: { findUnique: vi.fn(), create: vi.fn() },
        auditLog: { create: vi.fn() }
    }
}))

import * as svc from '../../src/services/admin-service'
import { prisma } from '../../src/db'
const p = prisma as any

describe('admin service - acceptInvite', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('accepts a valid invite and creates a user', async () => {
        p.invite.findUnique.mockResolvedValue({ id: 1, email: 'new@example.com', token: 't', accepted: false, expiresAt: null })
        p.user.findUnique.mockResolvedValue(null)
        p.role.findUnique.mockResolvedValue({ id: 2, name: 'user' })
        p.user.create.mockResolvedValue({ id: 5, email: 'new@example.com' })
        p.invite.update.mockResolvedValue({ id: 1, accepted: true })

        const user = await svc.acceptInvite('t', { name: 'New User' })
        expect(user).toEqual({ id: 5, email: 'new@example.com' })
        expect(prisma.user.create).toHaveBeenCalled()
        expect(prisma.invite.update).toHaveBeenCalledWith({ where: { id: 1 }, data: expect.objectContaining({ accepted: true }) })
        expect(prisma.auditLog.create).toHaveBeenCalled()
    })

    it('throws for invalid token', async () => {
        p.invite.findUnique.mockResolvedValue(null)
        await expect(svc.acceptInvite('nope')).rejects.toThrow('invalid token')
    })

    it('throws for already accepted', async () => {
        p.invite.findUnique.mockResolvedValue({ id: 1, email: 'new@example.com', token: 't', accepted: true })
        await expect(svc.acceptInvite('t')).rejects.toThrow('already accepted')
    })

    it('throws for expired invite', async () => {
        p.invite.findUnique.mockResolvedValue({ id: 1, email: 'new@example.com', token: 't', accepted: false, expiresAt: new Date(Date.now() - 1000) })
        await expect(svc.acceptInvite('t')).rejects.toThrow('expired token')
        expect(p.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'accept-invite-expired' }) }))
    })

    it('sets blocked flag and writes audit log', async () => {
        p.user.update = vi.fn().mockResolvedValue({ id: 1, blocked: true })
        await svc.setUserBlocked(1, true, 5)
        expect(p.user.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { blocked: true } })
        expect(p.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'set-blocked' }) }))
    })

    it('soft-deletes user by default and writes audit log', async () => {
        p.user.update = vi.fn().mockResolvedValue({ id: 1, deletedAt: new Date(), blocked: true })
        await svc.deleteUser(1, 5, {})
        expect(p.user.update).toHaveBeenCalled()
        expect(p.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'delete-user' }) }))
    })

    it('hard-deletes user when hard=true', async () => {
        p.user.delete = vi.fn().mockResolvedValue({ id: 1 })
        await svc.deleteUser(1, 5, { hard: true })
        expect(p.user.delete).toHaveBeenCalledWith({ where: { id: 1 } })
        expect(p.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'delete-user' }) }))
    })
})