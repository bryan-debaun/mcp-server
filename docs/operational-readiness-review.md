# Operational Readiness Review — mcp-server (bad-mcp)

> **Status:** Honest self-assessment for a solo personal project. Sections describe what genuinely exists in the repo today. Controls that do **not** exist are flagged **Gap** with an action item rather than papered over. No SLAs, alerting, or paging that aren't actually configured are invented here.
>
> **Reviewer:** Bryan DeBaun (solo owner/operator) · **Original:** 2026-05-31 · **Re-verified:** 2026-07-31 · **Service version:** `0.1.0`

## Re-verification summary — 2026-07-31

Every gap from the 2026-05-31 review was re-checked against the code as it stands today. Outcome:

| | Count | |
|---|---|---|
| ✅ **Closed** | 8 | #4 (Sentry log noise), #5 (CI-gated deploys), #6 (snapshot tooling), #7 (RLS — *verified, and the answer was bad*), #9 (cold-start keep-alive), #10 (Dependabot), #11 (incident runbook), #12 (perf baseline) |
| ❌ **Still open** | 4 | #1, #2, #3, #8 — **all ops actions.** Nothing in the repo can close them. |

**Gap #7 deserves calling out.** It was listed as "migrations present, enforcement path unverified". Verifying it found that RLS is **not an active control at all** — the app's role owns every table, no table uses `FORCE`, the production role carries `BYPASSRLS`, most tables have RLS disabled outright, and the RLS test files were empty skipped stubs. Three independent bypasses. See §9; the posture is now pinned by a test so it cannot drift silently again.

**Five findings were added that the original review missed.** Two were live defects:

