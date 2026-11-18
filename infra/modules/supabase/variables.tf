variable "project_id" {
  description = "The Scaleway project of the environment, whose Secret Manager holds the values"
  type        = string
}

variable "region" {
  description = "The region of the project's secrets"
  type        = string
}

variable "ref" {
  description = "The reference of the Supabase project, made by hand"
  type        = string

  validation {
    condition     = can(regex("^[a-z]{20}$", var.ref))
    error_message = "A Supabase project's reference is 20 lowercase letters."
  }
}

variable "portal_url" {
  description = "The portal's address: the default redirect of Supabase Auth's links"
  type        = string
}

variable "panel_url" {
  description = "The panel's address"
  type        = string
}

variable "api_url" {
  description = "The API's address, where Supabase Auth calls the send-email hook and Google returns"
  type        = string
}

variable "secrets" {
  description = "The name of the secret in Secret Manager that holds each value Supabase Auth reads"
  type = object({
    send_email_hook_secret = string
    google_client_id       = string
    google_client_secret   = string
  })
}

variable "secret_key_secret" {
  description = "The name of the secret the project's secret key is written into, made here"
  type        = string
}

variable "secret_key_version" {
  description = "Raising it replaces the project's secret key"
  type        = number
  default     = 1
}
