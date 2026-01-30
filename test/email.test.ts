import { describe, it, expect, vi } from 'vitest'
import { sendInviteEmail } from '../src/email'

describe('sendInviteEmail', () => {
    it('logs invite URL when no SENDGRID_API_KEY', async () => {
        delete process.env.SENDGRID_API_KEY
        const spy = vi.spyOn(console, 'log').mockImplementation(() => { })
        await sendInviteEmail('test@example.com', 'the-token')
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Invite for test@example.com:'))
        spy.mockRestore()
    })
})