variable "project_id" {
  description = "The Scaleway project of the environment"
  type        = string
}

variable "region" {
  description = "The region the secrets are stored in"
  type        = string
}

variable "path" {
  description = "The path the secrets sit under in the project"
  type        = string

  validation {
    condition     = startswith(var.path, "/")
    error_message = "A path starts with a slash."
  }
}

variable "entered" {
  description = "The names of the secrets whose value a person enters"
  type        = set(string)
  default     = []
}

variable "generated" {
  description = "The names of the secrets OpenTofu generates, each with the number that replaces its value when raised"
  type        = map(number)
  default     = {}

  validation {
    condition     = alltrue([for number in values(var.generated) : number >= 1 && floor(number) == number])
    error_message = "The number of a generated secret is a whole number from 1."
  }
}
