# For the units that change Coolify, beside root.hcl. The API token reaches Dev's project alone and is
# read from Secret Manager for the length of a run; it never reaches the state, and as it can deploy,
# only an operator's run reads it.
#
# Coolify creates a resource on the server it runs on only for an admin of the server's team, whose
# token reaches every project there. The server's owner creates the services with such a token from
# COOLIFY_TOKEN in their own environment: the provider reads it there, so it never reaches a file,
# the state or Secret Manager. Only whether it is set is read here.

locals {
  env = yamldecode(file(find_in_parent_folders("env.yaml")))

  owner_provider = <<-EOF
    provider "coolify" {
      endpoint = "${local.env.coolify.endpoint}"
    }
  EOF

  project_provider = <<-EOF
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

generate "coolify" {
  path      = "coolify.tf"
  if_exists = "overwrite_terragrunt"
  contents  = get_env("COOLIFY_TOKEN", "") != "" ? local.owner_provider : local.project_provider
}
