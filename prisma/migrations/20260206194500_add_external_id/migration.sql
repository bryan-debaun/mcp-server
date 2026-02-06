-- Add external_id column to User for mapping to external auth providers (e.g., Supabase)
ALTER TABLE "User" ADD COLUMN "external_id" VARCHAR;
CREATE INDEX "User_external_id_index" ON "User"("external_id");
