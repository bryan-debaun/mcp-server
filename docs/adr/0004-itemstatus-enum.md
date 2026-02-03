# ADR 0004: ItemStatus representation (Postgres ENUM vs lookup table)

Date: 2026-02-03

## Status

Accepted

## Context

A new `status` field was added to the `Book` model. The current implementation uses a Postgres ENUM type (created in migration `20260202173000_add_itemstatus_and_isadmin`) with values `NOT_STARTED`, `IN_PROGRESS`, and `COMPLETED`. The codebase also contains a TypeScript union type `ItemStatus` and helpers (`normalizeStatusInput`, `statusLabel`).

Clients generate client SDKs from the OpenAPI (tsoa) spec. Previously, the OpenAPI spec did not expose the `ItemStatus` enum because controller DTOs typed `status` as `string`.

## Decision

Keep `ItemStatus` as a Postgres ENUM type. Ensure the API surface (tsoa controllers) uses the `ItemStatus` type so the generated OpenAPI spec includes a typed enum for clients.

## Rationale

- Postgres ENUM provides type safety at the DB level and is simple to reason about (values are fixed and enforced by DB).
- Changing between statuses is infrequent; ENUMs are stable and avoid an extra join for simple lookups.
- Minimal application code changes are required (controllers and schemas), and we can surface enum to clients by using the shared `ItemStatus` type in controller DTOs.

## Alternatives

1) Use a dedicated `ItemStatus` lookup table and store a foreign key on `Book`.
   - Pros: Flexible, can add/remove statuses without DB migrations; can store labels/translations; queryable metadata for UI.
   - Cons: More complexity in queries, join overhead, data migrations for existing enum values.

2) Keep a plain string column with application-side validation.
   - Pros: Simple schema changes.
   - Cons: No DB-level enforcement; risk of inconsistent values.

## Consequences

- Implemented change to controllers so `status` surfaces in OpenAPI as enum for client generation (see PR/commit).
- Tests added/updated to assert swagger has `ItemStatus` and `Book.status` references.
- Tools-level JSON schemas updated to include `enum` for validation of inputs.

## Migration / Rollout Plan

- For today's change (surface enum to OpenAPI): merge code, regenerate spec (`npm run build:spec`), publish updated spec, and notify client SDK consumers to regenerate if needed.
- If we later convert to a lookup table: write a migration that creates the table, inserts canonical rows, performs a backfill, and updates application code to use the relationship. Include a rollback to restore previous enum state.

## Observability & Runbook

- Add a post-deploy validation step to confirm `GET /docs/swagger.json` contains `components.schemas.ItemStatus` with the expected enum values.
- Run DB schema migration tests in CI and confirm `prisma migrate` results.

## Owner

Architect: @bryan-debaun
