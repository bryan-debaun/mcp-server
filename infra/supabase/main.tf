terraform {
  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 0.12"
    }
  }
}

provider "supabase" {
  # Authentication is provided via the environment variable:
  #   SUPABASE_ACCESS_TOKEN (use a token with appropriate privileges)
  access_token = var.supabase_access_token
}

# NOTE: The resources below are _examples_ and intentionally commented out.
# Replace, enable, and adapt them to your organization/project needs.

# resource "supabase_project" "mcp" {
#   name = var.project_name
#   org_id = var.organization_id # optional: if your account has multiple orgs
#   # region = var.region
# }

# resource "supabase_database" "mcp_db" {
#   project_id = supabase_project.mcp.id
#   # Add any database instance configuration here
# }

# You can also add APIs, policies, and service roles via the provider resources.
# See the Supabase Terraform provider docs for complete resources and attributes.

# Outputs should be defined to expose values for CI / Render secrets (below).
