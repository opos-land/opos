output "path" {
  description = "The path the secrets sit under"
  value       = var.path
}

output "names" {
  description = "The names of the secrets, each with how it gets its value"
  value       = local.names
}
