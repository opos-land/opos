#!/usr/bin/env bash
# Prints the current value of one of an environment's secrets, entered or generated, to standard
# output: exactly the value, so that it pipes into a password manager or the clipboard, and a line
# break after it only on a terminal. It reads nothing else and changes nothing.
#
#   infra/run.sh <environment> infra/secret-get.sh <name>
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: infra/run.sh <environment> infra/secret-get.sh <name>" >&2
  exit 2
fi
name=$1

id=$(scw secret secret list name="$name" project-id="$DEPLOY_PROJECT_ID" region="$DEPLOY_REGION" \
  -o json |
  node -pe 'JSON.parse(require("node:fs").readFileSync(0, "utf8"))[0]?.id ?? ""')
if [ -z "$id" ]; then
  echo "the project has no secret $name" >&2
  exit 1
fi

# Secret Manager hands out the value in base64
scw secret version access secret-id="$id" revision=latest_enabled region="$DEPLOY_REGION" -o json |
  node -e 'process.stdout.write(Buffer.from(JSON.parse(require("node:fs").readFileSync(0, "utf8")).data, "base64"))'
if [ -t 1 ]; then echo; fi
