# Bruno API collection

[Bruno](https://www.usebruno.com/) is a free, open-source, Git-native API client (a Postman alternative). The collection lives **in this repo** at [`tools/bruno/`](../tools/bruno) as plain-text `.bru` files, so it's versioned alongside the code and needs no account or cloud.

This replaces the previous Postman collection (issue #8). Postman moved free collaboration behind paid tiers in March 2026, and Newman is incompatible with Postman's newer collection format — Bruno avoids both.

## What's in it

- **Tag folders** (`Books`, `Authors`, `Movies`, `VideoGames`, `ContentCreators`, `Articles`, `Spotify`, `Admin`) — **generated from the server's OpenAPI spec**, so they always reflect what's actually deployed. Auth is pre-wired: reads use the `X-Mcp-Api-Key` gateway key; admin writes use a bearer JWT.
- **`Ops/`** — hand-maintained operational probes the OpenAPI spec doesn't cover (`/healthz`, `/healthz?deep=1`, `/readyz`, `/metrics`), each with smoke assertions. These are public (no secrets), so they're the CI smoke target.
- **`environments/`** — `local`, `preview`, `prod`, each defining `baseUrl` and the secret vars `apiKey` / `token`.

## Using the desktop client

1. Install Bruno (https://www.usebruno.com/downloads).
2. **Open Collection** → select `tools/bruno/`.
3. Pick an environment (top-right): `prod` (`https://bad-mcp.onrender.com`), `preview`, or `local` (`http://localhost:8080`).
4. Set the environment's secret variables (they're intentionally **not** committed):
   - `apiKey` — the MCP gateway key (`MCP_API_KEY`). Required on all `/api/*` reads and writes.
   - `token` — an admin Supabase JWT. Required for create/update/delete and for reading article drafts.
5. Send requests. Reads send `X-Mcp-Api-Key: {{apiKey}}`; writes send `Authorization: Bearer {{token}}`.

> The `/docs/swagger.json` endpoint is also gateway-key-gated in deployed environments, so fetch it with `apiKey` set (or use Swagger UI at `/docs`).

## CLI / CI

The free Bruno CLI (`@usebruno/cli`, a devDependency) runs collections headlessly:

```powershell
# Public ops smoke against production (no secrets needed)
pnpm run bruno:smoke

# Any folder, with a chosen env and a JUnit report for CI
pnpm exec bru run Ops --env preview --reporter-junit results.xml   # run from tools/bruno/
```

`bru run` must be invoked from the collection root (`tools/bruno/`). Reporters: `--reporter-junit`, `--reporter-html`, `--reporter-json`.

## Keeping it in sync with the code (auto-discovery)

The tag folders are regenerated from the OpenAPI spec — which is itself generated from the TSOA controllers — so **new or changed endpoints flow in automatically**:

```powershell
pnpm run bruno:sync
```

This runs `build:spec` (regenerating `build/swagger.json`) then `scripts/sync-bruno.ts`, which uses Bruno's own `bru import openapi` and replaces only the generated folders — the hand-authored `environments/` and `Ops/` folders are preserved. Run it after adding/changing a controller route and commit the result. A test (`test/tools/bruno-collection.test.ts`) guards that the committed collection hasn't drifted from the spec.
