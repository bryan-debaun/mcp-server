-- Add Bet resource: personal sports-betting tracker (issue #128 / epic #127).

CREATE TYPE "BetStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'PUSH', 'VOID');
CREATE TYPE "BetSource" AS ENUM ('INTUITION', 'AI_ASSISTED');
CREATE TYPE "BetMarket" AS ENUM ('moneyline', 'spread', 'total', 'prop', 'parlay');

CREATE TABLE "Bet" (
    "id" SERIAL NOT NULL,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sport" TEXT NOT NULL,
    "league" TEXT,
    "event" TEXT NOT NULL,
    "market" "BetMarket" NOT NULL,
    "selection" TEXT NOT NULL,
    "line" DOUBLE PRECISION,
    "odds_american" INTEGER NOT NULL,
    "stake" DOUBLE PRECISION NOT NULL,
    "book" TEXT NOT NULL DEFAULT 'DraftKings',
    "status" "BetStatus" NOT NULL DEFAULT 'PENDING',
    "settled_at" TIMESTAMP(3),
    "payout" DOUBLE PRECISION,
    "source" "BetSource" NOT NULL,
    "ai_model" TEXT,
    "ai_rationale" TEXT,
    "ai_est_prob" DOUBLE PRECISION,
    "ai_ev" DOUBLE PRECISION,
    "closing_line" DOUBLE PRECISION,
    "closing_odds_american" INTEGER,
    "legs" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Bet_source_idx" ON "Bet"("source");
CREATE INDEX "Bet_status_idx" ON "Bet"("status");
CREATE INDEX "Bet_sport_idx" ON "Bet"("sport");
CREATE INDEX "Bet_placedAt_idx" ON "Bet"("placed_at");

-- Row-Level Security: bets are private personal data — admin only (no public
-- select). The app connects with a privileged role; this is defense-in-depth
-- against any direct (PostgREST/anon) access.
ALTER TABLE "Bet" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bet_admin_all" ON "Bet";
CREATE POLICY "Bet_admin_all" ON "Bet" FOR ALL USING (
  current_setting('request.jwt.claims.role', true) = 'admin'
) WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin'
);
