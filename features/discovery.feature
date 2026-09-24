Feature: A standards-based client can discover how to authenticate
  RFC 9728 protected resource metadata is published at the well-known path,
  outside the gate it describes, and every 401 from the MCP resource points
  at it (#152). Without this a conformant MCP client sees an opaque 401 and
  has no way to find the authorization server.

  Background:
    Given the server is running with no database configured
    And the public base URL is "https://bad-mcp.example.com"

  Scenario: The metadata is served without credentials, even when a key is configured
    Given MCP_API_KEY is "secret-key"
    When GET /.well-known/oauth-protected-resource is requested with no credentials
    Then the response status is 200
    And the metadata names "https://bad-mcp.example.com" as the resource
    And the metadata supports the "header" bearer method

  Scenario: The path-suffixed form describes the MCP endpoint
    When GET /.well-known/oauth-protected-resource/mcp is requested with no credentials
    Then the response status is 200
    And the metadata names "https://bad-mcp.example.com/mcp" as the resource

  Scenario: A rejection carries the resource_metadata pointer
    Given MCP_API_KEY is "secret-key"
    When POST /mcp is requested with no credentials
    Then the response status is 401
    And the WWW-Authenticate header names resource_metadata "https://bad-mcp.example.com/.well-known/oauth-protected-resource/mcp"
