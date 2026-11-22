output "urls" {
  description = "The address of each service"
  value       = local.url
}

output "application_uuid" {
  description = "The application in Coolify"
  value       = coolify_application.this.uuid
}
