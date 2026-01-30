# Supabase Terraform manifests

This folder will contain Terraform manifests to provision a Supabase project, database, and required resources.

Recommendation: Use Terraform with the Supabase provider for reproducible infra. Keep state remote and secrets out of VCS.

Example workflow:

1. Install Terraform (>=1.5) and configure credentials.
2. Create a workspace and `terraform init`.
3. `terraform plan` and `terraform apply` locally.
4. Export the `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Render and GitHub secrets.

Note: I can generate a first-pass `main.tf` and variables file with provider configuration and a `supabase_project` resource. Let me know if you'd like me to prepare the TF manifests now.
