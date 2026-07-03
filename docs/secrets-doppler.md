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