| New | Severity | Finding |
|---|---|---|
| **A** | 🔴 High | **Credential leak to Sentry.** `mcp-http.ts` logged the caller's presented bearer token verbatim (`{ got: auth }`) at `logger.error` on every auth failure. `logger.error` is bridged to Sentry, and Sentry scrubs by *key name* — `got` matches none of the scrub patterns, so failed auth attempts shipped the presented key out in the clear. **Fixed (#152).** |
| **B** | 🔴 High | **Silent admin downgrade.** The JWT subject lookup was gated on a UUID regex; a non-matching subject resolved to no profile, which reports `isAdmin: false`. Indistinguishable from an ordinary non-admin in the logs. **Fixed (#151).** |
| **C** | 🟠 Medium | **Deployment docs contradicted themselves about migrations** — `deploy/render.yaml` said migrations are "intentionally NOT run automatically", the Dockerfile `CMD` ran `prisma migrate deploy` at boot, and §3 of this document described a third mechanism (a Render build command). During an incident, ambiguity about the most destructive operation is worse than either answer. **Fixed.** |
| **D** | 🔴 **High** (was Medium) | **The boot migration never ran at all — for a month.** Production sat with **two unapplied migrations from 2026-06-28 to 2026-07-31** while the code needing them was live; the résumé tables from #145/#147 never existed. **Root cause (confirmed 2026-08-01): Render's dashboard `Docker Command` field was set to `node dist/index.js`, which overrides the Dockerfile `CMD` *and* `ENTRYPOINT`.** The migrate step was never executed — not "executed and failed". A blueprint cannot protect against this: a dashboard value silently wins over both `render.yaml` and the Dockerfile. **Fixed** (field cleared; the hazard is now documented in three places). |
| **E** | 🟡 Low | **`pnpm run verify` was unrunnable on Windows.** No `.gitattributes` + `core.autocrlf=true` → CRLF working tree, while Biome's formatter defaults to LF. Every file reported as a format error locally; CI (Linux) would have passed, except CI never ran `verify`. The check rotted where nobody could see it. **Fixed.** |

Findings A, B, C and E are fixed in this pass. D is documented as an accepted risk. The remaining open gaps are re-stated with current evidence in §12.

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

> **Corrected 2026-07-31 (finding C).** The description below was wrong: it cited a `render.yaml` build command that Render **ignores** for Docker services, and claimed the seed runs at deploy time (it does not). Verified against the `Dockerfile` and `deploy/render.yaml` as they stand.

- **Platform:** Render web service, `runtime: docker`, `plan: starter`, `branch: main`, `autoDeploy: true` → **every push to `main` triggers a production deploy.**
- **Build:** driven entirely by the `Dockerfile` (multi-stage `node:24-alpine`). Render **ignores `buildCommand`/`startCommand` for Docker services** — the Dockerfile is the source of truth. It runs `pnpm run build` (= `prisma generate && tsoa spec-and-routes && tsc && build:seed`) and ships a pruned, production-only `node_modules`.
- **Start + migrations:** the Dockerfile `CMD` is
  ```sh
  sh -c "pnpm exec prisma migrate deploy || echo '[boot] prisma migrate deploy failed; starting anyway'; exec node dist/index.js"
  ```
  So **migrations run at container boot**, not at build. `prisma` + `@prisma/config` are kept as prod deps so the CLI survives the prune.
  - The step is **deliberately non-fatal** so a paused Supabase project doesn't crash-loop the service — see finding **D**.
  - `DATABASE_URL` must be a **direct** (non-pooled, port 5432) connection; Supabase's pgbouncer endpoint can't take the advisory locks `migrate deploy` needs.
- **Seeding is NOT automatic** (ADR-0008) — boot never seeds. Run explicitly from the Render Shell: `pnpm exec prisma db seed`.
- **Health check path:** `/healthz` (Render uses this to gate the deploy).

### Rollback (verified `docs/runbooks/deploy-render.md`)

- **Primary:** Render dashboard → promote a previous revision (fast, no rebuild).
- **Secondary:** `git revert` the offending commit and push to `main` → autoDeploy rebuilds the prior good state.

### Gaps

- 🟡 **Gap #5 (partially closed) — auto-deploy on `main` is still not gated by CI.** Two workflows now run on every PR *and* push to `main`: `ci-deploy-render.yml` (install → `build:spec` → **`pnpm run verify`** → `pnpm test` → `pnpm run build`) and `db-integration.yml` (`sql:parse` → `prisma migrate deploy` → seed → full suite against a real Postgres). `verify` was added 2026-07-31; before that CI ran tests and build only, and `verify` had rotted (finding **E**).
  - **What's still open:** Render's `autoDeploy: true` fires on the push independently — it does **not** wait for the workflows. A red build and a live deploy can happen concurrently.
  - *Action:* Disable `autoDeploy` and trigger Render from the workflow on success (deploy hook), or accept and rely on the `/healthz` deploy gate + fast rollback.
- ❌ **Gap #6 (open) — no automated pre-deploy backup.** Migrations now apply at **container boot** (corrected above), so a schema-changing deploy hits production with no snapshot first, and the step is non-fatal (finding **D**) — a failure leaves the server running against an un-migrated schema.
  - *Mitigating:* migration SQL is genuinely exercised before production — `db-integration.yml` runs `prisma migrate deploy` against a real Postgres 15 on every PR to `main`, plus `sql:parse` as a syntax check.
  - *Action:* Snapshot the DB (or confirm the Supabase PITR window) before schema-changing deploys, and **grep the boot log for `[boot] prisma migrate deploy failed`** after each one.

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
| `OIDC_JWKS_URL` / `PUBLIC_SUPABASE_URL` | JWT verification (JWKS) | Admin REST auth |
| `OIDC_ISSUER`, `OIDC_AUDIENCE` | JWT `iss`/`aud` validation | Admin REST auth |
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

- ❌ **Gap #8 (open) — metrics are exposed but not collected.** No scraper, dashboard, or retention. They reset to zero on each restart/cold start. **Ops action; nothing in the repo can close this.**
  - *Action:* Point a lightweight hosted scraper (e.g., Grafana Cloud free tier) at `/metrics`, or accept that metrics are point-in-time only and document that.
- ✅ **Gap #4 (CLOSED 2026-07-31) — MCP HTTP handlers logged normal flow at `logger.error`.** All 19 routine-lifecycle calls in `src/http/mcp-http.ts` were re-levelled. The convention is now documented at `registerMcpHttp` and guarded by tests in `test/http/mcp-http.test.ts`:
  - `debug` — routine lifecycle (`POST /mcp called`, `created transport`, `registering tools`, `request handled`).
  - `warn` — caller-fault conditions (bad auth, missing conn id, unparseable payload). Not our failure; must not page.
  - `error` — we failed. 6 remain, all genuine.
  - **While fixing this, finding A surfaced:** the auth-failure branches logged the presented bearer token verbatim as `{ got: auth }`. Sentry scrubs by key name and `got` matched nothing, so a failed auth attempt shipped the credential to Sentry in the clear. Fixed alongside (#152).
- ❌ **Gap #2 (open) — Sentry not necessarily enabled in production.** No-op without `SENTRY_DSN`. **Ops action.** Note this gap and #4 compound: enabling the DSN *before* the log-level fix would have flooded Sentry with one issue per MCP request. Safe to enable now.
  - *Action:* Confirm/set `SENTRY_DSN` in the Doppler `prd` config, or accept that crashes are only visible in Render log streaming.

### New in this pass

- ✅ **Startup capability warnings (#155).** `src/capabilities.ts` logs one `warn` per unconfigured optional integration at boot (`capability disabled: github — GITHUB_TOKEN not set; …`) and `/healthz?deep=1` reports a `capabilities` map. Deliberately `warn`, not `error` — an intentionally-unconfigured integration must not page on every boot.
- ✅ **`auth_subject_unresolved_total` (#151).** Counts verified tokens whose subject maps to no local Profile, kept distinct from `mcp_auth_failures_total` — this is not an auth failure, it is a broken identity mapping. It is the metric that would have made finding **B** visible.

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

- ✅ **Gap #11 (CLOSED 2026-07-31) — consolidated incident runbook.** [`docs/runbooks/incident-response.md`](runbooks/incident-response.md) is now the single entry point: a 60-second triage table mapping `/healthz`, `/healthz?deep=1` and `/readyz` responses to a section, then per-cause procedures (DB paused, crash loop, config, degraded integration, Cloudflare HTML, migration trouble). It leads with what is **expected behaviour** rather than an incident — cold starts and the Supabase weekly pause — so time isn't lost chasing normal behaviour.
  - One non-obvious behaviour it captures: readiness is set **once** at startup (`src/http/server.ts`), so a DB that recovers *after* a failed init leaves `/readyz` stuck at 503 until the service is **restarted**.

---

## 8. Scaling, performance & limits

- **Concurrency model:** single Node process, single Render `starter` instance. No horizontal scaling configured.
- **MCP transports:** Streamable HTTP, SSE, and WebSocket. **Each MCP HTTP/SSE/WS connection lazily creates a fresh `McpServer` instance and re-registers all tools** (`mcp-http.ts`, `server.ts`) — fine at personal scale, but not optimized for many concurrent clients.
- **DB connections:** Prisma over `pg` adapter; single connection string. No explicit pool tuning in-repo — relies on adapter/Supabase defaults. **Supabase free tier has low connection ceilings** — relevant if connections aren't pooled.
- **Keepalives:** SSE/HTTP-stream transports write a keepalive every 15s to survive proxy idle timeouts.
- **External rate limits:** GitHub API (primary constraint for issue/project tools); Spotify API; Supabase free-tier quotas.

### Gaps

- ✅ **Gap #12 (CLOSED 2026-07-31) — warm latency baseline captured.**

  Measured against production, warmed first so this is steady state and not a cold start. n=12 sequential per endpoint from a home connection, so these include real internet + Cloudflare latency — they are an *operator's* view, not server-side timings.

  | Endpoint | p50 (ms) | p95 (ms) |
  |---|---|---|
  | `GET /healthz` | 53 | 77 |
  | `GET /healthz?deep=1` | 129 | 389 |
  | `GET /readyz` | 51 | 414 |
  | `GET /metrics` | 66 | 93 |
  | `GET /.well-known/oauth-protected-resource/mcp` | 51 | 68 |
  | `GET /api/books` | 307 | 644 |
  | `GET /api/movies` | 180 | 308 |

  Reading it: static/liveness routes sit around **~50ms**, which is essentially network round-trip — the server adds almost nothing. DB-backed catalog reads are **3–6× that**, and `/healthz?deep=1` (a single `SELECT 1`) costs ~80ms over the shallow probe, which is the Supabase round-trip. So catalog latency is dominated by database time, not application work — worth knowing before optimising anything in this repo.
  
  `/api/books` p95 of 644ms is the number to watch: it's the endpoint `bryandebaun.dev` depends on, and it's the slowest thing here.

  **These are point-in-time, not monitored.** Nothing scrapes `/metrics` (gap #8), so there is no trend and no alert if this doubles. Re-capture with `PERF_BASE`/`MCP_API_KEY` if you want a fresh read after a change.
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
- **RLS — ❌ NOT an active control (corrected 2026-07-31).** The previous revision of this document claimed RLS was enabled on `Role`, `Profile`/`User`, `Invite`, `AccessRequest`, `AuditLog`, `Author`, `Book`, `BookAuthor`, `Rating` as defence-in-depth. Verified against production, that is **false on every count**:

  | Claim | Reality |
  |---|---|
  | RLS enabled on the catalog tables | **7 of 11 tables have RLS disabled and zero policies.** `20260219163147_simplify_single_user` deliberately dropped them. Only `Article`, `Bet`, `Resume`, `ResumeDownloadRequest` still have RLS on. |
  | Policies constrain access | **No table uses `FORCE ROW LEVEL SECURITY`** — no migration in this repo ever has. The app connects as `postgres`, which **owns every table**, and owners bypass RLS without FORCE. |
  | …at minimum the role is constrained | The production role also carries **`rolbypassrls = true`**, which skips policies regardless of ownership or FORCE. |
  | "exercised by `test/rls/**` and `test/integration/rls*`" | `test/integration/rls*.test.ts` are **empty `describe.skip` stubs with the test bodies deleted**. `test/rls/**` are SQL/migration *lint* tests — they never open a connection. There were **zero** RLS enforcement tests. |

  Three independent bypasses, any one sufficient. **RLS provides no protection for this application's connection.**

  This is not necessarily the wrong design: authorization is enforced in the application layer (OIDC JWT → `resolveAppRole` → `requireAdmin`, plus the MCP gateway key), and for a single-user service that is a defensible place for it to live. The single-user simplification that removed the policies was a deliberate decision. **What was wrong was the belief that a second layer existed.** An inert control you trust is worse than one you know you don't have.

  **Resolved 2026-08-01 — RLS is now a real control.** Built, merged, and inert until a credential cutover ([`docs/runbooks/rls-cutover.md`](runbooks/rls-cutover.md)):

  - **`20260801120000_enforce_rls`** creates `mcp_app` — a non-owner, `NOBYPASSRLS` role with data privileges but **no DDL** — and sets `ENABLE` + **`FORCE ROW LEVEL SECURITY`** with a uniform policy pair on every table: `USING (true)` for SELECT, `role = 'admin'` for writes. FORCE is deliberate: without it, ownership alone silently reopens everything, which is how this became inert the first time.
  - **`src/db/with-request-claims.ts`** wraps write operations in a transaction that `set_config`s `request.jwt.claims.*` first. `is_local => true` scopes the setting to that transaction so it cannot bleed across a pooled connection — load-bearing on Supabase's transaction pooler.
  - **Reads are not wrapped.** Catalog reads are public and are the hot path (`/api/books` p50 307ms, already DB-round-trip bound); carrying identity on them would cost two extra round-trips per page load for no security gain. Writes are where an authorization bug costs something.
  - Identity is established by whichever gate resolves it — `jwtMiddleware`, TSOA's `expressAuthentication`, `mcpAuthMiddleware`, and a wrapper around MCP tool handlers in `createServer()`. The MCP gateway key and service-role path map to admin claims, preserving today's behaviour exactly; what changes is that a **user JWT can no longer write without genuinely resolving to admin.**

  Why the migration alone couldn't do it: `postgres` owns every table *and* carries `BYPASSRLS`. No `ALTER TABLE` overrides that — enforcement requires connecting as a different role, i.e. a credential rotation. Hence a runbook rather than a deploy.

  `test/integration/rls-enforcement.test.ts` now asserts enforcement rather than pinning inertness, and connects **as `mcp_app`** — testing as the owner would pass vacuously, which is precisely the trap the original setup fell into.

  > **One footgun, found by the spike and pinned by a test.** Prisma operations are lazy, so `runWithDbContext(ctx, () => db.x.create(…))` without an inner `await` executes *after* the scope exits and loses its claims. It fails closed, but silently.
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
| RLS on data tables | ❌ **Not an active control** — verified inert; posture pinned by test (§9) |
| Pre-migration snapshot tooling | ✅ `pnpm run db:snapshot` |
| Warm latency baseline | ✅ Captured 2026-07-31 (§8) |
| Secrets in env, scrubbed from telemetry | ✅ Implemented |
| Deploy + rollback path | ✅ Documented (Render revision / git revert) |
| Migrations automated | ✅ At deploy; ⚠️ no pre-migration backup |
| Metrics **collection** / dashboards | ❌ Gap — exposed but not scraped |
| **Alerting / uptime monitoring** | ❌ Gap — none configured |
| Backup/restore verified | ❌ Gap — relies on Supabase, undrilled |
| CI gate before production deploy | 🟡 CI runs verify + tests + migrations on every PR; Render `autoDeploy` still doesn't wait for it |
| Dependency vuln scanning | ✅ Dependabot (npm weekly grouped, actions + docker monthly) |
| Load/perf baseline | ❌ Gap — none captured |
| Consolidated incident runbook | ✅ `docs/runbooks/incident-response.md` |
| Line-ending policy / runnable `verify` | ✅ `.gitattributes` pins LF; CI enforces `verify` |
| Startup capability warnings | ✅ `src/capabilities.ts` + `/healthz?deep=1` |

### Prioritized open action items — as of 2026-07-31

**Ops-only — nothing in the repo can close these. They are the highest-value items remaining.**

| # | Priority | Gap | Action |
|---|---|---|---|
| 1 | **High** | No uptime/health alerting (§6) | Add UptimeRobot / cron-job.org (free) on `/healthz?deep=1` with email alerts. **Still the lowest-effort, highest-value operational improvement.** The deep variant covers Render spin-down *and* Supabase auto-pause in one ping. |
| 2 | **High** | Error tracking inert without a DSN (§5) | Set `SENTRY_DSN` in the Doppler `prd` config. Now safe — gap #4 (per-request Sentry noise) is fixed, so this no longer floods. |
| 3 | **High** | Backup/restore unverified (§10) | Confirm the Supabase backup/PITR window; document the real RPO; run one trial restore or `pg_dump`. |
| — | **High** | `GITHUB_TOKEN` unset in production (#155) | Mint a PAT with **`repo` + `project`** scopes, set it in Doppler `prd`, confirm it reaches Render. The code half (boot warning + health signal) is done. |
| 8 | Medium | Metrics exposed but not collected (§5) | Point a hosted scraper (Grafana Cloud free) at `/metrics`, or accept and document them as point-in-time only. |

**Open decisions (not gaps — deliberate choices left to the owner)**

| Topic | Decision needed |
|---|---|
| **RLS** (§9) | **Decided: make it real.** Built and merged, currently inert pending a credential cutover — see [`docs/runbooks/rls-cutover.md`](runbooks/rls-cutover.md). |
| **Deploy gating** (§3) | The workflow now gates deploys, but it only takes effect once Auto-Deploy is turned **off** in the Render dashboard and `RENDER_DEPLOY_HOOK_URL` is set. Until then Render still deploys on push and the gate is inert. |
| **Rate limiting** (§8) | Still none. Relies on `MCP_API_KEY` + Cloudflare. Fine at current exposure; revisit if the surface widens. |

**Closed in this pass**

| # | Gap | Resolution |
|---|---|---|
| 4 | `mcp-http.ts` logged normal flow at `error` → Sentry noise | 19 calls re-levelled to `debug`/`warn`; convention documented + test-guarded |
| 9 | Cold-start / DB-pause degradation | `/healthz?deep=1` + documented external keep-warm cron (#119); now also in the incident runbook |
| 10 | No dependency vuln scanning | `.github/dependabot.yml` — grouped weekly npm, monthly actions/docker; `tsoa` pinned out (deliberate alpha) |
| 11 | No consolidated incident runbook | `docs/runbooks/incident-response.md` |
| A | Credential leak to Sentry | Fixed (#152) |
| B | Silent admin downgrade | Fixed (#151) |
| C | Contradictory migration docs | Fixed — `deploy/render.yaml` and §3 corrected against the Dockerfile |
| D | Boot migration failing silently for a month | Fixed — see below |
| E | `verify` unrunnable on Windows | `.gitattributes` pins LF; CI now runs `verify` |
| 5 | Deploys not gated on CI | Workflow triggers Render's deploy hook after `verify` + tests + build + db-integration pass. **Needs Auto-Deploy off + `RENDER_DEPLOY_HOOK_URL` to take effect.** |
| 6 | No pre-migration snapshot | `pnpm run db:snapshot` — refuses the transaction pooler, matches `pg_dump` to the server's major version, deletes partial output rather than leaving a file that looks like a backup |
| 7 | RLS enforcement unverified | Verified — it is **inert**. Posture pinned by `test/integration/rls-enforcement.test.ts` (§9) |
| 12 | No perf baseline | Captured (§8) |
| F | `getMigrationStatus` used `$queryRawUnsafe`, which `src/db/index.ts` never forwards | Would have reported `checked: false` forever, so the health gate could never fire — a silent failure inside the fix for a silent failure. Caught by running it against a real database; now covered by `test/integration/migration-status.test.ts`, since the mocked test agreed with the bug |
| G | 3 schema drift items (`Article`/`Bet` index names, `Profile_new_pkey`) | `20260731170000_align_index_names_with_schema`; `migrate diff` now reports **no difference** |

### Finding D — how it was closed

Two layers, because a boot-time gate only helps when boot is where it goes wrong.

> **Correction, 2026-08-01.** This section originally attributed finding D to the transaction pooler's advisory locks. That was wrong — see the finding-D row above. The pooler hazard is real and the fixes below are still right, but the *cause* of the month-long outage was Render's dashboard `Docker Command` override, which meant the boot step never executed. Diagnosed from what the code *should* run rather than from what actually ran; the lesson generalises.

**0. The dashboard (not in this repo).** Render → `bad-mcp` → Settings → Deploy → **Docker Command must be empty.** Anything there overrides the Dockerfile `CMD` and `ENTRYPOINT`, and nothing in the repo can prevent it. Documented in `deploy/render.yaml`, `scripts/docker-entrypoint.sh`, and the incident runbook, because it is invisible from the code.

**1. Boot (`scripts/docker-entrypoint.sh`).** The `CMD` one-liner became a script:

- Migrates over **`DATABASE_URL_DIRECT`** (session pooler, 5432), which takes the advisory locks. Warns loudly at boot if it's unset and it has to fall back to `DATABASE_URL`.
- **Fatal only when the database is reachable** and the migration still failed — that's a real problem, and refusing to start is safer than serving traffic against an unknown schema (Render's health-check gate keeps the previous revision live). An **unreachable** database still starts normally, so a paused Supabase project never crash-loops the service. This distinction is the whole point: the old code couldn't tell the two apart, so it treated both as survivable.
- Escape hatches: `BOOT_MIGRATE_NONFATAL=1`, `SKIP_BOOT_MIGRATE=1`.

**2. Runtime (`src/db/migration-status.ts`).** `GET /healthz?deep=1` compares migration directories on disk against `_prisma_migrations` and returns **503** naming any that are unapplied. Unlike `capabilities` — reported but never a gate — a pending migration *is* a gate: it means the running code may be talking to a schema it doesn't expect. An external monitor on the deep endpoint now alerts on exactly the condition that went unnoticed for a month.

A check that cannot run reports `pending: null` with a reason, never `pending: 0`. Claiming a clean schema we failed to verify would recreate the original bug in a new place.

> **Prerequisite:** `DATABASE_URL_DIRECT` must be present in the Render environment. It already exists in the Doppler `prd` config.

---

*Compiled from repository inspection on 2026-05-31: `package.json`, `deploy/render.yaml`, `Dockerfile`, `src/config.ts`, `src/index.ts`, `src/logger.ts`, `src/sentry.ts`, `src/db/index.ts`, `src/http/server.ts`, `src/http/mcp-http.ts`, `src/http/health-route.ts`, `src/http/readiness.ts`, `src/http/metrics-route.ts`, `src/http/middleware/mcp-auth.ts`, `src/http/authentication.ts`, `src/auth/jwt.ts`, `src/auth/requireAdmin.ts`, `prisma/migrations/`, and `docs/` runbooks/ADRs.*

*Re-verified 2026-07-31 against the same files plus `.github/workflows/`, `.gitattributes`, `biome.json`, and `src/capabilities.ts`. Every gap was re-checked against code rather than carried forward on trust — which is how findings **C** (three sources disagreeing about when migrations run) and **E** (`verify` unrunnable on Windows) surfaced. **The lesson worth keeping: the two most serious findings this pass, A and B, were both cases where a failure was happening silently. Neither would have been found by asking "what is broken?" — only by asking "what would we not notice?"***
