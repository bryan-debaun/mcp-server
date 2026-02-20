/*
  Warnings:

  - The `status` column on the `Movie` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `VideoGame` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";

-- DropForeignKey
ALTER TABLE "AuthMagicLink" DROP CONSTRAINT "AuthMagicLink_userId_fkey";

-- DropForeignKey
ALTER TABLE "Author" DROP CONSTRAINT "Author_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "Book" DROP CONSTRAINT "Book_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ContentCreator" DROP CONSTRAINT "ContentCreator_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "Invite" DROP CONSTRAINT "Invite_invitedBy_fkey";

-- DropForeignKey
ALTER TABLE "Movie" DROP CONSTRAINT "Movie_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "Rating" DROP CONSTRAINT "Rating_bookId_fkey";

-- DropForeignKey
ALTER TABLE "Rating" DROP CONSTRAINT "Rating_userId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_roleId_fkey";

-- DropForeignKey
ALTER TABLE "VideoGame" DROP CONSTRAINT "VideoGame_createdBy_fkey";

-- DropIndex
DROP INDEX "Movie_average_rating_idx";

-- DropIndex
DROP INDEX "Rating_bookId_idx";

-- DropIndex
DROP INDEX "Rating_bookId_userId_key";

-- DropIndex
DROP INDEX "Rating_entity_id_idx";

-- DropIndex
DROP INDEX "Rating_entity_type_idx";

-- DropIndex
DROP INDEX "VideoGame_average_rating_idx";

-- AlterTable
ALTER TABLE "AuthMagicLink" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "consumedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ContentCreator" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Movie" DROP COLUMN "status",
ADD COLUMN     "status" "ItemStatus" NOT NULL DEFAULT 'NOT_STARTED',
ALTER COLUMN "releasedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Rating" ALTER COLUMN "bookId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "VideoGame" DROP COLUMN "status",
ADD COLUMN     "status" "ItemStatus" NOT NULL DEFAULT 'NOT_STARTED',
ALTER COLUMN "releasedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- Instead of dropping and recreating the users table (which breaks RLS/policies),
-- rename the existing SQL table and associated objects so Postgres keeps
-- dependent objects (policies, ownership, etc.).
-- Rename the physical table from "User" -> "Profile" and adjust indexes/seq
ALTER TABLE "User" RENAME TO "Profile";

-- Rename primary key constraint if present
ALTER TABLE "Profile" RENAME CONSTRAINT "User_pkey" TO "Profile_pkey";

-- Rename sequence and update the default on the id column
ALTER SEQUENCE "User_id_seq" RENAME TO "Profile_id_seq";
ALTER TABLE "Profile" ALTER COLUMN "id" SET DEFAULT nextval('"Profile_id_seq"'::regclass);

-- Rename existing indexes from the old table-name convention to the new ones Prisma expects
ALTER INDEX "User_email_key" RENAME TO "Profile_email_key";
ALTER INDEX "User_is_admin_index" RENAME TO "Profile_is_admin_idx";
ALTER INDEX "User_external_id_index" RENAME TO "Profile_external_id_idx";

-- Ensure column names/types already present remain (no-op if already correct)
-- (Prisma will handle other column-level ALTERs elsewhere in this migration)


-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Author" ADD CONSTRAINT "Author_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movie" ADD CONSTRAINT "Movie_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoGame" ADD CONSTRAINT "VideoGame_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCreator" ADD CONSTRAINT "ContentCreator_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthMagicLink" ADD CONSTRAINT "AuthMagicLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Book_status_index" RENAME TO "Book_status_idx";

-- RenameIndex
ALTER INDEX "Rating_entity_composite_idx" RENAME TO "Rating_entity_type_entity_id_idx";

-- RenameIndex
ALTER INDEX "Rating_entity_user_unique" RENAME TO "Rating_entity_type_entity_id_userId_key";

-- RenameIndex
ALTER INDEX "idx_ratingaggregate_entity_id" RENAME TO "RatingAggregate_entity_id_idx";

-- RenameIndex
ALTER INDEX "idx_ratingaggregate_entity_type" RENAME TO "RatingAggregate_entity_type_idx";
