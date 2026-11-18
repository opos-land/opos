#!/usr/bin/env bash
# The key provider OpenTofu runs to encrypt and decrypt a unit's state and plans: it hands over the
# passphrase infra/bootstrap.sh stored in the project's Secret Manager, which the pbkdf2 key provider
# of infra/root.hcl turns into the key. It speaks OpenTofu's external key provider protocol: a
# header, then the stored metadata on its input, then the keys on its output, nothing else.
#
#   infra/state-passphrase.sh <project-id> <region> <revision>
#
# scw signs in with the profile infra/run.sh names.
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: infra/state-passphrase.sh <project-id> <region> <revision>" >&2
  exit 2
fi

echo '{"magic":"OpenTofu-External-Key-Provider","version":1}'

# "null" when OpenTofu only encrypts; then no decryption key is handed back
meta=$(cat)

scw secret version access-by-path secret-path=/ secret-name=tofu-state-passphrase \
  revision="$3" project-id="$1" region="$2" -o json |
  META="$meta" node -e '
    // Secret Manager hands out the value in base64, the form the protocol wants it in
    const { data } = JSON.parse(require("node:fs").readFileSync(0, "utf8"))
    if (!data) process.exit(1)
    const keys = { encryption_key: data }
    if (process.env.META !== "null") keys.decryption_key = data
    process.stdout.write(JSON.stringify({ keys, meta: { external_data: {} } }))
  '
