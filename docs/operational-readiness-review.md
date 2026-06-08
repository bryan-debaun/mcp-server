# Operational Readiness Review — mcp-server (bad-mcp)

> **Status:** Honest self-assessment for a solo personal project. Sections describe what genuinely exists in the repo today. Controls that do **not** exist are flagged **Gap** with an action item rather than papered over. No SLAs, alerting, or paging that aren't actually configured are invented here.
>
> **Reviewer:** Bryan DeBaun (solo owner/operator) · **Date:** 2026-05-31 · **Service version:** `0.1.0`

---

## 1. Service overview & criticality / blast radius

`mcp-server` (npm package `@bryan-debaun/mcp-server`, hosted as **bad-mcp**) is a Node 20 / TypeScript MCP server that exposes two surfaces from one process:

- **MCP transport** (`/mcp` — Streamable HTTP, plus SSE and WebSocket fallbacks) for MCP clients (VS Code Copilot, agents) — tools for books/authors/movies/games/content-creators, GitHub Issues + Projects v2, SQL, Spotify.
- **REST API** (tsoa controllers + auto-generated OpenAPI/Swagger at `/docs`) consumed server-to-server, primarily by `bryandebaun.dev`.

**Hosted at:** `https://bad-mcp.onrender.com` (Render, `starter` plan, Docker). PORT 8080.

### Criticality / blast radius — READ THIS FIRST

> **This is THE shared runtime dependency of the ecosystem.** `bryandebaun.dev`'s books / authors / movies / games data is **not** stored in the website — it is fetched at runtime from this service's REST API. **If mcp-server is down, cold-starting, or its database is paused, the website's reading-library and media data features degrade or fail.**

Contributing realities that widen the blast radius:

- **Render `starter` cold starts / spin-down latency** — the first request after idle is slow; the website must tolerate this.
- **Supabase free-tier auto-pause** after ~1 week of inactivity — DB writes/reads fail until the project is resumed.
- **Cloudflare in front of the host** can return an HTML challenge page instead of JSON — the website client must detect and handle non-JSON responses.

| Attribute | Value |
|---|---|
| Owner / on-call | Bryan DeBaun (solo) |
| Tier | Personal project, but **production-facing** for the website |
| Direct downstream consumers | `bryandebaun.dev` (data), MCP clients (VS Code, agents), GitHub automation |
| Upstream dependencies | Supabase Postgres, GitHub API, Spotify API, Supabase Auth (JWKS) |
| Blast radius if down | Website data features degrade; MCP tooling and GitHub/issue automation unavailable |

---

## 2. Architecture & dependencies

### Stack (verified against `package.json`)

- **Runtime:** Node ≥ 20 (ESM, `"type": "module"`), TypeScript strict.
- **MCP:** `@modelcontextprotocol/sdk` ^1.
- **HTTP:** Express 4 + tsoa (`@tsoa/runtime` ^7-alpha) — controllers auto-generate routes and OpenAPI; Swagger UI via `swagger-ui-express`.
- **DB:** Prisma 7 + `@prisma/adapter-pg` over `pg` → Supabase Postgres.
- **Auth:** `jose` (Supabase JWT verification via JWKS).
- **Validation:** `zod` (env + tool/DTO schemas).
- **Observability:** `pino` (structured logs), `@sentry/node` (no-op without DSN), `prom-client` (Prometheus metrics).
- **Integrations:** `@octokit/rest` + `@octokit/graphql` (Issues + Projects v2); Spotify adapter.
- **Transports:** `ws` (WebSocket MCP), custom HTTP-stream + SSE transports.

### Runtime topology

```
MCP clients (VS Code / agents) ─┐
bryandebaun.dev (SSR/server)   ─┤→ Cloudflare → Render (bad-mcp) ─┬→ Supabase Postgres (Prisma)
GitHub automation callers      ─┘                                  ├→ GitHub API (Octokit)
                                                                   ├→ Spotify API
                                                                   └→ Supabase Auth JWKS (token verify)
```

### Dependency criticality

| Dependency | Used for | If unavailable | Degradation mode |
|---|---|---|---|
| Supabase Postgres | All catalog data, profiles, ratings, audit log | Writes throw; reads empty | **Lazy Prisma init + stub fallback** — server still boots; DB reads return `[]`/`null`, writes throw a clear "not configured" error (`src/db/index.ts`) |
| Supabase Auth (JWKS) | Admin JWT verification | Admin REST writes fail (401) | Read paths and MCP-key paths unaffected |
| GitHub API | Issues / Projects tools | Those tools error | Rest of service unaffected; subject to **GitHub rate limits** |
| Spotify API | Now-playing / playback tools | Spotify routes error | Cleanly disabled if creds absent (`config.spotify.enabled` is false unless all three creds present) |
| Render platform | Hosting | Full outage | Cold-start latency on wake from idle |

