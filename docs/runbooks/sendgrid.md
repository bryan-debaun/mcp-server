# SendGrid Runbook

This runbook documents SendGrid setup, verification, key rotation, and troubleshooting for MCP Server.

## Summary

- Domain: `send.bryandebaun.dev` (link branding)
- Return path: `rp.send.bryandebaun.dev`
- Environment variables used by the application: `SENDGRID_API_KEY`, `SENDER_EMAIL` (or `FROM_EMAIL`)

## Verification steps

1. In SendGrid UI: go to **Settings → Sender Authentication → Domain Authentication → Get Started**.
   - Use `send` for the link subdomain label and `rp` for the return path label.
   - Choose your DNS provider and follow the wizard to obtain CNAME records.
2. Add the provided **CNAME** records to your DNS provider (Cloudflare recommended).
   - **Important:** set the Cloudflare proxy status to **DNS only (grey cloud)** for these records.
3. Wait for DNS propagation and click **Verify** in the SendGrid UI.
4. Send a controlled test email to a mailbox you control and inspect the message headers for `DKIM=pass` and `SPF=pass`.

### DNS check commands

- PowerShell:

```powershell
Resolve-DnsName -Name s1._domainkey.send.bryandebaun.dev -Type CNAME
Resolve-DnsName -Name s2._domainkey.send.bryandebaun.dev -Type CNAME
Resolve-DnsName -Name rp.send.bryandebaun.dev -Type CNAME
```

- dig (WSL/macOS):

```bash
dig +short CNAME s1._domainkey.send.bryandebaun.dev
dig +short CNAME s2._domainkey.send.bryandebaun.dev
dig +short CNAME rp.send.bryandebaun.dev
```

- nslookup:

```bash
nslookup -type=CNAME s1._domainkey.send.bryandebaun.dev 8.8.8.8
```

## Secrets and rotation

- Store the SendGrid API key only in Render (or your host secret manager) and in GitHub Actions secrets (`SENDGRID_API_KEY`).
- To rotate a key:
  1. In SendGrid, create a new API key with the same minimal permissions (email sending).
  2. Update the `SENDGRID_API_KEY` secret in Render and in GitHub repo secrets.
  3. Trigger the SendGrid config check (see CI section) or run a manual test send.
  4. Revoke the old key after verification.

## CI / Verification

- A GitHub Actions workflow `sendgrid-check.yml` runs on `push` to `main` and `workflow_dispatch` and ensures the `SENDGRID_API_KEY` and `SENDER_EMAIL` secrets are present. It also runs a short integration test when manually dispatched.
- The integration test is feature-flagged and only runs when `CI_SENDGRID_CHECK=true`.

## Troubleshooting

- If SendGrid verification fails:
  - Ensure CNAME entries exist and are **DNS only** (no Cloudflare proxy).
  - Confirm the zone is `bryandebaun.dev` and that the left-hand labels in Cloudflare match (e.g., `s1._domainkey.send`).
  - Wait for TTL propagation (can take up to 1 hour or more depending on provider).

- If emails land in spam:
  - Ensure DKIM and SPF pass in message headers.
  - Verify `SENDER_EMAIL` is a verified sender or aligns with your authenticated domain.
  - Check SendGrid suppression lists and bounce/complaint webhooks.

## Manual e2e test (manual job)

- Use the `workflow_dispatch` job `SendGrid Config Check` to run a safe verification or to manually run a single test send. Use this in production only — it uses the real secret and should be run by a repo admin.

---

Maintainers: @bryan-debaun
