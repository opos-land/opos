terraform {
  required_version = ">= 1.11"

  required_providers {
    github = {
      source  = "integrations/github"
      version = "6.13.0"
    }
    scaleway = {
      source  = "scaleway/scaleway"
      version = "2.92.1"
    }
  }
}
