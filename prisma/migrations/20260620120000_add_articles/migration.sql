-- Add Article resource: DB-backed site philosophy content (issue #120).
-- Public reads are restricted to `published`; drafts require admin auth,
-- enforced in the application layer (ArticlesController + MCP tools).

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "Article" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'draft',
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "published_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_status_idx" ON "Article"("status");

-- CreateIndex
CREATE INDEX "Article_publishedAt_idx" ON "Article"("published_at");

-- Row-Level Security: public can read only `published`; admins do everything.
-- The application also enforces published-only at its layer; this is
-- defense-in-depth for any direct (PostgREST/anon) access.
ALTER TABLE "Article" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Article_public_select_published" ON "Article";
CREATE POLICY "Article_public_select_published" ON "Article" FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "Article_admin_all" ON "Article";
CREATE POLICY "Article_admin_all" ON "Article" FOR ALL USING (
  current_setting('request.jwt.claims.role', true) = 'admin'
) WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin'
);
