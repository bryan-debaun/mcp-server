export async function sendInviteEmail(email: string, token: string) {
    const inviteBase = process.env.INVITE_BASE_URL ?? 'http://localhost:3000'
    const inviteUrl = `${inviteBase}/accept?token=${token}`

    const sendgridKey = process.env.SENDGRID_API_KEY
    if (sendgridKey) {
        const from = process.env.FROM_EMAIL ?? 'noreply@example.com'
        const payload = {
            personalizations: [{ to: [{ email }], subject: 'You are invited' }],
            from: { email: from },
            content: [{ type: 'text/plain', value: `You were invited to MCP Server. Accept: ${inviteUrl}` }]
        }

        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })

        if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new Error(`SendGrid error ${res.status}: ${text}`)
        }

        return
    }

    // Default to a safe dev-mode behavior: log the invite URL so it's easy to copy.
    // This avoids adding a production email provider to local dev/test.
    // Tests assert that this logging happens when SENDGRID_API_KEY is not present.
    console.log(`Invite for ${email}: ${inviteUrl}`)
}

export async function sendMagicLinkEmail(email: string, token: string) {
    const base = process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:3000'
    const url = `${base}/auth/magic-link/verify?token=${encodeURIComponent(token)}`

    const sendgridKey = process.env.SENDGRID_API_KEY
    const from = process.env.SENDER_EMAIL ?? process.env.FROM_EMAIL ?? 'no-reply@example.com'

    if (sendgridKey) {
        const payload = {
            personalizations: [{ to: [{ email }], subject: 'Sign in to MCP Server' }],
            from: { email: from },
            content: [{ type: 'text/plain', value: `Sign in: ${url}` }]
        }

        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })

        if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new Error(`SendGrid error ${res.status}: ${text}`)
        }

        return
    }

    // Fallback: log magic link
    console.log(`Magic link for ${email}: ${url}`)
}