**Notable design choice (verified):** Prisma initialization is **lazy** (`initPrisma()`), and a **stub Prisma client** is installed when `DATABASE_URL` is unset or the client fails to load — reads resolve empty, writes throw. This lets the process start in DB-less/preview modes without crashing.

---

## 3. Deployment & rollback

### Deploy (verified `deploy/render.yaml` + `Dockerfile`)

- **Platform:** Render web service, `env: docker`, `plan: starter`, `branch: main`, `autoDeploy: true` → **every push to `main` triggers a production deploy.**
- **Build command (render.yaml):** `corepack enable && pnpm install --frozen-lockfile && pnpm run build && pnpm exec prisma migrate deploy && pnpm run prisma:seed`
  - `pnpm run build` = `prisma generate && tsoa spec-and-routes && tsc && build:seed`.
  - **Migrations run at deploy time** via `prisma migrate deploy`.
  - **Seed runs at deploy time** (`prisma:seed`) — see ADR-0008 (prevent runtime DB seed) for the guardrail context.
- **Start:** `pnpm run start` → `node dist/index.js`.
- **Health check path:** `/healthz` (Render uses this to gate the deploy).
- **Image:** multi-stage `node:20-alpine`; runtime installs prod deps only and copies the generated Prisma client.

### Rollback (verified `docs/runbooks/deploy-render.md`)

- **Primary:** Render dashboard → promote a previous revision (fast, no rebuild).
- **Secondary:** `git revert` the offending commit and push to `main` → autoDeploy rebuilds the prior good state.

### Gaps

- **Gap — auto-deploy on `main` with no staging gate or smoke gate.** A bad push to `main` deploys straight to production. Canary checks in the runbook are **manual** (`curl /healthz`, `/api/playback`, `/metrics`).
  - *Action:* Add a minimal CI gate (build + `pnpm test` + `pnpm run verify`) that must pass before Render deploys, or deploy from a release branch. Consider Render preview environments for risky changes.
- **Gap — migrations + seed run inline in the deploy build with no automated pre-deploy backup.** A failed/destructive migration affects production directly (see §10).
  - *Action:* Snapshot the DB (or confirm Supabase PITR window) before running migrations on schema-changing deploys.

---

## 4. Configuration & secrets

### Configuration (verified `src/config.ts`)

- **Single source of truth:** `src/config.ts` is the **only** module that reads `process.env`, validated with **zod**.
- **Fail-fast:** on validation failure the process prints the offending vars and **`process.exit(1)`** — bad config never boots a half-configured server.
- **dotenv** loaded only when `NODE_ENV !== 'production'`; Render injects env vars directly.
- Sensible derivations: JWKS URL derived from `PUBLIC_SUPABASE_URL` if not explicit; service-role and anon keys accept legacy aliases; `spotify.enabled` is true only when all three Spotify creds are present.

### Key environment variables

| Var | Purpose | Required for |
|---|---|---|
| `DATABASE_URL` | Postgres connection (Prisma) | All DB features (stub fallback if absent) |
| `MCP_API_KEY` | MCP gateway key (Bearer or `X-Mcp-Api-Key`) | Gating MCP + DB-dependent REST routes |
| `SUPABASE_JWKS_URL` / `PUBLIC_SUPABASE_URL` | JWT verification (JWKS) | Admin REST auth |
| `SUPABASE_ISS`, `SUPABASE_AUD` | JWT `iss`/`aud` validation | Admin REST auth |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | Service-role bypass identity | Server-to-server admin |
| `INTERNAL_ADMIN_KEY`, `ADMIN_IP_ALLOWLIST` | Harden service-role bypass | Service-role admin path |
| `GITHUB_TOKEN` | Octokit (Issues/Projects) | GitHub tools |
| `SPOTIFY_CLIENT_ID/SECRET/REFRESH_TOKEN` | Spotify | Spotify tools |
| `SENTRY_DSN` | Error tracking | Error reporting (no-op if unset) |

### Secrets handling

