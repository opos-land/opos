output "endpoint" {
  description = "The address of the region's S3 API, which the API and imgproxy reach the bucket at by path"
  value       = "https://s3.${scaleway_object_bucket.this.region}.scw.cloud"
}

output "region" {
  description = "The bucket's region, which signs every request"
  value       = scaleway_object_bucket.this.region
}

output "bucket" {
  description = "The bucket's name"
  value       = scaleway_object_bucket.this.name
}
