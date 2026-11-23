# Everything inside a deployment's Supabase project that its API needs: Auth's settings, the
# enforcement of TLS and the secret key the API signs in with. The project itself is made by hand,
# like the Coolify project, and no resource here makes, changes or deletes it.

data "scaleway_secret_version" "this" {
  for_each = var.secrets

  project_id  = var.project_id
  region      = var.region
  secret_name = each.value
  revision    = "latest_enabled"
}

locals {
  secret = { for key, version in data.scaleway_secret_version.this : key => base64decode(version.data) }

  # auth.json holds the settings supabase/config.toml gives the local stack, under the names of the
  # Management API; scripts/supabase-auth.test.mjs keeps the two equal. What differs between
  # environments, the addresses and the secrets, is added here.
  auth = merge(jsondecode(file("${path.module}/auth.json")), {
    site_url = var.portal_url
    uri_allow_list = join(",", [
      "${var.portal_url}/auth/confirm",
      "${var.panel_url}/auth/confirm",
      "${var.api_url}/auth/google/callback",
    ])
    hook_send_email_uri = "${var.api_url}/hooks/send-email"
    # The generated value is lowercase letters and digits, which base64 reads as it stands
    hook_send_email_secrets   = "v1,whsec_${local.secret.send_email_hook_secret}"
    external_google_client_id = local.secret.google_client_id
    external_google_secret    = local.secret.google_client_secret
  })
}

resource "supabase_settings" "this" {
  project_ref     = var.ref
  auth            = jsonencode(local.auth)
  ssl_enforcement = true
}

# The API's key; its value goes into Secret Manager, where the deployment reads it
resource "terraform_data" "secret_key_version" {
  input = var.secret_key_version
}

resource "supabase_apikey" "api" {
  project_ref = var.ref
  name        = "opos_api"
  description = "The OPOS API; managed by OpenTofu"

  lifecycle {
    replace_triggered_by  = [terraform_data.secret_key_version]
    create_before_destroy = true
  }
}

resource "scaleway_secret" "secret_key" {
  project_id = var.project_id
  region     = var.region
  name       = var.secret_key_secret
  path       = "/"
  tags       = ["source:supabase"]
}

resource "scaleway_secret_version" "secret_key" {
  region    = var.region
  secret_id = scaleway_secret.secret_key.id
  data      = supabase_apikey.api.api_key
}
