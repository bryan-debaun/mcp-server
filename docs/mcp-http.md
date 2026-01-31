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
