variable "project" {
  description = "The name of the environment's Scaleway project, which names the operators' group"
  type        = string
}

variable "project_id" {
  description = "The Scaleway project of the environment, the one place the operators get rights"
  type        = string
}
