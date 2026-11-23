# One secret per name under a path of the environment's project. Values: path, entered, generated.

include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "${get_repo_root()}/infra/modules/secrets"
  # The module's committed lock file stands; a generated unit keeps no copy
  copy_terraform_lock_file = false
}

inputs = {
  path      = values.path
  entered   = values.entered
  generated = values.generated
}
