-- Create RatingAggregate to support polymorphic aggregates
CREATE TABLE IF NOT EXISTS "RatingAggregate" (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  rating_count INTEGER NOT NULL DEFAULT 0,
  average_rating numeric(5,2),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_ratingaggregate_entity_type ON "RatingAggregate" (entity_type);
CREATE INDEX IF NOT EXISTS idx_ratingaggregate_entity_id ON "RatingAggregate" (entity_id);

-- Note: backfill should be performed by scripts/backfill-rating-aggregates.ts to allow throttling/checkpointing
