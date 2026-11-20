# What an environment needs from its Scaleway organisation rather than from its project, applied by
# an administrator of the organisation: an operator's key has no rights here. The operators' group
# and what it may do in the project, the key the API sends mail with, and the key the API opens the
# bucket of uploaded files with, in the project the bootstrap made for it.

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
      "TransactionalEmailFullAccess",
    ]
  }

  # The files unit keeps the bucket's settings; the operators restore a removed file
  rule {
    project_ids          = [var.files_project_id]
    permission_set_names = ["ObjectStorageFullAccess"]
  }
}

# The API signs in to the SMTP relay with the key of an application that may only send mail in the
# project. Its secret goes straight into Secret Manager and never into the state; raising
# smtp_key_version in env.yaml replaces it.
resource "scaleway_iam_application" "smtp" {
  name        = "${var.project}-smtp"
  description = "Sends the transactional mail of the ${var.project} project"
}

resource "scaleway_iam_policy" "smtp" {
  name           = "${var.project}-smtp"
  description    = "Send mail through Transactional Email in the ${var.project} project"
  application_id = scaleway_iam_application.smtp.id

  rule {
    project_ids          = [var.project_id]
    permission_set_names = ["TransactionalEmailEmailSmtpCreate"]
  }
}

resource "scaleway_secret" "smtp" {
  project_id = var.project_id
  region     = var.region
  name       = var.smtp_secret
  path       = "/"
  tags       = ["source:shared"]
}

resource "terraform_data" "smtp_key_version" {
  input = var.smtp_key_version
}

resource "scaleway_iam_api_key" "smtp" {
  application_id     = scaleway_iam_application.smtp.id
  default_project_id = var.project_id
  description        = "The SMTP password of the ${var.project} project's API"
  secret_id          = scaleway_secret.smtp.id

  lifecycle {
    replace_triggered_by = [terraform_data.smtp_key_version]
  }
}

# Object Storage rights reach every bucket of the project they are granted in, and a bucket policy
# names users and applications, never a group. So the bucket of uploaded files lies in a project
# that holds it alone, and the API's key, granted there alone, opens that bucket and nothing else:
# never the state's bucket (docs/adr/0069-keep-an-environments-uploaded-files-in-a-scaleway-project-of-their-own.md).
resource "scaleway_iam_application" "files" {
  name        = "${var.project}-files"
  description = "Keeps, reads and removes the uploaded files of the ${var.project} project's API"
}

# Objects alone: the API never changes the bucket's settings, its versions or its policy
resource "scaleway_iam_policy" "files" {
  name           = "${var.project}-files"
  description    = "Read, write and delete the objects of the bucket of uploaded files of the ${var.project} project"
  application_id = scaleway_iam_application.files.id

  rule {
    project_ids = [var.files_project_id]
    permission_set_names = [
      "ObjectStorageObjectsRead",
      "ObjectStorageObjectsWrite",
      "ObjectStorageObjectsDelete",
    ]
  }
}

# The secret key goes straight into the environment's Secret Manager and never into the state;
# raising files_key_version in env.yaml replaces it. Its default project is the bucket's, which
# Scaleway's S3 API scopes a key's requests to.
resource "scaleway_secret" "files" {
  project_id = var.project_id
  region     = var.region
  name       = var.files_key_secret
  path       = "/"
  tags       = ["source:shared"]
}

resource "terraform_data" "files_key_version" {
  input = var.files_key_version
}

resource "scaleway_iam_api_key" "files" {
  application_id     = scaleway_iam_application.files.id
  default_project_id = var.files_project_id
  description        = "The key of the bucket of uploaded files of the ${var.project} project's API"
  secret_id          = scaleway_secret.files.id

  lifecycle {
    replace_triggered_by = [terraform_data.files_key_version]
  }
}
