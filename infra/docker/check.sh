#!/usr/bin/env bash
# Builds the images as a deployment's server does and tries what a build alone does not show: that
# the API's bundle finds every import in its production dependencies, that an application answers
# a route with its page and its headers, and that the portal's pages come with their head from the
# server beside it, and without it when that server is gone. Needs Docker and nothing else; run it
# after a change to the Dockerfile, the Caddyfile, the dependencies or the workspace's packages.
#
#   infra/docker/check.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
# An address no deployment has: a bundle that names it was built here, from this tree
api_url=https://opos-control.invalid
name=opos-images-check-portal
guarded=opos-images-check-guarded
# The portal beside the server that answers its pages, on a network of their own
network=opos-images-check
head=opos-images-check-head
served=opos-images-check-served
password=opos-check-password
commit=0123456789abcdef0123456789abcdef01234567

build() {
  docker build --quiet -f infra/docker/Dockerfile "$@" . >/dev/null
}

echo "Building the api, the tools, the panel, the portal with the server beside it and the admin application"
build --target api -t opos-api:check
build --target tools -t opos-tools:check
for app in panel portal admin; do
  build --target web --build-arg APP="$app" --build-arg VITE_API_URL="$api_url" -t "opos-$app:check"
done
build --target head --build-arg APP=portal --build-arg VITE_API_URL="$api_url" -t opos-portal-head:check

# Without its environment the API stops at the validation, past every import of the bundle
echo "Starting the api without its environment"
log=$(docker run --rm opos-api:check 2>&1 || true)
if ! grep -q 'Invalid environment' <<<"$log"; then
  echo "$log" >&2
  echo "The api did not reach the validation of its environment" >&2
  exit 1
fi

