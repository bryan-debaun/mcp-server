-- Enable Row-Level Security (RLS) and create conservative policies for existing tables

-- Roles (lookup): public SELECT, admin-only writes
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Role_public_select" ON "Role";
CREATE POLICY "Role_public_select" ON "Role" FOR SELECT USING (true);
DROP POLICY IF EXISTS "Role_admin_insert" ON "Role";
CREATE POLICY "Role_admin_insert" ON "Role" FOR INSERT WITH CHECK (current_setting('request.jwt.claims.role', true) = 'admin');
DROP POLICY IF EXISTS "Role_admin_update" ON "Role";
CREATE POLICY "Role_admin_update" ON "Role" FOR UPDATE WITH CHECK (current_setting('request.jwt.claims.role', true) = 'admin');
DROP POLICY IF EXISTS "Role_admin_delete" ON "Role";
CREATE POLICY "Role_admin_delete" ON "Role" FOR DELETE USING (current_setting('request.jwt.claims.role', true) = 'admin');

-- User (renamed to Profile): owner (email) or admin
ALTER TABLE IF EXISTS "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "Profile" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "User_self_or_admin_select" ON "Profile";
CREATE POLICY "User_self_or_admin_select" ON "Profile" FOR SELECT USING (
  current_setting('request.jwt.claims.email', true) = email OR current_setting('request.jwt.claims.role', true) = 'admin'
);
DROP POLICY IF EXISTS "User_self_or_admin_insert" ON "Profile";
CREATE POLICY "User_self_or_admin_insert" ON "Profile" FOR INSERT WITH CHECK (
  current_setting('request.jwt.claims.email', true) = email OR current_setting('request.jwt.claims.role', true) = 'admin'
);
DROP POLICY IF EXISTS "User_self_or_admin_update" ON "Profile";
CREATE POLICY "User_self_or_admin_update" ON "Profile" FOR UPDATE USING (
  current_setting('request.jwt.claims.email', true) = email OR current_setting('request.jwt.claims.role', true) = 'admin'
) WITH CHECK (
  current_setting('request.jwt.claims.email', true) = email OR current_setting('request.jwt.claims.role', true) = 'admin'
);
DROP POLICY IF EXISTS "User_self_or_admin_delete" ON "Profile";
CREATE POLICY "User_self_or_admin_delete" ON "Profile" FOR DELETE USING (
  current_setting('request.jwt.claims.email', true) = email OR current_setting('request.jwt.claims.role', true) = 'admin'
);

-- Invite: owner (email) or admin
ALTER TABLE "Invite" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Invite_self_or_admin_select" ON "Invite";
CREATE POLICY "Invite_self_or_admin_select" ON "Invite" FOR SELECT USING (
  current_setting('request.jwt.claims.email', true) = email OR current_setting('request.jwt.claims.role', true) = 'admin'
);
DROP POLICY IF EXISTS "Invite_self_or_admin_insert" ON "Invite";
CREATE POLICY "Invite_self_or_admin_insert" ON "Invite" FOR INSERT WITH CHECK (
  current_setting('request.jwt.claims.email', true) = email OR current_setting('request.jwt.claims.role', true) = 'admin'
);
DROP POLICY IF EXISTS "Invite_self_or_admin_update" ON "Invite";
CREATE POLICY "Invite_self_or_admin_update" ON "Invite" FOR UPDATE USING (
  current_setting('request.jwt.claims.email', true) = email OR current_setting('request.jwt.claims.role', true) = 'admin'
) WITH CHECK (
  current_setting('request.jwt.claims.email', true) = email OR current_setting('request.jwt.claims.role', true) = 'admin'
);
DROP POLICY IF EXISTS "Invite_self_or_admin_delete" ON "Invite";
CREATE POLICY "Invite_self_or_admin_delete" ON "Invite" FOR DELETE USING (
  current_setting('request.jwt.claims.email', true) = email OR current_setting('request.jwt.claims.role', true) = 'admin'
);

-- AccessRequest: owner (userEmail) or admin
ALTER TABLE "AccessRequest" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AccessRequest_self_or_admin_select" ON "AccessRequest";
CREATE POLICY "AccessRequest_self_or_admin_select" ON "AccessRequest" FOR SELECT USING (
  current_setting('request.jwt.claims.email', true) = "userEmail" OR current_setting('request.jwt.claims.role', true) = 'admin'
);
DROP POLICY IF EXISTS "AccessRequest_self_or_admin_insert" ON "AccessRequest";
CREATE POLICY "AccessRequest_self_or_admin_insert" ON "AccessRequest" FOR INSERT WITH CHECK (
  current_setting('request.jwt.claims.email', true) = "userEmail" OR current_setting('request.jwt.claims.role', true) = 'admin'
);
DROP POLICY IF EXISTS "AccessRequest_self_or_admin_update" ON "AccessRequest";
CREATE POLICY "AccessRequest_self_or_admin_update" ON "AccessRequest" FOR UPDATE USING (
  current_setting('request.jwt.claims.email', true) = "userEmail" OR current_setting('request.jwt.claims.role', true) = 'admin'
) WITH CHECK (
  current_setting('request.jwt.claims.email', true) = "userEmail" OR current_setting('request.jwt.claims.role', true) = 'admin'
);
DROP POLICY IF EXISTS "AccessRequest_self_or_admin_delete" ON "AccessRequest";
CREATE POLICY "AccessRequest_self_or_admin_delete" ON "AccessRequest" FOR DELETE USING (
  current_setting('request.jwt.claims.email', true) = "userEmail" OR current_setting('request.jwt.claims.role', true) = 'admin'
);

