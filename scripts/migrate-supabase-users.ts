/*
Enhanced Supabase migration helper.

Modes:
  - default (no flags): create missing Supabase accounts for local users that
    don't have `external_id` and write the returned `id` into `users.external_id`.
  - --recreate-local-from-supabase
      * Fetches all Supabase Auth users and re-creates local `users` rows (safe: preserves isAdmin rows).
      * Use with --confirm=REALLY_I_AGREE to perform the destructive action.
  - --wipe-local
      * Deletes local users (preserves admins unless --force passed).

Flags:
  --dry-run        Show actions that would be taken without making changes
  --confirm <tok>  Required token to perform destructive actions (use: REALLY_I_AGREE)
  --force          When used with --wipe-local, will also remove admin rows

Usage examples:
  node ./scripts/migrate-supabase-users.ts --dry-run
  node ./scripts/migrate-supabase-users.ts --recreate-local-from-supabase --confirm REALLY_I_AGREE
*/

import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

// Load .env then override with .env.local (if present) so the script uses the
// same environment values developers keep locally.
dotenv.config()
const envLocalPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envLocalPath)) {
    // Parse .env.local and *override* existing process.env values so local dev
    // config always takes precedence over .env placeholder values.
    const parsed = dotenv.parse(fs.readFileSync(envLocalPath))
    for (const [k, v] of Object.entries(parsed)) {
        process.env[k] = String(v)
    }
    console.error(`Loaded and applied environment from ${envLocalPath}`)
}

import { prisma, initPrisma } from '../src/db/index.js'

type Opts = { dryRun: boolean; mode: 'create-missing' | 'recreate' | 'wipe'; confirm?: string; force?: boolean }

function parseArgs(): Opts {
    const args = process.argv.slice(2)
    const opts: Opts = { dryRun: false, mode: 'create-missing' }
    for (let i = 0; i < args.length; i++) {
        const a = args[i]
        if (a === '--dry-run') opts.dryRun = true
        else if (a === '--recreate-local-from-supabase') opts.mode = 'recreate'
        else if (a === '--wipe-local') opts.mode = 'wipe'
        else if (a === '--confirm') opts.confirm = args[++i]
        else if (a === '--force') opts.force = true
        else if (a === '--help') {
            console.error('See script header for usage')
            process.exit(0)
        }
    }
    return opts
}

async function fetchSupabaseUsers(supabaseUrl: string, supabaseKey: string) {
    const perPage = 100
    let page = 1
    const all: any[] = []
    while (true) {
        const url = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users?per_page=${perPage}&page=${page}`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } })
        if (!res.ok) throw new Error(`failed to list supabase users: ${res.status}`)
        const body = await res.json().catch(() => [])
        if (!Array.isArray(body) || body.length === 0) break
        all.push(...body)
        if (body.length < perPage) break
        page += 1
    }
    return all
}

async function createMissingLocalUsersLinkedToSupabase(supabaseUrl: string, supabaseKey: string, dryRun: boolean) {
    const localUsers = await prisma.profile.findMany({ where: { external_id: null, blocked: false } })
    console.error(`Found ${localUsers.length} local user(s) without external_id`)
    for (const u of localUsers) {
        console.error(`- local id=${u.id} email=${u.email}`)
        // Check if Supabase already has a user with this email
        const lookupUrl = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users?email=${encodeURIComponent(u.email)}`
        const lookup = await fetch(lookupUrl, { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } }).catch(() => null)
        let existingSup: any = null
        if (lookup && lookup.ok) {
            const body = await lookup.json().catch(() => null)
            existingSup = Array.isArray(body) ? (body[0] ?? null) : body
        }

        if (existingSup && existingSup.id) {
            console.error(`  -> Found existing Supabase user id=${existingSup.id}; will write external_id`)
            if (!dryRun) await prisma.profile.update({ where: { id: u.id }, data: { external_id: existingSup.id } })
            continue
        }

        console.error(`  -> No Supabase user for ${u.email}; will create one`)
        if (dryRun) continue

        // Create Supabase account (no password) and write external_id
        const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
            body: JSON.stringify({ email: u.email, user_metadata: { name: u.name }, email_confirm: true })
        })
        if (!res.ok) {
            const txt = await res.text().catch(() => '')
            console.error(`  !! Supabase create failed for ${u.email}: ${res.status} ${txt}`)
            continue
        }
        const body = await res.json().catch(() => null)
        const supId = body?.id
        if (supId) {
            await prisma.profile.update({ where: { id: u.id }, data: { external_id: supId } })
            console.error(`  -> linked local ${u.email} -> ${supId}`)
        } else {
            console.error(`  !! Supabase did not return id for ${u.email}`)
        }
    }
}

