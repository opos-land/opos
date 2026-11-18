#!/bin/sh
# The database steps of a deployment, in their order: the runtime roles, the pending migrations,
# then the check that every table keeps the tenant isolation rules. A failure stops the deployment:
# the API starts only once this container is healthy. It then stays up, as the place where the
# admin's scripts run (docs/ARCHITECTURE.md, Applications and packages).
set -eu

pnpm run db:roles
pnpm run db:migrate
pnpm run db:verify

touch /tmp/ready
exec sleep infinity
