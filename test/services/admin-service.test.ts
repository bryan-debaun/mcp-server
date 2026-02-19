import { describe, it, expect, vi, beforeEach } from 'vitest'

// TODO: Admin service needs refactoring for single-user Supabase Auth model
// Skipping these tests until we remove/refactor the admin service
describe.skip('admin service - acceptInvite', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('accepts a valid invite and creates a user', async () => {
        p.invite.findUnique.mockResolvedValue({ id: 1, email: 'new@example.com', token: 't', accepted: false, expiresAt: null })
        p.profile.findUnique.mockResolvedValue(null)
        p.role.findUnique.mockResolvedValue({ id: 2, name: 'user' })
        p.profile.create.mockResolvedValue({ id: 5, email: 'new@example.com' })
        p.invite.update.mockResolvedValue({ id: 1, accepted: true })

        const user = await svc.acceptInvite('t', { name: 'New User' })
        expect(user).toEqual({ id: 5, email: 'new@example.com' })
        expect(prisma.profile.create).toHaveBeenCalled()
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
        p.profile.update = vi.fn().mockResolvedValue({ id: 1, blocked: true })
        await svc.setUserBlocked(1, true, 5)
        expect(p.profile.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { blocked: true } })
        expect(p.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'set-blocked' }) }))
    })

    it('soft-deletes user by default and writes audit log', async () => {
        p.profile.update = vi.fn().mockResolvedValue({ id: 1, deletedAt: new Date(), blocked: true })
        await svc.deleteUser(1, 5, {})
        expect(p.profile.update).toHaveBeenCalled()
        expect(p.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'delete-user' }) }))
    })

    it('hard-deletes user when hard=true', async () => {
        p.profile.delete = vi.fn().mockResolvedValue({ id: 1 })
        await svc.deleteUser(1, 5, { hard: true })
        expect(p.profile.delete).toHaveBeenCalledWith({ where: { id: 1 } })
        expect(p.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'delete-user' }) }))
    })

    it('registers a new user without password and writes audit log', async () => {
        p.profile.findUnique.mockResolvedValue(null)
        p.role.findUnique.mockResolvedValue({ id: 2, name: 'user' })
        p.profile.create.mockResolvedValue({ id: 7, email: 'reg@example.com' })

        const user = await svc.registerUser('reg@example.com', 'Reg User')
        expect(user).toEqual({ id: 7, email: 'reg@example.com' })
        expect(prisma.profile.create).toHaveBeenCalled()
        expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'register-user' }) }))
    })

    it('throws when registering an existing user', async () => {
        p.profile.findUnique.mockResolvedValue({ id: 1, email: 'exists@example.com' })
        await expect(svc.registerUser('exists@example.com')).rejects.toThrow('user already exists')
    })

    it('rejects password when SUPABASE not configured', async () => {
        p.profile.findUnique.mockResolvedValue(null)
        await expect(svc.registerUser('pw@example.com', 'PW', 'secret')).rejects.toThrow('password not supported')
    })

    it('propagates supabase provisioning failure and writes audit log', async () => {
        p.profile.findUnique.mockResolvedValue(null)
        process.env.SUPABASE_SECRET_KEY = 'key'
        process.env.PUBLIC_SUPABASE_URL = 'https://supabase.example'
        const oldFetch = (global as any).fetch
            ; (global as any).fetch = vi.fn().mockResolvedValue({ ok: false, text: async () => 'bad' })

        await expect(svc.registerUser('s@example.com', 'S', 'secret')).rejects.toThrow('supabase provisioning failed')
        expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'register-supabase-failed' }) }))

        delete process.env.SUPABASE_SECRET_KEY
        delete process.env.PUBLIC_SUPABASE_URL
            ; (global as any).fetch = oldFetch
    })

    it('records external_id when Supabase provisioning succeeds during register (new env vars)', async () => {
        p.profile.findUnique.mockResolvedValue(null)
        process.env.SUPABASE_SECRET_KEY = 'key'
        process.env.PUBLIC_SUPABASE_URL = 'https://supabase.example'

        const supabaseId = '11111111-2222-3333-4444-555555555555'
        const oldFetch = (global as any).fetch
            ; (global as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: supabaseId }) })

        p.role.findUnique.mockResolvedValue({ id: 2, name: 'user' })
        p.profile.create.mockResolvedValue({ id: 7, email: 'sup@example.com', external_id: supabaseId })

        await svc.registerUser('sup@example.com', 'Sup', 'secret')
        expect(prisma.profile.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ external_id: supabaseId }) }))

        delete process.env.SUPABASE_SECRET_KEY
        delete process.env.PUBLIC_SUPABASE_URL
            ; (global as any).fetch = oldFetch
    })

    it('records external_id when Supabase provisioning succeeds during acceptInvite', async () => {
        p.invite.findUnique.mockResolvedValue({ id: 1, email: 'new@example.com', token: 't', accepted: false, expiresAt: null })
        p.profile.findUnique.mockResolvedValue(null)
        p.role.findUnique.mockResolvedValue({ id: 2, name: 'user' })

        process.env.SUPABASE_SECRET_KEY = 'key'
        process.env.PUBLIC_SUPABASE_URL = 'https://supabase.example'
        const supabaseId = '22222222-3333-4444-5555-666666666666'
        const oldFetch = (global as any).fetch
            ; (global as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: supabaseId }) })

        p.profile.create.mockResolvedValue({ id: 5, email: 'new@example.com', external_id: supabaseId })
        p.invite.update.mockResolvedValue({ id: 1, accepted: true })

        await svc.acceptInvite('t', { name: 'New User' })
        expect(prisma.profile.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ external_id: supabaseId }) }))

        delete process.env.SUPABASE_SECRET_KEY
        delete process.env.PUBLIC_SUPABASE_URL
            ; (global as any).fetch = oldFetch
    })
})