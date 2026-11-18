# shellcheck shell=bash
# The settings of an environment, read from its env.yaml by the scripts that run before Terragrunt
# does. Sourced, never run: it stops the script that sources it when the environment has none.
#
#   . infra/settings.sh <environment>
#   setting <block> <key>

settings="$(dirname "${BASH_SOURCE[0]}")/live/$1/env.yaml"
if [ ! -f "$settings" ]; then
  echo "no environment has its settings at $settings" >&2
  exit 2
fi

# A plain value one level inside a top-level block of env.yaml
setting() {
  awk -v block="$1" -v key="$2" '
    $0 == block ":" { inside = 1; next }
    /^[^ #]/ { inside = 0 }
    inside && $1 == key ":" { print $2; exit }
  ' "$settings"
}
