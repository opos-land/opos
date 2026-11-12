# The project in Coolify that holds an environment. Values: name, description.

include "root" {
  path = find_in_parent_folders("root.hcl")
}

include "coolify" {
  path = find_in_parent_folders("coolify.hcl")
}

terraform {
  source = "${get_repo_root()}/infra/modules/coolify-project"
  # The module's committed lock file stands; a generated unit keeps no copy
  copy_terraform_lock_file = false
}

inputs = {
  name        = values.name
  description = values.description
}
