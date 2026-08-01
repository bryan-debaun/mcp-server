-- Make Row-Level Security an actual control (ORR gap #7).
--
-- Before this, RLS enforced nothing. The app connects as `postgres`, which owns
-- every table AND carries rolbypassrls, and no table used FORCE ROW LEVEL
-- SECURITY — three independent bypasses. Most catalog tables had RLS switched
-- off entirely by the single-user simplification, and the policies that did
-- exist keyed on `request.jwt.claims.*`, which nothing ever set.
--
-- This migration builds the database half:
--   * `mcp_app` — a NON-OWNER, NOBYPASSRLS role for the application to connect as.
--   * RLS enabled on every application table.
--   * Policies: SELECT is open, writes require an admin claim.
--
-- The application half (propagating `request.jwt.claims.*` per request) is the
-- Prisma extension in `src/db/with-request-claims.ts`.
--
-- IMPORTANT: this migration does NOT give `mcp_app` a password or LOGIN, and it
-- does NOT change DATABASE_URL. Applying it is therefore a no-op for the running
-- app — everything keeps working as `postgres` exactly as before. The cutover is
-- a separate, deliberate step: see docs/runbooks/rls-cutover.md.

-- ── The application role ────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_app') THEN
        -- NOLOGIN on purpose: the password is set during cutover so it never
        -- lives in the repository or in migration history.
        CREATE ROLE mcp_app NOLOGIN NOBYPASSRLS NOINHERIT;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO mcp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mcp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mcp_app;

-- Tables created by later migrations must be reachable too, or the first new
-- model after cutover fails with a bare "permission denied" at runtime.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mcp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO mcp_app;

-- Deliberately NOT granted: CREATE on the schema, and any DDL. Migrations run
-- as the owner over DATABASE_URL_DIRECT; the application never needs to alter
-- the schema, so it should not be able to.

-- ── RLS + policies ─────────────────────────────────────────────────────────
-- One shape for every table, applied in a loop so a new table cannot quietly
-- miss out. `_prisma_migrations` is excluded: Prisma's own bookkeeping, written
-- by the owner during migration, never by the app role.
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname NOT LIKE '\_%'
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

        -- FORCE so the posture holds even if the app is ever pointed back at an
        -- owner role. Without it, ownership alone silently reopens everything —
        -- which is precisely how this became inert the first time.
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

        -- Reads stay open. Catalog data is public, reads are the hot path, and
        -- wrapping them to carry identity would cost two round-trips on every
        -- page load for no security gain. Writes are where an authorization bug
        -- actually costs something.
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR SELECT USING (true)', t || '_read', t);

        -- Writes require an admin claim. `set_config(..., is_local => true)`
        -- inside the statement's own transaction is what puts it there.
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_admin_write', t);
        EXECUTE format($p$
            CREATE POLICY %I ON %I FOR ALL
            USING (current_setting('request.jwt.claims.role', true) = 'admin')
            WITH CHECK (current_setting('request.jwt.claims.role', true) = 'admin')
        $p$, t || '_admin_write', t);
    END LOOP;
END $$;

-- Retire the earlier, never-effective policy set so two generations of rules
-- don't sit on the same tables confusing whoever reads this next.
DO $$
DECLARE
    p record;
BEGIN
    FOR p IN
        SELECT pol.polname, cls.relname
        FROM pg_policy pol
        JOIN pg_class cls ON cls.oid = pol.polrelid
        JOIN pg_namespace n ON n.oid = cls.relnamespace
        WHERE n.nspname = 'public'
          AND pol.polname NOT IN (cls.relname || '_read', cls.relname || '_admin_write')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p.polname, p.relname);
    END LOOP;
END $$;