- Secrets live in **Render environment variables** (and GitHub Actions secrets for CI), **never committed** (verified runbook guidance).
- **Sentry scrubbing (verified `src/sentry.ts`):** a `SENSITIVE_KEY` regex redacts `authorization|cookie|token|secret|password|api-key|jwt|dsn`; request headers/cookies stripped; `sendDefaultPii: false`.
- **Auth middleware never logs presented credentials** (verified `mcp-auth.ts`, `jwt.ts`).

### Gaps

- **Gap — no documented secret-rotation cadence or inventory.** The deploy runbook describes service-role rotation steps, but there is no schedule or single secrets inventory.
  - *Action:* Add a short secrets inventory + rotation note (owner, where stored, last rotated) to the deploy runbook.

---

## 5. Observability (logging / metrics / tracing / error-tracking)

| Capability | Status | Detail |
|---|---|---|
| **Structured logging** | **Wired** | `pino` (JSON in prod, pretty in dev, silent in test). Single choke point in `src/logger.ts`. |
| **Metrics** | **Wired** | `prom-client` at **`/metrics`**: default Node metrics + `http_requests_total`, `http_request_duration_seconds` (histogram), plus domain counters (`mcp_auth_failures_total`, `service_role_bypass_total`, `mcp_poll_*`, `book_aggregate_*`, invites, etc.). |
| **Error tracking** | **Wired (conditional)** | `@sentry/node` — **no-op unless `SENTRY_DSN` set**. Bridges every `logger.error` to Sentry; installs uncaught-exception / unhandled-rejection handlers; scrubs sensitive keys; flushes before fatal exit. |
| **Tracing** | **Partial / Gap** | `SENTRY_TRACES_SAMPLE_RATE` is plumbed (default `0`), so distributed tracing is effectively **off** unless DSN + sample rate are set. No OpenTelemetry. |
| **Health / readiness** | **Wired** | `/healthz` (liveness, always 200 + uptime) and `/readyz` (503 until DB init + DB routes registered, then 200). |
| **Metrics scraping** | **Gap** | `/metrics` exists but **nothing scrapes it** — no Prometheus/Grafana, no retention. Metrics are only observable by manual `curl`. |

### Gaps

- **Gap — metrics are exposed but not collected.** No scraper, dashboard, or retention. They reset to zero on each restart/cold start.
  - *Action:* Point a lightweight hosted scraper (e.g., Grafana Cloud free tier) at `/metrics`, or accept that metrics are point-in-time only and document that.
- **Gap (bug-ish) — MCP HTTP handlers log normal flow at `logger.error`.** In `src/http/mcp-http.ts`, routine request lifecycle messages (`POST /mcp called`, `created transport`, `registering tools`, etc.) use `logger.error(...)`. Because `logger.error` is bridged to Sentry, **every normal MCP request would generate Sentry noise when a DSN is set**, and pollutes error logs/metrics interpretation.
  - *Action:* Downgrade these to `logger.debug`/`logger.info`. Low effort, high signal-to-noise payoff.
- **Gap — Sentry not necessarily enabled in production.** It is no-op without `SENTRY_DSN`. Confirm the DSN is actually set in Render, or accept that crashes are only visible in Render log streaming.

---

## 6. Alerting & on-call

**Status: Gap (largely absent) — stated honestly.**

- **No alerting is configured.** There is no paging, no email/Slack alert, no uptime monitor wired today. The deploy runbook *suggests* an external monitor (UptimeRobot/Pingdom) on `/healthz`, but this is a recommendation, not an implemented control.
- **On-call** is "Bryan notices, or the website breaks and Bryan notices." There is no rotation (solo project) and no escalation path — which is acceptable for a personal project but should be acknowledged.
- **Detection today is reactive:** failures typically surface as website data errors or manual checks.

### Gaps / actions (prioritized)

- **Gap — no uptime/health alerting.** *Action:* Add a free external monitor (UptimeRobot) hitting `/healthz` and `/readyz` with email alerts. **(Highest-value, lowest-effort operational improvement.)**
- **Gap — no error alerting.** *Action:* Set `SENTRY_DSN` in Render and enable Sentry issue alerts to email.
- **Gap — no DB-pause / cold-start awareness.** *Action:* Optionally schedule a periodic keep-warm ping (cron) to mitigate Supabase auto-pause and Render spin-down, **or** explicitly accept cold starts and ensure the website degrades gracefully.

---

## 7. Failure modes & runbook responses

