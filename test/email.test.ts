import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendInviteEmail, sendMagicLinkEmail } from '../src/email.js'
import { config } from '../src/config.js'

const origSendgridKey = config.email.sendgridApiKey
const origSenderEmail = config.email.senderEmail
const origSenderName = config.email.senderName
const origSupportEmail = config.email.supportEmail

beforeEach(() => {
    config.email.sendgridApiKey = undefined
    config.email.senderEmail = undefined
})

afterEach(() => {
    config.email.sendgridApiKey = origSendgridKey
    config.email.senderEmail = origSenderEmail
    config.email.senderName = origSenderName
    config.email.supportEmail = origSupportEmail
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
        config.email.sendgridApiKey = 'SG.test'
        config.email.senderEmail = 'no-reply@bryandebaun.dev'
        config.email.senderName = 'BryanDeBaunDev'
        config.email.supportEmail = 'support@bryandebaun.dev'

        const fakeRes = { ok: true, status: 202, text: async () => '' }
        const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(fakeRes as any)

        await sendMagicLinkEmail('u@example.com', 'tkn', 'https://preview.bryandebaun.dev')

        expect(fetchSpy).toHaveBeenCalled()
        const call = (fetchSpy.mock as any).calls[0]
        const body = JSON.parse((call[1] as any).body)
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