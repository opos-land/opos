# The Turborepo remote cache of CI on the Coolify server, with its two hosts. Values: zone,
# project_uuid, environment, server_uuid, ipv4, ipv6 (optional), image, host_rw, host_ro,
# token_rw_secret, token_ro_secret.

include "root" {
  path = find_in_parent_folders("root.hcl")
}

include "coolify" {
  path = find_in_parent_folders("coolify.hcl")
}

terraform {
  source = "${get_repo_root()}/infra/modules/turbo-cache"
  # The module's committed lock file stands; a generated unit keeps no copy
  copy_terraform_lock_file = false
}

inputs = {
  zone                 = values.zone
  coolify_project_uuid = values.project_uuid
  environment          = values.environment
  server_uuid          = values.server_uuid
  ipv4                 = values.ipv4
  ipv6                 = try(values.ipv6, null)
  image                = values.image
  host_rw              = values.host_rw
  host_ro              = values.host_ro
  token_rw_secret      = values.token_rw_secret
  token_ro_secret      = values.token_ro_secret
}
