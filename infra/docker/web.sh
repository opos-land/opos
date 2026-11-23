#!/bin/sh
# Starts Caddy for one built application. With BASIC_AUTH_PASSWORD set, as on Dev, every path but
# /healthz asks for BASIC_AUTH_USER and that password: the password is hashed here, so the hash
# never has to be kept anywhere, and it leaves the environment before Caddy starts
# (docs/adr/0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md).
set -eu

BASIC_AUTH=off
if [ -n "${BASIC_AUTH_PASSWORD:-}" ]; then
  BASIC_AUTH=on
  BASIC_AUTH_USER=${BASIC_AUTH_USER:-opos}
  BASIC_AUTH_HASH=$(printf '%s\n' "$BASIC_AUTH_PASSWORD" | caddy hash-password)
  export BASIC_AUTH_USER BASIC_AUTH_HASH
fi
unset BASIC_AUTH_PASSWORD
export BASIC_AUTH

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
