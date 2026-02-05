# 0009 - MCP API Key Authentication for DB-dependent routes

Date: 2026-02-04

## Status

Proposed/Accepted

## Context

The MCP server supports a global `MCP_API_KEY` which is required for MCP transport endpoints (`/mcp`). However, database-backed endpoints (books, authors, ratings) were previously public and inconsistent with the transport protection. When a hosted instance sets `MCP_API_KEY`, the expectation is that server-to-server clients should authenticate; leaving catalog routes public increases risk of accidental data exposure.

## Decision

Add a centralized Express middleware that enforces `Authorization: Bearer <MCP_API_KEY>` for DB-dependent routes when `MCP_API_KEY` is set. Keep the following considerations:

- If `MCP_API_KEY` is unset, middleware is a no-op (backwards compatible).
- Support `x-mcp-api-key` as a temporary, deprecated fallback (logs a deprecation warning) to ease rolling upgrades of clients; remove support after a short deprecation period.
- Log auth failures with request path and IP, and increment a Prometheus counter `mcp_auth_failures_total` for monitoring.

## Consequences

- Improved security: when `MCP_API_KEY` is set, DB routes are protected.
- Rollout: deploy to staging with `MCP_API_KEY` set, validate logs and `mcp_auth_failures_total`. If spikes arise, use the deprecated header temporarily and notify clients.
- Testing: add unit/integration tests to assert both success and failure cases and verify the deprecation log.

## Alternatives considered

- Require JWT for catalog routes: rejected due to complexity and because `MCP_API_KEY` covers the intended server-to-server use case.
- Leave routes public: unacceptable for hosted instances that set `MCP_API_KEY`.

## Notes

Patch: feature/mcp-api-key-middleware
Acceptance criteria: tests assert 401 when `MCP_API_KEY` set and missing header; log deprecation for fallback header; metric recorded for auth failures.
