# What an environment needs from its Scaleway organisation rather than from its project, applied by
# an administrator of the organisation: an operator's key has no rights here. For now the
# operators' group and what it may do in the project.

# Who is in the group stays out of the repository: an administrator adds people with
# mise run deploy:grant, and OpenTofu leaves the members alone.
resource "scaleway_iam_group" "operators" {
  name                = "${var.project}-operators"
  description         = "Run the deploy commands of the ${var.project} project"
  external_membership = true
}

# What the deploy commands need in the environment's project and nothing more: never an
# administrator of the organisation
resource "scaleway_iam_policy" "operators" {
  name        = "${var.project}-operators"
  description = "What the deploy commands of the ${var.project} project need"
  group_id    = scaleway_iam_group.operators.id

  rule {
    project_ids = [var.project_id]
    permission_set_names = [
      "SecretManagerFullAccess",
      "DomainsDNSFullAccess",
      "ObjectStorageFullAccess",
    ]
  }
}
