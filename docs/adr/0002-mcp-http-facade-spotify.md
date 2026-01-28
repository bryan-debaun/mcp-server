# ADR 0002: MCP HTTP Façade for Spotify Playback (Read-only for Website)

- **Status:** Proposed
- **Date:** 2026-01-28
- **Owner:** bryan-debaun

## Context

The project needs an integration with Spotify to publish playback (Now Playing) state and accept control intents (play, pause, next, previous, seek, set volume). The user's personal website (`https://bryandebaun.dev`) should be able to surface playback state but should not be allowed to modify playback (no writes from the website). The MCP server currently provides model semantics useful to AI agents and Copilot tools.

## Decision

- Treat the MCP server as the authoritative model hub and model source for Spotify playback state.
- Implement a small **HTTP façade** on the MCP server that exposes **read-only** endpoints for the website (e.g., `GET /api/playback`) that return the MCP playback model in JSON. These endpoints will be safe for public or authenticated use depending on config and will return only non-sensitive metadata.
- Keep **write** operations (control intents that modify playback) accessible only via **MCP tools** (i.e., agent/CLI interfaces or internal services). The website will not be granted permission to call control intents directly.
- Implement OAuth token storage and refresh logic on the server only; no Spotify secrets or refresh tokens are exposed to the website.

## Alternatives Considered

1. Website calls Spotify directly (user-managed OAuth)
   - Pros: Simpler front-end only work
   - Cons: Requires web app to manage refresh tokens and OAuth flow, duplicate server-side logic, worse security posture for tokens.

2. Give website write access to control endpoints
   - Pros: Convenient UX for remote control from the site
   - Cons: Increased security risk (exposing control surface to a public website), complexity of strong auth and CSRF protections.

3. WebPlayback SDK bridge (browser-run client that pushes events)
   - Pros: Near real-time updates and control from a browser client
   - Cons: Requires a running browser client, more complex UX and user device requirements

## Consequences

- The website can reliably show Now Playing and other playback metadata without ever handling OAuth secrets or refresh tokens.
- Control requests (writes) will be handled through MCP tools or server-side APIs that are not reachable from unauthenticated website clients. This keeps the attack surface small and enables better auditing.
- The HTTP façade should implement caching (TTL ≈ poll interval), rate limiting, TLS, and structured logging to support secure and reliable use.

## Non-functional Requirements (NFRs)

- **Latency:** playback model updated within ~5s of source change (configurable poll interval).
- **Security:** Spotify client secret and refresh tokens stored server-side in platform secrets; no client exposure.
- **Observability:** metrics for poll_success_total, poll_failure_total, intent_success_total, intent_failure_total, token_refresh_success/fail.
- **Availability:** personal-hosted service availability expectation ~99.9% for personal use; basic alerts on token refresh failures and repeated control failures.

## Hosting and Deployment

- Prefer containerized deployment (Docker) to a low-cost provider (Fly.io, Render, Railway, DigitalOcean). Platform must provide TLS and secret management.
- See ADR 0003: `docs/adr/0003-hosting-render.md` for an initial Render hosting plan and deploy guidance.
- Add `/health` and `/metrics` endpoints and document a minimal deployment runbook.

## Security Model

- `GET /api/playback` may be public if it returns only non-sensitive metadata and respects caching and rate limits.
- Control endpoints will be internal or require strong authentication (MCP agent calls or server-side request with API keys/JWTs). The website will not be issued control credentials under this decision.

## Rollout Plan

1. Create the MCP Spotify adapter that polls Spotify and publishes an internal playback model.
2. Add `GET /api/playback` endpoint that reads the current model and returns the published JSON schema.
3. Add tests (unit + integration with mocked Spotify), a `Dockerfile`, and a simple `deploy/` example (Fly.io and/or Render).
4. Implement monitoring & runbook: metrics, alerts for token refresh failure, runbook for how to refresh credentials using the Spotify OAuth flow.

## Acceptance Criteria

- `docs/models/playback.schema.json` exists and is referenced by the ADR.
- `GET /api/playback` returns current playback model and passes integration tests against mocked Spotify responses.
- Control intents are implemented as MCP tools and covered by tests; website has no route to execute them.
- Runbook `docs/runbooks/spotify.md` describes Spotify app creation, required scopes, and token renewal process.

## Next Steps (Tasks)

- [ ] Add playback JSON Schema file (`docs/models/playback.schema.json`).
- [ ] Implement Spotify adapter: `src/adapters/spotify/spotify-adapter.ts` (polling + mapper + token refresh).
- [ ] Implement HTTP endpoint: `src/http/playback-route.ts` (read-only) and tests.
- [ ] Add `Dockerfile` and `deploy/flyio` example with secrets guidance.
- [ ] Create `docs/runbooks/spotify.md` and `config/spotify.example.env`.
- [ ] Create ADR acceptance tests and add labels: `project:music`, `type:feature`, `priority:medium`.

## Stakeholders

- Owner: bryan-debaun
- Engineering: implementer
- Security: audit token storage and endpoint auth for control surfaces

---

*This ADR is open for review; if accepted we will create the code scaffolding and the schema file referenced in the Next Steps.*
