#!/usr/bin/env bash
# What an environment needs before its first plan and no unit can make, made once by an
# administrator of its Scaleway organisation: the bucket that holds the state and the passphrase its
# key derives from, which the state of a unit that made them would need, and the environment's
# domain, for which no resource exists
# (docs/adr/0035-describe-the-infrastructure-in-opentofu-units-run-by-terragrunt.md). The operators'
# group is the shared unit. Safe to run again, also to print the DNS records again.
#
#   infra/bootstrap.sh <environment>
#
# The project, its id, its region and the domain come from the environment's env.yaml, which the
# administrator fills in first. scw runs with the administrator's own profile.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: infra/bootstrap.sh <environment>" >&2
  exit 2
fi

# shellcheck source=infra/settings.sh
. "$(dirname "$0")/settings.sh" "$1"
environment=$1

# Prints a command that changes something before running it; no secret is ever an argument
run() {
  echo "+ $*" >&2
  "$@"
}

project=$(setting scaleway project)
project_id=$(setting scaleway project_id)
region=$(setting scaleway region)
zone=$(setting dns zone)
if [ -z "$project" ] || [ -z "$project_id" ] || [ -z "$region" ] || [ -z "$zone" ]; then
  echo "$settings names no scaleway project, project_id and region, or no dns zone" >&2
  exit 2
fi
# The names infra/root.hcl and infra/state-passphrase.sh derive from the project
bucket="${project}-tofu-state"
passphrase=tofu-state-passphrase

# The bucket keeps every earlier version of every object: a damaged state is restored from one
if scw object bucket get "$bucket" project-id="$project_id" region="$region" >/dev/null 2>&1; then
  run scw object bucket update "$bucket" enable-versioning=true project-id="$project_id" \
    region="$region" >/dev/null
else
  run scw object bucket create "$bucket" enable-versioning=true acl=private \
    project-id="$project_id" region="$region" >/dev/null
fi
echo "state bucket: $bucket"

# 64 random characters, made here and sent from memory; protected, so that it cannot be deleted.
# Losing it loses every state.
id=$(scw secret secret list name="$passphrase" path=/ project-id="$project_id" region="$region" \
  -o json | node -pe 'JSON.parse(require("node:fs").readFileSync(0, "utf8"))[0]?.id ?? ""')
if [ -z "$id" ]; then
  id=$(run scw secret secret create name="$passphrase" path=/ protected=true \
    project-id="$project_id" region="$region" \
    description="The passphrase the key of the OpenTofu state derives from" -o json |
    node -pe 'JSON.parse(require("node:fs").readFileSync(0, "utf8")).id')
fi
# Only the first version: a second one would change the passphrase and lose every state
versions=$(scw secret version list secret-id="$id" region="$region" -o json |
  node -pe 'JSON.parse(require("node:fs").readFileSync(0, "utf8")).length')
if [ "$versions" = 0 ]; then
  openssl rand -base64 48 | tr -d '\n' |
    run scw secret version create secret-id="$id" data=@/dev/stdin region="$region" >/dev/null
fi
echo "state passphrase: $passphrase"

# The environment's domain, held as an external domain: Scaleway makes its zone, which the parent
# zone delegates. Scaleway removes the domain unless the TXT record proves it within 48 hours and
# the NS records point at its name servers within 14 days.
# A listing, not a get: a failure stops the script instead of reading as "not registered"
registered=$(scw domain domain list domain="$zone" project-id="$project_id" -o json |
  ZONE="$zone" node -pe '
    JSON.parse(require("node:fs").readFileSync(0, "utf8")).some((d) => d.domain === process.env.ZONE)')
if [ "$registered" != true ]; then
  run scw domain external-domain register domain="$zone" project-id="$project_id" >/dev/null
fi
domain=$(scw domain domain get domain="$zone" -o json)
status=$(node -pe 'JSON.parse(require("node:fs").readFileSync(0, "utf8")).status' <<<"$domain")
token=$(node -pe '
  JSON.parse(require("node:fs").readFileSync(0, "utf8"))
    .external_domain_registration_status?.validation_token ?? ""' <<<"$domain")
label=${zone%%.*}
echo "domain: $zone, $status"
echo "records in the zone of ${zone#*.}: the TXT first, the NS once Scaleway has validated it"
echo "  _scaleway-challenge.$label TXT $token"
echo "  $label NS ns0.dom.scw.cloud"
echo "  $label NS ns1.dom.scw.cloud"

echo "next: mise run deploy:login $environment, mise run deploy:apply $environment shared, then"
echo "mise run deploy:grant $environment <email>... for each operator"
