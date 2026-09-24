Feature: The liveness probe depends on nothing
  Render polls /healthz to decide whether the process is alive. The plain form
  touches no database and no optional integration, so it answers the same on
  a laptop with no secrets as it does in production. The deep form reports
  what is and is not configured without changing the answer.

  Background:
    Given the server is running with no database configured

  Scenario: The plain probe answers without a database
    When GET /healthz is requested
    Then the response status is 200
    And the body reports status "ok" with the Node version and uptime

  Scenario: The deep probe reports the database as skipped when there is none
    When GET /healthz?deep=1 is requested
    Then the response status is 200
    And the body reports the database as "skipped"
    And the body reports the optional integrations
