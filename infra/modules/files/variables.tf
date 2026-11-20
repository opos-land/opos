variable "project_id" {
  description = "The Scaleway project of the environment, the provider's own"
  type        = string
}

variable "region" {
  description = "The region of the bucket, in the EU"
  type        = string

  validation {
    condition     = contains(["fr-par", "nl-ams", "pl-waw"], var.region)
    error_message = "The bucket of uploaded files lies in a Scaleway region of the EU."
  }
}

variable "environment" {
  description = "The environment the bucket serves, as OPOS_ENV names it"
  type        = string
}

variable "files_project_id" {
  description = "The Scaleway project that holds the bucket alone, made by the bootstrap"
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", var.files_project_id))
    error_message = "files.project_id of env.yaml is empty or no project's id: run mise run deploy:bootstrap first."
  }
}

variable "bucket" {
  description = "The bucket's name, unique across Scaleway's region"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.bucket))
    error_message = "A bucket's name is 3 to 63 lowercase letters, digits, dots and hyphens."
  }
}

variable "noncurrent_days" {
  description = "How many days a removed or replaced object's earlier version stays recoverable"
  type        = number

  validation {
    condition     = var.noncurrent_days >= 1
    error_message = "An earlier version stays at least a day."
  }
}
