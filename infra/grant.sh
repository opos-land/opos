#!/usr/bin/env bash
# Lets people run the deploy commands of an environment, or stops them: puts them into its
# operators' group or takes them out of it. The shared unit makes the group and leaves its members
# alone, so that who they are stays out of the repository. Run by an administrator of the Scaleway
# organisation, with their own profile of scw; each person is a member of the organisation. Safe to
# run again.
#
#   infra/grant.sh [--revoke] <environment> <email>...
set -euo pipefail

revoke=false
if [ "${1:-}" = --revoke ]; then
  revoke=true
  shift
fi

if [ "$#" -lt 2 ]; then
  echo "usage: infra/grant.sh [--revoke] <environment> <email>..." >&2
  exit 2
fi

# shellcheck source=infra/settings.sh
. "$(dirname "$0")/settings.sh" "$1"
environment=$1
shift

# Prints a command that changes something before running it; no secret is ever an argument
run() {
  echo "+ $*" >&2
  "$@"
}

project=$(setting scaleway project)
if [ -z "$project" ]; then
  echo "$settings names no scaleway project" >&2
  exit 2
fi
# The name the shared unit gives the group
group="${project}-operators"

# The group's id and the ids of its members, one per line
group_lines=$(scw iam group list name="$group" -o json |
  GROUP="$group" node -e '
    const group = JSON.parse(require("node:fs").readFileSync(0, "utf8"))
      .find((g) => g.name === process.env.GROUP)
    if (group) console.log([group.id, ...(group.user_ids ?? [])].join("\n"))')
group_id=$(head -n 1 <<<"$group_lines")
if [ -z "$group_id" ]; then
  echo "no group $group: first mise run deploy:apply $environment shared" >&2
  exit 1
fi
members=$(tail -n +2 <<<"$group_lines")

users=$(scw iam user list -o json)
for email in "$@"; do
  user_id=$(EMAIL="$email" node -pe '
    JSON.parse(require("node:fs").readFileSync(0, "utf8"))
      .find((user) => user.email === process.env.EMAIL)?.id ?? ""' <<<"$users")
  if [ -z "$user_id" ]; then
    echo "$email is not a member of the organisation" >&2
    exit 1
  fi
  if [ "$revoke" = true ]; then
    if grep -qxF "$user_id" <<<"$members"; then
      run scw iam group remove-member group-id="$group_id" user-id="$user_id" >/dev/null
    fi
    echo "$email can no longer run the deploy commands in $project"
  else
    run scw iam group add-members group-id="$group_id" user-ids.0="$user_id" >/dev/null
    echo "$email can run the deploy commands in $project"
  fi
done
