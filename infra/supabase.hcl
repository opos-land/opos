# For the units that change a Supabase project, beside root.hcl. The project itself is made by hand;
# the units change only what is inside it. The access token is read from Secret Manager for the
# length of a run and never reaches the state; it reaches every project of the Supabase
# organisation, so only an operator's run reads it.

locals {
  env = yamldecode(file(find_in_parent_folders("env.yaml")))
}

generate "supabase" {
  path      = "supabase.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<-EOF
    ephemeral "scaleway_secret_version" "supabase_token" {
      project_id  = "${local.env.scaleway.project_id}"
      region      = "${local.env.scaleway.region}"
      secret_name = "${local.env.supabase.token_secret}"
      revision    = "latest_enabled"
    }

    provider "supabase" {
      # Secret Manager hands out the value in base64
      access_token = base64decode(ephemeral.scaleway_secret_version.supabase_token.data)
    }
  EOF
}
