import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendInviteEmail, sendMagicLinkEmail } from '../src/email.js'

beforeEach(() => {
    delete process.env.SENDGRID_API_KEY
    delete process.env.SENDER_EMAIL
})

describe('sendInviteEmail', () => {
    it('logs invite URL when no SENDGRID_API_KEY', async () => {
        delete process.env.SENDGRID_API_KEY
        const spy = vi.spyOn(console, 'log').mockImplementation(() => { })
        await sendInviteEmail('test@example.com', 'the-token')
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Invite for test@example.com:'))
        spy.mockRestore()
    })
})

describe('sendMagicLinkEmail', () => {
    it('sends HTML and text payload when SENDGRID_API_KEY is set', async () => {
        process.env.SENDGRID_API_KEY = 'SG.test'
        process.env.SENDER_EMAIL = 'no-reply@bryandebaun.dev'
        process.env.SENDER_NAME = 'BryanDeBaunDev'
        process.env.SUPPORT_EMAIL = 'support@bryandebaun.dev'

        const fakeRes = { ok: true, status: 202, text: async () => '' }
        const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(fakeRes as any)

        await sendMagicLinkEmail('u@example.com', 'tkn', 'https://preview.bryandebaun.dev')

        expect(fetchSpy).toHaveBeenCalled()
        const call = fetchSpy.mock.calls[0]
        const body = JSON.parse(call[1].body)
        // has both text/plain and text/html
        const types = body.content.map((c: any) => c.type)
        expect(types).toContain('text/plain')
        expect(types).toContain('text/html')
        expect(body.personalizations[0].to[0].email).toBe('u@example.com')
        expect(body.from.email).toBe('no-reply@bryandebaun.dev')
        expect(body.from.name).toBe('BryanDeBaunDev')
        expect(body.tracking_settings).toBeDefined()

        fetchSpy.mockRestore()
    })
})