#!/bin/sh
# The database steps of a deployment, in their order: the runtime roles, the pending migrations,
# then the check that every table keeps the tenant isolation rules, and on a deployment that seeds
# (OPOS_SEED true, Dev's deployment.seed in env.yaml) the demo data. A failure stops the deployment:
# the API starts only once this container is healthy. It then stays up, as the place where the
# admin's scripts run (docs/ARCHITECTURE.md, Applications and packages).
set -eu

seed=${OPOS_SEED:-false}
case $seed in
  true | false) ;;
  *)
    echo "OPOS_SEED must be true or false, not '$seed'" >&2
    exit 1
    ;;
esac

pnpm run db:roles
pnpm run db:migrate
pnpm run db:verify
if [ "$seed" = true ]; then
  pnpm run db:seed
fi

touch /tmp/ready
exec sleep infinity
