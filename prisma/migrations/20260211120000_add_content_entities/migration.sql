-- Create Movie, VideoGame, ContentCreator tables and make Rating polymorphic
-- Adds columns to Rating (entity_type, entity_id), backfills from existing bookId,
-- and creates unique constraint and indexes. Also adds RLS policies for new tables.
-- Rollback notes: This migration is additive and non-destructive; we intentionally
-- do NOT drop the old Rating.bookId column here to allow validation before removal.

-- Movie table
CREATE TABLE "Movie" (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  description TEXT,
  iasn TEXT UNIQUE,
  imdb_id TEXT UNIQUE,
  "releasedAt" TIMESTAMP WITHOUT TIME ZONE,
  "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  "createdBy" INTEGER REFERENCES "User"(id) ON DELETE SET NULL
);

CREATE INDEX "Movie_title_idx" ON "Movie" (title);
CREATE INDEX "Movie_iasn_idx" ON "Movie" (iasn);

-- Enable Row-Level Security and restrict: public SELECT, creator or admin for writes
ALTER TABLE "Movie" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Movie_public_select" ON "Movie";
CREATE POLICY "Movie_public_select" ON "Movie" FOR SELECT USING (true);
DROP POLICY IF EXISTS "Movie_creator_or_admin_insert" ON "Movie";
CREATE POLICY "Movie_creator_or_admin_insert" ON "Movie" FOR INSERT WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
);
DROP POLICY IF EXISTS "Movie_creator_or_admin_update" ON "Movie";
CREATE POLICY "Movie_creator_or_admin_update" ON "Movie" FOR UPDATE USING (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "Movie"."createdBy"))
) WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
);
DROP POLICY IF EXISTS "Movie_creator_or_admin_delete" ON "Movie";
CREATE POLICY "Movie_creator_or_admin_delete" ON "Movie" FOR DELETE USING (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
);

-- VideoGame table
CREATE TABLE "VideoGame" (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  description TEXT,
  platform TEXT NOT NULL,
  igdb_id TEXT UNIQUE,
  "releasedAt" TIMESTAMP WITHOUT TIME ZONE,
  "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  "createdBy" INTEGER REFERENCES "User"(id) ON DELETE SET NULL
);

CREATE INDEX "VideoGame_title_idx" ON "VideoGame" (title);
CREATE INDEX "VideoGame_platform_idx" ON "VideoGame" (platform);

-- RLS for VideoGame
ALTER TABLE "VideoGame" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "VideoGame_public_select" ON "VideoGame";
CREATE POLICY "VideoGame_public_select" ON "VideoGame" FOR SELECT USING (true);
DROP POLICY IF EXISTS "VideoGame_creator_or_admin_insert" ON "VideoGame";
CREATE POLICY "VideoGame_creator_or_admin_insert" ON "VideoGame" FOR INSERT WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
);
DROP POLICY IF EXISTS "VideoGame_creator_or_admin_update" ON "VideoGame";
CREATE POLICY "VideoGame_creator_or_admin_update" ON "VideoGame" FOR UPDATE USING (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "VideoGame"."createdBy"))
) WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
);
DROP POLICY IF EXISTS "VideoGame_creator_or_admin_delete" ON "VideoGame";
CREATE POLICY "VideoGame_creator_or_admin_delete" ON "VideoGame" FOR DELETE USING (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
);

-- ContentCreator table
CREATE TABLE "ContentCreator" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  website TEXT,
  "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  "createdBy" INTEGER REFERENCES "User"(id) ON DELETE SET NULL
);

CREATE INDEX "ContentCreator_name_idx" ON "ContentCreator" (name);

-- RLS for ContentCreator
ALTER TABLE "ContentCreator" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ContentCreator_public_select" ON "ContentCreator";
CREATE POLICY "ContentCreator_public_select" ON "ContentCreator" FOR SELECT USING (true);
DROP POLICY IF EXISTS "ContentCreator_creator_or_admin_insert" ON "ContentCreator";
CREATE POLICY "ContentCreator_creator_or_admin_insert" ON "ContentCreator" FOR INSERT WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
);
DROP POLICY IF EXISTS "ContentCreator_creator_or_admin_update" ON "ContentCreator";
CREATE POLICY "ContentCreator_creator_or_admin_update" ON "ContentCreator" FOR UPDATE USING (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "ContentCreator"."createdBy"))
) WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
);
DROP POLICY IF EXISTS "ContentCreator_creator_or_admin_delete" ON "ContentCreator";
CREATE POLICY "ContentCreator_creator_or_admin_delete" ON "ContentCreator" FOR DELETE USING (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
);

-- Make Rating polymorphic: add entity_type/entity_id and backfill from bookId
ALTER TABLE "Rating" ADD COLUMN IF NOT EXISTS "entity_type" TEXT;
ALTER TABLE "Rating" ADD COLUMN IF NOT EXISTS "entity_id" INTEGER;

-- Backfill existing book ratings into new polymorphic columns
UPDATE "Rating" SET "entity_type" = 'book', "entity_id" = "bookId" WHERE "bookId" IS NOT NULL;

-- Add unique index and indexes for polymorphic rating uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "Rating_entity_user_unique" ON "Rating" ("entity_type", "entity_id", "userId");
CREATE INDEX IF NOT EXISTS "Rating_entity_type_idx" ON "Rating" ("entity_type");
CREATE INDEX IF NOT EXISTS "Rating_entity_id_idx" ON "Rating" ("entity_id");
CREATE INDEX IF NOT EXISTS "Rating_entity_composite_idx" ON "Rating" ("entity_type", "entity_id");

-- Notes:
--  - We intentionally keep the old "bookId" column for validation and rollback safety.
--  - After validation and production verification, we can create a follow-up migration to drop "bookId".

-- End of migration
