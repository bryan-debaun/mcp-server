/*
Create a Supabase Auth user for a single local user and write the returned
`id` into `users.external_id`.

Usage:
  npx tsx scripts/create-supabase-user-for-local.ts brn.dbn@gmail.com

Requirements: PUBLIC_SUPABASE_URL (or SUPABASE_ISS) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
*/

import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config()
const envLocalPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envLocalPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envLocalPath))
    for (const [k, v] of Object.entries(parsed)) process.env[k] = String(v)
    console.error(`Loaded ${envLocalPath}`)
}

import { initPrisma, prisma } from '../src/db/index.js'

async function main() {
    const email = process.argv[2]
    if (!email) {
        console.error('Usage: npx tsx scripts/create-supabase-user-for-local.ts <email>')
        process.exit(2)
    }

    await initPrisma()

    const user = await prisma.profile.findUnique({ where: { email } as any })
    if (!user) {
        console.error('Local user not found:', email)
        process.exit(1)
    }
    if (user.external_id) {
        console.error('Local user already linked to Supabase:', user.external_id)
        process.exit(0)
    }

    const supabaseUrl = String(process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_ISS)
    const supabaseKey = String(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
    if (!supabaseUrl || !supabaseKey) {
        console.error('PUBLIC_SUPABASE_URL (or SUPABASE_ISS) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required')
        process.exit(1)
    }

    // Attempt to create Supabase user via Admin API
    try {
        const body = { email: user.email, user_metadata: { name: user.name ?? null }, email_confirm: true }
        const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
            body: JSON.stringify(body),
        })

        if (res.ok) {
            const payload = await res.json().catch(() => null)
            const supId = payload?.id
            if (!supId) {
                console.error('Supabase did not return an id for new user', payload)
                process.exit(1)
            }

            await prisma.profile.update({ where: { id: user.id }, data: { external_id: supId } })
            console.log('Linked local user', email, '-> supabase id', supId)
            process.exit(0)
        }

        // If create failed because user already exists, attempt to lookup and link
        const txt = await res.text().catch(() => '')
        console.error('Supabase create returned', res.status, txt)

        // Try lookup by email
        const lookup = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users?email=${encodeURIComponent(user.email)}`, { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } })
        if (lookup.ok) {
            const arr = await lookup.json().catch(() => null)
            const found = Array.isArray(arr) ? arr[0] ?? null : arr
            if (found && found.id) {
                await prisma.profile.update({ where: { id: user.id }, data: { external_id: found.id } })
                console.log('Found existing Supabase user and linked local user ->', found.id)
                process.exit(0)
            }
        }

        console.error('Failed to create or find Supabase user for', user.email)
        process.exit(1)
    } catch (err: any) {
        console.error('Error calling Supabase Admin API:', err?.message ?? err)
        process.exit(1)
    }
}

main().catch((err) => { console.error('script failed', err); process.exit(1) })
