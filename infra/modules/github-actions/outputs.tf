output "environments" {
  description = "The environments the workflows can name, each with the branches it admits"
  value       = { for name, settings in var.environments : name => settings.branches }
}
