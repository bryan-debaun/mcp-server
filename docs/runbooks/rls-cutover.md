# RLS cutover — switching the app to a non-bypassing database role

> **Status: not yet performed in production.** The migration and application
> code are merged and inert; this runbook is the deliberate step that turns
> enforcement on.

## Why there is a cutover at all

RLS could not be enabled by a migration alone. The application connects as
`postgres`, which **owns every table** and carries **`rolbypassrls`** — two
independent bypasses that no `ALTER TABLE` can override. Enforcement requires
the app to connect as a *different role*, and that means rotating
`DATABASE_URL`: a credential change, not a schema change.

The migration (`20260801120000_enforce_rls`) already created the role, granted
it, and enabled `ENABLE`/`FORCE ROW LEVEL SECURITY` with policies on every
table. None of that affects the running app, because the app is still
`postgres` and still bypasses. **Applying the migration is a no-op; this
runbook is the switch.**

## What changes

| | Before | After |
|---|---|---|
| App connects as | `postgres` (owner, `BYPASSRLS`) | `mcp_app` (non-owner, `NOBYPASSRLS`) |
| Reads | unrestricted | unrestricted (`*_read` policy is `USING (true)`) |
| Writes | unrestricted | require `request.jwt.claims.role = 'admin'` |
| Migrations / seed | as `postgres` | **unchanged** — still `postgres` over `DATABASE_URL_DIRECT` |

Writes carry identity via the Prisma extension in
`src/db/with-request-claims.ts`; reads deliberately do not, so the hot catalog
path keeps its single round-trip.

## Preconditions

> [!WARNING]
> **The migration must be applied to production before step 1 will work.**
> `mcp_app` is created by `20260801120000_enforce_rls`. Until that migration has
> run, the role does not exist and step 1 fails with:
>
> ```text
> ERROR:  role "mcp_app" does not exist
> ```
>
> That migration ships with the application code that propagates claims, so the
> order is: **merge → deploy (the boot entrypoint applies it) → then cut over.**
> Confirm before starting:
>
> ```sql
> SELECT rolname FROM pg_roles WHERE rolname = 'mcp_app';   -- expect 1 row
> ```

- [ ] `20260801120000_enforce_rls` applied in production (see the warning above)
- [ ] The application code that sets `request.jwt.claims.*` is **deployed** — cutting over without it means every write is refused
- [ ] A snapshot exists: `pnpm run db:snapshot` (see gap #6)
- [ ] You can reach the database directly (`DATABASE_URL_DIRECT`)

## Steps

**1. Give `mcp_app` a password.** It was created `NOLOGIN` on purpose so no
credential ever entered the repo or migration history.

Run this in the **Supabase dashboard → SQL Editor** (it executes as `postgres`,
so it has the rights), or over `DATABASE_URL_DIRECT` with any SQL client:

```sql
ALTER ROLE mcp_app LOGIN PASSWORD '<generate a long random password>';
```

Generate it with `openssl rand -base64 32` or Doppler's generator. Do not reuse
the `postgres` password.

> [!NOTE]
> **The password is not a standalone environment variable.** Nothing reads a
> `DB_PASSWORD`/`MCP_PASSWORD`-style value — Prisma takes a single connection
> string, so the password lives *inside* `DATABASE_URL` (step 2). A separate var
> will simply be ignored.

**2. Build the new connection strings.** Same host/database as today, only the
credentials change. Supabase's pooler expects `<role>.<project-ref>`:

```
postgresql://mcp_app.<project-ref>:<password>@aws-0-us-west-2.pooler.supabase.com:6543/postgres
```

Both pooler ports accept a custom role — verified on 5432 and 6543 before this
was written.

**3. Verify the new credential BEFORE switching anything.**

```powershell
$env:DATABASE_URL = "<the new mcp_app pooled URL>"
pnpm exec vitest run test/integration/rls-enforcement.test.ts
```

Expect a non-admin write to be refused and an admin write to succeed. If that
does not hold, stop — do not proceed.

**4. Update Doppler `prd`.**

- `DATABASE_URL` → the new `mcp_app` **pooled** (6543) URL
- `DATABASE_URL_DIRECT` → **leave as `postgres`**. Migrations need the owner:
  `mcp_app` deliberately has no DDL rights, and the boot entrypoint migrates
  over this URL.

**5. Confirm it reached Render**, then deploy/restart. As with `GITHUB_TOKEN`,
a value in Doppler is not automatically a value in Render.

**6. Smoke-test production.**

```sh
curl -s 'https://bad-mcp.onrender.com/healthz?deep=1' | jq '{db, migrations}'
curl -s 'https://bad-mcp.onrender.com/api/books' -H "X-Mcp-Api-Key: $KEY" | head -c 200
```

Then exercise one **write** through an MCP tool (e.g. `update-movie`) — that is
the path this change actually alters. A write failing with `row-level security`
means claims are not reaching the database; roll back and investigate.

**A successful write does NOT prove the cutover worked.** `postgres` bypasses
every policy, so writes succeed either way. The decisive check is *which role the
app is actually connected as* — run this over `DATABASE_URL_DIRECT`:

```sql
SELECT usename, count(*) AS conns
FROM pg_stat_activity
WHERE datname = current_database() AND usename IS NOT NULL
GROUP BY usename ORDER BY usename;
```

Expect `mcp_app` to appear. If you only see `postgres`, the new `DATABASE_URL`
has not reached the running process — env vars are read once at startup, so a
Doppler change needs a **deploy or restart**, and a value in Doppler is not
automatically a value in Render.

## Rollback

One value, one restart:

```
DATABASE_URL = <the original postgres pooled URL>
```

`postgres` still owns the tables and still has `BYPASSRLS`, so it bypasses every
policy exactly as before. **Keep the original URL somewhere you can paste it
from** — that is the entire rollback plan, and it is instant.

Nothing in the schema needs reverting: the policies are inert against a
bypassing role.

## Known consequences

- **Writes without identity now fail.** Any code path that writes without going
  through an auth gate is refused, and logs `db: write attempted with no request
  context`. That is the point, but it will find any path we missed.
- **The lazy-promise footgun.** `runWithDbContext(ctx, () => db.x.create(…))`
  without an inner `await` executes outside the scope and loses its claims. It
  fails closed. There is a regression test pinning this behaviour.
- **`prisma db seed` still works** because it runs as `postgres`.

## If you ever want to undo enforcement entirely

Rolling `DATABASE_URL` back to `postgres` (above) is sufficient and instant. To
also strip the policies:

```sql
-- per table
ALTER TABLE "<T>" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "<T>" DISABLE ROW LEVEL SECURITY;
```

Prefer the credential rollback — it is reversible in both directions, and
leaving the policies in place keeps the option open.
