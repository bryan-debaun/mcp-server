# Supabase Terraform manifests

This folder contains Terraform skeleton manifests to provision a Supabase project and to capture the outputs you'll need for deployments.

**Goal**: produce reproducible infra for a Supabase project and DB. These manifests are a starting point — you will need to fill required organization/region values and enable the example resources that match your account configuration.

Quick notes

- Keep sensitive values (tokens, keys) out of version control.
- Use `SUPABASE_ACCESS_TOKEN` (an admin token) to authenticate the provider.
- Terraform will produce outputs (e.g., `database_url`, `service_role_key`, `jwks_url`) that you should add to Render secrets and GitHub Actions secrets.

Getting started

1. Install Terraform (>=1.5) and set the `SUPABASE_ACCESS_TOKEN` environment variable:

   ```bash
   export SUPABASE_ACCESS_TOKEN="<your-token>"
   # or set in CI provider secrets
   ```

2. Initialize Terraform:

   ```bash
   cd infra/supabase
   terraform init
   ```

3. (Optional) Review with `terraform plan -var "project_name=mcp-server"` and then apply with `terraform apply -var "project_name=mcp-server"`.

4. After `apply`, extract outputs and add to Render/GitHub secrets:

   - `database_url` -> `DATABASE_URL`
   - `service_role_key` -> `SUPABASE_SECRET_KEY` (preferred) — legacy `SUPABASE_SERVICE_ROLE_KEY` still accepted
   - `jwks_url` -> `SUPABASE_JWKS_URL`
   - `project_public_url` -> `PUBLIC_SUPABASE_URL`
   - `anon_key` -> `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preferred) — legacy `SUPABASE_ANON_KEY` still accepted

Provider & resources

- `main.tf` contains the Supabase provider setup and commented example resources. Uncomment and adapt the example resources to match your account and desired configuration.

Security & state

- Use a remote state backend (e.g., Terraform Cloud, S3 + DynamoDB locks) for team collaboration.
- Rotate `SUPABASE_SERVICE_ROLE_KEY` periodically. See `docs/runbooks/deploy-render.md` for runbook notes.

If you'd like, I can:

- add example `terraform.tfvars.example` with variables and guidance, and
- provide an optional `make` script to run `terraform fmt`/`plan`/`apply` with recommended defaults.

Want me to populate the example resources (project & DB) and a `terraform.tfvars.example` now?
