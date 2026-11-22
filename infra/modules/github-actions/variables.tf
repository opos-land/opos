variable "project_id" {
  description = "The Scaleway project whose Secret Manager holds the values"
  type        = string
}

variable "region" {
  description = "The region of the project's secrets"
  type        = string
}

variable "repository" {
  description = "The repository's name, without its owner"
  type        = string
}

variable "environments" {
  description = "The environments the workflows run in: the branches they admit (every run when none), their secrets by the name of the secret holding each value, and their plain variables"
  type = map(object({
    branches  = optional(list(string), [])
    secrets   = optional(map(string), {})
    variables = optional(map(string), {})
  }))
  default = {}
}

variable "environment_variables" {
  description = "Further plain variables of the environments above, by environment, such as the outputs of other units"
  type        = map(map(string))
  default     = {}

  validation {
    condition     = alltrue([for environment in keys(var.environment_variables) : contains(keys(var.environments), environment)])
    error_message = "Further variables go only to an environment of environments."
  }
}

variable "secrets" {
  description = "The secrets of the repository, readable by every run of it but a fork's, by the name of the secret holding each value"
  type        = map(string)
  default     = {}
}

variable "generated" {
  description = "The number of each generated secret of the environment, raised to replace its value"
  type        = map(number)
  default     = {}
}
