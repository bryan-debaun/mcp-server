# Incident response — mcp-server (bad-mcp)

> **Read this first when something is broken.** One page, in the order you should
> actually work through it. Everything here links out to the detailed runbook for
> the specific subsystem — this page exists so you don't have to remember which
> one to open at 11pm.

**Service:** `https://bad-mcp.onrender.com` · **Health:** `/healthz` · **Readiness:** `/readyz`

**Why this matters:** `bryandebaun.dev` fetches its books / authors / movies /
games data from this service **at runtime**. If this is down, the website's data
features degrade. This is the shared runtime dependency of the ecosystem.

---

## 0. Is it actually an incident?

Two things are **expected behaviour**, not outages:

| Symptom | Probably just |
|---|---|
| First request after idle takes ~30–60s | Render free/starter **spin-down**. Normal. |
| Everything DB-backed is empty/failing after ~a week of no traffic | Supabase free-tier **auto-pause**. Resume it (§2). |

If a keep-warm ping is configured (`GET /healthz?deep=1` every ~10 min, see
[deploy-render.md](deploy-render.md#keep-alive-preventing-cold-starts--issue-119)),
both should be rare.

---

## 1. Triage — 60 seconds

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://bad-mcp.onrender.com/healthz
curl -s https://bad-mcp.onrender.com/healthz?deep=1 | jq
curl -s -o /dev/null -w '%{http_code}\n' https://bad-mcp.onrender.com/readyz
```

Read the result:

| Result | Meaning | Go to |
|---|---|---|
| `/healthz` times out or connection refused | Process is down or Render is cold-starting | §3 |
| `/healthz` 200, `/readyz` 503 | Process alive, DB init hasn't completed (or failed) | §2 |
| `deep=1` → `503 {"db":"error"}` | DB configured but unreachable — **most likely a paused Supabase** | §2 |
| `deep=1` → `{"db":"skipped"}` | `DATABASE_URL` is unset in the environment | §4 |
| `deep=1` → `capabilities: { "github": false, … }` | That integration's secret is missing — degraded, not down | §5 |
| HTML instead of JSON | Cloudflare challenge page, not the app | §6 |
| All 200 but a specific tool errors | Not an outage — §5 |

`/healthz?deep=1` also reports `capabilities` (#155), so a missing secret is
visible here without reading logs.

---

## 2. Database unreachable / `readyz` stuck

Overwhelmingly the most common real failure.

1. **Check Supabase** — dashboard → is the project **paused**? Free tier pauses
   after ~7 days of no external activity. Resume it; restore takes a few minutes.
2. Re-check `curl .../healthz?deep=1` until `{"db":"ok"}`.
3. `/readyz` flips to 200 only after DB init succeeds — note that readiness is
   set **once at startup** (`src/http/server.ts`), so if the DB came back *after*
   a failed init, **restart the service** in Render to re-run init.
4. If Supabase is up but connections fail, check `DATABASE_URL` in Doppler/Render
   (see [secrets-doppler.md](../secrets-doppler.md)).

**Why it degrades rather than crashes:** `src/db/index.ts` installs stub Prisma
models when the DB is unavailable — reads return empty, writes throw. The server
stays up serving empty data. That's by design, and it's why the website shows
*empty* catalogs rather than errors.

---

## 3. Service down / crash-looping

1. **Was there a deploy just now?** `autoDeploy: true` on `main` — every push to
   `main` deploys to production. Check Render's deploy list.
2. **If yes → roll back first, diagnose after.** Render dashboard → promote the
   previous revision. Fast, no rebuild. Fallback: `git revert` + push.
3. Check Render logs for:
   - `[boot] prisma migrate deploy failed; starting anyway` → §7
   - `config.ts` validation exit → an env var is invalid; the log names it. Fix
     in Doppler/Render and redeploy.
   - `capability disabled: …` → informational only, not a crash cause.
4. Render gates deploys on `/healthz`, so a new revision that can't come up
   should leave the old one live.

Details: [deploy-render.md](deploy-render.md).

---

## 4. Configuration problems

`src/config.ts` is the only reader of `process.env` and validates everything with
zod, exiting with the offending var names on failure — so a config problem is
loud and names itself. Fix in the Doppler `prd` config, then **confirm it reached
Render** (a synced value still needs a deploy/restart to reach the process).

---

## 5. One integration is broken, service is fine

Check `capabilities` in `/healthz?deep=1` and the boot logs
(`capability disabled: <name> — <VAR> not set`).

| Integration | Symptom | Fix |
|---|---|---|
| GitHub | All issue/label/Projects tools fail | `GITHUB_TOKEN` unset, **expired**, or missing the `project` scope — see [secrets-doppler.md](../secrets-doppler.md#rotation--expiry) |
| Spotify | Playback routes error | [spotify.md](spotify.md) — re-run the OAuth flow |
| Sentry | No error reports | `SENTRY_DSN` unset; errors only in Render logs |

Note the capability check only catches an **unset** variable. A token that is
present but expired or under-scoped still reports `true` and fails at call time
with a 401/403 from the upstream API.

---

## 6. Website gets HTML instead of JSON

Cloudflare sits in front of the host and can return a challenge page. The server
is likely fine. The client must detect non-JSON responses and handle them; check
Cloudflare settings for the hostname if it persists.

---

## 7. Migration trouble

**Migrations run at container boot** — the Dockerfile `CMD` runs
`prisma migrate deploy` before starting the server. It is **non-fatal**: if it
fails, the log says `[boot] prisma migrate deploy failed; starting anyway` and
the server starts **against an un-migrated schema**.

So after any schema-changing deploy: **grep the boot log for that line.** A
half-deployed schema presents as confusing runtime errors, not as a down service.

- Common cause: `DATABASE_URL` points at Supabase's **pooled/pgbouncer**
  endpoint, which can't take the advisory locks `migrate deploy` needs. It must
  be a **direct** connection (port 5432).
- To apply manually: Render Shell → `pnpm exec prisma migrate deploy`. (Direct
  connections from a laptop time out — Supabase direct is IPv6/pooler-only.)
- **Migrations are forward-only** — there are no down-migrations. Rollback means
  restore-from-backup, so take a snapshot before schema-changing deploys.

Migration SQL is exercised in CI by `.github/workflows/db-integration.yml`
(`prisma migrate deploy` against a real Postgres) on every PR to `main`.

---

## 8. After the incident

- If detection was slow, that's the finding — there is **no alerting configured**
  today (see the [operational readiness review](../operational-readiness-review.md) §6).
  Detection is "Bryan notices, or the website breaks."
- Check `/metrics` for `auth_subject_unresolved_total`, `mcp_auth_failures_total`,
  `service_role_bypass_total` — but note metrics **reset on every restart** and
  nothing scrapes them, so read them before restarting anything.
- Update the ORR if the incident revealed a gap not listed there.

---

## Related

- [Operational readiness review](../operational-readiness-review.md) — full posture + open gaps
- [deploy-render.md](deploy-render.md) — deploy, rollback, env vars, keep-alive
- [secrets-doppler.md](../secrets-doppler.md) — secrets, rotation, expiry
- [service-role-bypass.md](service-role-bypass.md) · [admin-user-management.md](admin-user-management.md) · [spotify.md](spotify.md) · [book-aggregates.md](book-aggregates.md)
