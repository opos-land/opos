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

variable "files_project_id" {
  description = "The Scaleway project that holds the bucket of uploaded files alone, made by the bootstrap"
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", var.files_project_id))
    error_message = "files.project_id of env.yaml is empty or no project's id: run mise run deploy:bootstrap first."
  }
}

variable "files_key_secret" {
  description = "The name of the secret that holds the secret key of the API's key of the bucket, made here"
  type        = string
}

variable "files_key_version" {
  description = "Raising it replaces the API's key of the bucket"
  type        = number
  default     = 1
}
