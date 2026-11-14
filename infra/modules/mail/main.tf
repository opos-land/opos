# The environment's transactional mail through Scaleway's Transactional Email, sent from the
# domain the project holds, with the records that let receivers trust it. Nothing receives mail
# there: the MX record is Scaleway's blackhole. The key the API signs in with is made in the shared
# unit, which may make keys.

# A project makes no domain before it subscribes to an offer. Essential has no monthly fee and is
# billed by the email sent. The provider subscribes only through an action, which OpenTofu does not
# run, so scw does it under the operator's profile (infra/run.sh). The API cancels no subscription:
# destroying this changes nothing at Scaleway.
resource "terraform_data" "offer" {
  input = { project_id = var.project_id, region = var.region, offer = "essential" }

  provisioner "local-exec" {
    command = "scw tem offer-subscriptions update project-id=${self.input.project_id} region=${self.input.region} name=${self.input.offer} >/dev/null"
  }
}

# Creating the domain accepts Scaleway's terms of service for Transactional Email
resource "scaleway_tem_domain" "this" {
  project_id = var.project_id
  region     = var.region
  name       = var.zone
  accept_tos = true

  depends_on = [terraform_data.offer]
}

data "scaleway_domain_zone" "this" {
  project_id = var.project_id
  domain     = var.zone
}

locals {
  records = {
    spf   = { name = "", type = "TXT", data = scaleway_tem_domain.this.spf_value, priority = null }
    dkim  = { name = scaleway_tem_domain.this.dkim_name, type = "TXT", data = scaleway_tem_domain.this.dkim_config, priority = null }
    dmarc = { name = scaleway_tem_domain.this.dmarc_name, type = "TXT", data = scaleway_tem_domain.this.dmarc_config, priority = null }
    mx    = { name = "", type = "MX", data = scaleway_tem_domain.this.mx_config, priority = scaleway_tem_domain.this.mx_priority }
  }
}

resource "scaleway_domain_record" "this" {
  for_each = local.records

  project_id = var.project_id
  dns_zone   = data.scaleway_domain_zone.this.id
  name       = each.value.name
  type       = each.value.type
  data       = each.value.data
  priority   = each.value.priority
  ttl        = 3600
}

# Waits until Scaleway has seen the records; mail is refused before
resource "scaleway_tem_domain_validation" "this" {
  region    = var.region
  domain_id = scaleway_tem_domain.this.id
  timeout   = 3600

  depends_on = [scaleway_domain_record.this]
}
