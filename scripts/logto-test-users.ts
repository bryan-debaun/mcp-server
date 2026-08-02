/**
 * Provision and clean up namespaced Logto test users.
 *
 *   pnpm run logto:users seed [runId]     create a roled test user
 *   pnpm run logto:users teardown <runId> delete that run's user
 *   pnpm run logto:users list             show every test user in the tenant
 *   pnpm run logto:users cleanup [--dry]  delete ALL orphaned test users
 *
 * Credentials come from the environment (Doppler `bad-mcp/dev`), never the repo:
 *   LOGTO_TENANT_ID, LOGTO_M2M_CLIENT_ID, LOGTO_M2M_CLIENT_SECRET
 *
 * `cleanup` only ever touches users inside the test namespace, so it cannot
 * remove a real account — that is what makes it safe to run unattended against
 * the shared tenant ADR 0001 commits us to.
 */
import { LogtoDirectory } from '../src/auth/user-directory/logto.js'
import {
    cleanupOrphanedTestUsers,
    findTestUserByRunId,
    newRunId,
    seedTestUser,
} from '../src/auth/user-directory/seed.js'
import { isTestUser } from '../src/auth/user-directory/types.js'
import { config } from '../src/config.js'

const out = (s: string) => process.stdout.write(`${s}\n`)
const die = (s: string): never => {
    process.stderr.write(`${s}\n`)
    process.exit(1)
}

async function main() {
    const [command, ...rest] = process.argv.slice(2)

    if (!config.logto.enabled) {
        die(
            'Logto is not configured.\n' +
                'Set LOGTO_TENANT_ID, LOGTO_M2M_CLIENT_ID and LOGTO_M2M_CLIENT_SECRET.\n' +
                'Locally: pnpm run env:pull  (or run under `doppler run --`).',
        )
    }
    const directory = LogtoDirectory.fromConfig()

    switch (command) {
        case 'seed': {
            const runId = rest[0] ?? newRunId()
            const user = await seedTestUser(directory, {
                runId,
                role: 'admin',
            })
            out(`${user.created ? 'created' : 'already existed'}`)
            out(`  runId    : ${runId}`)
            out(`  id       : ${user.id}`)
            out(`  username : ${user.username}`)
            out(`  email    : ${user.email}`)
            out(`  role     : admin`)
            if (user.password) {
                // Printed once, never stored. A re-run cannot reproduce it —
                // seed a fresh runId instead of trying to recover this.
                out(`  password : ${user.password}`)
            } else {
                out('  password : (unchanged — user already existed)')
            }
            out(`\nteardown with: pnpm run logto:users teardown ${runId}`)
            break
        }

        case 'teardown': {
            const runId = rest[0] ?? die('usage: teardown <runId>')
            const user = await findTestUserByRunId(directory, runId)
            if (!user) {
                out(`no test user for runId ${runId} (nothing to do)`)
                break
            }
            await directory.deleteUser(user.id)
            out(`deleted ${user.username} (${user.id})`)
            break
        }

        case 'list': {
            const users = (await directory.listUsers()).filter(isTestUser)
            if (!users.length) {
                out('no test users in the tenant')
                break
            }
            out(`${users.length} test user(s):`)
            for (const u of users) {
                out(`  ${String(u.id).padEnd(14)} ${u.username ?? '-'}`)
            }
            break
        }

        case 'cleanup': {
            const dryRun = rest.includes('--dry')
            const removed = await cleanupOrphanedTestUsers(directory, {
                dryRun,
            })
            if (!removed.length) {
                out('no orphaned test users')
                break
            }
            out(`${dryRun ? 'would delete' : 'deleted'} ${removed.length}:`)
            for (const u of removed) {
                out(`  ${String(u.id).padEnd(14)} ${u.username ?? '-'}`)
            }
            break
        }

        default:
            die(
                'usage: pnpm run logto:users <seed [runId] | teardown <runId> | list | cleanup [--dry]>',
            )
    }
}

main().catch((e) => {
    process.stderr.write(`${e?.stack ?? e}\n`)
    process.exit(1)
})
