# ADR 0003: Host MCP server on Render (Managed Container Service)

- **Status:** Proposed
- **Date:** 2026-01-28
- **Owner:** bryan-debaun

## Context

We need a low-friction hosting option for the personal MCP server so that the user's website (`bryandebaun.dev`) can reliably fetch playback state from Spotify via a read-only HTTP façade. The service must support persistent runtime (for polling and token refresh), TLS, secrets management, health checks, and an easy CI/CD flow. The user prefers a simple, fast-to-iterate hosting model.

## Decision

- Use **Render** as the initial hosting platform for the MCP server. Render provides easy GitHub integration, automatic TLS, an approachable dashboard for environment variables (secrets), and a simple deployment model that suits a personal, low-traffic service.
- Deploy the MCP server as a single **Web Service** using a Docker-based build described in `Dockerfile` and `render.yaml`.
- Use `/health` as the liveness/readiness probe endpoint and expose `/metrics` for observability integrations.
- Keep control endpoints internal or process-protected; expose only read-only endpoints (e.g., `GET /api/playback`) to the public website.

## Rationale

- **Fast setup and iteration:** Render integrates directly with GitHub to trigger automatic builds on push and makes secret management straightforward.
- **Low operational overhead:** Managed TLS, logs, and service health reduce the ops burden for a personal project.
- **Sufficient features:** Render supports background workers, custom domains, environment secrets, and reasonable free/low-cost tiers suitable for personal use.

## Non-functional Requirements

- **Availability:** Target ~99.9% uptime for personal usage. Use Render's health check and auto-restart features.
- **Security:** Store `SPOTIFY_CLIENT_SECRET` and refresh tokens in Render's secret management; never commit secrets to the repository. Restrict control endpoints from public access.
- **Observability:** Provide logs (Render dashboard), and a `/metrics` endpoint for Prometheus or a push-based metrics export.

## Deployment & CI

- Use Render's GitHub integration to auto-deploy on pushes to `main`, or use a GitHub Actions workflow that calls Render's API if explicit control is desired.
- Build steps: `npm ci && npm run build`; start command: `npm run start` (starts `node dist/index.js`).
- Platform health check path: `/health`.

## Environment variables (recommended)

Set the following in Render's dashboard (as secure env vars):

- `SPOTIFY_CLIENT_ID` — Spotify App Client ID
- `SPOTIFY_CLIENT_SECRET` — Spotify App Client Secret
- `SPOTIFY_REDIRECT_URI` — OAuth redirect (e.g., `https://<your-domain>/oauth/callback`)
- `MCP_API_KEY` — optional API key for protected control intents
- `NODE_ENV` — production
- `PORT` — Render sets this automatically but the app should listen on `process.env.PORT`

## Operations & Runbook notes

- Token refresh failures: Detect >3 consecutive refresh failures and alert (email or PagerDuty). Provide a runbook at `docs/runbooks/spotify.md` describing how to re-authorize (exchange code for refresh token).
- Logs: use Render logs; add structured logs for poll successes/failures and intent calls.
- Backups: Not required for this app unless you store user data; document how to rotate credentials manually.

## Rollout Plan

1. Add Dockerfile, `render.yaml`, and CI workflow; implement `/health` and `/metrics` routes.
2. Connect repo to Render via the Dashboard (GitHub OAuth connector) and set secrets.
3. Perform canary deploy (initial traffic) and verify `/api/playback` returns expected schema.
4. Configure custom domain and enable TLS.

## Acceptance Criteria

- MCP server builds and runs on Render using the `Dockerfile` and `render.yaml`.
- `/health` returns 200 when the server is healthy.
- `/api/playback` returns the schema in `docs/models/playback.schema.json` and is reachable over HTTPS.
- Secrets are configured in Render and no secrets are committed to the repo.
- Deploys are automated via Render's GitHub integration or a documented CI workflow.

## Next Steps (Tasks)

- [ ] Add `Dockerfile` for a production Node container.
- [ ] Add `render.yaml` describing the service.
- [ ] Add `docs/runbooks/deploy-render.md` with step-by-step Render instructions.
- [ ] Add GitHub Actions workflow to run tests and optionally trigger Render deploys.
- [ ] Implement `/health` and `/metrics` endpoints and test readiness in Render.

---

*This ADR is open for review.*
