-- Simplify schema for single-user personal website with Supabase Auth
-- This is a BREAKING CHANGE but acceptable since no real user data exists

-- Step 1: Drop all RLS policies FIRST (they depend on columns we're about to drop)
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    -- Drop all policies on all tables
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
            pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
    
    -- Disable RLS on all tables
    ALTER TABLE IF EXISTS "Profile" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS "Author" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS "Book" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS "BookAuthor" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS "Movie" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS "VideoGame" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS "ContentCreator" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS "Rating" DISABLE ROW LEVEL SECURITY;
END $$;

-- Step 2: Drop foreign key constraints that reference Profile.id or tables we're removing
-- Step 2: Drop foreign key constraints that reference Profile.id or tables we're removing
ALTER TABLE "Author" DROP CONSTRAINT IF EXISTS "Author_createdBy_fkey";
ALTER TABLE "Book" DROP CONSTRAINT IF EXISTS "Book_createdBy_fkey";
ALTER TABLE "Movie" DROP CONSTRAINT IF EXISTS "Movie_createdBy_fkey";
ALTER TABLE "VideoGame" DROP CONSTRAINT IF EXISTS "VideoGame_createdBy_fkey";
ALTER TABLE "ContentCreator" DROP CONSTRAINT IF EXISTS "ContentCreator_createdBy_fkey";
ALTER TABLE "Rating" DROP CONSTRAINT IF EXISTS "Rating_userId_fkey";
ALTER TABLE "Profile" DROP CONSTRAINT IF EXISTS "Profile_roleId_fkey";
ALTER TABLE "Invite" DROP CONSTRAINT IF EXISTS "Invite_invitedBy_fkey";
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_actorId_fkey";
ALTER TABLE "AuthMagicLink" DROP CONSTRAINT IF EXISTS "AuthMagicLink_userId_fkey";

-- Step 3: Drop tables we don't need
DROP TABLE IF EXISTS "RatingAggregate" CASCADE;
DROP TABLE IF EXISTS "AuthMagicLink" CASCADE;
DROP TABLE IF EXISTS "AuditLog" CASCADE;
DROP TABLE IF EXISTS "AccessRequest" CASCADE;
DROP TABLE IF EXISTS "Invite" CASCADE;
DROP TABLE IF EXISTS "Role" CASCADE;

-- Step 4: Drop columns we don't need
ALTER TABLE "Author" DROP COLUMN IF EXISTS "createdBy";
ALTER TABLE "Book" DROP COLUMN IF EXISTS "createdBy";
ALTER TABLE "Book" DROP COLUMN IF EXISTS "average_rating";
ALTER TABLE "Book" DROP COLUMN IF EXISTS "rating_count";
ALTER TABLE "Movie" DROP COLUMN IF EXISTS "createdBy";
ALTER TABLE "Movie" DROP COLUMN IF EXISTS "average_rating";
ALTER TABLE "Movie" DROP COLUMN IF EXISTS "rating_count";
ALTER TABLE "VideoGame" DROP COLUMN IF EXISTS "createdBy";
ALTER TABLE "VideoGame" DROP COLUMN IF EXISTS "average_rating";
ALTER TABLE "VideoGame" DROP COLUMN IF EXISTS "rating_count";
ALTER TABLE "ContentCreator" DROP COLUMN IF EXISTS "createdBy";

-- Step 5: Modify Rating table (remove userId, make single rating per entity)
-- Drop old unique constraint and index
DROP INDEX IF EXISTS "Rating_userId_idx";
ALTER TABLE "Rating" DROP CONSTRAINT IF EXISTS "Rating_entityType_entityId_userId_key";

-- Drop userId column
ALTER TABLE "Rating" DROP COLUMN IF EXISTS "userId";

-- Make entityType and entityId required and add unique constraint
ALTER TABLE "Rating" ALTER COLUMN "entity_type" SET NOT NULL;
ALTER TABLE "Rating" ALTER COLUMN "entity_id" SET NOT NULL;
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_entityType_entityId_key" UNIQUE ("entity_type", "entity_id");

-- Add foreign key columns for 1:1 relations with entities
ALTER TABLE "Rating" ADD COLUMN "movieId" INTEGER;
ALTER TABLE "Rating" ADD COLUMN "video_game_id" INTEGER;

-- Add unique constraints for 1:1 relations
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_bookId_key" UNIQUE ("bookId");
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_movieId_key" UNIQUE ("movieId");
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_video_game_id_key" UNIQUE ("video_game_id");

-- Add foreign key constraints
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_video_game_id_fkey" FOREIGN KEY ("video_game_id") REFERENCES "VideoGame"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 6: Modify Profile table to use UUID matching Supabase Auth
-- This requires recreating the table since we're changing the PK type from INT to TEXT

-- Create temporary table with new schema
CREATE TABLE "Profile_new" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "is_admin" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Profile_new_pkey" PRIMARY KEY ("id")
);

-- Create indexes on new table
CREATE UNIQUE INDEX "Profile_new_email_key" ON "Profile_new"("email");
CREATE INDEX "Profile_new_is_admin_idx" ON "Profile_new"("is_admin");

-- Migrate existing Profile data if any (this will fail if there are non-UUID ids, which is expected)
-- Since there's no real data, we'll just drop and recreate
DROP TABLE IF EXISTS "Profile" CASCADE;

-- Rename new table to Profile
ALTER TABLE "Profile_new" RENAME TO "Profile";

-- Rename indexes to match Prisma expectations
ALTER INDEX "Profile_new_email_key" RENAME TO "Profile_email_key";
ALTER INDEX "Profile_new_is_admin_idx" RENAME TO "Profile_is_admin_idx";

-- Step 7: Ensure test RLS role exists and grant permissions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_test_role') THEN
    CREATE ROLE rls_test_role NOINHERIT;
  END IF;
END
$$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO rls_test_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO rls_test_role;
