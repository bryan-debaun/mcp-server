# Postman collection: MCP Server (HTTP Façade)

This repository includes a Postman collection and an environment template to help with quick smoke checks and manual testing of the MCP HTTP façade.

Files

- `tools/postman/mcp-server.postman_collection.json` — collection (requests + tests) with a `base_url` collection variable (defaults to `https://bad-mcp.onrender.com`).
- `tools/postman/mcp-server.environment.json` — environment template for preview (example uses `https://bad-mcp-pr-7.onrender.com`).

How to use

1. Import the collection file into Postman (File → Import → select the JSON file).
2. Import the environment template and set the `base_url` variable to the preview URL (or `https://bad-mcp.onrender.com` for production).
3. Select the environment in the Postman UI, then run requests individually or run a collection run for a smoke test.

Notes

- The collection does **not** include any secrets or sensitive values.
- Keep `tools/postman/mcp-server.environment.json` out of source-control if you need to store secrets (this example uses only non-secret preview URL). If you prefer not to track environment files in the repo, delete the `tools/postman/mcp-server.environment.json` file and rely on local environments.

Suggested usage

- Add a step in the deploy runbook to run the Postman collection (or use Newman) after a preview deploy for automated smoke checks.

Example Newman command (install `newman` locally):

```
newman run tools/postman/mcp-server.postman_collection.json -e tools/postman/mcp-server.environment.json
```

This will run the collection against the preview URL defined in the environment file.
