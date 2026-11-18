# What an environment needs from its Scaleway organisation, applied by an administrator of the
# organisation. Values: project, smtp_secret, smtp_key_version.

include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "${get_repo_root()}/infra/modules/shared"
  # The module's committed lock file stands; a generated unit keeps no copy
  copy_terraform_lock_file = false
}

inputs = {
  project          = values.project
  smtp_secret      = values.smtp_secret
  smtp_key_version = values.smtp_key_version
}
