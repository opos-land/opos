# The Dev environment: what it runs once, whatever the number of its deployments, made from the
# units of infra/units with the settings of env.yaml. The units are generated into .terragrunt-stack
# on every run and never committed.

locals {
  env   = yamldecode(file("env.yaml"))
  cache = local.env.cache
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

# Holds what Dev runs once and each of its deployments
unit "coolify" {
  source = "../../units/coolify-project"
  path   = "coolify"

  values = {
    name        = local.env.coolify.project
    description = "The Dev environment of OPOS; managed by OpenTofu"
  }

  # Coolify's token is read from the secrets
  autoinclude {
    dependencies {
      paths = [unit.secrets.path]
    }
  }
}

unit "cache" {
  source = "../../units/turbo-cache"
  path   = "cache"

  values = {
    zone            = local.env.dns.zone
    environment     = local.env.coolify.environment
    server_uuid     = local.env.coolify.server_uuid
    ipv4            = local.env.coolify.ipv4
    ipv6            = try(local.env.coolify.ipv6, null)
    image           = local.cache.image
    host_rw         = local.cache.host_rw
    host_ro         = local.cache.host_ro
    token_rw_secret = local.cache.token_rw_secret
    token_ro_secret = local.cache.token_ro_secret
  }

  autoinclude {
    # The tokens are read from the secrets
    dependencies {
      paths = [unit.secrets.path]
    }

    dependency "coolify" {
      config_path = unit.coolify.path

      mock_outputs = {
        project_uuid = "mock-project"
      }
      mock_outputs_allowed_terraform_commands = ["init", "validate", "plan"]
    }

    inputs = {
      coolify_project_uuid = dependency.coolify.outputs.project_uuid
    }
  }
}

# The names of the environments are those the check job of .github/workflows/ci.yml enters
unit "github" {
  source = "../../units/github-actions"
  path   = "github"

  values = {
    owner      = split("/", local.env.github.repository)[0]
    repository = split("/", local.env.github.repository)[1]

    environments = {
      "cache-write" = {
        branches  = local.cache.write_branches
        secrets   = { TURBO_TOKEN = local.cache.token_rw_secret }
        variables = { TURBO_API = "https://${local.cache.host_rw}" }
      }
      "cache-read" = {
        secrets   = { TURBO_TOKEN = local.cache.token_ro_secret }
        variables = { TURBO_API = "https://${local.cache.host_ro}" }
      }
    }

    secrets = {
      TURBO_REMOTE_CACHE_SIGNATURE_KEY = local.cache.signature_key_secret
    }
  }

  # The values are read from the secrets
  autoinclude {
    dependencies {
      paths = [unit.secrets.path]
    }
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
