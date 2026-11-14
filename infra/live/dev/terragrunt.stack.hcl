# The Dev environment: what it runs once, whatever the number of its deployments, and its
# deployment, made from the units of infra/units with the settings of env.yaml. The units are generated into .terragrunt-stack
# on every run and never committed.

locals {
  env        = yamldecode(file("env.yaml"))
  cache      = local.env.cache
  mail       = local.env.mail
  supabase   = local.env.supabase
  deployment = local.env.deployment

  # The addresses of the deployment's services (docs/adr/0034-address-dev-under-dev-opos-land-in-a-dns-zone-of-its-own.md)
  site = "${local.deployment.name}.${local.env.dns.zone}"
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

unit "cache" {
  source = "../../units/turbo-cache"
  path   = "cache"

  values = {
    zone            = local.env.dns.zone
    project_uuid    = local.env.coolify.project_uuid
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

  # The tokens are read from the secrets
  autoinclude {
    dependencies {
      paths = [unit.secrets.path]
    }
  }
}

unit "mail" {
  source = "../../units/mail"
  path   = "mail"

  values = {
    zone = local.env.dns.zone
  }
}

unit "supabase" {
  source = "../../units/supabase"
  path   = "supabase"

  values = {
    ref                = local.supabase.ref
    portal_url         = "https://${local.site}"
    panel_url          = "https://panel.${local.site}"
    api_url            = "https://api.${local.site}"
    secret_key_secret  = local.supabase.secret_key_secret
    secret_key_version = local.supabase.secret_key_version

    secrets = {
      send_email_hook_secret = "send-email-hook-secret"
      google_client_id       = "google-client-id"
      google_client_secret   = "google-client-secret"
    }
  }

  # The values and the access token are read from the secrets
  autoinclude {
    dependencies {
      paths = [unit.secrets.path]
    }
  }
}

unit "deployment" {
  source = "../../units/deployment"
  path   = "deployment"

  values = {
    zone           = local.env.dns.zone
    name           = local.deployment.name
    project_uuid   = local.env.coolify.project_uuid
    server_uuid    = local.env.coolify.server_uuid
    ipv4           = local.env.coolify.ipv4
    ipv6           = try(local.env.coolify.ipv6, null)
    repository     = local.deployment.repository
    branch         = local.deployment.branch
    compose_loaded = local.deployment.compose_loaded
    supabase_ref   = local.supabase.ref
    mail_from      = local.mail.from

    # The secret holding each value; the supabase unit makes the secret key's, the shared unit
    # smtp-password
    secrets = {
      supabase_db_password     = "supabase-db-password"
      supabase_secret_key      = local.supabase.secret_key_secret
      opos_app_password        = "opos-app-password"
      opos_app_global_password = "opos-app-global-password"
      opos_admin_password      = "opos-admin-password"
      send_email_hook_secret   = "send-email-hook-secret"
      invite_secret            = "invite-secret"
      smtp_password            = local.mail.smtp_secret
      basic_auth_password      = "basic-auth-password"
    }
  }

  autoinclude {
    # The values are read from the secrets, the secret key once the supabase unit wrote it
    dependencies {
      paths = [unit.secrets.path, unit.supabase.path]
    }

    dependency "mail" {
      config_path = unit.mail.path

      mock_outputs = {
        smtp_host = "smtp.example.invalid"
        smtp_port = 465
        smtp_user = "mock-user"
      }
      mock_outputs_allowed_terraform_commands = ["init", "validate", "plan"]
    }

    inputs = {
      smtp_host = dependency.mail.outputs.smtp_host
      smtp_port = dependency.mail.outputs.smtp_port
      smtp_user = dependency.mail.outputs.smtp_user
    }
  }
}

# The names of the environments are those the jobs of .github/workflows/ci.yml enter
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
      # The release job: the token deploys and reads in Dev's project alone
      "dev" = {
        branches = [local.deployment.branch]
        secrets  = { COOLIFY_TOKEN = local.deployment.release_token_secret }
        variables = {
          COOLIFY_URL = trimsuffix(local.env.coolify.endpoint, "/")
        }
      }
    }

    secrets = {
      TURBO_REMOTE_CACHE_SIGNATURE_KEY = local.cache.signature_key_secret
    }
  }

  autoinclude {
    # The values are read from the secrets
    dependencies {
      paths = [unit.secrets.path]
    }

    # The application the release job deploys
    dependency "deployment" {
      config_path = unit.deployment.path

      mock_outputs = {
        application_uuid = "mock-application"
        urls             = { portal = "https://mock.invalid" }
      }
      mock_outputs_allowed_terraform_commands = ["init", "validate", "plan"]
    }

    inputs = {
      environment_variables = {
        "dev" = {
          COOLIFY_APPLICATION = dependency.deployment.outputs.application_uuid
          DEPLOYMENT_URL      = dependency.deployment.outputs.urls.portal
        }
      }
    }
  }
}

# What only an administrator of the organisation applies: the deploy commands leave it out unless
# it is named (mise run deploy:apply dev shared)
unit "shared" {
  source = "../../units/shared"
  path   = "shared"

  values = {
    project          = local.env.scaleway.project
    smtp_secret      = local.mail.smtp_secret
    smtp_key_version = local.mail.smtp_key_version
  }
}
