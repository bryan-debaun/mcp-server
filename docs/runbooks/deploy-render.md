Render deployment runbook for MCP Server

Overview
--------

This runbook outlines steps to deploy the `mcp-server` to Render, configure secrets, set up a custom domain, and verify service health.

Prerequisites
-------------

- A Render account (connected to GitHub) — you already created one using GitHub provider.
- Repo: `github.com/bryan-debaun/mcp-server` connected to Render.
- `Dockerfile`, `render.yaml`, and CI workflow present in the repo (examples included in `/deploy`).

Required Environment Variables (secrets)
---------------------------------------

Set these in Render Dashboard > Environment > Environment Variables (secure):

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI` (e.g. `https://<your-domain>/oauth/callback`)
- `MCP_API_KEY` (optional; for protected control endpoints used by internal tools)
- `NODE_ENV=production`

Build & Start
-------------

Render will detect `render.yaml` and build using Docker if present. The application build steps should be:

- Build: `npm ci && npm run build`
- Start: `npm run start` (this runs `node dist/index.js`)

Health & Readiness
------------------

- Configure the service health check path to: `/healthz`.
- Implement `/healthz` to return HTTP 200 only when:
  - Server process is running
  - Critical subsystems (Spotify token store if persisted, metrics exporter) are reachable or in acceptable state
- Add `/metrics` as a Prometheus-compatible endpoint for metrics scraping or export.

Secrets & Token Management
--------------------------

- Store Spotify client secret and any refresh tokens in Render's secrets; never commit to repo.
- Document reauthorization procedure in `docs/runbooks/spotify.md` (how to re-run the OAuth flow and update secrets in Render).

Domain & TLS
------------

1. In Render Dashboard, go to your Service → Settings → Custom Domains
2. Add domain `playback.bryandebaun.dev` (or your preferred subdomain).
3. Follow DNS instructions to create the required CNAME/A records.
4. Render will provision TLS automatically (Let's Encrypt).

Logging & Monitoring
--------------------

- Use Render's log streaming in the dashboard for debugging and live logs.
- Add metric counters for: `poll_success_total`, `poll_failure_total`, `intent_success_total`, `intent_failure_total`, `token_refresh_success_total`, `token_refresh_failure_total`.
- Configure an external monitor (UptimeRobot, Pingdom) to check `/healthz` and alert on failures.

Deployment Workflow
-------------------

- Option A (recommended): Use Render's GitHub integration (auto-deploy on push to `main`).
- Option B (optional): Use GitHub Actions to run tests and call Render's API to trigger a deploy (requires `RENDER_API_KEY` and `RENDER_SERVICE_ID`).

Rollback Plan
-------------

- Render allows quick rollback by promoting a previous revision in the dashboard.
- Alternatively, revert the commit in Git and push to `main` to trigger a redeploy of the previous working state.

Troubleshooting
---------------

- App not starting: Check `npm run build` and `npm run start` locally to reproduce build/start errors.
- Health check failing: Inspect `/healthz` logic and logs; ensure necessary environment variables are set.
- Token refresh failing: Confirm `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_CLIENT_ID` are correct and that the `SPOTIFY_REDIRECT_URI` configured in the Spotify app matches the deployed redirect.

Security Notes
--------------

- Do not store client secrets in repository. Rotate keys periodically and document rotation steps in `docs/runbooks/spotify.md`.
- Keep the control surfaces closed to public access; the website integration should be read-only.
