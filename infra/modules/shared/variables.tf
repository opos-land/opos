variable "project" {
  description = "The name of the environment's Scaleway project, which names the operators' group"
  type        = string
}

variable "project_id" {
  description = "The Scaleway project of the environment, the one place the operators get rights"
  type        = string
}

variable "region" {
  description = "The region of the project's secrets"
  type        = string
}

variable "smtp_secret" {
  description = "The name of the secret that holds the API's SMTP password, made here"
  type        = string
}

variable "smtp_key_version" {
  description = "Raising it replaces the API's SMTP key"
  type        = number
  default     = 1
}
