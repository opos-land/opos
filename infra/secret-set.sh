#!/usr/bin/env bash
# Stores a new value of a secret whose value a person enters, read without echo and handed to scw
# on its input: never an argument, a file or the shell's history. The version before it is
# disabled.
#
#   infra/run.sh <environment> infra/secret-set.sh <name>
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: infra/run.sh <environment> infra/secret-set.sh <name>" >&2
  exit 2
fi
name=$1

id=$(scw secret secret list name="$name" project-id="$DEPLOY_PROJECT_ID" region="$DEPLOY_REGION" \
  -o json |
  node -pe 'JSON.parse(require("node:fs").readFileSync(0, "utf8"))[0]?.id ?? ""')
if [ -z "$id" ]; then
  echo "the project has no secret $name: apply the environment's secrets unit first" >&2
  exit 1
fi

read -rsp "The value of $name: " value
echo
if [ -z "$value" ]; then
  echo "nothing entered; $name is unchanged" >&2
  exit 1
fi

printf '%s' "$value" |
  scw secret version create secret-id="$id" data=@/dev/stdin disable-previous=true \
    region="$DEPLOY_REGION" >/dev/null
echo "$name has a new value; apply the units that read it"
