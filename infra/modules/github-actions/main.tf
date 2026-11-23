# What the workflows of the repository read: environments, each limited to the branches named, with
# their secrets and variables, and the secrets of the repository itself. A secret's value comes from
# the secret of that name in Secret Manager, so a rotation there reaches GitHub with the next apply.
# The GitHub provider keeps the values in the state, which is encrypted.

locals {
  branch_policies = merge([
    for environment, settings in var.environments : {
      for branch in settings.branches : "${environment}/${branch}" => {
        environment = environment
        branch      = branch
      }
    }
  ]...)

  environment_secrets = merge([
    for environment, settings in var.environments : {
      for name, secret in settings.secrets : "${environment}/${name}" => {
        environment = environment
        name        = name
        secret      = secret
      }
    }
  ]...)

  environment_variables = merge([
    for environment, settings in var.environments : {
      for name, value in merge(settings.variables, lookup(var.environment_variables, environment, {})) : "${environment}/${name}" => {
        environment = environment
        name        = name
        value       = value
      }
    }
  ]...)

  secret_names = toset(concat(values(var.secrets), [for entry in values(local.environment_secrets) : entry.secret]))
}

# An environment with branches admits a run of those branches alone, an administrator's included;
# one without admits every run of the repository. A pull request's ref is never a branch's.
resource "github_repository_environment" "this" {
  for_each = var.environments

  repository        = var.repository
  environment       = each.key
  can_admins_bypass = false

  dynamic "deployment_branch_policy" {
    for_each = length(each.value.branches) > 0 ? [true] : []

    content {
      protected_branches     = false
      custom_branch_policies = true
    }
  }
}

resource "github_repository_environment_deployment_policy" "this" {
  for_each = local.branch_policies

  repository     = var.repository
  environment    = github_repository_environment.this[each.value.environment].environment
  branch_pattern = each.value.branch
}

# The number of each generated secret read here. A new or raised one has a change planned here,
# which puts off reading the secrets until the apply, once the secrets unit has written them;
# otherwise they are read during the plan, which fails on a secret not made yet and reads a rotated
# one's version before it.
resource "terraform_data" "produced" {
  input = { for name in local.secret_names : name => tostring(var.generated[name]) if contains(keys(var.generated), name) }
}

data "scaleway_secret_version" "this" {
  for_each = local.secret_names

  project_id  = var.project_id
  region      = var.region
  secret_name = each.key
  revision    = "latest_enabled"

  depends_on = [terraform_data.produced]
}

resource "github_actions_environment_secret" "this" {
  for_each = local.environment_secrets

  repository  = var.repository
  environment = github_repository_environment.this[each.value.environment].environment
  secret_name = each.value.name
  value       = base64decode(data.scaleway_secret_version.this[each.value.secret].data)
}

resource "github_actions_environment_variable" "this" {
  for_each = local.environment_variables

  repository    = var.repository
  environment   = github_repository_environment.this[each.value.environment].environment
  variable_name = each.value.name
  value         = each.value.value
}

resource "github_actions_secret" "this" {
  for_each = var.secrets

  repository  = var.repository
  secret_name = each.key
  value       = base64decode(data.scaleway_secret_version.this[each.value].data)
}
