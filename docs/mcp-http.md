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

- GET /.well-known/oauth-protected-resource
- GET /.well-known/oauth-protected-resource/mcp
  - **Public** (deliberately un-gated — a document describing how to authenticate cannot sit behind the gate it describes).
  - RFC 9728 Protected Resource Metadata. See below.

## Authorization discovery (RFC 9728) — #152

The June 2025 revision of the MCP authorization spec separates the **MCP server
(resource server)** from the **authorization server** and requires the resource
server to publish [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728)
metadata. That revision also removed the older fallback-default-endpoint
mechanism, so this document is now the *only* way a standards-based MCP client
can discover how to authenticate here.

```console
$ curl https://bad-mcp.onrender.com/.well-known/oauth-protected-resource/mcp
{
  "resource": "https://bad-mcp.onrender.com/mcp",
  "bearer_methods_supported": ["header"],
  "authorization_servers": ["https://<issuer>"]
}
```

RFC 9728 §3.1 inserts the resource's path component after the well-known prefix,
so the document for the `https://host/mcp` resource lives at
`/.well-known/oauth-protected-resource/mcp`. The bare path is served too, for
clients that have no path component to insert.

On a 401 from a protected MCP endpoint the server points at that document via
`WWW-Authenticate` (RFC 9728 §5.1):

```
WWW-Authenticate: Bearer error="invalid_token",
  resource_metadata="https://bad-mcp.onrender.com/.well-known/oauth-protected-resource/mcp",
  error_description="Missing or invalid credentials for the MCP resource"
```

### Configuration

Every advertised value is configuration, never hardcoded — so the document
follows whichever authorization server ADR 0001 Stage 2 lands on:

| Var | Meaning | Default |
|---|---|---|
| `PUBLIC_BASE_URL` | Public origin of this deployment | Derived from `X-Forwarded-Proto`/`Host` |
| `OAUTH_RESOURCE_IDENTIFIER` | Canonical resource identifier | Origin + request path |
| `OAUTH_AUTHORIZATION_SERVERS` | Comma-separated AS issuers | `OIDC_ISSUER` |
| `OAUTH_SCOPES_SUPPORTED` | Comma-separated scopes | omitted |

**Pin `PUBLIC_BASE_URL` in production.** Without it the origin is derived from
the `Host` header, which is client-supplied — harmless for a public document
carrying no secret, but it means the advertised `resource` isn't guaranteed to
match the audience real tokens are minted for.

### This does not replace `MCP_API_KEY`

The shared-secret gate is unchanged and still works both ways
(`Authorization: Bearer <MCP_API_KEY>` and `X-Mcp-Api-Key`). This issue adds the
conformant discovery path alongside it. Replacing `MCP_API_KEY` and the
`service_role` bearer shortcut with real `client_credentials` grants is
follow-on work tracked with the ADR 0001 Stage 2 spike.

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

### Authentication

Authentication is handled by **Supabase Auth** (client-side); this server only **validates Supabase JWTs** (`Authorization: Bearer <SUPABASE_JWT>`). The previous custom magic-link, password, and session-cookie endpoints were removed (issue #89).

> **Note:** When `MCP_API_KEY` is set, DB-dependent routes under `/api/*` (books, authors, ratings) are also protected by the same API key. Present the key one of two supported ways: `Authorization: Bearer <MCP_API_KEY>` (pure MCP clients), or the **`X-Mcp-Api-Key: <MCP_API_KEY>`** header — a first-class second factor for callers whose `Authorization` header already carries a Supabase user JWT (e.g. the website's admin requests).
