/**
 * Regenerate the Bruno API collection from the server's OpenAPI spec using
 * Bruno's own `bru import openapi` (issue #8). This is the "auto-discover new
 * endpoints" mechanism: the spec is generated from the TSOA controllers, so any
 * route added/removed in code flows into the collection on the next sync.
 *
 * Hand-maintained folders (`environments/`, `Ops/`) are preserved — only the
 * OpenAPI-generated request folders are replaced. Run after `build:spec`
 * (the `bruno:sync` npm script chains them).
 */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

// Relative paths only: `bru import` parses a source containing a Windows drive
// letter ("C:\\...") as a URL ("Unsupported protocol c:"), so we pass paths
// relative to cwd and stage the temp output inside the project tree.
const SPEC_REL = 'build/swagger.json'
const TMP_REL = 'tools/.bruno-sync-tmp'
const OUT = path.join(ROOT, 'tools', 'bruno')
const TMP = path.join(ROOT, TMP_REL)

// Folders authored by hand that must survive a regeneration.
const PRESERVE = new Set(['environments', 'Ops'])

if (!existsSync(path.join(ROOT, SPEC_REL))) {
    console.error(
        `OpenAPI spec not found at ${SPEC_REL}. Run \`pnpm run build:spec\` first.`,
    )
    process.exit(1)
}

// Do NOT pre-create TMP: `bru import` writes a flat collection when --output
// does not exist, but nests it under a <collection-name>/ subfolder when the
// directory already exists.
rmSync(TMP, { recursive: true, force: true })
try {
    // Bruno's official OpenAPI importer → .bru files grouped by tag.
    const cmd = [
        'pnpm exec bru import openapi',
        `--source ${SPEC_REL}`,
        `--output ${TMP_REL}`,
        '--collection-name "MCP Server API"',
        '--collection-format bru',
        '--group-by tags',
    ].join(' ')
    execSync(cmd, { stdio: 'inherit' })

    // We keep our own environments under environments/ — drop the bare one.
    rmSync(path.join(TMP, 'environments'), { recursive: true, force: true })

    // Replace previously-generated content, preserving hand-authored folders.
    for (const entry of readdirSync(OUT)) {
        if (PRESERVE.has(entry)) continue
        rmSync(path.join(OUT, entry), { recursive: true, force: true })
    }
    for (const entry of readdirSync(TMP)) {
        cpSync(path.join(TMP, entry), path.join(OUT, entry), {
            recursive: true,
        })
    }

    console.log(`Bruno collection synced from ${SPEC_REL}`)
} finally {
    rmSync(TMP, { recursive: true, force: true })
}
