output "smtp_host" {
  description = "The SMTP relay the API sends through"
  value       = scaleway_tem_domain.this.smtp_host
}

output "smtp_port" {
  description = "The relay's port with TLS from the first byte, which the API prefers"
  value       = scaleway_tem_domain.this.smtps_port
}

output "smtp_user" {
  description = "The user the API signs in to the relay as"
  value       = scaleway_tem_domain.this.smtps_auth_user
}

output "domain" {
  description = "The domain mail is sent from, read once Scaleway has validated it"
  value       = scaleway_tem_domain.this.name
  depends_on  = [scaleway_tem_domain_validation.this]
}
