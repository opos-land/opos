# The Dev environment: what it runs once, whatever the number of its deployments, and its
# deployment, made from the units of infra/units with the settings of env.yaml. The units are generated into .terragrunt-stack
# on every run and never committed.

locals {
  env        = yamldecode(file("env.yaml"))
  cache      = local.env.cache
  mail       = local.env.mail
  files      = local.env.files
  supabase   = local.env.supabase
  deployment = local.env.deployment

  # The number of each generated secret: a unit that reads one puts off its read until the apply
  # when the number is new or raised
  generated = try(local.env.secrets.generated, {})

  # The addresses of the deployment's services (docs/adr/0034-address-dev-under-dev-opos-land-in-a-dns-zone-of-its-own.md)
  site = local.env.dns.zone
}

unit "secrets" {
  source = "../../units/secrets"
  path   = "secrets"

  values = {
    # The environment's own secrets sit at the root of its project, beside the state's passphrase
    path      = "/"
    entered   = try(local.env.secrets.entered, [])
    generated = local.generated
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

# The bucket of uploaded files, in the project the bootstrap made for it alone
unit "files" {
  source = "../../units/files"
  path   = "files"

  values = {
    environment      = "dev"
    files_project_id = local.files.project_id
    bucket           = local.files.bucket
    noncurrent_days  = local.files.noncurrent_days
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

  # deploy:apply --ref runs another branch or tag than env.yaml's, until an apply without it
  values = {
    zone            = local.env.dns.zone
    name            = local.deployment.name
    project_uuid    = local.env.coolify.project_uuid
    server_uuid     = local.env.coolify.server_uuid
    ipv4            = local.env.coolify.ipv4
    ipv6            = try(local.env.coolify.ipv6, null)
    repository      = local.deployment.repository
    branch          = get_env("DEPLOY_REF", local.deployment.branch)
    loaded_services = local.deployment.loaded_services
    catch_mail      = local.deployment.catch_mail
    supabase_ref    = local.supabase.ref
    mail_from       = local.mail.from
    generated       = local.generated

    # The secret holding each value, named after its key but for the two other units make: the
    # supabase unit the secret key's, the shared unit smtp-password. Derived rather than written
    # out, which a scanner would take for passwords
    secrets = merge(
      {
        for key in [
          "supabase_db_password",
          "opos_app_password",
          "opos_app_global_password",
          "opos_admin_password",
          "send_email_hook_secret",
          "invite_secret",
          "payment_credentials_key",
          "basic_auth_password",
          "imgproxy_key",
          "imgproxy_salt",
        ] : key => replace(key, "_", "-")
      },
      {
        supabase_secret_key = local.supabase.secret_key_secret
        smtp_password       = local.mail.smtp_secret
        files_secret_key    = local.files.key_secret
      },
    )
  }

  autoinclude {
    dependencies {
      paths = [unit.secrets.path]
    }

    # The units that write smtp-password, the bucket's key and the secret key, and a marker of each
    # value. Mocked
    # while they have written nothing, so that a plan of the whole stack runs before them; the
    # deployment then reads those secrets at the apply, which runs after theirs.
    dependency "shared" {
      config_path = unit.shared.path

      mock_outputs                            = { smtp_key = "mock", files_access_key = "mock" }
      mock_outputs_allowed_terraform_commands = get_env("DEPLOY_EXACT_PLAN", "") == "true" ? ["init", "validate"] : ["init", "validate", "plan"]
      mock_outputs_merge_strategy_with_state  = "shallow"
    }

    dependency "supabase" {
      config_path = unit.supabase.path

      mock_outputs                            = { secret_key_version = "mock" }
      mock_outputs_allowed_terraform_commands = get_env("DEPLOY_EXACT_PLAN", "") == "true" ? ["init", "validate"] : ["init", "validate", "plan"]
      mock_outputs_merge_strategy_with_state  = "shallow"
    }

    dependency "files" {
      config_path = unit.files.path

      mock_outputs = {
        endpoint = "https://s3.example.invalid"
        region   = "mock"
        bucket   = "mock"
      }
      mock_outputs_allowed_terraform_commands = get_env("DEPLOY_EXACT_PLAN", "") == "true" ? ["init", "validate"] : ["init", "validate", "plan"]
    }

    dependency "mail" {
      config_path = unit.mail.path

      mock_outputs = {
        smtp_host = "smtp.example.invalid"
        smtp_port = 465
        smtp_user = "mock-user"
      }
      mock_outputs_allowed_terraform_commands = get_env("DEPLOY_EXACT_PLAN", "") == "true" ? ["init", "validate"] : ["init", "validate", "plan"]
    }

    inputs = {
      smtp_host = dependency.mail.outputs.smtp_host
      smtp_port = dependency.mail.outputs.smtp_port
      smtp_user = dependency.mail.outputs.smtp_user
      files = {
        endpoint   = dependency.files.outputs.endpoint
        region     = dependency.files.outputs.region
        bucket     = dependency.files.outputs.bucket
        access_key = dependency.shared.outputs.files_access_key
      }
      produced = {
        smtp_password       = dependency.shared.outputs.smtp_key
        files_secret_key    = dependency.shared.outputs.files_access_key
        supabase_secret_key = dependency.supabase.outputs.secret_key_version
      }
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

    generated = local.generated
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
      mock_outputs_allowed_terraform_commands = get_env("DEPLOY_EXACT_PLAN", "") == "true" ? ["init", "validate"] : ["init", "validate", "plan"]
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

    files_project_id  = local.files.project_id
    files_key_secret  = local.files.key_secret
    files_key_version = local.files.key_version
  }
}
