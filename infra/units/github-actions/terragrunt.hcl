# What CI reads in GitHub: environments with their branches, secrets and variables, and repository
# secrets. Values: owner, repository, environments, secrets.

include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "${get_repo_root()}/infra/modules/github-actions"
  # The module's committed lock file stands; a generated unit keeps no copy
  copy_terraform_lock_file = false
}

# The operator's own sign-in of the GitHub CLI: the provider asks `gh auth token` for it
generate "github" {
  path      = "github.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<-EOF
    provider "github" {
      owner = "${values.owner}"
    }
  EOF
}

inputs = {
  repository   = values.repository
  environments = values.environments
  secrets      = values.secrets
}
