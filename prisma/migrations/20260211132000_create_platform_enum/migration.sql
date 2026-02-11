-- Create Postgres enum type for Platform and migrate existing column
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Platform') THEN
        CREATE TYPE "Platform" AS ENUM ('PlayStation', 'Xbox', 'PC');
    END IF;
END $$;

-- Convert existing TEXT platform column to enum Platform
ALTER TABLE "VideoGame" ALTER COLUMN "platform" TYPE "Platform" USING "platform"::"Platform";
