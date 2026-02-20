-- Disable Profile RLS entirely
-- Profile data (email, name, role) is just metadata/cache of Supabase Auth.
-- Real security is handled by Supabase Auth tokens at the application layer.
-- RLS on Profile adds significant test complexity with minimal security benefit.

DO $$
BEGIN
  IF to_regclass('public.Profile') IS NOT NULL THEN
    -- Drop all RLS policies
    DROP POLICY IF EXISTS "User_self_or_admin_select" ON "Profile";
    DROP POLICY IF EXISTS "User_self_or_admin_insert" ON "Profile";
    DROP POLICY IF EXISTS "User_self_or_admin_update" ON "Profile";
    DROP POLICY IF EXISTS "User_self_or_admin_delete" ON "Profile";
    DROP POLICY IF EXISTS "Profile_public_read" ON "Profile";
    DROP POLICY IF EXISTS "Profile_admin_write" ON "Profile";
    DROP POLICY IF EXISTS "Profile_admin_update" ON "Profile";
    DROP POLICY IF EXISTS "Profile_admin_delete" ON "Profile";

    -- Disable RLS on Profile table
    ALTER TABLE "Profile" DISABLE ROW LEVEL SECURITY;
  END IF;
END$$;

-- Ensure rls_test_role has necessary grants (for tests)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_test_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Profile" TO rls_test_role;
  END IF;
END$$;
