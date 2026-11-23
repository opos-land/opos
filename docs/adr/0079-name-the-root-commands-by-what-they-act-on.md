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
- Nineteen descriptions wrapped in a 120-column terminal, `deploy:apply` over five rows: they held
  what each flag does and who may run the command, a rule repeated in every deploy command's line.
  `mise run <name> --help` printed mise's definition of the task and said it took no arguments.

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
- A task's description says what the command does and then its arguments, on one row of a
  120-column terminal. Who may run the command and what each flag does are its help: a script that
  takes arguments prints it on `--help`, and its task hands every argument on (`raw_args`), so
  `mise run <name> --help` prints the same.

## Alternatives

- **`local:*` for the stack.** `local` already runs the applications in watch mode.
- **`dev:*` for the stack.** Dev is the shared environment the documents name.
- **The offline commands kept under `deploy:*`.** One prefix for everything about `infra/`, but a
  check that needs no sign-in would sit in the list beside the commands an agent never runs.
- **Who may run a command kept in its description.** Seen where a command is chosen, but each row
  of the list wraps, and the rule is written once per command instead of once in its help.
- **A usage spec per task for its help.** Turned down in
  [0024](0024-list-the-root-commands-as-mise-tasks-that-run-the-pnpm-scripts.md): with a spec,
  mise no longer hands the arguments to the root script, and each flag is written twice.

## Consequences

- CI, the hooks, the `.env.example` templates and the documents name the new commands; accepted
  records and implemented specs keep the names of their date.
- A checkout keeps its `.env` files and its stack: only the names of the commands change.
- The deploy commands and `infra:graph` answer `--help`; the `db:*` scripts that take arguments do
  not yet, and their tasks keep mise's own `--help` until they do.
- `scripts/mise-tasks.test.mjs` keeps every description on one row and hands `--help` on exactly to
  the commands whose script answers it.
