Admin user management runbook

Overview

- PATCH /api/admin/users/:id
  - Accepts { role?: string, blocked?: boolean }
  - Updates role and/or blocked flag. Writes AuditLog entries for actions.

- DELETE /api/admin/users/:id
  - Default behavior (no query params): Performs a *soft-delete* for safety:
    - Sets `blocked = true`, `deletedAt = <now>`, clears `name`, `external_id`, and replaces `email` with `deleted-<id>-<timestamp>@deleted.local` to avoid re-use.
    - Records an `AuditLog` with action `delete-user` and `metadata.hard = false`.
  - Hard delete: pass `?hard=1` or `?hard=true` to attempt a hard delete (may fail due to DB FK constraints). If hard delete is used, an `AuditLog` with `hard = true` is recorded.

Supabase Auth account cleanup (recommended manual steps)

- Deleting a user locally does NOT remove the Supabase Auth account. To remove Supabase Auth account:
  1. Use Supabase Admin API: `DELETE ${SUPABASE_ISS}/auth/v1/admin/users/:uid` using the service role key.
  2. Verify any webhooks or third-party integrations are cleaned up.
  3. If you need to coordinate downstream cleanup (ratings, invites, etc.), follow the project-specific procedures described in the data retention policy.

Notes & Caveats

- Soft-delete is the safe default. Use hard delete only when you have verified cascading effects and run necessary backups.
- Tests were added to cover authorization, happy-paths, audit log creation, and soft/hard delete behavior.
