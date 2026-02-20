-- Embed ratings directly in Book, Movie, VideoGame tables (single-user system)
-- This migration:
-- 1. Adds rating/review/ratedAt columns to entity tables
-- 2. Migrates existing Rating data to new columns
-- 3. Drops the Rating table

-- Step 1: Add new columns to Book, Movie, VideoGame
ALTER TABLE "Book" ADD COLUMN "rating" INTEGER;
ALTER TABLE "Book" ADD COLUMN "review" TEXT;
ALTER TABLE "Book" ADD COLUMN "ratedAt" TIMESTAMP(3);

ALTER TABLE "Movie" ADD COLUMN "rating" INTEGER;
ALTER TABLE "Movie" ADD COLUMN "review" TEXT;
ALTER TABLE "Movie" ADD COLUMN "ratedAt" TIMESTAMP(3);

ALTER TABLE "VideoGame" ADD COLUMN "rating" INTEGER;
ALTER TABLE "VideoGame" ADD COLUMN "review" TEXT;
ALTER TABLE "VideoGame" ADD COLUMN "ratedAt" TIMESTAMP(3);

-- Step 2: Migrate existing rating data from Rating table to entity columns
-- Books
UPDATE "Book" b
SET 
    "rating" = r."rating",
    "review" = r."review",
    "ratedAt" = r."createdAt"
FROM "Rating" r
WHERE r."entity_type" = 'book' 
  AND r."entity_id" = b."id";

-- Also handle ratings that used bookId FK (if any)
UPDATE "Book" b
SET 
    "rating" = r."rating",
    "review" = r."review",
    "ratedAt" = r."createdAt"
FROM "Rating" r
WHERE r."bookId" = b."id"
  AND b."rating" IS NULL; -- Only if not already migrated

-- Movies
UPDATE "Movie" m
SET 
    "rating" = r."rating",
    "review" = r."review",
    "ratedAt" = r."createdAt"
FROM "Rating" r
WHERE r."entity_type" = 'movie' 
  AND r."entity_id" = m."id";

-- Also handle ratings that used movieId FK (if any)
UPDATE "Movie" m
SET 
    "rating" = r."rating",
    "review" = r."review",
    "ratedAt" = r."createdAt"
FROM "Rating" r
WHERE r."movieId" = m."id"
  AND m."rating" IS NULL; -- Only if not already migrated

-- VideoGames
UPDATE "VideoGame" v
SET 
    "rating" = r."rating",
    "review" = r."review",
    "ratedAt" = r."createdAt"
FROM "Rating" r
WHERE r."entity_type" = 'videogame' 
  AND r."entity_id" = v."id";

-- Also handle ratings that used videoGameId FK (if any)
UPDATE "VideoGame" v
SET 
    "rating" = r."rating",
    "review" = r."review",
    "ratedAt" = r."createdAt"
FROM "Rating" r
WHERE r."video_game_id" = v."id"
  AND v."rating" IS NULL; -- Only if not already migrated

-- Step 3: Drop the Rating table (no longer needed)
DROP TABLE IF EXISTS "Rating" CASCADE;

-- Step 4: Add indexes for rating columns (for filtering/sorting)
CREATE INDEX "Book_rating_idx" ON "Book"("rating");
CREATE INDEX "Movie_rating_idx" ON "Movie"("rating");
CREATE INDEX "VideoGame_rating_idx" ON "VideoGame"("rating");