-- AuditLog: admin-only (read/write)
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AuditLog_admin_only" ON "AuditLog";
CREATE POLICY "AuditLog_admin_only" ON "AuditLog" FOR ALL USING (current_setting('request.jwt.claims.role', true) = 'admin');

-- Author: public SELECT, admin or creator for writes
ALTER TABLE "Author" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Author_public_select" ON "Author";
CREATE POLICY "Author_public_select" ON "Author" FOR SELECT USING (true);
DROP POLICY IF EXISTS "Author_creator_or_admin_insert" ON "Author";
CREATE POLICY "Author_creator_or_admin_insert" ON "Author" FOR INSERT WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND (exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy") OR exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "createdBy")))
);
DROP POLICY IF EXISTS "Author_creator_or_admin_update" ON "Author";
CREATE POLICY "Author_creator_or_admin_update" ON "Author" FOR UPDATE USING (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND (exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "Author"."createdBy") OR exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "Author"."createdBy")))
) WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND (exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy") OR exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "createdBy")))
);
DROP POLICY IF EXISTS "Author_creator_or_admin_delete" ON "Author";
CREATE POLICY "Author_creator_or_admin_delete" ON "Author" FOR DELETE USING (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy"))
);

-- Book: public SELECT, admin or creator for writes
ALTER TABLE "Book" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Book_public_select" ON "Book";
CREATE POLICY "Book_public_select" ON "Book" FOR SELECT USING (true);
DROP POLICY IF EXISTS "Book_creator_or_admin_insert" ON "Book";
CREATE POLICY "Book_creator_or_admin_insert" ON "Book" FOR INSERT WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND (exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy") OR exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "createdBy")))
);
DROP POLICY IF EXISTS "Book_creator_or_admin_update" ON "Book";
CREATE POLICY "Book_creator_or_admin_update" ON "Book" FOR UPDATE USING (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND (exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "Book"."createdBy") OR exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "Book"."createdBy")))
) WITH CHECK (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND (exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "createdBy") OR exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "createdBy")))
);
DROP POLICY IF EXISTS "Book_creator_or_admin_delete" ON "Book";
CREATE POLICY "Book_creator_or_admin_delete" ON "Book" FOR DELETE USING (
  current_setting('request.jwt.claims.role', true) = 'admin' OR (current_setting('request.jwt.claims.email', true) IS NOT NULL AND (exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "Book"."createdBy") OR exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "Book"."createdBy")))
);

-- BookAuthor: public SELECT, admin-only writes
ALTER TABLE "BookAuthor" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "BookAuthor_public_select" ON "BookAuthor";
CREATE POLICY "BookAuthor_public_select" ON "BookAuthor" FOR SELECT USING (true);
DROP POLICY IF EXISTS "BookAuthor_admin_insert" ON "BookAuthor";
CREATE POLICY "BookAuthor_admin_insert" ON "BookAuthor" FOR INSERT WITH CHECK (current_setting('request.jwt.claims.role', true) = 'admin');
DROP POLICY IF EXISTS "BookAuthor_admin_update" ON "BookAuthor";
CREATE POLICY "BookAuthor_admin_update" ON "BookAuthor" FOR UPDATE WITH CHECK (current_setting('request.jwt.claims.role', true) = 'admin');
DROP POLICY IF EXISTS "BookAuthor_admin_delete" ON "BookAuthor";
CREATE POLICY "BookAuthor_admin_delete" ON "BookAuthor" FOR DELETE USING (current_setting('request.jwt.claims.role', true) = 'admin');

-- Rating: owner-based (userId) or admin
ALTER TABLE "Rating" ENABLE ROW LEVEL SECURITY;

-- Admin policy for ratings (admin sees everything)
DROP POLICY IF EXISTS "Rating_admin_all" ON "Rating";
CREATE POLICY "Rating_admin_all" ON "Rating" FOR ALL USING (current_setting('request.jwt.claims.role', true) = 'admin');

-- Allow users to SELECT their own ratings
DROP POLICY IF EXISTS "Rating_owner_select" ON "Rating";
CREATE POLICY "Rating_owner_select" ON "Rating" FOR SELECT USING (
  current_setting('request.jwt.claims.email', true) IS NOT NULL
  AND (exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "Rating"."userId") OR exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "Rating"."userId"))
);

-- Allow users to INSERT ratings for themselves
DROP POLICY IF EXISTS "Rating_owner_insert" ON "Rating";
CREATE POLICY "Rating_owner_insert" ON "Rating" FOR INSERT WITH CHECK (
  current_setting('request.jwt.claims.email', true) IS NOT NULL
  AND (exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "userId") OR exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "userId"))
);

-- Allow users to UPDATE/DELETE their own ratings
DROP POLICY IF EXISTS "Rating_owner_modify" ON "Rating";
CREATE POLICY "Rating_owner_modify" ON "Rating" FOR UPDATE USING (
  current_setting('request.jwt.claims.email', true) IS NOT NULL
  AND (exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "Rating"."userId") OR exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "Rating"."userId"))
) WITH CHECK (
  current_setting('request.jwt.claims.email', true) IS NOT NULL
  AND (exists (select 1 from "User" u where u.email = current_setting('request.jwt.claims.email', true) and u.id = "userId") OR exists (select 1 from "Profile" p where p.email = current_setting('request.jwt.claims.email', true) and p.id = "userId"))
);

-- Notes:
--  - Policies use `request.jwt.claims.*` session settings that Supabase sets from the incoming JWT.
--  - We use `email` as the stable owner attribute because the application stores email on `User` and maps JWT email claim to user accounts.
--  - Admins are determined via `request.jwt.claims.role = 'admin'`.
--  - Service-role server actions should continue to use server-side credentials or the Supabase service role key when appropriate.


-- End of migration
