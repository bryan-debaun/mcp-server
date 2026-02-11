-- Add aggregate columns for Movie and VideoGame

ALTER TABLE "Movie" ADD COLUMN IF NOT EXISTS "average_rating" numeric(5,2);
ALTER TABLE "Movie" ADD COLUMN IF NOT EXISTS "rating_count" integer DEFAULT 0 NOT NULL;

ALTER TABLE "VideoGame" ADD COLUMN IF NOT EXISTS "average_rating" numeric(5,2);
ALTER TABLE "VideoGame" ADD COLUMN IF NOT EXISTS "rating_count" integer DEFAULT 0 NOT NULL;

-- Ensure indexes for fast filtering by rating
CREATE INDEX IF NOT EXISTS "Movie_average_rating_idx" ON "Movie" ("average_rating");
CREATE INDEX IF NOT EXISTS "VideoGame_average_rating_idx" ON "VideoGame" ("average_rating");
