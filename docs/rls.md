# Row-Level Security (RLS) — Policies & Guidelines

This doc describes the RLS policy templates and developer checklist used by the MCP Server repository.

## Goals

- Ensure all tables are protected by RLS unless there is an approved, documented exception.
- Provide safe policy templates (owner-based, admin override, public read for lookup tables).
- Add CI checks so new migrations that add tables must include RLS.

## Policy templates 🔧

1) Owner-based (email)

- Use when table rows belong to a user and the application keeps `User.email` as the canonical identity.

SQL snippet:

ALTER TABLE "YourTable" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "YourTable_owner_select" ON "YourTable" FOR SELECT USING (
  current_setting('request.jwt.claims.email', true) = owner_email_column
);
CREATE POLICY "YourTable_owner_modify" ON "YourTable" FOR INSERT, UPDATE, DELETE WITH CHECK (
  current_setting('request.jwt.claims.email', true) = NEW.owner_email_column
);

1) Owner-based (foreign key to `User.id`)

- Use when rows reference `userId`.

SQL snippet:

ALTER TABLE "YourTable" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "YourTable_owner_select" ON "YourTable" FOR SELECT USING (
  current_setting('request.jwt.claims.email', true) IS NOT NULL
  AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "YourTable"."userId")
);

1) Public lookup (read-only)

- Use for small lookup tables (e.g., `Role`) that are safe to read publicly.

SQL snippet:

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Role_public_select" ON "Role" FOR SELECT USING (true);
CREATE POLICY "Role_admin_write" ON "Role" FOR INSERT, UPDATE, DELETE WITH CHECK (current_setting('request.jwt.claims.role', true) = 'admin');

1) Admin override

- Admins are allowed to bypass owner checks by policy (use `request.jwt.claims.role = 'admin'`).

Example:
CREATE POLICY "YourTable_admin_all" ON "YourTable" FOR ALL USING (current_setting('request.jwt.claims.role', true) = 'admin');

## Developer checklist ✅

- [ ] For new tables include RLS enablement and policy creation in the same migration file.
- [ ] Prefer owner-based policies over broad public access.
- [ ] Add integration tests (gated by RUN_DB_INTEGRATION=true) that validate policy behavior (owner cannot see other owner rows).
- [ ] If an exception is required, document it in the issue and add a comment in the migration noting the reason and an owner.

## Running integration tests locally

- Start a development Postgres instance and configure `DATABASE_URL`.
- Run: `RUN_DB_INTEGRATION=true npm test`

## Rollout guidance

- Apply RLS in staging first and validate all smoke tests.
- Have a rollback plan: ability to disable policies or disable RLS quickly in case of production regressions.