async function recreateLocalFromSupabase(supabaseUrl: string, supabaseKey: string, dryRun: boolean, force: boolean, confirm?: string) {
    if (!dryRun && confirm !== 'REALLY_I_AGREE') {
        console.error('Destructive operation. Pass --confirm REALLY_I_AGREE to proceed.')
        process.exit(2)
    }

    const supUsers = await fetchSupabaseUsers(supabaseUrl, supabaseKey)
    console.error(`Found ${supUsers.length} Supabase user(s)`)

    if (dryRun) {
        const localCount = await prisma.profile.count()
        const nonAdminCount = await prisma.profile.count({ where: { isAdmin: false } })
        console.error(`Dry-run: would remove ${nonAdminCount} local non-admin user(s) and recreate ${supUsers.length} users from Supabase.`)
        console.error('Example supabase users:', supUsers.slice(0, 10).map((u: any) => u.email))
        return
    }

    // Delete local users (preserve admins unless force)
    if (force) {
        console.error('Deleting ALL local users (force)')
        await prisma.profile.deleteMany({})
    } else {
        console.error('Deleting local non-admin users')
        await prisma.profile.deleteMany({ where: { isAdmin: false } })
    }

    // Ensure role exists
    const role = await prisma.role.upsert({ where: { name: 'user' }, update: {}, create: { name: 'user' } })

    for (const s of supUsers) {
        try {
            const email = s.email
            if (!email) continue
            const name = s.user_metadata?.name ?? null
            const created = await prisma.profile.create({ data: { email, name, roleId: role.id, external_id: s.id } })
            console.error(`  created local user ${email} (id=${created.id} external_id=${s.id})`)
        } catch (err: any) {
            console.error('  failed to create local user for', s.email, err?.message ?? err)
        }
    }
}

async function wipeLocalUsers(dryRun: boolean, force: boolean, confirm?: string) {
    if (!dryRun && confirm !== 'REALLY_I_AGREE') {
        console.error('Destructive operation. Pass --confirm REALLY_I_AGREE to proceed.')
        process.exit(2)
    }

    if (dryRun) {
        const count = await prisma.profile.count({ where: force ? {} : { isAdmin: false } })
        console.error(`Dry-run: would delete ${count} local user(s) (force=${Boolean(force)})`)
        return
    }

    if (force) await prisma.profile.deleteMany({})
    else await prisma.profile.deleteMany({ where: { isAdmin: false } })
    console.error('Local users wiped')
}

async function main() {
    const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_ISS
    const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    console.error('Supabase URL from env:', supabaseUrl)
    if (!supabaseUrl || !supabaseKey) {
        console.error('PUBLIC_SUPABASE_URL (or SUPABASE_ISS) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required to run this script')
        process.exit(1)
    }

    const opts = parseArgs()

    // Ensure Prisma client / stubs are initialized before any DB calls
    try {
        await initPrisma()
    } catch (err) {
        console.error('initPrisma failed (continuing with stubbed prisma):', err)
    }

    if (opts.mode === 'create-missing') {
        console.error('Mode: create-missing (default)')
        await createMissingLocalUsersLinkedToSupabase(supabaseUrl, supabaseKey, opts.dryRun)
        console.error('Done')
        return
    }

    if (opts.mode === 'recreate') {
        console.error('Mode: recreate-local-from-supabase')
        await recreateLocalFromSupabase(supabaseUrl, supabaseKey, opts.dryRun, opts.force ?? false, opts.confirm)
        console.error('Done')
        return
    }

    if (opts.mode === 'wipe') {
        console.error('Mode: wipe-local')
        await wipeLocalUsers(opts.dryRun, opts.force ?? false, opts.confirm)
        console.error('Done')
        return
    }
}

main().catch((err) => { console.error('migration failed', err); process.exit(1) })
