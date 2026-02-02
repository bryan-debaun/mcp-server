-- Create AuthMagicLink table for magic-link passwordless login

CREATE TABLE "AuthMagicLink" (
  id SERIAL PRIMARY KEY,
  jti TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  "userId" INTEGER REFERENCES "User"(id) ON DELETE SET NULL,
  "expiresAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  "consumedAt" TIMESTAMP WITHOUT TIME ZONE,
  "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX "AuthMagicLink_email_idx" ON "AuthMagicLink" (email);
CREATE INDEX "AuthMagicLink_expiresAt_idx" ON "AuthMagicLink" ("expiresAt");

-- Enable Row-Level Security and restrict to admins (server-side writes/reads only)
ALTER TABLE "AuthMagicLink" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AuthMagicLink_admin_only" ON "AuthMagicLink";
CREATE POLICY "AuthMagicLink_admin_only" ON "AuthMagicLink" FOR ALL USING (current_setting('request.jwt.claims.role', true) = 'admin');
