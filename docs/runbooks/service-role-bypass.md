Service role bypass runbook

Overview
--------

The `service_role_bypass_total` counter increments each time a request is authenticated
using the Supabase service role key and passes the hardened check in `requireAdmin`
(valid `x-internal-key` header + IP allowlisted). This counter tracks privileged
automation or internal tooling requests, not end-user traffic.

In normal operation this counter should be **zero or near-zero** — it only increments
when internal tooling explicitly authenticates with the service role key. Any unexpected
spike indicates either misconfigured tooling or an active attack attempt.

Metrics endpoint
----------------

The counter is exposed at:

```
GET /metrics           # Prometheus text format
```

Look for the line:

```
service_role_bypass_total N
```

where `N` is the cumulative value since the last process restart.

Expected thresholds
-------------------

| Condition | Meaning | Action |
|---|---|---|
| `N = 0` | No service-role calls since last restart | Normal |
| `N > 0`, known automation ran | Expected increment from a scheduled job or migration script | No action needed; verify the caller matches your known tooling |
| `N > 0`, no automation scheduled | Unexpected bypass — investigate immediately | See response steps below |
| Rapid increase (>5 in <1 hour) | Possible attack, misconfigured script, or credential leak | Rotate `INTERNAL_ADMIN_KEY`; review logs; see response steps below |

Note: "unexpected" is context-dependent. If you have no scheduled internal tooling,
`service_role_bypass_total` should remain 0 except during manual operational tasks.

How to check the current value
-------------------------------

1. From Render logs or locally, `curl` the metrics endpoint:

   ```bash
   curl -s https://<your-domain>/metrics | grep service_role_bypass_total
   ```

2. In Render dashboard → Logs, filter for:

   ```
   service-role-bypass
   ```

   Each bypass generates a structured audit log entry:

   ```
   action: service-role-bypass, ip: <IP>, path: <path>, method: <method>
   ```

3. Denied attempts are also logged at `WARN` level:

   ```
   Service role access denied: missing internal header or IP not allowlisted
   ```

   A spike in WARN-level denials (without corresponding bypass increments) indicates
   probe/scan activity against the admin endpoints.

Response steps
--------------

**Scenario A — unexpected bypass (counter incremented, no known automation)**

1. Pull recent metrics and note the exact count and timestamp window:
   ```bash
   curl -s https://<your-domain>/metrics | grep service_role_bypass
   ```
2. Search Render logs for `service-role-bypass` entries. Note the `ip` and `path` fields.
3. Cross-reference the IP against `ADMIN_IP_ALLOWLIST`. If the IP is not one you added,
   the allowlist was misconfigured or a credential was leaked.
4. **Immediately rotate `INTERNAL_ADMIN_KEY`** in Render Dashboard → Environment Variables.
   Restart the service to pick up the new value.
5. If the source IP is external and unknown, also rotate `SUPABASE_SERVICE_ROLE_KEY`
   and update it in Render.
6. Review `ADMIN_IP_ALLOWLIST` — remove any IPs that should not be there.
7. After rotation, monitor `service_role_bypass_total` for 15 minutes. If it stays at 0,
   the incident is contained; open a post-mortem issue.

**Scenario B — rapid increase from known IP (misconfigured script)**

1. Identify the script or job using the `ip` and `path` from the audit log.
2. Stop or rate-limit the job.
3. Review whether the job is using the service role key unnecessarily. If it can use a
   user-scoped JWT instead, prefer that.
4. If the volume was harmless (e.g., a retry loop bug), no key rotation is needed;
   fix the script and document the incident.

**Scenario C — spike in WARN-level denied attempts (probing)**

1. Check whether the probe IPs appear to be scanners (use a service like
   `https://ipinfo.io/<IP>` to look up ASN/org).
2. If the probing is from a known cloud provider or scan service, note the ASN and
   consider tightening firewall rules in Render (if available) or documenting the source.
3. No key rotation required unless bypass attempts succeeded.
4. Consider adding the source CIDR to a block list if Render supports it.

Key logs to check
-----------------

All bypass events write an `AuditLog` entry via Prisma (when DB is reachable):

```
prisma.auditLog.create({
  action: 'service-role-bypass',
  metadata: { ip, path, method }
})
```

If DB is not reachable during the event, the bypass still succeeds but only the
Prometheus counter and process log are written. Query the database directly if needed:

```sql
SELECT * FROM "AuditLog"
WHERE action = 'service-role-bypass'
ORDER BY "createdAt" DESC
LIMIT 50;
```

Configuration reference
-----------------------

| Env var | Description |
|---|---|
| `INTERNAL_ADMIN_KEY` | Secret header value required for service role bypass (`x-internal-key`) |
| `ADMIN_IP_ALLOWLIST` | Comma-separated list of IPs allowed to use service role key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (full access) — store as a secret |

All three must be set and consistent for service-role bypass to be permitted. If any
is missing or mismatched, `requireAdmin` returns 403 and logs a WARN.

Future alerting
---------------

This runbook documents manual response steps. If the operational load increases, consider
adding automated alerting by:

- Scheduling a GitHub Actions job to `curl /metrics` on a cron (e.g., every 30 minutes),
  compare the counter delta from the previous run, and send an alert email via SendGrid
  if the delta exceeds a threshold (e.g., > 3 new bypasses per window).
- See issue #17 for the tracking item.
