output "database_url" {
  description = "Postgres DATABASE_URL for application usage (set in Render/GitHub secrets)"
  value       = "<replace-with-resource-output>"
  # example: supabase_database.mcp_db.connection_string
}

output "service_role_key" {
  description = "Supabase service role key (server-only, store in Render/GitHub secrets)"
  value       = "<replace-with-secure-output>"
  # example: data.supabase_service_role.service_role_key.value
}

output "jwks_url" {
  description = "JWKS endpoint for Supabase JWT validation (SUPABASE_JWKS_URL)"
  value       = "https://<your-project>.supabase.co/.well-known/jwks.json"
}
