-- Enable Row-Level Security (RLS) and create conservative policies for existing tables

-- Roles (lookup): public SELECT, admin-only writes
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Role_public_select" ON "Role" FOR SELECT USING (true);
CREATE POLICY "Role_admin_write" ON "Role" FOR INSERT, UPDATE, DELETE WITH CHECK (current_setting('request.jwt.claims.role', true) = 'admin');

-- User: owner (email) or admin
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User_self_or_admin_select" ON "User" FOR SELECT USING (
  current_setting('request.jwt.claims.email', true) = email OR current_setting('request.jwt.claims.role', true) = 'admin'
);
CREATE POLICY "User_self_or_admin_modify" ON "User" FOR INSERT, UPDATE, DELETE WITH CHECK (
  current_setting('request.jwt.claims.email', true) = NEW.email OR current_setting('request.jwt.claims.role', true) = 'admin'
);

-- Invite: owner (email) or admin
ALTER TABLE "Invite" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Invite_self_or_admin_select" ON "Invite" FOR SELECT USING (
  current_setting('request.jwt.claims.email', true) = email OR current_setting('request.jwt.claims.role', true) = 'admin'
);
CREATE POLICY "Invite_self_or_admin_modify" ON "Invite" FOR INSERT, UPDATE, DELETE WITH CHECK (
  current_setting('request.jwt.claims.email', true) = NEW.email OR current_setting('request.jwt.claims.role', true) = 'admin'
);

-- AccessRequest: owner (userEmail) or admin
ALTER TABLE "AccessRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AccessRequest_self_or_admin_select" ON "AccessRequest" FOR SELECT USING (
  current_setting('request.jwt.claims.email', true) = userEmail OR current_setting('request.jwt.claims.role', true) = 'admin'
);
CREATE POLICY "AccessRequest_self_or_admin_modify" ON "AccessRequest" FOR INSERT, UPDATE, DELETE WITH CHECK (
  current_setting('request.jwt.claims.email', true) = NEW.userEmail OR current_setting('request.jwt.claims.role', true) = 'admin'
);

-- AuditLog: admin-only (read/write)
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AuditLog_admin_only" ON "AuditLog" FOR ALL USING (current_setting('request.jwt.claims.role', true) = 'admin');

-- Author: public SELECT, admin or creator for writes
ALTER TABLE "Author" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Author_public_select" ON "Author" FOR SELECT USING (true);
CREATE POLICY "Author_creator_or_admin_modify" ON "Author" FOR INSERT, UPDATE, DELETE WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = NEW.createdBy))
);

-- Book: public SELECT, admin or creator for writes
ALTER TABLE "Book" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Book_public_select" ON "Book" FOR SELECT USING (true);
CREATE POLICY "Book_creator_or_admin_modify" ON "Book" FOR INSERT, UPDATE, DELETE WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = NEW.createdBy))
);

-- BookAuthor: public SELECT, admin-only writes
ALTER TABLE "BookAuthor" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "BookAuthor_public_select" ON "BookAuthor" FOR SELECT USING (true);
CREATE POLICY "BookAuthor_admin_modify" ON "BookAuthor" FOR INSERT, UPDATE, DELETE WITH CHECK (current_setting('request.jwt.claims.role', true) = 'admin');

-- Rating: owner-based (userId) or admin
ALTER TABLE "Rating" ENABLE ROW LEVEL SECURITY;

-- Admin policy for ratings (admin sees everything)
CREATE POLICY "Rating_admin_all" ON "Rating" FOR ALL USING (current_setting('request.jwt.claims.role', true) = 'admin');

-- Allow users to SELECT their own ratings
CREATE POLICY "Rating_owner_select" ON "Rating" FOR SELECT USING (
  current_setting('request.jwt.claims.email', true) IS NOT NULL
  AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "Rating"."userId")
);

-- Allow users to INSERT ratings for themselves
CREATE POLICY "Rating_owner_insert" ON "Rating" FOR INSERT WITH CHECK (
  current_setting('request.jwt.claims.email', true) IS NOT NULL
  AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = NEW."userId")
);

-- Allow users to UPDATE/DELETE their own ratings
CREATE POLICY "Rating_owner_modify" ON "Rating" FOR UPDATE, DELETE USING (
  current_setting('request.jwt.claims.email', true) IS NOT NULL
  AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "Rating"."userId")
) WITH CHECK (
  current_setting('request.jwt.claims.email', true) IS NOT NULL
  AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = NEW."userId")
);

-- Notes:
--  - Policies use `request.jwt.claims.*` session settings that Supabase sets from the incoming JWT.
--  - We use `email` as the stable owner attribute because the application stores email on `User` and maps JWT email claim to user accounts.
--  - Admins are determined via `request.jwt.claims.role = 'admin'`.
--  - Service-role server actions should continue to use server-side credentials or the Supabase service role key when appropriate.


-- End of migration
