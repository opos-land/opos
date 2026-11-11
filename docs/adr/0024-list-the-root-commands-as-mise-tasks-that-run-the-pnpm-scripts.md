# 0024. List the root commands as mise tasks that run the pnpm scripts

- Status: Accepted
- Date: 2026-11-11

## Context

The root `package.json` holds the commands of the repository, and `pnpm run` lists them only by
name and command. Most commands are `turbo run <task>`, which says nothing of what they do, and
`package.json` takes no description or comment. mise already pins Node and the Supabase CLI on
every machine and in CI ([0015](0015-run-a-pnpm-turborepo-monorepo-with-pinned-tools.md)), and its
tasks carry a description that `mise tasks` lists. The documents, CI, the git hooks and the scripts'
own messages name every command as `pnpm <name>`.

## Decision

- The root scripts stay the only definition of each command and the complete interface: every
  command runs as `pnpm <name>` without mise tasks, and the documents, CI and the hooks name it so.
- Each root script but a lifecycle one has a mise task of the same name that runs `pnpm <name>`,
  says in one line what it does and passes its arguments through. A command that takes arguments
  names them in its description. `mise tasks` lists the commands, `mise run` opens a picker, and a
  task started in any directory runs at the root.
- turbo stays the runner of the packages' tasks: a mise task declares no sources, outputs or
  dependencies, and mise caches nothing.
- The tasks live in `mise-tasks.toml`, which `mise.toml` includes: `mise.toml` is in turbo's global
  hash, and a description must not throw away the cache.
- `scripts/mise-tasks.test.mjs` keeps the scripts and the tasks equal.

## Alternatives

- **Descriptions in `package.json` printed by a help script.** One more script of our own to keep,
  and no picker.
- **The commands moved into mise, the root scripts dropped.** One list instead of two, but every
  `pnpm <name>` in the documents, CI, the hooks and the scripts' messages changes, and no command
  runs without mise tasks.
- **Tasks that run `turbo run <task>` directly.** One process less, but each command written twice,
  and the copies drift.
- **A usage spec for each command that takes arguments.** `--help` and completion through mise, but
  every flag written a second time beside the script's own parser, and the help reaches only those
  who run mise.
- **mise `sources` and `outputs`.** A second cache over turbo's, with rules of its own.

## Consequences

- A new root script gets its task in the same change, or `pnpm test:scripts` fails.
- `--help` is not handled: a script that takes arguments prints its usage line when one is missing.
- A task may run something other than a root script; only a task that runs pnpm must run the root
  script of its name.
