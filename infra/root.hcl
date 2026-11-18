# What every unit shares: where its state lives and how it reaches Scaleway, from the settings of
# its environment. A unit of infra/units includes this file once an environment's stack has
# generated it (docs/ARCHITECTURE.md, Environments).

locals {
  # The one place an environment is configured: plain settings and the names of its secrets.
  env        = yamldecode(file(find_in_parent_folders("env.yaml")))
  project    = local.env.scaleway.project
  project_id = local.env.scaleway.project_id
  region     = local.env.scaleway.region
}

# One state per unit, in the bucket infra/bootstrap.sh made, through Scaleway's S3 API, keyed by the
# unit's place in the environment without the generated directory. The block is written as it
# stands rather than through remote_state, whose checks of the bucket speak to AWS.
# The deploy commands hand OpenTofu the operator's key (infra/run.sh); a lock file in the bucket
# keeps two runs of one unit apart.
generate "backend" {
  path      = "backend.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<-EOF
    terraform {
      backend "s3" {
        bucket       = "${local.project}-tofu-state"
        key          = "${replace(path_relative_to_include(), ".terragrunt-stack/", "")}/tofu.tfstate"
        region       = "${local.region}"
        use_lockfile = true

        endpoints = {
          s3 = "https://s3.${local.region}.scw.cloud"
        }
        use_path_style              = true
        skip_credentials_validation = true
        skip_region_validation      = true
        skip_requesting_account_id  = true
        skip_metadata_api_check     = true
      }
    }
  EOF
}

# OpenTofu encrypts the state and every plan, and refuses to write either in the clear: values the
# containers and CI need pass through the state. The key derives from a passphrase in the project's
# Secret Manager, which infra/state-passphrase.sh reads for the length of a run. Its revision is
# fixed: a new one goes in beside this one, with this one as the fallback, until every state is
# written again.
generate "encryption" {
  path      = "encryption.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<-EOF
    terraform {
      encryption {
        key_provider "external" "passphrase" {
          command = ["${get_repo_root()}/infra/state-passphrase.sh", "${local.project_id}", "${local.region}", "1"]
        }

        key_provider "pbkdf2" "state" {
          chain = key_provider.external.passphrase
        }

        method "aes_gcm" "state" {
          keys = key_provider.pbkdf2.state
        }

        state {
          method   = method.aes_gcm.state
          enforced = true
        }

        plan {
          method   = method.aes_gcm.state
          enforced = true
        }
      }
    }
  EOF
}

# The operator's own Scaleway key, from the profile infra/run.sh names: no credential in this
# repository.
generate "scaleway" {
  path      = "scaleway.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<-EOF
    provider "scaleway" {
      project_id = "${local.project_id}"
      region     = "${local.region}"
    }
  EOF
}

inputs = {
  project_id = local.project_id
  region     = local.region
}
