/**
 * The BDD harness (issue #196): feature files under `features/` state the
 * server's externally visible contract — the dependency-free liveness probe,
 * the MCP_API_KEY gate and its two header shapes, RFC 9728 discovery, and the
 * MCP handshake — and the steps drive the real Express app from
 * `startHttpServer()` over a real port with nothing mocked. Same recipe as
 * tempered-bonds: Cucumber-js with TypeScript steps loaded through tsx.
 *
 * The scenarios are limited to the DB-free surface on purpose, so they run
 * anywhere vitest does (see features/support/world.ts).
 *
 * No `loader` entry: tsx must be active before Node loads anything, so
 * `test:bdd` launches `node --import tsx .../cucumber.js` directly.
 *
 * Profiles: the default prints progress; `report` also writes the HTML report.
 */
const common = {
    import: ['features/support/**/*.ts', 'features/steps/**/*.ts'],
    format: ['progress'],
    strict: true,
}

export default common
export const report = {
    ...common,
    format: ['progress', 'html:reports/bdd.html'],
}
