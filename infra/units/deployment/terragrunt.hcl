# One deployment of the environment on the Coolify server, with its hosts. Values: zone, name,
# project_uuid, server_uuid, ipv4, ipv6 (optional), repository, branch, loaded_services, catch_mail,
# supabase_ref, mail_from, secrets. The relay, smtp_host, smtp_port and smtp_user, comes from the
# stack's mail unit, and produced, the markers of the secrets other units write, from theirs.

include "root" {
  path = find_in_parent_folders("root.hcl")
}

include "coolify" {
  path = find_in_parent_folders("coolify.hcl")
}

terraform {
  source = "${get_repo_root()}/infra/modules/deployment"
  # The module's committed lock file stands; a generated unit keeps no copy
  copy_terraform_lock_file = false
}

inputs = {
  zone                 = values.zone
  name                 = values.name
  coolify_project_uuid = values.project_uuid
  server_uuid          = values.server_uuid
  ipv4                 = values.ipv4
  ipv6                 = try(values.ipv6, null)
  repository           = values.repository
  branch               = values.branch
  loaded_services      = values.loaded_services
  catch_mail           = values.catch_mail
  supabase_ref         = values.supabase_ref
  secrets              = values.secrets
  mail_from            = values.mail_from
}
