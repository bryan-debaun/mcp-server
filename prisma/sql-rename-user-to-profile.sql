-- Rename physical table and associated objects so Prisma's `Profile` model matches
ALTER TABLE IF EXISTS "User" RENAME TO "Profile";
ALTER TABLE IF EXISTS "Profile" RENAME CONSTRAINT "User_pkey" TO "Profile_pkey";

-- Rename sequence and update default
ALTER SEQUENCE IF EXISTS "User_id_seq" RENAME TO "Profile_id_seq";
ALTER TABLE IF EXISTS "Profile" ALTER COLUMN "id" SET DEFAULT nextval('"Profile_id_seq"'::regclass);

-- Rename indexes created earlier
ALTER INDEX IF EXISTS "User_email_key" RENAME TO "Profile_email_key";
ALTER INDEX IF EXISTS "User_is_admin_index" RENAME TO "Profile_is_admin_idx";
ALTER INDEX IF EXISTS "User_external_id_index" RENAME TO "Profile_external_id_idx";
