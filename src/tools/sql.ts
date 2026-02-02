import fs from 'fs'
import { Client } from 'pg'

export function parseSqlStatements(sql: string): string[] {
    // Remove comments starting with -- to avoid splitting inside comments
    // Keep comment lines so we can still support statements that include ; in comments
    const cleaned = sql
        .split('\n')
        // preserve single-line comments as blank lines
        .map(line => (line.trimStart().startsWith('--') ? '' : line))
        .join('\n')

    // Naive split on semicolon followed by newline or end-of-string
    const parts = cleaned
        .split(/;\s*(?:\n|$)/g)
        .map(s => s.trim())
        .filter(Boolean)

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
