variable "project_id" {
  description = "The Scaleway project of the environment"
  type        = string
}

variable "region" {
  description = "The region of the project's Transactional Email"
  type        = string
}

variable "zone" {
  description = "The domain the project holds, which the environment's mail is sent from"
  type        = string
}
