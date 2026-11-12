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

build() {
  docker build --quiet -f infra/docker/Dockerfile "$@" . >/dev/null
}

echo "Building the api, the tools, the panel and the portal"
build --target api -t opos-api:check
build --target tools -t opos-tools:check
for app in panel portal; do
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
trap 'docker stop "$name" >/dev/null' EXIT
for _ in $(seq 30); do
  curl -fsS -o /dev/null http://127.0.0.1:39080/ 2>/dev/null && break
  sleep 1
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

echo "The images build, the api resolves its imports and the portal serves its routes"
