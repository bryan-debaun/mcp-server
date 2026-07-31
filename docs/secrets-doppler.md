# Secrets management with Doppler

This repo's runtime secrets are managed in **[Doppler](https://www.doppler.com/)** — a
cloud secrets store — instead of hand-copying `.env` files between machines.

- **Values, not files.** Doppler stores each secret (`MCP_API_KEY`, `DATABASE_URL`, …)
  as a discrete key/value. Each machine reconstructs the environment locally via the
  CLI; no `.env` is ever copied or emailed.
- **Two configs:** `dev` (local) and `prd` (production on Render).
- **Fallback still works.** `.env.local` remains supported (`src/config.ts` loads
  dotenv in non-prod, and dotenv does not override already-set vars), so Doppler and a
  local `.env.local` compose without conflict. Doppler is the source of truth.

`doppler.yaml` at the repo root pins the project (`bad-mcp`) + config (`dev`) so every
machine auto-configures with no interactive prompts.

## One-time: create the project (owner, once)

In the Doppler dashboard, create project **`bad-mcp`** with configs **`dev`** and
**`prd`**. Then bootstrap the `dev` values from an existing local file:

```powershell
doppler login                          # browser auth
doppler setup                          # reads doppler.yaml → project bad-mcp, config dev
doppler secrets upload .env.local      # push local values into the dev config (one time)
```

Populate `prd` with production values in the dashboard (or `doppler secrets set` scoped
to `--config prd`). See `.env.example` for the full list of variable names.

## Per machine (PC, Mac, …)

```powershell
doppler login
doppler setup            # auto-selects bad-mcp / dev from doppler.yaml
doppler run -- pnpm dev  # injects secrets into the process
```

That's the cross-machine transfer: authenticate to the same vault, done. No file copy.

## Daily use — prefix commands with `doppler run --`

Existing package scripts are unchanged; run them through Doppler when you want managed
secrets:

```powershell
doppler run -- pnpm dev
doppler run -- pnpm run start:http
doppler run -- pnpm run build          # prisma generate → tsoa → tsc → seed
doppler run -- pnpm run prisma:dev      # local DB push + generate
doppler run -- pnpm test                # vitest also loads .env.local as fallback
```

## Production (Render)

Render injects env vars at runtime today (dashboard). To make Doppler the source of
truth, connect Doppler's **native Render integration** and sync the `prd` config to the
`bad-mcp` service. No Dockerfile change required — the container's boot command
(`prisma migrate deploy` → `node dist/index.js`) inherits the injected vars exactly as
it does now.

## Rotate after migrating

Moving secrets into Doppler is the natural moment to rotate the sensitive ones, since
old plaintext has lived in `.env.local`: `MCP_API_KEY`, `INTERNAL_ADMIN_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SESSION_JWT_SECRET`, `MAGIC_LINK_JWT_SECRET`,
`SENDGRID_API_KEY`, `GITHUB_TOKEN`, and any Spotify/Odds keys.

## Rotation & expiry

Most secrets here never expire on their own — they change only when *we* rotate them.
`GITHUB_TOKEN` is the exception, and the one that has already bitten us (#155): a
classic PAT can carry an expiry date, and when it lapses the server keeps booting
happily while every GitHub tool fails at call time.

| Secret | Expires on its own? | Scopes / notes | On rotation |
|---|---|---|---|
| `GITHUB_TOKEN` | **Yes, if you set an expiry** — classic PATs default to 30 days in the GitHub UI | Needs **`repo`** (issue/label CRUD, and required for private repos such as `varsityclub-web`) and **`project`** (Projects v2 field/item tools). A `repo`-only token passes issue calls and fails Projects tools. | Set in Doppler `prd`, confirm it reaches Render, then verify with `list-labels` against a public **and** a private repo, plus one Projects v2 call. |
| `MCP_API_KEY` | No | Gateway key for `/mcp` and DB-dependent `/api/*` | Update every MCP client (VS Code config, `bryandebaun.dev`) in the same change — rotating this alone locks them out. |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Service-role bypass identity | See `docs/runbooks/service-role-bypass.md`. |
| `INTERNAL_ADMIN_KEY` | No | Second factor on the service-role path | Rotate alongside the service-role key. |
| `SPOTIFY_REFRESH_TOKEN` | Revocable, not time-boxed | Invalidated if the Spotify app's secret is regenerated | Re-run the auth flow in `docs/runbooks/spotify.md`. |
| `SENTRY_DSN`, `ODDS_API_KEY`, `SENDGRID_API_KEY` | No | Vendor-revocable only | Set in Doppler, redeploy. |

**Prefer a PAT with no expiry for `GITHUB_TOKEN`**, or calendar the expiry date — there
is no automated renewal here. Rotation is a two-step operation in both cases: set the
value in the Doppler `prd` config, then confirm Render actually picked it up (a synced
value still needs a deploy or restart to reach the running process).

### Detecting a missing or lapsed secret

Since #155 the server reports optional-integration state in two places, so a missing
secret is visible without waiting for a tool call to fail:

- **Boot logs** — one `capability disabled: <name> — <VAR> not set; <impact>` warning per
  unconfigured integration (`src/capabilities.ts`, emitted from `src/index.ts`).
- **`GET /healthz?deep=1`** — a `capabilities` map, e.g. `{ "github": false, … }`.

Both are deliberately **non-fatal**: boot still succeeds and the probe still returns 200,
because the server does plenty of useful work without any single integration. Note this
only catches an *unset* variable — a token that is present but **expired or under-scoped**
still looks configured, and surfaces as a 401/403 from the GitHub API at call time.