| Failure | Likely symptom | Response |
|---|---|---|
| **Render cold start / spin-down** | First request after idle is slow or times out | Expected on `starter`. Website must tolerate latency / retry. Optional keep-warm ping. |
| **Supabase free-tier auto-paused** (~1wk idle) | DB reads empty / writes fail; `/readyz` may stay degraded; connection errors in logs | Resume the Supabase project from its dashboard; verify with `/readyz` and a catalog read. Consider keep-warm. |
| **`DATABASE_URL` unset / Prisma fails to load** | Server boots but reads return empty, writes throw "not configured" | Stub fallback is working as designed. Fix/set `DATABASE_URL` in Render and redeploy. (`src/db/index.ts`) |
| **Cloudflare HTML challenge** | Website receives HTML instead of JSON; parse errors downstream | Website client must detect non-JSON and handle/retry. Server-side: confirm Cloudflare settings for the host. |
| **GitHub API rate limit** | GitHub Issues/Projects tools return 403/limit errors | Back off / wait for reset window; ensure `GITHUB_TOKEN` is set (higher limits). Other features unaffected. |
| **Bad deploy from `main`** | `/healthz` fails post-deploy or restart loop in Render logs | **Roll back:** promote previous Render revision, or `git revert` + push. (§3) |
| **Migration failure during deploy** | Build fails at `prisma migrate deploy`; deploy aborts | Deploy is gated by health check — old revision stays live if new one fails to come up. Investigate migration; restore DB if partially applied (see §10). |
| **JWKS unreachable / `iss`/`aud` misconfig** | Admin REST returns 401 | Verify `SUPABASE_*` vars; `jwt.ts` has a publishable-key fallback fetch path. Read + MCP-key paths unaffected. |
| **Invalid env at boot** | Process exits immediately (exit 1) with listed bad vars | Fix the named env var(s) in Render and redeploy. (`config.ts`) |
| **Service-role bypass abuse attempt** | `service_role_bypass_total` increments; 403s logged | Bypass requires **both** `INTERNAL_ADMIN_KEY` header **and** IP allowlist match; audited to `AuditLog`. (§9) |

**Existing runbooks (verified, `docs/runbooks/`):** `deploy-render.md`, `spotify.md`, `service-role-bypass.md`, `admin-user-management.md`, `book-aggregates.md`; plus `docs/rls.md`, `docs/admin-runbook.md`, and ADRs `0002`–`0009`.

- **Gap — no consolidated "service down / DB paused" incident runbook.** The pieces exist but aren't in one place. *Action:* Add a short top-level incident checklist (resume Supabase → check `/readyz` → roll back if recent deploy → check Sentry/logs).

---

## 8. Scaling, performance & limits

- **Concurrency model:** single Node process, single Render `starter` instance. No horizontal scaling configured.
- **MCP transports:** Streamable HTTP, SSE, and WebSocket. **Each MCP HTTP/SSE/WS connection lazily creates a fresh `McpServer` instance and re-registers all tools** (`mcp-http.ts`, `server.ts`) — fine at personal scale, but not optimized for many concurrent clients.
- **DB connections:** Prisma over `pg` adapter; single connection string. No explicit pool tuning in-repo — relies on adapter/Supabase defaults. **Supabase free tier has low connection ceilings** — relevant if connections aren't pooled.
- **Keepalives:** SSE/HTTP-stream transports write a keepalive every 15s to survive proxy idle timeouts.
- **External rate limits:** GitHub API (primary constraint for issue/project tools); Spotify API; Supabase free-tier quotas.

### Gaps

- **Gap — no load/perf baseline.** The `http_request_duration_seconds` histogram exists but no numbers have been captured. No documented throughput/latency expectations.
  - *Action:* Capture a one-time baseline (warm) for a few representative REST + MCP calls; record p50/p95 in this doc.
- **Gap — per-connection MCP server creation** could be costly under load. *Action:* Acceptable now; revisit only if concurrency grows.
- **Gap — no rate limiting on the service's own endpoints.** Relies on `MCP_API_KEY` + Cloudflare. *Action:* Acceptable for now; note as a future consideration if exposed more broadly.

---

## 9. Security

### Auth layers (verified)

1. **MCP gateway key (`MCP_API_KEY`)** — `mcpAuthMiddleware` (DB-dependent REST routes) and the `/mcp` handlers gate on a shared key, accepted two ways:
   - `Authorization: Bearer <MCP_API_KEY>` (pure MCP clients), or
   - `X-Mcp-Api-Key: <MCP_API_KEY>` (callers like the website whose Authorization header already carries a user JWT).
   - **Fail-closed**, never logs the credential, increments `mcp_auth_failures_total`. **No-op when `MCP_API_KEY` is unset** — so this gate only protects when the key is configured (confirm it is set in Render).
