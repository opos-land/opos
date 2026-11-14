#!/usr/bin/env bash
# Builds the images as a deployment's server does and tries what a build alone does not show: that
# the API's bundle finds every import in its production dependencies, and that an application
# answers a route with its page and its headers. Needs Docker and nothing else; run it after a
# change to the Dockerfile, the Caddyfile, the dependencies or the workspace's packages.
#
#   infra/docker/check.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
# An address no deployment has: a bundle that names it was built here, from this tree
api_url=https://opos-control.invalid
name=opos-images-check-portal
guarded=opos-images-check-guarded

build() {
  docker build --quiet -f infra/docker/Dockerfile "$@" . >/dev/null
}

echo "Building the api, the tools, the panel, the portal and the admin application"
build --target api -t opos-api:check
build --target tools -t opos-tools:check
for app in panel portal admin; do
  build --target web --build-arg APP="$app" --build-arg VITE_API_URL="$api_url" -t "opos-$app:check"
done

# Without its environment the API stops at the validation, past every import of the bundle
echo "Starting the api without its environment"
log=$(docker run --rm opos-api:check 2>&1 || true)
if ! grep -q 'Invalid environment' <<<"$log"; then
  echo "$log" >&2
  echo "The api did not reach the validation of its environment" >&2
  exit 1
fi

echo "Asking the portal for a route"
docker run --rm -d --name "$name" -p 127.0.0.1:39080:8080 opos-portal:check >/dev/null
docker run --rm -d --name "$guarded" -p 127.0.0.1:39081:8080 \
  -e BASIC_AUTH_PASSWORD=opos-check-password opos-admin:check >/dev/null
trap 'docker stop "$name" "$guarded" >/dev/null' EXIT
for port in 39080 39081; do
  for _ in $(seq 30); do
    curl -fsS -o /dev/null "http://127.0.0.1:$port/healthz" 2>/dev/null && break
    sleep 1
  done
done

# A route of the application, not a file: the fallback to index.html and the headers at once
headers=$(curl -fsS -D - -o /dev/null http://127.0.0.1:39080/conventions/any/programme)
expect() {
  if ! grep -qi "$1" <<<"$headers"; then
    echo "$headers" >&2
    echo "The portal's answer lacks: $1" >&2
    exit 1
  fi
}
expect "content-type: text/html"
expect "content-security-policy: .*connect-src 'self' $api_url"
expect "strict-transport-security:"
expect "x-content-type-options: nosniff"

status=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:39080/assets/missing.js)
if [ "$status" != 404 ]; then
  echo "A missing built file answered $status, not 404" >&2
  exit 1
fi

# With a password, as on Dev, every path but the health check asks for it, and the hash Caddy
# checks against was made from it
answer() {
  curl -s -o /dev/null -w '%{http_code}' "$@"
}
for check in \
  "401 http://127.0.0.1:39081/" \
  "401 http://127.0.0.1:39081/assets/missing.js" \
  "200 http://127.0.0.1:39081/healthz" \
  "401 -u opos:wrong http://127.0.0.1:39081/" \
  "200 -u opos:opos-check-password http://127.0.0.1:39081/"; do
  expected=${check%% *}
  # shellcheck disable=SC2086
  actual=$(answer ${check#* })
  if [ "$actual" != "$expected" ]; then
    echo "The guarded admin application answered $actual, not $expected: ${check#* }" >&2
    exit 1
  fi
done
# Caddy's own environment, not the container's, which an exec inherits
if docker exec "$guarded" sh -c "tr '\\0' '\\n' </proc/1/environ | grep -q '^BASIC_AUTH_PASSWORD='"; then
  echo "The password stayed in Caddy's environment" >&2
  exit 1
fi

echo "The images build, the api resolves its imports and the frontends serve their routes, behind basic auth when asked"
