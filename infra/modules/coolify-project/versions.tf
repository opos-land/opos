terraform {
  required_version = ">= 1.11"

  required_providers {
    coolify = {
      source  = "coolify-terraform/coolify"
      version = "0.1.30"
    }
    # The unit's provider configuration reads Coolify's token from Secret Manager
    scaleway = {
      source  = "scaleway/scaleway"
      version = "2.91.0"
    }
  }
}
