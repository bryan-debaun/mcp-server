# Book Aggregates Runbook

Purpose: Guide for running the backfill and responding to failing aggregate updates.

Steps to run a backfill (staging/production):

1. Run migration on the database to add columns (already included in migration `20260210120000_add_book_aggregates`).
2. On a staging instance run the backfill script (safer scripted ops):

   # Dry run (no writes)

   npm run backfill:books -- --dry-run

   # To run against production you MUST use an explicit confirmation token and the --force flag

   CONFIRM=REALLY_I_AGREE npm run backfill:books:force

   - Use `--batch-size` to tune chunk size (e.g., `--batch-size=500`).
   - The script will set `book_aggregates_last_backfill_timestamp` Gauge on completion (skipped in dry-run).
   - For convenience there are wrappers: `npm run backfill:books` (normal), `npm run backfill:books:dry-run` (shorthand dry), and `npm run backfill:books:force` (production guarded).

3. Verify in metrics endpoint `/metrics` that `book_aggregates_last_backfill_timestamp` and `book_aggregate_update_failures_total` look healthy.

If `book_aggregate_update_failures_total` increases:

- Check the application logs for errors when rating writes occur; the write paths increment the counter on failures.
- Investigate for DB connectivity or constraint issues.
- As a mitigation, run the backfill script to correct inconsistent rows, and fix underlying write failures.

If you need to re-run a backfill safely on production large datasets, consider copying the script to run with a throttling loop and checkpointing (currently the script iterates by id and is resumable).
