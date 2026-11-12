#!/usr/bin/env bash
# Signs the operator in for the deploy commands, as themselves, each unless already signed in: to
# Scaleway through the browser, into the profile infra/run.sh names, with a key that belongs to the
# environment's project and expires after 12 hours; to GitHub through its CLI. Nothing is written to
# the repository.
#
#   infra/run.sh --signed-out <environment> infra/login.sh
set -euo pipefail

# The profile's key stands while it has more than an hour left: a new sign-in would only replace it.
# Every user may read their own keys.
expires=""
access_key=$(scw -p "$SCW_PROFILE" config get access-key 2>/dev/null || true)
if [ -n "$access_key" ]; then
  expires=$(scw -p "$SCW_PROFILE" iam api-key get "$access_key" with-policies=false -o json \
    2>/dev/null | node -pe '
      const { expires_at } = JSON.parse(require("node:fs").readFileSync(0, "utf8"))
      expires_at && Date.parse(expires_at) - Date.now() > 3600e3 ? expires_at : ""' 2>/dev/null ||
    true)
fi
if [ -n "$expires" ]; then
  echo "Scaleway: signed in as profile $SCW_PROFILE until $expires"
else
  scw -p "$SCW_PROFILE" login project-id="$DEPLOY_PROJECT_ID" expires-at=+12h
fi
# The profile holds the key alone: the project and region come from env.yaml on every run
scw -p "$SCW_PROFILE" config unset default-project-id >/dev/null
scw -p "$SCW_PROFILE" config unset default-region >/dev/null

if ! gh auth status >/dev/null 2>&1; then
  gh auth login
fi
