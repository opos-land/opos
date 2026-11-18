# Everything inside a deployment's Supabase project, which is made by hand. Values: ref,
# portal_url, panel_url, api_url, secrets, secret_key_secret, secret_key_version.

include "root" {
  path = find_in_parent_folders("root.hcl")
}

include "supabase" {
  path = find_in_parent_folders("supabase.hcl")
}

terraform {
  source = "${get_repo_root()}/infra/modules/supabase"
  # The module's committed lock file stands; a generated unit keeps no copy
  copy_terraform_lock_file = false
}

inputs = {
  ref                = values.ref
  portal_url         = values.portal_url
  panel_url          = values.panel_url
  api_url            = values.api_url
  secrets            = values.secrets
  secret_key_secret  = values.secret_key_secret
  secret_key_version = values.secret_key_version
}
