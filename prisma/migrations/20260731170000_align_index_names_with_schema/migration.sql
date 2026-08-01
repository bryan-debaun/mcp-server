-- Align three index/constraint names with what Prisma derives from schema.prisma.
--
-- `prisma migrate diff` against a fully-migrated database reports drift on these
-- three. All are cosmetic — names, not structure — and all pre-date the work
-- that surfaced them. They matter only because the next `prisma migrate dev`
-- would generate a spurious "corrective" migration for them, which is exactly
-- the kind of noise that trains you to stop reading generated migrations.
--
--   Article_publishedAt_idx -> Article_published_at_idx
--   Bet_placedAt_idx        -> Bet_placed_at_idx
--   Profile_new_pkey        -> Profile_pkey
--
-- The Profile one is a leftover from 20260219163147_simplify_single_user, which
-- rebuilt the table as `Profile_new`, renamed the table and its two indexes, but
-- never renamed the primary key constraint.
--
-- Guarded so this is a no-op on databases where the names are already correct
-- (e.g. one built by `prisma db push`, which CI uses).

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Article_publishedAt_idx')
       AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Article_published_at_idx') THEN
        ALTER INDEX "Article_publishedAt_idx" RENAME TO "Article_published_at_idx";
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Bet_placedAt_idx')
       AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Bet_placed_at_idx') THEN
        ALTER INDEX "Bet_placedAt_idx" RENAME TO "Bet_placed_at_idx";
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Profile_new_pkey')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Profile_pkey') THEN
        ALTER TABLE "Profile" RENAME CONSTRAINT "Profile_new_pkey" TO "Profile_pkey";
    END IF;
END $$;
