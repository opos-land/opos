output "operators_group" {
  description = "The name of the operators' group, which mise run deploy:grant fills"
  value       = scaleway_iam_group.operators.name
}
