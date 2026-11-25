terraform {
  # Ephemeral values and write-only arguments keep the generated secrets out of the state
  required_version = ">= 1.11"

  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "3.9.1"
    }
    scaleway = {
      source  = "scaleway/scaleway"
      version = "2.92.1"
    }
  }
}
