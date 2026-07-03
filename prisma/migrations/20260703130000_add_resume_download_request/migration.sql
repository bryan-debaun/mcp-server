-- Add ResumeDownloadRequest resource: gated résumé-download flow (issue #139).
-- A signed-in user requests the contact-bearing résumé; an admin approves/denies;
-- approval grants a 72h download window. Authorization (admin gating, owner-only
-- create/fulfill, quota) is enforced in the application layer; RLS below is
-- defense-in-depth mirroring the AccessRequest owner-or-admin pattern.

-- CreateEnum
CREATE TYPE "ResumeDownloadStatus" AS ENUM ('pending', 'approved', 'denied', 'fulfilled', 'expired');

-- CreateTable
CREATE TABLE "ResumeDownloadRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "reason" TEXT,
    "status" "ResumeDownloadStatus" NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ResumeDownloadRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResumeDownloadRequest_userId_idx" ON "ResumeDownloadRequest"("userId");

-- CreateIndex
CREATE INDEX "ResumeDownloadRequest_status_idx" ON "ResumeDownloadRequest"("status");

-- CreateIndex
CREATE INDEX "ResumeDownloadRequest_userId_createdAt_idx" ON "ResumeDownloadRequest"("userId", "createdAt");

-- Row-Level Security: a user may see/act on their own requests (matched by the
-- JWT email claim against `userEmail`); admins do everything. Defense-in-depth
-- for any direct (PostgREST/anon) access; the app also enforces this.
ALTER TABLE "ResumeDownloadRequest" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ResumeDownloadRequest_self_or_admin_select" ON "ResumeDownloadRequest";
CREATE POLICY "ResumeDownloadRequest_self_or_admin_select" ON "ResumeDownloadRequest" FOR SELECT USING (
  current_setting('request.jwt.claims.email', true) = "userEmail" OR current_setting('request.jwt.claims.role', true) = 'admin'
);

DROP POLICY IF EXISTS "ResumeDownloadRequest_self_or_admin_insert" ON "ResumeDownloadRequest";
CREATE POLICY "ResumeDownloadRequest_self_or_admin_insert" ON "ResumeDownloadRequest" FOR INSERT WITH CHECK (
  current_setting('request.jwt.claims.email', true) = "userEmail" OR current_setting('request.jwt.claims.role', true) = 'admin'
);

DROP POLICY IF EXISTS "ResumeDownloadRequest_self_or_admin_update" ON "ResumeDownloadRequest";
CREATE POLICY "ResumeDownloadRequest_self_or_admin_update" ON "ResumeDownloadRequest" FOR UPDATE USING (
  current_setting('request.jwt.claims.email', true) = "userEmail" OR current_setting('request.jwt.claims.role', true) = 'admin'
) WITH CHECK (
  current_setting('request.jwt.claims.email', true) = "userEmail" OR current_setting('request.jwt.claims.role', true) = 'admin'
);

DROP POLICY IF EXISTS "ResumeDownloadRequest_admin_delete" ON "ResumeDownloadRequest";
CREATE POLICY "ResumeDownloadRequest_admin_delete" ON "ResumeDownloadRequest" FOR DELETE USING (
  current_setting('request.jwt.claims.role', true) = 'admin'
);
