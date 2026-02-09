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
    const supportEmail = process.env.SUPPORT_EMAIL ?? 'support@bryandebaun.dev'

    // Preheader visible in inbox preview; include as hidden text in HTML
    const preheader = 'Use this link to sign in to MCP Server — expires in 15 minutes.'

    if (sendgridKey) {
        const html = `<!doctype html>
        <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <span style="display:none;line-height:1px;color:#fff;opacity:0;height:0;width:0;overflow:hidden;visibility:hidden;">${preheader}</span>
          <div style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Liberation Sans', sans-serif;">
            <h2 style="color:#111">Sign in to MCP Server</h2>
            <p style="color:#333">Click the button below to sign in. The link expires in 15 minutes. If you did not request this, you can ignore this email or contact support.</p>
            <p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#1a73e8;color:#fff;border-radius:6px;text-decoration:none">Sign in</a></p>
            <p style="color:#666;font-size:13px">If the button does not work, copy and paste this URL into your browser:<br/><a href="${url}">${url}</a></p>
            <hr />
            <p style="color:#999;font-size:12px">Sent by MCP Server. Need help? <a href="mailto:${supportEmail}">Contact support</a>.</p>
          </div>
        </body>
        </html>`

        const text = `Sign in to MCP Server\n\nUse this link to sign in (expires in 15 minutes): ${url}\n\nIf you did not request this email, you can ignore it or contact ${supportEmail}.`

        // Respect env override to disable click tracking if needed (useful for tests or preview)
        const clickTrackingEnabled = (process.env.SENDGRID_CLICK_TRACKING ?? 'true') !== 'false'

        const payload: any = {
            personalizations: [{ to: [{ email }], subject: 'Sign in to MCP Server' }],
            from: { email: from },
            reply_to: { email: supportEmail },
            headers: {
                'List-Unsubscribe': `<mailto:${supportEmail}>`
            },
            content: [
                { type: 'text/plain', value: text },
                { type: 'text/html', value: html }
            ],
            tracking_settings: {
                click_tracking: { enable: clickTrackingEnabled, enable_text: false }
            }
        }

        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })

        if (!res.ok) {
            const text = await res.text().catch(() => '')
            // Provide actionable error message for 401/403
            if (res.status === 401 || res.status === 403) {
                throw new Error(`SendGrid ${res.status} — API key not authorized to send mail or sender not verified: ${text}`)
            }
            throw new Error(`SendGrid error ${res.status}: ${text}`)
        }

        return
    }

    // Fallback: log magic link (safe dev behavior)
    console.log(`Magic link for ${email}: ${url}`)
}