# For the units that change Coolify, beside root.hcl. The API token is read from Secret Manager for
# the length of a run and never reaches the state; it can deploy anything on the server, so only an
# operator's run reads it.

locals {
  env = yamldecode(file(find_in_parent_folders("env.yaml")))
}

generate "coolify" {
  path      = "coolify.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<-EOF
    ephemeral "scaleway_secret_version" "coolify_token" {
      project_id  = "${local.env.scaleway.project_id}"
      region      = "${local.env.scaleway.region}"
      secret_name = "${local.env.coolify.token_secret}"
      revision    = "latest_enabled"
    }

    provider "coolify" {
      endpoint = "${local.env.coolify.endpoint}"
      # Secret Manager hands out the value in base64
      token = base64decode(ephemeral.scaleway_secret_version.coolify_token.data)
    }
  EOF
}
