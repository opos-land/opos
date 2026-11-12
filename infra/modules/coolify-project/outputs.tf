output "project_uuid" {
  description = "The project's id in Coolify, for the environments of the deployments"
  value       = coolify_project.this.uuid
}
