terraform {
  required_version = ">= 1.11"

  required_providers {
    coolify = {
      source  = "coolify-terraform/coolify"
      version = "0.1.32"
    }
    scaleway = {
      source  = "scaleway/scaleway"
      version = "2.92.1"
    }
  }
}
