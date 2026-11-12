# The Dev environment: what it runs once, whatever the number of its deployments, made from the
# units of infra/units with the settings of env.yaml. The units are generated into .terragrunt-stack
# on every run and never committed.

locals {
  env = yamldecode(file("env.yaml"))
}

unit "secrets" {
  source = "../../units/secrets"
  path   = "secrets"

  values = {
    # The environment's own secrets sit at the root of its project, beside the state's passphrase
    path      = "/"
    entered   = try(local.env.secrets.entered, [])
    generated = try(local.env.secrets.generated, {})
  }
}

# What only an administrator of the organisation applies: the deploy commands leave it out unless
# it is named (mise run deploy:apply dev shared)
unit "shared" {
  source = "../../units/shared"
  path   = "shared"

  values = {
    project = local.env.scaleway.project
  }
}
