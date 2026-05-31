# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An extensible **Model Context Protocol (MCP) server** that exposes the same tool logic two ways: as **MCP tools** (for VS Code Copilot / MCP clients) and as a **REST API** (with auto-generated OpenAPI/Swagger). Tool categories: GitHub Issues (Octokit REST), GitHub Projects V2 (GraphQL), and a database-backed catalog (books, authors, ratings, movies, videogames, content-creators, users) over Postgres/Prisma. Also includes a Spotify read-only adapter and Supabase-JWT auth.

ESM project (`"type": "module"`), Node 20+, TypeScript strict mode.

## Commands

```powershell
npm run build          # FULL build: prisma generate → tsoa spec+routes → fix imports → tsc → seed
npm run build:spec     # Regenerate tsoa routes + swagger.json ONLY (run after editing controllers)
npm run dev            # tsc --watch
npm start              # node dist/index.js (transport auto-selected)
npm run start:http     # force HTTP transport (MCP_TRANSPORT=http)

npm test               # vitest run (all)
npm run test:watch     # vitest watch
npm run typecheck      # tsc -p tsconfig.test.json --noEmit  (type-checks src + test)
npm run lint           # eslint src/**/*.ts test/**/*.ts
npm run lint:fix
npm run verify         # lint + typecheck (run before proposing a commit)
```

Run a single test file / single test by name (PowerShell):
```powershell
npx vitest run test/http/mcp-http.test.ts
npx vitest run -t "decideTransport prefers stdio"
```

Most tests mock external services and run without a DB. Tests that hit a real Postgres are **opt-in and gated by env flags**, and DB integration runs serially (`fileParallelism` is disabled when the flag is set — see [vitest.config.ts](vitest.config.ts)):
```powershell
$env:RUN_DB_INTEGRATION='true'; npm test               # enables test/integration/db.test.ts, RLS tests, etc.
$env:RUN_GITHUB_PROJECTS_INTEGRATION='true'; npm test   # hits real GitHub Projects (needs GITHUB_TEST_* vars)
```
`vitest.config.ts` loads `.env.local` for tests.

Database / migrations / SQL tooling:
```powershell
npx prisma migrate deploy        # apply migrations
npm run prisma:dev               # prisma db push + generate (local schema iteration)
npm run prisma:seed:dev          # seed via tsx (dev); prisma:seed runs the compiled seed
npm run sql:parse                # dry-run lint a migration SQL file (scripts/find-sql-error.ts)
npm run sql:validate             # apply-validate a migration SQL file
```

## Architecture — the big picture

### 1. One tool implementation, two surfaces (the central pattern)
Business logic lives **once** in `src/tools/**`. Each tool is its own file exporting a `registerXxxTool(server)` that calls `server.registerTool(name, config, handler)`. The handler returns an MCP `CallToolResult` (`{ content: [{ type, text }], isError? }`). Inputs are validated with **Zod** schemas (`schemas.ts` per category).

- **MCP surface:** `src/tools/index.ts` → `registerTools()` registers every category onto the real `McpServer`.
- **REST surface:** `src/tools/local.ts` registers the *same* tools onto a **fake server** that captures handlers into a `Map`, and exposes `callTool(name, args)` (parses the JSON text result, throws on `isError`). TSOA controllers in `src/http/controllers/*Controller.ts` are thin facades that call `callTool(...)`.

**Implication:** to add catalog functionality, write the tool under `src/tools/db/<category>/`, register it, then add a controller method that delegates via `callTool`. Don't duplicate logic in the controller.

### 2. TSOA code generation (REST routes + OpenAPI)
Controllers are decorated TSOA classes. `npm run build:spec` runs `tsoa spec-and-routes` to generate `src/http/tsoa-routes.ts` and `build/swagger.json`, then `scripts/fix-tsoa-imports.ts` rewrites the generated relative imports to add `.js` extensions (TSOA emits extensionless imports, which break ESM at runtime). **Generated files are committed — regenerate with `build:spec` whenever you change a controller's routes, params, or DTO interfaces.** Config: [tsoa.json](tsoa.json). Auth integrates via `src/http/authentication.ts` (`expressAuthentication`), invoked by `@Security('jwt', [scopes])`.

