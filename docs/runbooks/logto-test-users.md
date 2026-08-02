# Logto test users

Provisioning and cleaning up test users against the Logto tenant (ADR 0001
Stage 2, #154).

## Why this exists

Testing authenticated paths used to mean either hand-made fixtures or a shared
account nobody wanted to touch. Logto's Management API gives us programmatic
create / role / delete, and the `UserDirectory` port wraps it thinly.

**It runs against a shared hosted tenant, not a clean local database.** The free
tier does allow a second tenant, but that tenant cannot hold API resources
(confirmed in #153), so a separate "dev" tenant is useless for us. Two
consequences follow, and they drive the whole design:

1. A run cannot assume a fresh slate → **everything is idempotent.**
2. A crashed run leaks users into the real tenant → **everything is namespaced**,
   so orphans stay identifiable and removable later.

## Setup

Credentials live in Doppler `bad-mcp/dev` and never in the repo:

| Var | For |
|---|---|
| `LOGTO_TENANT_ID` | issuer + Management API URLs are derived from this |
| `LOGTO_M2M_CLIENT_ID` / `_SECRET` | machine-to-machine app with "Logto Management API access" |
| `LOGTO_WEB_CLIENT_ID` / `_SECRET` | client application — **only** needed to mint user tokens |

```powershell
pnpm run env:pull        # or run commands under `doppler run --`
```

## Commands

```powershell
pnpm run logto:users seed [runId]      # create a roled test user
pnpm run logto:users teardown <runId>  # delete that run's user
pnpm run logto:users list              # every test user in the tenant
pnpm run logto:users cleanup [--dry]   # delete ALL orphaned test users
```

`seed` prints the generated password **once**. It is never stored, and a re-run
cannot reproduce it — seed a fresh `runId` rather than trying to recover one.

## The namespace, and why cleanup is safe

Test users are `test_<runId>` / `test+<runId>@bad-mcp.test`. `cleanup` only ever
deletes users matching that namespace, so **a real account can never match** —
that is the property that makes it safe to run unattended against a tenant
holding live accounts. `isTestUser` is unit-tested against `brn.dbn@gmail.com`
and against near-misses like `contest+x@example.com` specifically to keep that
guarantee honest.

## Running the integration test

```powershell
$env:RUN_LOGTO_INTEGRATION='true'
pnpm exec vitest run test/integration/logto-user-directory.test.ts
```

It provisions a user, assigns `admin`, mints a token with no browser, and drives
that token through the **real** auth stack — `jwtMiddleware` → `verifyAccessToken`
(live JWKS) → `resolveAppRole` → `requireAdmin` — then tears the user down. The
default suite skips it, so no tenant is needed for ordinary work.

## Token minting has two prerequisites

Both were discovered the hard way during the #153 spike:

- **The client application performs the exchange, not the M2M app.** Attempting
  it as the M2M app returns `requested grant type is not allowed for this client`.
- **"Allow token exchange" is off by default** on new applications. Console →
  Applications → *(the client app)* → Token exchange.

## Tenant prerequisites

The port deliberately does **not** create roles or API resources — those are
configuration, not something a test should invent. They must exist first:

- API resource `mcp-server`, indicator `https://bad-mcp.onrender.com/mcp` (the
  same string the RFC 9728 document advertises, so audiences match end to end)
- A permission named **`admin`** on that resource
- A role named **`admin`** holding that permission

`assignRole` fails with a pointed message if the role is missing, rather than
silently provisioning an unroled user.

## Gotchas

- **Logto resource tokens carry no `email` claim.** Identity resolution is
  `(issuer, externalId)` only — the #90 email fallback cannot fire. Any Profile
  you expect to match must have `externalId` populated.
- **`OIDC_ROLE_CLAIM_PATH=scope` is load-bearing** under Logto. Without it, an
  admin resolves as a non-admin.
- Logto ids are 12-character lowercase alphanumeric, **not UUIDs**. Nothing may
  assume a shape — see #151.
