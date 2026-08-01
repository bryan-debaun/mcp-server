/**
 * Take a timestamped logical snapshot of the database before a risky migration.
 *
 * Operational readiness review, gap #6: migrations are forward-only (no
 * down-migrations), so "rollback" means restore-from-backup — and until now
 * nothing in the repo produced a backup to restore *from*. This closes the
 * "there is no artifact" half. It deliberately does NOT try to be a backup
 * system: Supabase's managed backups remain the real durability story, and this
 * is the cheap, local, before-I-touch-the-schema safety net.
 *
 * Usage (PowerShell):
 *   $env:DATABASE_URL = (doppler secrets get DATABASE_URL_DIRECT --project bad-mcp --config prd --plain)
 *   pnpm run db:snapshot
 *
 * Writes `backups/<db>-<utc-timestamp>.sql`. `backups/` is gitignored — a dump
 * contains real data and must never be committed.
 *
 * Requires `pg_dump` on PATH. If you don't have it, the Supabase dashboard's
 * backup/export is a fine substitute — the point is that *something* exists
 * before a schema change, not that it came from this script.
 */
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const url = process.env.DATABASE_URL
if (!url) {
    process.stderr.write(
        'DATABASE_URL is not set.\n' +
            'Use the DIRECT (session pooler, port 5432) URL — the transaction\n' +
            'pooler on 6543 is not a good target for pg_dump.\n',
    )
    process.exit(1)
}

// Refuse to run against the pooled endpoint: dumps over pgbouncer in
// transaction mode routinely fail partway and leave a truncated file, which is
// worse than no snapshot because it looks like one.
if (url.includes(':6543')) {
    process.stderr.write(
        'Refusing to dump over the transaction pooler (port 6543).\n' +
            'Use DATABASE_URL_DIRECT (port 5432) instead.\n',
    )
    process.exit(1)
}

const dbName = (() => {
    try {
        return new URL(url).pathname.replace(/^\//, '') || 'database'
    } catch {
        return 'database'
    }
})()

const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z')
const outDir = join(process.cwd(), 'backups')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, `${dbName}-${stamp}.sql`)

process.stdout.write(`Dumping ${dbName} -> ${outFile}\n`)

// `--no-owner`/`--no-acl` keep the dump restorable into a different role, which
// is what you actually want when restoring into a scratch database to inspect.
const DUMP_ARGS = ['--no-owner', '--no-acl', '--format=plain']

/**
 * Ask the server its major version.
 *
 * `pg_dump` refuses to dump a server newer than itself, so the Docker fallback
 * has to match. Hardcoding a tag is how you get "aborting because of server
 * version mismatch" the first time the host is upgraded — Supabase is on 17
 * today and was not always.
 */
async function serverMajorVersion(): Promise<number | null> {
    try {
        const pg = await import('pg')
        const c = new pg.default.Client({
            connectionString: url,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 10000,
        })
        await c.connect()
        const r = await c.query('SHOW server_version')
        await c.end()
        const major = Number.parseInt(
            String(r.rows[0].server_version).split('.')[0],
            10,
        )
        return Number.isFinite(major) ? major : null
    } catch {
        return null
    }
}

function finish(code: number | null, via: string) {
    if (code === 0) {
        process.stdout.write(`\nSnapshot written (${via}): ${outFile}\n`)
        process.exit(0)
    }
    // A partial dump is worse than none — it looks like a backup and isn't.
    try {
        unlinkSync(outFile)
    } catch {
        /* nothing to clean up */
    }
    process.stderr.write(
        `\npg_dump (${via}) exited ${code}. Partial output deleted — you do NOT have a snapshot.\n`,
    )
    process.exit(code ?? 1)
}

/**
 * Fallback: run pg_dump from the Postgres Docker image.
 *
 * The primary use for this script is snapshotting the hosted database before a
 * schema change, and a container reaches a remote host fine. It cannot reach a
 * database on the host's own `localhost` — use a locally installed pg_dump for
 * that, or point the container at `host.docker.internal`.
 */
async function dumpViaDocker() {
    process.stdout.write('pg_dump not on PATH — falling back to Docker…\n')

    // Match the image to the server, or pg_dump aborts on version mismatch.
    // PG_DUMP_IMAGE overrides for anything unusual.
    const major = await serverMajorVersion()
    const image = process.env.PG_DUMP_IMAGE ?? 'postgres:15-alpine'
    process.stdout.write(
        `server major version: ${major ?? 'unknown'} — using ${image} + apk postgresql${major ?? 17}-client\n`,
    )

    // Rather than `postgres:<major>-alpine` (which needs a registry pull that is
    // not always available — Docker Hub's CDN refused it repeatedly on the
    // primary dev machine), run whatever postgres image is already local and
    // `apk add` the client matching the SERVER's major version. pg_dump refuses
    // to dump a server newer than itself, so the version has to match; apk goes
    // via a different CDN, which is the point.
    //
    // The image's own binaries shadow the installed ones, hence the explicit
    // /usr/libexec path and LD_LIBRARY_PATH (otherwise psql/pg_dump link against
    // the image's older libpq and fail on missing symbols).
    const inner = [
        `apk add --no-cache postgresql${major ?? 17}-client >/dev/null 2>&1`,
        `LD_LIBRARY_PATH=/usr/lib /usr/libexec/postgresql${major ?? 17}/pg_dump ${DUMP_ARGS.join(' ')} "$PGURL"`,
    ].join('\n')

    const out = createWriteStream(outFile)
    const child = spawn(
        'docker',
        ['run', '--rm', '-i', '-e', `PGURL=${url}`, image, 'sh', '-c', inner],
        { stdio: ['ignore', 'pipe', 'inherit'] },
    )
    child.stdout.pipe(out)
    child.on('error', (err: NodeJS.ErrnoException) => {
        process.stderr.write(
            err.code === 'ENOENT'
                ? '\nNeither pg_dump nor docker is available.\n' +
                      'Install the PostgreSQL client tools, or export from the Supabase\n' +
                      'dashboard instead. Do not skip the snapshot on a schema change.\n'
                : `\ndocker pg_dump failed to start: ${err.message}\n`,
        )
        process.exit(1)
    })
    child.on('exit', (code) => out.end(() => finish(code, 'docker')))
}

const local = spawn('pg_dump', [...DUMP_ARGS, '--file', outFile, url], {
    stdio: ['ignore', 'inherit', 'inherit'],
})
local.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return dumpViaDocker()
    process.stderr.write(`\npg_dump failed to start: ${err.message}\n`)
    process.exit(1)
})
local.on('exit', (code) => finish(code, 'local pg_dump'))