### 3. Transport selection (stdio vs HTTP)
`src/index.ts` picks a transport using the pure, unit-tested helper `decideTransport()` in [src/transport-selection.ts](src/transport-selection.ts):
- `MCP_TRANSPORT=stdio|http` forces it; otherwise production+PORT → HTTP, stdin-attached+PORT → stdio (VS Code LocalProcess), PORT alone → HTTP, nothing → stdio.
- stdio mode connects a `StdioServerTransport`. HTTP mode calls `startHttpServer()`.

### 4. HTTP server lifecycle (hosted mode)
[src/http/server.ts](src/http/server.ts) `startHttpServer()` is built for fast cold-starts on Render:
- Binds the port early with only liveness/readiness/metrics routes.
- Registers the **MCP HTTP transport at `/mcp` immediately** (no DB dependency) — and a WebSocket transport at `/mcp/ws` when `MCP_API_KEY` is set.
- Then lazily `initPrisma()` and registers DB-dependent routes; flips the **readiness** flag (`src/http/readiness.ts`) only after DB init succeeds. `EARLY_START` runs this in the background so the listener resolves immediately.

### 5. Prisma: lazy init with stub fallback
[src/db/index.ts](src/db/index.ts) exports a shared mutable `prisma` object. `initPrisma()` either populates it with a real `PrismaClient` (via the `@prisma/adapter-pg` Postgres adapter) or, **when `DATABASE_URL` is unset / client unavailable, fills it with no-op stubs** (reads return empty, writes throw). This lets the server and the GitHub-only tooling run without a database. Tool code should assume `prisma` may be a stub in non-DB environments.

### 6. Configuration is centralized
[src/config.ts](src/config.ts) is the **only** place that reads `process.env`. It Zod-validates all env vars and `process.exit(1)`s on invalid config. Import it for its side effect (dotenv load + validation) before other modules — `src/index.ts` imports it first. Everywhere else, read from the exported `config` object, never `process.env`.

### 7. Security layers
- `mcpAuthMiddleware` ([src/http/middleware/mcp-auth.ts](src/http/middleware/mcp-auth.ts)): when `MCP_API_KEY` is set, requires `Authorization: Bearer <MCP_API_KEY>` on DB-dependent `/api/*` routes and `/mcp`. Public magic-link auth routes are exempt. Legacy `x-mcp-api-key` header is a deprecated fallback.
- TSOA `@Security('jwt', ['admin'])`: Supabase-issued JWT verification (`src/auth/jwt.ts`) for user/admin REST endpoints.

## Data model

Postgres via Prisma ([prisma/schema.prisma](prisma/schema.prisma)). Catalog entities (`Book`, `Movie`, `VideoGame`) share an `ItemStatus` enum (`NOT_STARTED|IN_PROGRESS|COMPLETED`) and **embed rating fields directly** (`rating`, `review`, `ratedAt`) rather than a separate ratings table for the single-user case. `Profile` is keyed by the Supabase Auth UUID. Row-Level-Security policies are exercised by `test/rls/**` and `test/integration/rls*` (DB-integration-gated), and migration SQL is lint-checked via the `sql:parse`/`sql:validate` scripts.

## Conventions specific to this repo

- **ESM imports must include the `.js` extension** on relative paths (e.g. `import { x } from './foo.js'`), even though the source is `.ts`. This applies to hand-written code and is the reason `fix-tsoa-imports.ts` exists for generated code.
- One tool = one file + a `registerXxxTool` function; aggregate registration in the category `index.ts`; Zod input schemas in `schemas.ts`; success/error result builders in `results.ts`.
- `docs/adr/` holds architecture decision records (transport, HTTP facade, hosting); `docs/handoffs/` and `agent-artifacts/` hold working notes and agent-generated drafts.
- The `README.md` is partly out of date (its "Project Structure" section predates the HTTP/REST/DB expansion) — trust the source and this file over it for architecture.
