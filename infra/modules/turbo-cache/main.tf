# The build cache of CI on the Coolify server: who may write is decided by which token a run can
# read, and the tokens live in Secret Manager.

resource "coolify_environment" "this" {
  project_uuid = var.coolify_project_uuid
  name         = var.environment
}

resource "coolify_service" "this" {
  name             = "turbo-cache"
  description      = "Turborepo remote cache for CI, managed by OpenTofu"
  project_uuid     = var.coolify_project_uuid
  environment_uuid = coolify_environment.this.uuid
  server_uuid      = var.server_uuid

  docker_compose_raw = templatefile("${path.module}/compose.yaml.tftpl", { image = var.image })

  # The port tells Coolify's proxy where the container listens
  urls = [
    { name = "cache", url = "https://${var.host_rw}:3000" },
    { name = "cache-ro", url = "https://${var.host_ro}:3000" },
  ]

  # Started below, once its tokens are set
  instant_deploy = false
}

# The values pass through this unit's encrypted state on their way to Coolify
data "scaleway_secret_version" "token_rw" {
  project_id  = var.project_id
  region      = var.region
  secret_name = var.token_rw_secret
  revision    = "latest_enabled"
}

data "scaleway_secret_version" "token_ro" {
  project_id  = var.project_id
  region      = var.region
  secret_name = var.token_ro_secret
  revision    = "latest_enabled"
}

# Coolify makes each variable the compose file names, empty, as it reads the file: the values are
# written over them, which only the bulk call does. The values are lowercase letters and digits, which
# Coolify reads as they stand.
resource "coolify_envs_bulk" "tokens" {
  resource_type = "service"
  resource_uuid = coolify_service.this.uuid
  variables = {
    TURBO_TOKEN_RW = base64decode(data.scaleway_secret_version.token_rw.data)
    TURBO_TOKEN_RO = base64decode(data.scaleway_secret_version.token_ro.data)
  }
}

# Starts the service the first time and again whenever its compose file or a token changes
resource "coolify_resource_action" "restart" {
  resource_type = "service"
  resource_uuid = coolify_service.this.uuid
  action        = "restart"

  triggers = {
    config   = coolify_service.this.config_hash
    token_rw = data.scaleway_secret_version.token_rw.created_at
    token_ro = data.scaleway_secret_version.token_ro.created_at
  }

  depends_on = [coolify_envs_bulk.tokens]
}

# The zone of the domain the project holds: read first, so that a record never lands in a zone the
# API would make elsewhere
data "scaleway_domain_zone" "this" {
  project_id = var.project_id
  domain     = var.zone
}

# Straight at the server: Coolify's proxy answers Let's Encrypt's HTTP challenge on these names
locals {
  records = merge(
    { for host in [var.host_rw, var.host_ro] : "${host}/A" => { host = host, type = "A", data = var.ipv4 } },
    var.ipv6 == null ? {} : {
      for host in [var.host_rw, var.host_ro] : "${host}/AAAA" => { host = host, type = "AAAA", data = var.ipv6 }
    },
  )
}

resource "scaleway_domain_record" "this" {
  for_each = local.records

  project_id = var.project_id
  dns_zone   = data.scaleway_domain_zone.this.id
  name       = trimsuffix(each.value.host, ".${var.zone}")
  type       = each.value.type
  data       = each.value.data
  ttl        = 300

  lifecycle {
    precondition {
      condition     = endswith(each.value.host, ".${var.zone}")
      error_message = "A host of the cache lies in the zone."
    }
  }
}
