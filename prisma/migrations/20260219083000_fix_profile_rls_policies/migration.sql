-- Ensure RLS policies that reference the legacy "User" table also consider the renamed "Profile" table.
-- This migration is idempotent: it drops existing policies and (re)creates them with a condition
-- that checks both `Profile` and `User` so environments at different migration states remain compatible.

-- Movie policies (owner by email OR admin)
DO $$
BEGIN
  IF to_regclass('public.Profile') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Movie_creator_or_admin_insert" ON "Movie";
    CREATE POLICY "Movie_creator_or_admin_insert" ON "Movie" FOR INSERT WITH CHECK (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "createdBy"))
    );

    DROP POLICY IF EXISTS "Movie_creator_or_admin_update" ON "Movie";
    CREATE POLICY "Movie_creator_or_admin_update" ON "Movie" FOR UPDATE USING (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "Movie"."createdBy"))
    ) WITH CHECK (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "createdBy"))
    );

    DROP POLICY IF EXISTS "Movie_creator_or_admin_delete" ON "Movie";
    CREATE POLICY "Movie_creator_or_admin_delete" ON "Movie" FOR DELETE USING (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "Movie"."createdBy"))
    );

  ELSIF to_regclass('public.User') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Movie_creator_or_admin_insert" ON "Movie";
    CREATE POLICY "Movie_creator_or_admin_insert" ON "Movie" FOR INSERT WITH CHECK (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
    );

    DROP POLICY IF EXISTS "Movie_creator_or_admin_update" ON "Movie";
    CREATE POLICY "Movie_creator_or_admin_update" ON "Movie" FOR UPDATE USING (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "Movie"."createdBy"))
    ) WITH CHECK (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
    );

    DROP POLICY IF EXISTS "Movie_creator_or_admin_delete" ON "Movie";
    CREATE POLICY "Movie_creator_or_admin_delete" ON "Movie" FOR DELETE USING (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "Movie"."createdBy"))
    );
  END IF;
END$$;

-- VideoGame policies
DO $$
BEGIN
  IF to_regclass('public.Profile') IS NOT NULL THEN
    DROP POLICY IF EXISTS "VideoGame_creator_or_admin_insert" ON "VideoGame";
    CREATE POLICY "VideoGame_creator_or_admin_insert" ON "VideoGame" FOR INSERT WITH CHECK (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "createdBy"))
    );

    DROP POLICY IF EXISTS "VideoGame_creator_or_admin_update" ON "VideoGame";
    CREATE POLICY "VideoGame_creator_or_admin_update" ON "VideoGame" FOR UPDATE USING (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "VideoGame"."createdBy"))
    ) WITH CHECK (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "createdBy"))
    );

    DROP POLICY IF EXISTS "VideoGame_creator_or_admin_delete" ON "VideoGame";
    CREATE POLICY "VideoGame_creator_or_admin_delete" ON "VideoGame" FOR DELETE USING (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "VideoGame"."createdBy"))
    );

  ELSIF to_regclass('public.User') IS NOT NULL THEN
    DROP POLICY IF EXISTS "VideoGame_creator_or_admin_insert" ON "VideoGame";
    CREATE POLICY "VideoGame_creator_or_admin_insert" ON "VideoGame" FOR INSERT WITH CHECK (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
    );

    DROP POLICY IF EXISTS "VideoGame_creator_or_admin_update" ON "VideoGame";
    CREATE POLICY "VideoGame_creator_or_admin_update" ON "VideoGame" FOR UPDATE USING (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "VideoGame"."createdBy"))
    ) WITH CHECK (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
    );

    DROP POLICY IF EXISTS "VideoGame_creator_or_admin_delete" ON "VideoGame";
    CREATE POLICY "VideoGame_creator_or_admin_delete" ON "VideoGame" FOR DELETE USING (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "VideoGame"."createdBy"))
    );
  END IF;
END$$;

-- ContentCreator policies
DO $$
BEGIN
  IF to_regclass('public.Profile') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ContentCreator_creator_or_admin_insert" ON "ContentCreator";
    CREATE POLICY "ContentCreator_creator_or_admin_insert" ON "ContentCreator" FOR INSERT WITH CHECK (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "createdBy"))
    );

    DROP POLICY IF EXISTS "ContentCreator_creator_or_admin_update" ON "ContentCreator";
    CREATE POLICY "ContentCreator_creator_or_admin_update" ON "ContentCreator" FOR UPDATE USING (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "ContentCreator"."createdBy"))
    ) WITH CHECK (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "createdBy"))
    );

    DROP POLICY IF EXISTS "ContentCreator_creator_or_admin_delete" ON "ContentCreator";
    CREATE POLICY "ContentCreator_creator_or_admin_delete" ON "ContentCreator" FOR DELETE USING (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "ContentCreator"."createdBy"))
    );

  ELSIF to_regclass('public.User') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ContentCreator_creator_or_admin_insert" ON "ContentCreator";
    CREATE POLICY "ContentCreator_creator_or_admin_insert" ON "ContentCreator" FOR INSERT WITH CHECK (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
    );

    DROP POLICY IF EXISTS "ContentCreator_creator_or_admin_update" ON "ContentCreator";
    CREATE POLICY "ContentCreator_creator_or_admin_update" ON "ContentCreator" FOR UPDATE USING (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "ContentCreator"."createdBy"))
    ) WITH CHECK (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
    );

    DROP POLICY IF EXISTS "ContentCreator_creator_or_admin_delete" ON "ContentCreator";
    CREATE POLICY "ContentCreator_creator_or_admin_delete" ON "ContentCreator" FOR DELETE USING (
      current_setting('request.jwt.claims.role', true) = 'admin'
      OR (current_setting('request.jwt.claims.email', true) IS NOT NULL
          AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "ContentCreator"."createdBy"))
    );
  END IF;
END$$;
