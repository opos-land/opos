output "api_rw" {
  description = "The address of the instance that reads and writes"
  value       = "https://${var.host_rw}"
}

output "api_ro" {
  description = "The address of the instance that only reads"
  value       = "https://${var.host_ro}"
}
