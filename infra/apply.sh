#!/usr/bin/env bash
# deploy:apply and deploy:plan --save. Plans the environment's units into one directory, then, for
# an apply, asks once and applies exactly those plans, never a plan made again behind the answer.
# A plan meant for an apply allows no mocked dependency outputs (DEPLOY_EXACT_PLAN): a saved plan
# keeps every value a unit was handed, so a unit whose dependencies are not applied yet fails to
# plan instead, and is applied in a later run. The plans are encrypted like the state (root.hcl).
#
#   infra/apply.sh plan        <environment> [unit]   plan and keep the plans
#   infra/apply.sh apply       <environment> [unit]   plan, ask, apply the plans
#   infra/apply.sh apply-saved <environment> [unit]   ask, apply the plans kept by plan
#
# Without a unit, every unit but shared, which only an administrator applies and only by its name.
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "usage: infra/apply.sh plan|apply|apply-saved <environment> [unit]" >&2
  exit 2
fi
mode=$1
environment=$2
unit=${3:-}

root=$(git rev-parse --show-toplevel)
live="$root/infra/live/$environment"
plans="$live/.terragrunt-plans"
if [ ! -d "$live" ]; then
  echo "infra/live has no environment $environment" >&2
  exit 2
fi

stack() {
  terragrunt stack run --working-dir "$live" --filter "${unit:-!shared}" --out-dir "$plans" "$@"
}

plan() {
  rm -rf "$plans"
  if ! DEPLOY_EXACT_PLAN=true stack -- plan; then
    echo "A unit did not plan. If its dependencies are not applied yet, apply them first by name:" >&2
    echo "mise run deploy:apply $environment <unit>" >&2
    exit 1
  fi
}

case "$mode" in
  plan)
    plan
    echo "The plans are kept for mise run deploy:apply $environment ${unit:+$unit }--saved"
    exit 0
    ;;
  apply) plan ;;
  apply-saved)
    if [ ! -d "$plans" ]; then
      echo "No plans are kept: mise run deploy:plan $environment ${unit:+$unit }--save first" >&2
      exit 1
    fi
    ;;
  *)
    echo "usage: infra/apply.sh plan|apply|apply-saved <environment> [unit]" >&2
    exit 2
    ;;
esac

read -r -p "Apply the plans above to $environment${unit:+ ($unit)}? [y/N] " answer </dev/tty
case "$answer" in
  y | Y | yes) ;;
  *)
    echo "Nothing applied."
    exit 1
    ;;
esac

# A unit without a kept plan would otherwise be planned and approved here unseen: OpenTofu asks
# for it instead. A kept plan applies without asking.
TG_NO_AUTO_APPROVE=true stack -- apply
rm -rf "$plans"
