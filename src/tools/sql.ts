import fs from 'fs'
import { Client } from 'pg'

export function parseSqlStatements(sql: string): string[] {
    // Robust SQL splitter that understands:
    // - single-quoted strings '...'
    // - double-quoted identifiers "..."
    // - dollar-quoted strings $tag$...$tag$
    // - line comments -- ... and block comments /* ... */
    const parts: string[] = []
    let cur = ''
    let i = 0
    const len = sql.length

    let inSingle = false
    let inDouble = false
    let inLineComment = false
    let inBlockComment = false
    let dollarTag: string | null = null

    const startsWith = (s: string) => sql.slice(i).startsWith(s)

    while (i < len) {
        const ch = sql[i]

        // handle line comments
        if (!inSingle && !inDouble && !dollarTag && !inBlockComment && startsWith('--')) {
            inLineComment = true
            // consume until newline
            while (i < len && sql[i] !== '\n') {
                i++
            }
            // keep a single newline to preserve statement separation
            cur += '\n'
            inLineComment = false
            continue
        }

        // handle block comments
        if (!inSingle && !inDouble && !dollarTag && !inLineComment && startsWith('/*')) {
            inBlockComment = true
            i += 2
            while (i < len && !startsWith('*/')) i++
            i += 2 // consume '*/' (if reached end this moves to len)
            cur += ' ' // replace comment with a space
            inBlockComment = false
            continue
        }

        // handle dollar-quoted string start
        if (!inSingle && !inDouble && !dollarTag && ch === '$') {
            // match tag like $tag$
            const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i))
            if (m) {
                dollarTag = m[0]
                cur += dollarTag
                i += dollarTag.length
                // consume until matching tag
                const endIdx = sql.indexOf(dollarTag, i)
                if (endIdx === -1) {
                    // unterminated dollar-quote — append rest and break
                    cur += sql.slice(i)
                    i = len
                    break
                }
                cur += sql.slice(i, endIdx + dollarTag.length)
                i = endIdx + dollarTag.length
                dollarTag = null
                continue
            }
        }

        // handle single-quoted strings
        if (!inDouble && !dollarTag && ch === "'") {
            cur += ch
            i++
            while (i < len) {
                cur += sql[i]
                // handle escaped single quote by doubling
                if (sql[i] === "'" && sql[i + 1] === "'") {
                    cur += sql[i + 1]
                    i += 2
                    continue
                }
                if (sql[i] === "'") {
                    i++
                    break
                }
                i++
            }
            continue
        }

        // handle double-quoted identifiers
        if (!inSingle && !dollarTag && ch === '"') {
            cur += ch
            i++
            while (i < len) {
                cur += sql[i]
                // handle escaped double quote by doubling
                if (sql[i] === '"' && sql[i + 1] === '"') {
                    cur += sql[i + 1]
                    i += 2
                    continue
                }
                if (sql[i] === '"') {
                    i++
                    break
                }
                i++
            }
            continue
        }

        // statement separator (semicolon) when not inside any quote/comment
        if (ch === ';' && !inSingle && !inDouble && !dollarTag && !inBlockComment && !inLineComment) {
            const stmt = cur.trim()
            if (stmt) parts.push(stmt)
            cur = ''
            i++
            // skip following whitespace/newline
            while (i < len && /[\s\n\r]/.test(sql[i])) i++
            continue
        }

        // default: append char
        cur += ch
        i++
    }

    const last = cur.trim()
    if (last) parts.push(last)
    return parts
}

export async function executeStatements(connectionString: string, statements: string[], onStatement?: (index: number, sql: string) => void) {
    const client = new Client({ connectionString })
    await client.connect()
    try {
        for (let i = 0; i < statements.length; i++) {
            const s = statements[i]
            if (onStatement) onStatement(i, s)
            await client.query(s)
        }
    } finally {
        await client.end()
    }
}

export function readSqlFile(path: string): string {
    return fs.readFileSync(path, 'utf8')
}
