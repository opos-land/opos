#!/usr/bin/env bash
# Runs a command for an environment under the operator's own Scaleway key: the profile of scw
# named after the environment's project (mise run deploy:login), which holds the key alone, in a
# config file of the deploy commands' own. The project and region come from env.yaml alone, through
# the provider block of root.hcl; a second source makes the provider warn. So the scripts get them
# as DEPLOY_PROJECT_ID and DEPLOY_REGION rather than SCW_DEFAULT_*, and the profile sits outside
# the user's own config.yaml, whose top-level settings scw merges into every profile of the file.
# OpenTofu's s3 backend speaks AWS's names, so the same key reaches it as AWS_* variables, for this
# process alone.
# --signed-out names the profile without asking for its key, for the sign-in itself.
#
#   infra/run.sh [--signed-out] <environment> <command> [<argument>...]
set -euo pipefail

signed_out=false
if [ "${1:-}" = --signed-out ]; then
  signed_out=true
  shift
fi

if [ "$#" -lt 2 ]; then
  echo "usage: infra/run.sh [--signed-out] <environment> <command> [<argument>...]" >&2
  exit 2
fi

# shellcheck source=infra/settings.sh
. "$(dirname "$0")/settings.sh" "$1"
shift

SCW_PROFILE=$(setting scaleway project)
DEPLOY_PROJECT_ID=$(setting scaleway project_id)
DEPLOY_REGION=$(setting scaleway region)
if [ -z "$SCW_PROFILE" ] || [ -z "$DEPLOY_PROJECT_ID" ] || [ -z "$DEPLOY_REGION" ]; then
  echo "$settings names no scaleway project, project_id and region" >&2
  exit 2
fi
SCW_CONFIG_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/scw/opos-deploy.yaml"
export SCW_PROFILE SCW_CONFIG_PATH DEPLOY_PROJECT_ID DEPLOY_REGION

if [ "$signed_out" = false ]; then
  if ! AWS_ACCESS_KEY_ID=$(scw config get access-key 2>/dev/null) || [ -z "$AWS_ACCESS_KEY_ID" ]; then
    echo "scw has no profile $SCW_PROFILE: mise run deploy:login first" >&2
    exit 1
  fi
  AWS_SECRET_ACCESS_KEY=$(scw config get secret-key)
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
fi

exec "$@"
