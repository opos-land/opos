# The project in Coolify that holds everything of one environment. What the environment runs once
# and each of its deployments have an environment of their own in it, so no two share resources.

resource "coolify_project" "this" {
  name        = var.name
  description = var.description
}
