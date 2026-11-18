output "urls" {
  description = "The address of each service"
  value       = local.url
}

output "application_uuid" {
  description = "The application in Coolify, which CI releases"
  value       = coolify_application.this.uuid
}
