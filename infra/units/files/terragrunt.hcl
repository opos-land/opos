# The environment's bucket of uploaded files, in the project the bootstrap made for it. Values:
# environment, files_project_id, bucket, noncurrent_days.

include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "${get_repo_root()}/infra/modules/files"
  # The module's committed lock file stands; a generated unit keeps no copy
  copy_terraform_lock_file = false
}

inputs = {
  environment      = values.environment
  files_project_id = values.files_project_id
  bucket           = values.bucket
  noncurrent_days  = values.noncurrent_days
}
