# MCP DB Tools

This document describes the `db/*` MCP tools provided by the MCP server.

## Overview

The `db` tools expose typed database operations via MCP so other clients/agents can reuse them. Tools live under `src/tools/db/` and are registered by `registerDbTools`.

### Current tools

- `db/create-invite` — Create an invite for a user email (admin-only).
- `db/accept-invite` — Accept an invite token and create a user (public via token).

### Security

Write operations (e.g., `create-invite`) should be restricted to admin callers. Read-only tools can be public depending on the data sensitivity.

More details, contracts (Zod schemas), and examples will be added as we expand the tool suite.
