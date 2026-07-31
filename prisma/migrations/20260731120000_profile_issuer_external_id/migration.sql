-- Issue #151: stop overloading Profile.id as the identity-provider subject.
--
-- `Profile.id` has been doing double duty as the Supabase Auth user.id, and the
-- auth lookup gated on a UUID-shaped regex before it would even try the id
-- match. Any issuer that mints non-UUID subjects (Logto uses short alphanumeric
-- ids) fell through that gate silently and resolved to no profile — which
-- `resolveAppRole` reports as `isAdmin: false`, quietly downgrading an admin
-- instead of failing loudly.
--
-- Identity moves to an explicit (issuer, external_id) pair so a subject is
-- attributable to the issuer that minted it, and so two issuers can coexist
-- during a migration.

ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "issuer" TEXT;
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "external_id" TEXT;

-- Backfill. Every pre-existing row's `id` IS the subject the previous code
-- matched on, so copying it into `external_id` preserves resolution exactly.
--
-- `issuer` is deliberately left NULL rather than hardcoded to the current
-- Supabase issuer URL: this migration runs against dev, CI, and production
-- databases that point at different Supabase projects, and stamping one
-- project's issuer would mis-attribute rows in the others. The application
-- treats a NULL issuer as "pre-migration, not yet attributed" and still matches
-- it on external_id alone, so the backfill is complete without downtime.
UPDATE "Profile" SET "external_id" = "id" WHERE "external_id" IS NULL;

CREATE INDEX IF NOT EXISTS "Profile_external_id_idx" ON "Profile"("external_id");

-- One profile per identity per issuer. Postgres treats NULLs as distinct under a
-- unique index, so this constrains attributed identities without blocking
-- profiles that have no linked identity yet (seeded or admin-created rows).
CREATE UNIQUE INDEX IF NOT EXISTS "Profile_issuer_external_id_key" ON "Profile"("issuer", "external_id");