2. **Supabase JWT (admin REST)** — tsoa `@Security('jwt', ['admin'])` + `expressAuthentication`/`jwtMiddleware`. Verified with `jose` JWKS, checking `iss`/`aud`. App role resolved from `app_metadata.role` (token-baked, stateless) or local `Profile` fallback — deliberately **not** the Postgres `role` claim.
3. **Service-role bypass** — a request bearing the Supabase service-role key is marked `service` but `requireAdmin` still requires **both** a matching `INTERNAL_ADMIN_KEY` header **and** an IP in `ADMIN_IP_ALLOWLIST`; otherwise 403. Audited to `AuditLog` and counted (`service_role_bypass_total`). (See `docs/runbooks/service-role-bypass.md`.)

### Other controls

- **Input validation:** zod on env and tool/DTO schemas; tsoa validates REST DTOs.
- **RLS (verified `prisma/migrations/.../enable_rls`):** RLS enabled on `Role`, `Profile`/`User`, `Invite`, `AccessRequest`, `AuditLog`, `Author`, `Book`, `BookAuthor`, `Rating` with owner-by-email / admin-override / public-read-lookup policies driven by `request.jwt.claims.*`. CI checklist in `docs/rls.md` requires RLS in new table migrations.
- **Secrets:** see §4 — env-only, scrubbed from Sentry, not logged.
- **Error responses:** global handler returns generic `internal error` in production (no stack/message leakage).
- **Admin debug endpoints:** hard-blocked in production regardless of `ADMIN_DEBUG_ENABLED` (verified `index.ts`).

### Gaps

- **Gap — RLS depends on `request.jwt.claims.*` being set on the DB session.** The app connects with a single `DATABASE_URL` via the pg adapter; RLS only enforces if the connection role isn't a bypass superuser and the JWT claims are propagated to the session. *Action:* Confirm the connection role and claim propagation actually exercise the policies (an integration test gated by `RUN_DB_INTEGRATION`), so RLS is defense-in-depth rather than assumed.
- **Gap — `MCP_API_KEY` optional.** If unset in Render, DB-dependent REST + MCP routes are ungated. *Action:* Verify it is set in production.
- **Gap — no dependency vulnerability scanning** (e.g., Dependabot / `npm audit` in CI). Uses alpha tsoa. *Action:* Enable Dependabot or a scheduled `npm audit`.

---

## 10. Data: migrations, backup / restore

### Migrations (verified `prisma/migrations/`)

- **Tool:** Prisma migrations; `prisma migrate deploy` runs **inline during the Render build** on every deploy.
- **History:** ~20 ordered migrations (init → auth/magic-links → RLS → content entities → embed ratings). `migration_lock.toml` present.
- **Seed:** `prisma:seed` runs at deploy time; ADR-0008 documents preventing *runtime* seeding.

### Backup / restore

- **Relies entirely on Supabase's managed backups** for the underlying Postgres. **No application-level backup/export job exists in this repo.**

### Gaps

- **Gap — backup/restore is unverified and undocumented.** Free-tier Supabase backup/PITR coverage and retention window are not confirmed here, and no restore drill has been done.
  - *Action:* Confirm the Supabase plan's backup/PITR window; document it; do one trial restore (or a manual `pg_dump` export) so restore is known-good before it's needed.
- **Gap — no pre-migration backup step.** Migrations apply directly to production during deploy with no snapshot first.
  - *Action:* For schema-changing migrations, take a snapshot/export first (see §3).
- **Gap — no migration rollback plan.** Prisma migrations are forward-only here; there are no down-migrations.
  - *Action:* For risky migrations, write an explicit reverse SQL alongside, or rely on restore-from-backup as the documented rollback.

---

## 11. Availability expectations / informal SLOs

These are **informal, best-effort targets for a solo project** — *not* contractual SLAs, and there is no measurement/alerting backing them today (see §6).

| Aspect | Informal target | Reality / caveat |
|---|---|---|
| Availability | "Up when needed; best-effort" | Render `starter` spin-down + Supabase auto-pause mean **cold starts and idle pauses are expected**, not incidents |
| Cold-start latency | Tolerated, not bounded | Website must handle slow first request after idle |
| Warm latency | No committed number | Histogram exists; baseline not yet captured (§8) |
| Data durability | Defer to Supabase managed backups | Not yet verified (§10) |
| RTO (recovery time) | "Manual, minutes-to-hours" | Roll back via Render revision; resume Supabase manually |
| RPO (data loss) | Defer to Supabase backup window | **Unverified** — confirm window (§10) |

