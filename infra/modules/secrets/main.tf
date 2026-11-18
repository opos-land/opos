# One secret per value, in the environment's own project, under one path. The names come from the
# environment's env.yaml; the values never enter the repository or, for the generated ones, the
# state.

locals {
  names = merge(
    { for name in var.entered : name => "entered" },
    { for name in keys(var.generated) : name => "generated" },
  )
}

resource "scaleway_secret" "this" {
  for_each = local.names

  project_id = var.project_id
  region     = var.region
  name       = each.key
  path       = var.path
  tags       = ["source:${each.value}"]

  lifecycle {
    precondition {
      condition     = length(setintersection(var.entered, keys(var.generated))) == 0
      error_message = "A secret is either entered or generated, never both."
    }
  }
}

# Lowercase letters and digits: safe in a URL, a header and a shell. The value exists only during
# the run that writes it.
ephemeral "random_password" "generated" {
  for_each = var.generated

  length  = 64
  special = false
  upper   = false
}

# A new version only when the number in env.yaml changes.
resource "scaleway_secret_version" "generated" {
  for_each = var.generated

  region          = var.region
  secret_id       = scaleway_secret.this[each.key].id
  data_wo         = ephemeral.random_password.generated[each.key].result
  data_wo_version = each.value
}
