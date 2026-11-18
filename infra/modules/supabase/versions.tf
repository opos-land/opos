terraform {
  required_version = ">= 1.11"

  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "2.91.0"
    }
    supabase = {
      source  = "supabase/supabase"
      version = "1.11.1"
    }
  }
}
