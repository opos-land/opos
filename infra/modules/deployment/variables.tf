variable "project_id" {
  description = "The Scaleway project of the environment"
  type        = string
}

variable "region" {
  description = "The region of the project's secrets"
  type        = string
}

variable "zone" {
  description = "The domain the project holds: the portal's host, with the other services' hosts under it"
  type        = string
}

variable "name" {
  description = "The name of the deployment's environment in the Coolify project"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]*$", var.name))
    error_message = "A deployment's name is lowercase letters, digits and hyphens, from a letter."
  }
}

variable "coolify_project_uuid" {
  description = "The project in Coolify that holds the deployment's environment, made by the server's owner"
  type        = string
}

variable "server_uuid" {
  description = "The Coolify server the deployment runs on"
  type        = string
}

variable "ipv4" {
  description = "The server's IPv4 address, for the A records"
  type        = string
}

variable "ipv6" {
  description = "The server's IPv6 address, for the AAAA records; none when null"
  type        = string
  default     = null
}

variable "repository" {
  description = "The public HTTPS address of the repository Coolify builds from"
  type        = string
}

variable "branch" {
  description = "The branch or tag whose head every deployment runs"
  type        = string
}

variable "compose_loaded" {
  description = "Whether a deployment has already read the compose file: Coolify takes the hosts of its services only then"
  type        = bool
}

variable "supabase_ref" {
  description = "The reference of the deployment's Supabase project"
  type        = string

  validation {
    condition     = can(regex("^[a-z]{20}$", var.supabase_ref))
    error_message = "A Supabase project's reference is 20 lowercase letters."
  }
}

variable "smtp_host" {
  description = "The relay the API sends mail through"
  type        = string
}

variable "smtp_port" {
  description = "The relay's port with TLS from the first byte"
  type        = number
}

variable "smtp_user" {
  description = "The user the API signs in to the relay as"
  type        = string
}

variable "mail_from" {
  description = "The sender of every message the API sends, at the environment's domain"
  type        = string
}

variable "secrets" {
  description = "The name of the secret in Secret Manager that holds each value of the deployment"
  type = object({
    supabase_db_password     = string
    supabase_secret_key      = string
    opos_app_password        = string
    opos_app_global_password = string
    opos_admin_password      = string
    send_email_hook_secret   = string
    invite_secret            = string
    smtp_password            = string
    basic_auth_password      = string
  })
}

variable "produced" {
  description = "A marker per value another unit writes into its secret, which changes with the value; never the value"
  type        = map(string)
  default     = {}
}
