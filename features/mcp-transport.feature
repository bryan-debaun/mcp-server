Feature: An MCP client can open a session and see the tools
  POST /mcp is the Streamable HTTP transport. A client sends initialize and
  gets the server's identity and capabilities back; tools/list returns the
  catalog and GitHub tools the website and the issue automation rely on.
  Calling a catalog tool needs a database; listing it does not.

  Background:
    Given the server is running with no database configured
    And MCP_API_KEY is "secret-key"

  Scenario: initialize returns the server's identity and capabilities
    When an MCP initialize request is sent with bearer "secret-key"
    Then the response status is 200
    And the JSON-RPC result names the server and its protocol version
    And the result advertises tools

  Scenario: tools/list includes the catalog and GitHub tools
    When an MCP tools/list request is sent with bearer "secret-key"
    Then the response status is 200
    And the listed tools include:
      | list-books   |
      | get-book     |
      | list-authors |
      | list-movies  |
      | get-issue    |
      | create-issue |
