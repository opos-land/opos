# 0079. Name the root commands by what they act on

- Status: Proposed
- Date: 2026-11-23

## Context

[0024](0024-list-the-root-commands-as-mise-tasks-that-run-the-pnpm-scripts.md) lists the root
commands as mise tasks, sorted by name, so a command's prefix is the only grouping `mise tasks`
shows. The prefixes had grown apart from what the commands act on:

- `infra:init`, `infra:up`, `infra:down` and `infra:reset` run the local stack, while `infra/`, the
  `infra` commit scope and the infrastructure in the documents mean the deployment, whose commands
  are `deploy:*`.
- `deploy:check`, `deploy:images`, `deploy:lock` and `deploy:graph` read or build the code in
  `infra/` on the machine they run on: they sign in nowhere and change no environment, yet sit
  beside the commands that apply and destroy one.
- A command's parts were joined three ways: `db:admin:grant`, `deploy:grant` with
  `deploy:grant:revoke`, and `deploy:secret-set`.
- A command was named apart from its script: `deploy:graph` ran `scripts/deploy-graph.mjs` beside
  `scripts/deploy.mjs`, which runs the other deploy commands.

## Decision

- A root command's prefix names what it acts on:
  - none, `test`, `format`, `i18n` and `db`: the code of the applications and packages, and their
    database;
  - `stack`: the local stack of a checkout, its Supabase, bucket and image server;
  - `infra`: the code in `infra/`, on the machine it runs on, without a sign-in;
  - `deploy`: a deployed environment, under the operator's own identity.
- The parts of a name are joined by `:` alone, the more general first: `deploy:access:grant`,
  `deploy:secret:set`.
- A command has one name everywhere it is named: its root script, its mise task, its script's file
  when it has one of its own (`scripts/stack-init.mjs`), the usage and hints its script prints, and
  the documents.

## Alternatives

- **`local:*` for the stack.** `local` already runs the applications in watch mode.
- **`dev:*` for the stack.** Dev is the shared environment the documents name.
- **The offline commands kept under `deploy:*`.** One prefix for everything about `infra/`, but a
  check that needs no sign-in would sit in the list beside the commands an agent never runs.

## Consequences

- CI, the hooks, the `.env.example` templates and the documents name the new commands; accepted
  records and implemented specs keep the names of their date.
- A checkout keeps its `.env` files and its stack: only the names of the commands change.
