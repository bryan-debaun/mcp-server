// Terraform skeleton for Supabase project
// Fill provider config and variables as needed

terraform {
  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 0.12"
    }
  }
}

provider "supabase" {
  // Configure authentication (e.g., via env var SUPABASE_ACCESS_TOKEN)
}

// Example placeholder resource
// resource "supabase_project" "mcp" {
//   name = var.project_name
// }

// Add resources: project, db, secrets, policies, etc.
