import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../..')
const BRUNO = path.join(ROOT, 'tools', 'bruno')
const SPEC = path.join(ROOT, 'build', 'swagger.json')

/** Recursively collect request .bru files (excludes folder.bru, collection.bru, environments/). */
function requestFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
        if (entry === 'environments') continue
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) out.push(...requestFiles(full))
        else if (
            entry.endsWith('.bru') &&
            entry !== 'folder.bru' &&
            entry !== 'collection.bru'
        )
            out.push(full)
    }
    return out
}

/** Extract `METHOD /path` (baseUrl + query stripped) from a request .bru. */
function methodAndPath(content: string): string | null {
    const m = content.match(
        /^(get|post|put|delete|patch)\s*\{\s*\n\s*url:\s*([^\n]+)/m,
    )
    if (!m) return null
    const method = m[1].toLowerCase()
    const url = m[2].trim().replace('{{baseUrl}}', '').split('?')[0]
    return `${method} ${url}`
}

describe('Bruno API collection (#8)', () => {
    it('exists with a valid collection manifest', () => {
        const manifest = JSON.parse(
            readFileSync(path.join(BRUNO, 'bruno.json'), 'utf8'),
        )
        expect(manifest.type).toBe('collection')
        expect(manifest.name).toBeTruthy()
    })

    it('has the expected tag folders plus the hand-authored Ops folder', () => {
        const dirs = readdirSync(BRUNO).filter((e) =>
            statSync(path.join(BRUNO, e)).isDirectory(),
        )
        for (const expected of [
            'Books',
            'Authors',
            'Movies',
            'VideoGames',
            'ContentCreators',
            'Articles',
            'Spotify',
            'Ops',
            'environments',
        ])
            expect(dirs).toContain(expected)
    })

    it('ships local/preview/prod environments without committed secret values', () => {
        const envDir = path.join(BRUNO, 'environments')
        const envs = readdirSync(envDir)
        for (const e of ['local.bru', 'preview.bru', 'prod.bru'])
            expect(envs).toContain(e)

        for (const e of envs) {
            const txt = readFileSync(path.join(envDir, e), 'utf8')
            // Secret vars are declared but must never carry a value in git.
            expect(txt).not.toMatch(/apiKey:\s*\S/)
            expect(txt).not.toMatch(/token:\s*\S/)
        }
    })

    it('Ops smoke requests are public (no auth, with assertions)', () => {
        const ops = requestFiles(path.join(BRUNO, 'Ops'))
        expect(ops.length).toBeGreaterThanOrEqual(4)
        for (const f of ops) {
            const txt = readFileSync(f, 'utf8')
            expect(txt).toContain('auth: none')
            expect(txt).toContain('assert {')
        }
    })

    // Drift guard: every endpoint in the generated OpenAPI spec must have a
    // matching request in the collection, so `bruno:sync` keeps it complete.
    // Conditional: the spec is gitignored and only present after `build:spec`.
    it.runIf(existsSync(SPEC))(
        'covers every endpoint in the OpenAPI spec',
        () => {
            const spec = JSON.parse(readFileSync(SPEC, 'utf8'))
            const covered = new Set(
                requestFiles(BRUNO)
                    .map((f) => methodAndPath(readFileSync(f, 'utf8')))
                    .filter((x): x is string => Boolean(x)),
            )

            const missing: string[] = []
            for (const [p, methods] of Object.entries<any>(spec.paths)) {
                const bruPath = p.replace(/\{(\w+)\}/g, ':$1') // {id} -> :id
                for (const method of Object.keys(methods)) {
                    const key = `${method.toLowerCase()} ${bruPath}`
                    if (!covered.has(key)) missing.push(key)
                }
            }
            expect(missing).toEqual([])
        },
    )
})
