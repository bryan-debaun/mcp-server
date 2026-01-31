# ADR 0004: Add HTTP Stream and SSE transport for MCP server

Status: Accepted

Date: 2026-01-31

## Context

The MCP server previously exposed only a WebSocket transport at `/mcp/ws`. VS Code and other HTTP-based clients expect an HTTP Stream transport (bidirectional, chunked NDJSON) and an SSE fallback (server -> client) for discovery and usage of hosted MCP servers.

## Decision

Add a primary HTTP stream endpoint at `POST /mcp` supporting newline-delimited JSON (NDJSON) bidirectional streaming. Add an SSE fallback at `GET /mcp` (server -> client) and an accompanying `POST /mcp/events` for clients to send messages when using SSE.

Authentication is required via header `Authorization: Bearer <MCP_API_KEY>`. When `MCP_API_KEY` is not set, the endpoints will allow unauthenticated access (useful for local development).

We will implement server-side transports:

- `HttpStreamTransport` — reads NDJSON from the request body, writes NDJSON to the response body.
- `SseServerTransport` — writes SSE events to the response. Incoming messages for SSE clients are posted to `/mcp/events` with header `X-MCP-Conn-Id`.

Each new HTTP connection creates a temporary MCP server instance and registers tools with it (same pattern as the WebSocket transport). This keeps connection lifecycles isolated.

## Consequences

- VS Code should be able to discover and use hosted MCP servers that support these endpoints.
- We must include discovery docs and an example `mcp.json` showing how to point to HTTP servers and set `MCP_API_KEY`.
- Integration tests will be added later to simulate discovery and a tool invocation over HTTP Stream.

## Rollback Plan

Remove the endpoints and revert server registration if regressions appear. The WebSocket endpoint at `/mcp/ws` remains in place as a legacy option.
