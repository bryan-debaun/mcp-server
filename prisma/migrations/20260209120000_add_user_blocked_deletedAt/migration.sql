-- Add blocked and deletedAt to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blocked" boolean DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone;

-- Add index on blocked for admin queries
CREATE INDEX IF NOT EXISTS "User_blocked_idx" ON "User" ("blocked");
