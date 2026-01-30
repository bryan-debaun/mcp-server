variable "supabase_access_token" {
  type        = string
  description = "Access token used by the Supabase provider (set via env var SUPABASE_ACCESS_TOKEN)"
  sensitive   = true
}

variable "project_name" {
  type        = string
  description = "Name of the Supabase project to create"
  default     = "mcp-server"
}

variable "organization_id" {
  type        = string
  description = "(Optional) Supabase organization id to create project under"
  default     = ""
}

variable "region" {
  type        = string
  description = "(Optional) Region for the Supabase project"
  default     = ""
}
