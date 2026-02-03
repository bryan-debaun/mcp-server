-- Create enum type for item status
CREATE TYPE "ItemStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- Add status column to Book with default NOT_STARTED
ALTER TABLE "Book" ADD COLUMN "status" "ItemStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- Add is_admin column to User with default false
ALTER TABLE "User" ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT false;

-- Add indexes
CREATE INDEX "Book_status_index" ON "Book"("status");
CREATE INDEX "User_is_admin_index" ON "User"("is_admin");
