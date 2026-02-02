# ADR 0008: Prevent Runtime DB Re-seed on Cold Start

Date: 2026-02-02

## Status

Proposed

## Context

Currently, the project seeds the database using `prisma/seed.ts`. When the application is deployed to Render's free tier and the process spins down, each cold start appears to trigger the seeding logic which increases startup latency and consumes unnecessary resources.

The existing seed file is idempotent (uses `upsert`) but lacks a short-circuit presence check and is sometimes executed at runtime rather than as part of deploy/CI. We want to avoid repeated runtime seeding while keeping the ability to seed reliably during deploys or manually.

## Decision

We will implement a small, fast seed-guard in `prisma/seed.ts` that performs a single presence check (e.g., `await prisma.role.findUnique({ where: { name: 'admin' } })`) and exits early with a clear log message when data already exists.

We will also recommend and document running `npm run prisma:seed` as an explicit deploy step (CI or Render deploy hook) rather than invoking the seeding script automatically at runtime startup.

This approach minimizes runtime complexity, requires no schema changes, and preserves idempotency and the ability to reseed manually.

### Implementation details

- Add at the top of `prisma/seed.ts`:

```ts
const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
if (adminRole) {
  console.log('DB already seeded; skipping.');
  return;
}
```

- Keep `upsert` usage for item-level idempotency.
- Add a small unit/integration test that covers: first-run seeds successfully; subsequent run returns early and does not perform the full seed.
- Add a README section documenting how to run the seed manually and add an example GitHub Actions job or Render deploy hook that runs `npm run prisma:seed` after migrations.

## Alternatives considered

- Skip seed entirely in production by checking `NODE_ENV=production` — simpler but brittle and not ideal when intentional automated seeding during deploy is desired.
- Add a `meta`/`deployment` table with `seeded_at` flag — explicit and auditable but requires a schema migration and is higher overhead.

## Consequences

- Positive: Fast cold-starts, minimal code change, low risk.
- Neutral: Need to update deploy process to ensure seed runs when expected (CI/Render hook).
- Negative: If the presence check uses the wrong canonical marker, a partially seeded DB could misreport as fully seeded — mitigated by choosing a robust canonical check and keeping seeding idempotent.

## Acceptance criteria

- Cold-start after spin-down does NOT trigger the full seeding process (no repeated "Seeding DB..." logs when DB contains expected items).
- `prisma/seed.ts` exits early when canonical record exists and logs `DB already seeded; skipping.`
- Tests exist covering guard behavior and idempotency.
- README documents deploy-time seeding and how to reseed manually.

## Rollout plan

1. Add seed-guard and tests in branch `feature/38-seed-guard` and open PR.
2. Merge after review and CI passes.
3. Add deploy job (CI or Render deploy hook) to run seed post-deploy; document steps in README.
4. Monitor cold-starts and logs for regressions; revert or roll forward if needed.

## Owner

- Decision owner: @bryan-debaun

---

(Generated as part of the handoff for Issue #38.)
