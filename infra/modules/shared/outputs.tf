output "operators_group" {
  description = "The name of the operators' group, which mise run deploy:grant fills"
  value       = scaleway_iam_group.operators.name
}

output "smtp_secret" {
  description = "The name of the secret that holds the API's SMTP password"
  value       = scaleway_secret.smtp.name
}

output "smtp_key" {
  description = "The SMTP key's access key, which changes with the key: a marker for the units that read the password, never the password"
  value       = scaleway_iam_api_key.smtp.access_key
}

output "files_access_key" {
  description = "The access key of the API's key of the bucket, which changes with the key; its secret key is in files_key_secret alone"
  value       = scaleway_iam_api_key.files.access_key
}
