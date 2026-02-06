import { describe, it, expect } from 'vitest'

const enabled = process.env.CI_SENDGRID_CHECK === 'true'

    ; (enabled ? describe : describe.skip)('SendGrid configuration (CI gated)', () => {
        it('has SENDGRID_API_KEY and SENDER_EMAIL', () => {
            expect(process.env.SENDGRID_API_KEY, 'SENDGRID_API_KEY must be present').toBeDefined()
            expect(process.env.SENDGRID_API_KEY!.length, 'SENDGRID_API_KEY looks too short').toBeGreaterThan(20)
            expect(process.env.SENDER_EMAIL, 'SENDER_EMAIL must be present').toBeDefined()
            expect(process.env.SENDER_EMAIL, 'SENDER_EMAIL should include an @').toMatch(/@/)
        })
    })
