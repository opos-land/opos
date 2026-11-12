variable "project_id" {
  description = "The Scaleway project of the environment"
  type        = string
}

variable "region" {
  description = "The region of the project's secrets"
  type        = string
}

variable "zone" {
  description = "The domain the project holds, whose zone the hosts belong to"
  type        = string
}

variable "coolify_project_uuid" {
  description = "The project in Coolify"
  type        = string
}

variable "environment" {
  description = "The name of the environment in the Coolify project, made here"
  type        = string
}

variable "server_uuid" {
  description = "The Coolify server the cache runs on"
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

variable "image" {
  description = "The cache server's image, pinned by its digest"
  type        = string

  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.image))
    error_message = "The image is pinned by its digest."
  }
}

variable "host_rw" {
  description = "The host of the instance that reads and writes"
  type        = string
}

variable "host_ro" {
  description = "The host of the instance that only reads"
  type        = string
}

variable "token_rw_secret" {
  description = "The name of the secret holding the token of the instance that reads and writes"
  type        = string
}

variable "token_ro_secret" {
  description = "The name of the secret holding the token of the instance that only reads"
  type        = string
}
