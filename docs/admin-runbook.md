# Admin user runbook

This documents how to create or sync a single admin user in the application database.

## Using the helper script

Run the helper (local dev):

```bash
DATABASE_URL=postgresql://... tsx scripts/create_admin.ts --email your@email.com
```

Behavior:

- If a `users` row exists for the email, it will be updated with `isAdmin = true` and the script prints the user id.
- If no `users` row exists, a minimal row will be created with `isAdmin = true`. **This does not create a Supabase Auth user automatically.**

Next manual steps (if a new row was created):

1. In Supabase Dashboard → Authentication → Users, create a user for the email (set a secure password or invite the email).
2. Optionally copy the Supabase Auth `id` into `users.external_id` to fully link the records.

## Notes

- This script intentionally does not create or modify Supabase Auth users automatically to avoid leaking passwords or creating unwanted accounts in production.
- Prefer manual creation in Supabase Auth and then use this script to mark the corresponding DB row `isAdmin = true`.
