-- Add Resume singleton content resource: DB-backed résumé, ADR-0007 Phase 3 (#147).
-- Exactly one row (id = 1). `basics.privateContact` is stripped from public reads
-- at the application layer (resume tools / ResumeController); RLS below is
-- coarse-grained defense-in-depth (public read of the row, admin-only writes).

-- CreateTable
CREATE TABLE "Resume" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "document" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id"),
    -- Singleton: only row id = 1 may ever exist.
    CONSTRAINT "Resume_singleton" CHECK ("id" = 1)
);

-- Row-Level Security: anyone may read the single row (the app strips private
-- contact fields before returning them publicly); only admins may write.
ALTER TABLE "Resume" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Resume_public_select" ON "Resume";
CREATE POLICY "Resume_public_select" ON "Resume" FOR SELECT USING (true);

DROP POLICY IF EXISTS "Resume_admin_all" ON "Resume";
CREATE POLICY "Resume_admin_all" ON "Resume" FOR ALL USING (
  current_setting('request.jwt.claims.role', true) = 'admin'
) WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin'
);
