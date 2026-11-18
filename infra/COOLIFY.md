# Coolify

Dev runs on the team's Coolify server, which is shared: its owner makes Dev's project, and the
units change only what is inside it
([0033](../docs/adr/0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md)).
The steps are for Dev; another environment follows them with its own names. They are step 7 of
[setting up an environment](README.md#set-up-an-environment).

## The project

Ask the owner of the server to make Dev's project, `opos-dev`, and to set API access to Enabled
(Settings, Advanced).

## The tokens

Create Coolify's two API tokens and enter them. Under Keys & Tokens, API Tokens, select New token,
with access to Dev's project alone and an expiry of at most a year; before one lapses, enter a new
token the same way.

| Secret                  | Permissions                                           | Used by                      |
| ----------------------- | ----------------------------------------------------- | ---------------------------- |
| `coolify-api-token`     | `read`, `read:sensitive`, `write`, `delete`, `deploy` | OpenTofu, on your machine    |
| `coolify-release-token` | `read`, `deploy`                                      | the release job, from GitHub |

```sh
mise run deploy:secret-set dev coolify-api-token
mise run deploy:secret-set dev coolify-release-token
```

Coolify creates a resource on the server it runs on only for an admin of the server's team, with a
token that reaches every project there. So the owner of the server runs each apply that creates a
service, the first of `cache` and `deployment` and any that replaces one, with such a token of their
own, passed for that command alone and kept nowhere else:

```sh
COOLIFY_TOKEN=<the owner's token> mise run deploy:apply dev --no-plan
```

While `COOLIFY_TOKEN` is set, the units use it instead of `coolify-api-token`. Every other run, by
any operator, uses `coolify-api-token`: changing, deploying and deleting what exists needs no more.

## The addresses

Write the dashboard's address, the server's id (Servers, then the server's page), its public
addresses and the project's id (in the address of the project's page) into the `coolify` block of
`live/dev/env.yaml`.

## IPv6

A Free Supabase project's database is reached over IPv6 alone, and Coolify makes its networks
without it. Ask the owner of the server to give Docker's networks IPv6: in
`/etc/docker/daemon.json`, Docker 27 or later,

```json
{ "default-network-opts": { "bridge": { "com.docker.network.enable_ipv6": "true" } } }
```

then restart Docker. Every bridge network made after it, as Coolify makes one per deployment, gets
a private IPv6 subnet whose traffic leaves through the server's address; networks made before keep
none. Check it, with any project's reference:

```sh
docker network create ipv6-check
docker run --rm --network ipv6-check alpine nc -zv -w 5 db.<reference>.supabase.co 5432
docker network rm ipv6-check
```

If the deployment's tools container cannot connect, its network was made before: destroy and apply
the `deployment` unit, so that Coolify makes the network again.
