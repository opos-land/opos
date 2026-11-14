output "operators_group" {
  description = "The name of the operators' group, which mise run deploy:grant fills"
  value       = scaleway_iam_group.operators.name
}

output "smtp_secret" {
  description = "The name of the secret that holds the API's SMTP password"
  value       = scaleway_secret.smtp.name
}