**Honest summary:** the realistic posture is "best-effort, owner-monitored, degrade-gracefully." The website should be built to tolerate this host being slow, cold, or briefly unavailable.

---

## 12. Readiness checklist + prioritized open action items

### Readiness checklist

| Control | State |
|---|---|
| Health (`/healthz`) + readiness (`/readyz`) probes | ✅ Implemented |
| Structured logging (pino) | ✅ Implemented |
| Metrics endpoint (`/metrics`, prom-client) | ✅ Exposed |
| Error tracking (Sentry) | ⚠️ Code wired; **active only if `SENTRY_DSN` set** |
| Fail-fast env validation (zod) | ✅ Implemented |
| Layered auth (MCP key + Supabase JWT + hardened service-role) | ✅ Implemented |
| RLS on data tables | ✅ Migrations present; ⚠️ enforcement path unverified |
| Secrets in env, scrubbed from telemetry | ✅ Implemented |
| Deploy + rollback path | ✅ Documented (Render revision / git revert) |
| Migrations automated | ✅ At deploy; ⚠️ no pre-migration backup |
| Metrics **collection** / dashboards | ❌ Gap — exposed but not scraped |
| **Alerting / uptime monitoring** | ❌ Gap — none configured |
| Backup/restore verified | ❌ Gap — relies on Supabase, undrilled |
| CI gate before production deploy | ❌ Gap — autoDeploy on `main`, manual canary |
| Dependency vuln scanning | ❌ Gap — none |
| Load/perf baseline | ❌ Gap — none captured |

### Prioritized open action items (the Gaps)

| # | Priority | Gap | Action |
|---|---|---|---|
| 1 | **High** | No uptime/health alerting (§6) | Add UptimeRobot (free) on `/healthz` + `/readyz` with email alerts. Lowest effort, highest value. |
| 2 | **High** | Error tracking may be inert (§5/§6) | Confirm/set `SENTRY_DSN` in Render; enable Sentry email alerts. |
| 3 | **High** | Backup/restore unverified (§10) | Confirm Supabase backup/PITR window; document RPO; run one trial restore or `pg_dump`. |
| 4 | **High** | `mcp-http.ts` logs normal flow at `error` → Sentry noise (§5) | Downgrade routine MCP request logs to `debug`/`info`. |
| 5 | Medium | Auto-deploy on `main`, no CI gate (§3) | Require build + `pnpm test` + `pnpm run verify` to pass before deploy; consider preview env. |
| 6 | Medium | No pre-migration backup; forward-only migrations (§3/§10) | Snapshot DB before schema-changing deploys; add reverse SQL for risky migrations. |
| 7 | Medium | RLS enforcement path unverified (§9) | Add `RUN_DB_INTEGRATION` test proving owner-isolation; confirm claim propagation on the app's DB session. |
| 8 | Medium | Metrics exposed but not collected (§5) | Point a hosted scraper (Grafana Cloud free) at `/metrics`, or document them as point-in-time only. |
| 9 | Low | Cold-start / DB-pause degradation (§1/§7) | Optional keep-warm cron; ensure website degrades gracefully and handles Cloudflare HTML challenges. |
| 10 | Low | No dependency vuln scanning (§9) | Enable Dependabot or scheduled `npm audit`. |
| 11 | Low | No consolidated incident runbook (§7) | Add a one-page "service down / DB paused" checklist. |
| 12 | Low | No perf baseline / no endpoint rate limiting (§8) | Capture warm p50/p95 once; revisit rate limiting only if exposure grows. |

---

*Compiled from repository inspection on 2026-05-31: `package.json`, `deploy/render.yaml`, `Dockerfile`, `src/config.ts`, `src/index.ts`, `src/logger.ts`, `src/sentry.ts`, `src/db/index.ts`, `src/http/server.ts`, `src/http/mcp-http.ts`, `src/http/health-route.ts`, `src/http/readiness.ts`, `src/http/metrics-route.ts`, `src/http/middleware/mcp-auth.ts`, `src/http/authentication.ts`, `src/auth/jwt.ts`, `src/auth/requireAdmin.ts`, `prisma/migrations/`, and `docs/` runbooks/ADRs.*
