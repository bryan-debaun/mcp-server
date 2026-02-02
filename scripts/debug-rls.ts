#!/usr/bin/env tsx
import { Client } from 'pg'

async function main() {
    const conn = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mcp_dev'
    const client = new Client({ connectionString: conn })
    await client.connect()
    try {
        await client.query('BEGIN')
        const u1 = await client.query("INSERT INTO \"User\" (email,name,\"createdAt\",\"updatedAt\") VALUES ('rls-a@example.com','User A', now(), now()) RETURNING id")
        const u2 = await client.query("INSERT INTO \"User\" (email,name,\"createdAt\",\"updatedAt\") VALUES ('rls-b@example.com','User B', now(), now()) RETURNING id")
        const b = await client.query('INSERT INTO "Book" (title,"createdBy","createdAt","updatedAt") VALUES ($1,$2, now(), now()) RETURNING id', ['RLS debug', u1.rows[0].id])
        await client.query('INSERT INTO "Rating" ("bookId","userId",rating,"createdAt","updatedAt") VALUES ($1,$2,$3, now(), now())', [b.rows[0].id, u1.rows[0].id, 5])
        await client.query('INSERT INTO "Rating" ("bookId","userId",rating,"createdAt","updatedAt") VALUES ($1,$2,$3, now(), now())', [b.rows[0].id, u2.rows[0].id, 3])

        await client.query("SELECT set_config('request.jwt.claims.email','rls-a@example.com', false)")
        const check = await client.query("SELECT current_setting('request.jwt.claims.email', true) as val")
        console.log('current_setting for email:', check.rows[0].val)
        const asA = await client.query("WITH _s AS (SELECT set_config('request.jwt.claims.email','rls-a@example.com', true)) SELECT r.* FROM \"Rating\" r")
        console.log('asA count', asA.rows.length, asA.rows.map(r => r.id))

        const asAdmin = await client.query("WITH _s AS (SELECT set_config('request.jwt.claims.role','admin', true)) SELECT r.* FROM \"Rating\" r")
        console.log('asAdmin count', asAdmin.rows.length, asAdmin.rows.map(r => r.id))

        await client.query('ROLLBACK')
    } catch (err) {
        console.error(err)
    } finally {
        await client.end()
    }
}

main()
