-- Add rating_count and average_rating columns to Book
ALTER TABLE "Book" ADD COLUMN IF NOT EXISTS "rating_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "Book" ADD COLUMN IF NOT EXISTS "average_rating" numeric(5,2);

-- Backfill from existing ratings
-- Set rating_count and average_rating for books that have ratings
UPDATE "Book" b
SET
  "rating_count" = agg.cnt,
  "average_rating" = agg.avg
FROM (
  SELECT "bookId" AS book_id, COUNT(*) AS cnt, ROUND(AVG(rating)::numeric, 2) AS avg
  FROM "Rating"
  GROUP BY "bookId"
) AS agg
WHERE b.id = agg.book_id;

-- Notes:
-- - Books with no ratings will have rating_count = 0 and average_rating = NULL
-- - This backfill should be safe to run as part of the migration; for very large datasets, prefer the included scripts/backfill-book-aggregates.ts to perform a throttled backfill with checkpoints.

-- Optionally create an index on average_rating if you expect frequent queries filtering by rating.
-- CREATE INDEX IF NOT EXISTS idx_book_average_rating ON "Book" ("average_rating");
