output "url" {
  description = "The project's gateway, with Supabase Auth at /auth/v1"
  value       = "https://${var.ref}.supabase.co"
}

output "secret_key_secret" {
  description = "The name of the secret that holds the API's secret key, once it holds it"
  value       = scaleway_secret.secret_key.name
  depends_on  = [scaleway_secret_version.secret_key]
}
