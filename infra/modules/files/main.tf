# The environment's bucket of uploaded files (docs/specs/0012-file-storage.md): private, in the
# project the bootstrap made for it alone, encrypted at rest, and keeping a removed or replaced
# object's earlier version for as long as a backup is kept. The API's key and its rights are the
# shared unit's; this unit keeps the bucket's settings alone.
#
# Every resource names the bucket's project: Scaleway's S3 API scopes a request to one project, the
# provider's own otherwise.

resource "scaleway_object_bucket" "this" {
  name       = var.bucket
  project_id = var.files_project_id
  region     = var.region

  versioning {
    enabled = true
  }

  # A delete leaves the earlier version behind a marker: it goes after noncurrent_days, and the
  # marker once no version is left behind it. An upload never ends in parts, but an unfinished one
  # is billed until it is aborted.
  lifecycle_rule {
    id      = "removed-files"
    enabled = true

    abort_incomplete_multipart_upload_days = 1

    expiration {
      expired_object_delete_marker = true
    }

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_days
    }
  }

  tags = {
    environment = var.environment
    purpose     = "uploaded-files"
  }
}

# Nobody but the project's own keys, through IAM: no public read, no grant to another project
resource "scaleway_object_bucket_acl" "this" {
  bucket     = scaleway_object_bucket.this.id
  project_id = var.files_project_id
  region     = var.region
  acl        = "private"
}

# Every object is encrypted at rest under a key of its own that Scaleway manages (SSE-ONE). By its
# name: the provider puts a regional id into the request's path as it stands, fr-par%2F<bucket>,
# and Scaleway refuses the signature
resource "scaleway_object_bucket_server_side_encryption_configuration" "this" {
  bucket     = scaleway_object_bucket.this.name
  project_id = var.files_project_id
  region     = var.region

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
