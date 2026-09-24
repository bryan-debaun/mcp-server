Feature: MCP_API_KEY gates the API in exactly two header shapes
  When MCP_API_KEY is set, the MCP transport and every catalog route require
  it, presented either as "Authorization: Bearer <key>" for pure MCP clients
  or as "X-Mcp-Api-Key: <key>" for callers whose Authorization header already
  carries a user JWT (the website). When it is unset the gate is a no-op, so
  CI and no-DB startups stay open.

  Background:
    Given the server is running with no database configured

  Rule: A configured key is required, and a rejection says where to look

    Scenario: The MCP transport rejects a missing key
      Given MCP_API_KEY is "secret-key"
      When POST /mcp is requested with no credentials
      Then the response status is 401
      And the WWW-Authenticate header points at the protected resource metadata

    Scenario: The MCP transport rejects a wrong key
      Given MCP_API_KEY is "secret-key"
      When POST /mcp is requested with bearer "wrong-key"
      Then the response status is 401

    Scenario: The catalog API rejects a missing key
      Given MCP_API_KEY is "secret-key"
      When GET /api/books is requested with no credentials
      Then the response status is 401

  Rule: Both header shapes open the gate

    Scenario: The bearer form opens the MCP transport
      Given MCP_API_KEY is "secret-key"
      When an MCP initialize request is sent with bearer "secret-key"
      Then the response status is 200

    Scenario: The bearer form opens the catalog API
      Given MCP_API_KEY is "secret-key"
      When GET /api/books is requested with bearer "secret-key"
      Then the response status is not 401

    Scenario: The second-factor header opens the catalog API
      Given MCP_API_KEY is "secret-key"
      When GET /api/books is requested with header X-Mcp-Api-Key "secret-key"
      Then the response status is not 401

  Rule: Without a configured key the gate is open

    Scenario: The MCP transport answers an anonymous client
      Given MCP_API_KEY is not set
      When an MCP initialize request is sent with no credentials
      Then the response status is 200