# A build whose install layer came from the cache leaves the manifests newer than the install; a
# step of the tools still runs, past pnpm's check of the dependencies, to the validation of its
# environment
echo "Running a step of the tools with the manifests newer than the install"
log=$(docker run --rm -u 0 opos-tools:check sh -c \
  'touch /repo/package.json /repo/packages/db/package.json &&
   su node -s /bin/sh -c "cd /repo/packages/db && pnpm run db:roles"' 2>&1 || true)
if ! grep -q 'OPOS_APP_PASSWORD is not set' <<<"$log"; then
  echo "$log" >&2
  echo "A step of the tools did not reach the validation of its environment" >&2
  exit 1
fi

echo "Asking the portal for a route"
docker run --rm -d --name "$name" -p 127.0.0.1:39080:8080 opos-portal:check >/dev/null
docker run --rm -d --name "$guarded" -p 127.0.0.1:39081:8080 \
  -e BASIC_AUTH_PASSWORD="$password" -e OPOS_COMMIT="$commit" opos-admin:check >/dev/null
cleanup() {
  docker stop "$name" "$guarded" "$served" "$head" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
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
    echo "The answer lacks: $1" >&2
    exit 1
  fi
}
expect "content-type: text/html"
expect "content-security-policy: .*connect-src 'self' $api_url"
expect "strict-transport-security:"
expect "x-content-type-options: nosniff"
# The portal runs without a commit, as a build outside a deployment does
expect "x-opos-commit: unknown"

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
  "200 -u opos:$password http://127.0.0.1:39081/"; do
  expected=${check%% *}
  # shellcheck disable=SC2086
  actual=$(answer ${check#* })
  if [ "$actual" != "$expected" ]; then
    echo "The guarded admin application answered $actual, not $expected: ${check#* }" >&2
    exit 1
  fi
done
# The commit a deployment hands over. Caddy answers a request without basic auth with its 401
# alone, none of the Caddyfile's headers on it
headers=$(curl -fsS -D - -o /dev/null -u "opos:$password" http://127.0.0.1:39081/)
expect "x-opos-commit: $commit"

# A value that is no commit's name stops the application before Caddy reads it
if docker run --rm -e OPOS_COMMIT='x" y' opos-portal:check >/dev/null 2>&1; then
  echo "The portal started with a commit that is no commit's name" >&2
  exit 1
fi

# Caddy's own environment, not the container's, which an exec inherits. Caddy holds a capability,
# which leaves its environment to a privileged root alone; the hash proves the read saw it.
if ! environ=$(docker exec --privileged -u 0 "$guarded" sh -c "tr '\\0' '\\n' </proc/1/environ") ||
  ! grep -q '^BASIC_AUTH_HASH=' <<<"$environ"; then
  echo "Caddy's environment could not be read" >&2
  exit 1
fi
if grep -q '^BASIC_AUTH_PASSWORD=' <<<"$environ"; then
  echo "The password stayed in Caddy's environment" >&2
  exit 1
fi

# The server beside the portal stops without its environment, past every import of its one file
echo "Starting the server beside the portal without its environment"
log=$(docker run --rm opos-portal-head:check 2>&1 || true)
if ! grep -q 'Invalid environment' <<<"$log"; then
  echo "$log" >&2
  echo "The server beside the portal did not reach the validation of its environment" >&2
  exit 1
fi

# The portal asks that server for its pages. The API's address is one nothing answers at, so the
# pages that would read it get the plain head; a page that reads nothing is named all the same
echo "Asking the portal for a page beside the server that answers its pages"
docker network create "$network" >/dev/null
docker run --rm -d --name "$head" --network "$network" \
  -e PORTAL_URL=https://opos-control.invalid -e API_URL="$api_url" opos-portal-head:check >/dev/null
docker run --rm -d --name "$served" --network "$network" -p 127.0.0.1:39082:8080 \
  -e HEAD_UPSTREAM="$head:8081" opos-portal:check >/dev/null
page=""
for _ in $(seq 30); do
  page=$(curl -fsS http://127.0.0.1:39082/privacy 2>/dev/null || true)
  grep -q 'og:site_name' <<<"$page" && break
  sleep 1
done
holds() {
  if ! grep -q "$1" <<<"$page"; then
    echo "$page" >&2
    echo "The page lacks: $1" >&2
    exit 1
  fi
}
holds '<meta property="og:site_name" content="OPOS" data-server-head>'
holds '<link rel="canonical" href="https://opos-control.invalid/privacy" data-server-head>'
holds '<div id="root"></div>'
# The headers are the portal's own, on a page the other server answered
headers=$(curl -fsS -D - -o /dev/null http://127.0.0.1:39082/privacy)
expect "content-type: text/html"
expect "content-security-policy: .*connect-src 'self' $api_url"
expect "cache-control: no-cache"
expect "x-opos-commit: unknown"

# A page that is not there is a 404 with the portal's document, which says so itself; a built file
# is still the portal's own to serve
status=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:39082/no/such/page)
if [ "$status" != 404 ]; then
  echo "A page that is not there answered $status, not 404" >&2
  exit 1
fi
page=$(curl -s http://127.0.0.1:39082/no/such/page)
holds '<meta name="robots" content="noindex" data-server-head>'
holds '<div id="root"></div>'
status=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:39082/assets/missing.js)
if [ "$status" != 404 ]; then
  echo "A missing built file answered $status beside the other server, not 404" >&2
  exit 1
fi

# Without that server the portal opens all the same, from its plain document and under its headers
docker stop "$head" >/dev/null
headers=$(curl -fsS -D - -o /dev/null http://127.0.0.1:39082/privacy)
expect "content-type: text/html"
expect "content-security-policy: .*connect-src 'self' $api_url"
expect "cache-control: no-cache"
page=$(curl -fsS http://127.0.0.1:39082/privacy)
holds '<div id="root"></div>'
if grep -q 'data-server-head' <<<"$page"; then
  echo "The portal answered a filled head with the server beside it stopped" >&2
  exit 1
fi

# A value that is no host and port stops the portal before Caddy reads it
if docker run --rm -e HEAD_UPSTREAM='head 8081' opos-portal:check >/dev/null 2>&1; then
  echo "The portal started with a HEAD_UPSTREAM that is no host and port" >&2
  exit 1
fi

echo "The images build, the api resolves its imports, the tools run past pnpm's check, the frontends serve their routes with their commit, behind basic auth when asked, and the portal's pages come with their head, or without it when the server beside the portal is gone"
