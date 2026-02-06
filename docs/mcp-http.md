# MCP HTTP Stream & SSE Transport

This document describes the new HTTP-based transports for the MCP server.

## Endpoints

- POST /mcp
  - Primary HTTP Stream endpoint (bidirectional NDJSON). Clients should POST and keep the connection open.
  - Requires `Authorization: Bearer <MCP_API_KEY>` when `MCP_API_KEY` is set.
  - Uses newline-delimited JSON for framing (one JSON message per line).

- GET /mcp
  - SSE fallback (server -> client). Connection stays open and the server sends `data: <json>` events.
  - On connection, the server emits a `connected` event with a `connId` that the client can use for posting events.
  - Requires `Authorization: Bearer <MCP_API_KEY>` when `MCP_API_KEY` is set.

- POST /mcp/events
  - Used by SSE clients to send messages back to the server.
  - Must include header `X-MCP-Conn-Id: <connId>` and `Authorization: Bearer <MCP_API_KEY>` when auth is enabled.

## Example `mcp.json` snippet for HTTP servers

```
{
  "servers": [
    {
      "name": "Hosted MCP",
      "url": "https://bad-mcp.onrender.com/mcp",
      "auth": {
        "type": "bearer",
        "tokenEnv": "MCP_API_KEY"
      }
    }
  ]
}
```

## Notes

- Clients that require true bidirectional streaming should use `POST /mcp`.
- SSE is a fallback when an HTTP Stream client is not available; it requires clients to POST events separately to `/mcp/events`.
- The endpoints are guarded by `MCP_API_KEY` to protect hosted servers.

### Auth session endpoint

The server exposes `GET /api/auth/session` which reads the `session` cookie and returns a minimal authenticated user object. The cookie is signed using `SESSION_JWT_SECRET` in production; when `SESSION_JWT_SECRET` is not set (development), a base64-encoded JSON payload is accepted for convenience. Response shape:

```
{ "id": 42, "email": "you@example.com", "role": "admin", "isAdmin": true, "external_id": "<optional>" }
```

Missing or invalid sessions return `401`. Rate-limiting protections apply and are configurable via `SESSION_RATE_LIMIT_PER_IP` and `SESSION_RATE_LIMIT_WINDOW_MS`.

> **Note:** When `MCP_API_KEY` is set, DB-dependent routes under `/api/*` (books, authors, ratings) are also protected by the same API key. Requests must present `Authorization: Bearer <MCP_API_KEY>`. As a temporary fallback we accept `x-mcp-api-key` but this header is **deprecated** and will be removed in a future release (the server logs a deprecation warning when it is used).
