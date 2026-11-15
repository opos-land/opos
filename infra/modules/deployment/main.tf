# The deployment of the environment: the compose file of infra/docker built by Coolify from the
# head of a branch, with its variables and a host per service in the environment's zone. OpenTofu owns the configuration and
# never which commit runs; CI releases (docs/adr/0038-release-dev-from-ci-and-change-its-infrastructure-from-an-operators-machine.md).

locals {
  hosts = {
    portal = var.zone
    panel  = "panel.${var.zone}"
    api    = "api.${var.zone}"
    admin  = "admin.${var.zone}"
  }

  # The address of each service
  url = { for service, host in local.hosts : service => "https://${host}" }
}

resource "coolify_environment" "this" {
  project_uuid = var.coolify_project_uuid
  name         = var.name
}

resource "coolify_application" "this" {
  name             = "opos"
  description      = "The deployment of OPOS at ${var.zone}, managed by OpenTofu"
  project_uuid     = var.coolify_project_uuid
  environment_uuid = coolify_environment.this.uuid
  server_uuid      = var.server_uuid

  git_repository          = var.repository
  git_branch              = var.branch
  build_pack              = "dockercompose"
  base_directory          = "/"
  docker_compose_location = "/infra/docker/compose.yaml"
  ports_exposes           = "3001"

  # Coolify reads the compose file from the repository during a deployment, and refuses the hosts of
  # its services before; a new deployment is applied once without them. No host names a port: the
  # proxy routes to the one a service exposes in the compose file, and Coolify hands back no port
  # it was given, which the provider then takes for a change
  docker_compose_domains = var.compose_loaded ? jsonencode([
    for service, host in local.hosts : { name = service, domain = "https://${host}" }
  ]) : null

  autogenerate_domain    = false
  is_force_https_enabled = true
  # CI releases, once the checks passed; a push alone deploys nothing
  is_auto_deploy_enabled = false
  instant_deploy         = false
}

# The markers of the values other units write. A new, changed or mocked marker has a change
# planned here, which puts off reading the secrets until the apply, once those units have written
# them; otherwise the secrets are read during the plan.
resource "terraform_data" "produced" {
  input = var.produced
}

# The values pass through this unit's encrypted state on their way to Coolify
data "scaleway_secret_version" "this" {
  for_each = var.secrets

  project_id  = var.project_id
  region      = var.region
  secret_name = each.value
  revision    = "latest_enabled"

  depends_on = [terraform_data.produced]
}

locals {
  secret = { for key, version in data.scaleway_secret_version.this : key => base64decode(version.data) }

  database = "db.${var.supabase_ref}.supabase.co:5432/postgres?sslmode=verify-full"

  environment = {
    OPOS_ENV = "dev"

    DATABASE_MIGRATION_URL   = "postgres://postgres:${urlencode(local.secret.supabase_db_password)}@${local.database}"
    DATABASE_URL             = "postgres://opos_app:${urlencode(local.secret.opos_app_password)}@${local.database}"
    DATABASE_GLOBAL_URL      = "postgres://opos_app_global:${urlencode(local.secret.opos_app_global_password)}@${local.database}"
    DATABASE_ADMIN_URL       = "postgres://opos_admin:${urlencode(local.secret.opos_admin_password)}@${local.database}"
    OPOS_APP_PASSWORD        = local.secret.opos_app_password
    OPOS_APP_GLOBAL_PASSWORD = local.secret.opos_app_global_password
    OPOS_ADMIN_PASSWORD      = local.secret.opos_admin_password

    SUPABASE_URL        = "https://${var.supabase_ref}.supabase.co"
    SUPABASE_SECRET_KEY = local.secret.supabase_secret_key
    # The generated value is lowercase letters and digits, which base64 reads as it stands
    SEND_EMAIL_HOOK_SECRET = "v1,whsec_${local.secret.send_email_hook_secret}"
    INVITE_SECRET          = local.secret.invite_secret

    API_URL    = local.url.api
    PANEL_URL  = local.url.panel
    PORTAL_URL = local.url.portal
    ADMIN_URL  = local.url.admin

    SMTP_HOST = var.smtp_host
    SMTP_PORT = tostring(var.smtp_port)
    SMTP_USER = var.smtp_user
    SMTP_PASS = local.secret.smtp_password
    MAIL_FROM = var.mail_from

    BASIC_AUTH_PASSWORD = local.secret.basic_auth_password
  }
}

resource "coolify_environment_variable" "this" {
  for_each = toset(keys(local.environment))

  application_uuid = coolify_application.this.uuid
  key              = each.key
  value            = local.environment[each.key]
  # Taken as written: a $ in a password stays a $
  is_literal = true
  # The frontends are built for the API's address
  is_build   = each.key == "API_URL"
  is_runtime = true
  is_preview = false
}

# Deploys the head of the branch when the deployment is new and whenever its configuration, a value
# or the branch changes; a new commit alone is CI's to release
resource "coolify_deployment" "this" {
  application_uuid    = coolify_application.this.uuid
  wait_for_completion = true

  triggers = {
    configuration = sha256(jsonencode([local.environment, coolify_application.this.docker_compose_domains, var.branch]))
  }

  timeouts = {
    create = "30m"
  }

  depends_on = [coolify_environment_variable.this]
}

data "scaleway_domain_zone" "this" {
  project_id = var.project_id
  domain     = var.zone
}

# Straight at the server: Coolify's proxy answers Let's Encrypt's HTTP challenge on these names
locals {
  records = merge(
    { for service, host in local.hosts : "${service}/A" => { host = host, type = "A", data = var.ipv4 } },
    var.ipv6 == null ? {} : {
      for service, host in local.hosts : "${service}/AAAA" => { host = host, type = "AAAA", data = var.ipv6 }
    },
  )
}

resource "scaleway_domain_record" "this" {
  for_each = local.records

  project_id = var.project_id
  dns_zone   = data.scaleway_domain_zone.this.id
  # The portal's record sits at the zone's apex, whose name is empty
  name = each.value.host == var.zone ? "" : trimsuffix(each.value.host, ".${var.zone}")
  type = each.value.type
  data = each.value.data
  ttl  = 300
}
