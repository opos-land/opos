# 0021. Run the shadcn/ui skill through the CLI each application pins, without its MCP server

- Status: Accepted
- Date: 2026-11-09

## Context

shadcn/ui publishes an agent skill and an MCP server in its CLI. Their instructions run
`npx shadcn@latest`, and the skill runs `shadcn info` by itself each time it loads, with permission
to run the CLI again without asking. `npx` fetches whatever version was published last, past the
7-day `minimumReleaseAge` of pnpm
([0015](0015-run-a-pnpm-turborepo-monorepo-with-pinned-tools.md)). The panel and the portal each
pin the CLI and have their own `components.json`, in the `base-nova` style on Base UI
([0020](0020-build-the-frontends-from-shadcn-ui-with-its-default-look.md)).

The MCP server of CLI 4.23.0, even started through the pinned CLI, asks the registry for items
without the project's style: the component code and examples it returns are those of the Radix
style `new-york-v4`, with `asChild` and a `radix-ui` dependency, and the add command it gives for
every item is `pnpm dlx shadcn@latest`.

## Decision

- The skill lives in `.claude/skills/shadcn`, installed with
  `skills add shadcn/ui --skill shadcn --agent claude-code --copy`; `skills-lock.json` records its
  source. Its allowed tools and its injected context run `pnpm --dir apps/<app> exec shadcn`, and it
  tells the agent to run the CLI so. Its logos, Codex manifest, evals and guide to the MCP server
  are left out.
- No MCP server runs the CLI: the CLI's own `search`, `view`, `docs` and `add --dry-run`, run as
  the skill says, answer what the server would, in the project's style.
- `.claude/shadcn.test.mjs` fails when the skill runs anything else or an MCP server runs the CLI.

The rule is in [ARCHITECTURE.md, Tooling and versions](../ARCHITECTURE.md#tooling-and-versions).

## Alternatives

- **The skill as published.** Each load would run the newest CLI, unreviewed and possibly hours old.
- **The MCP server through the pinned CLI**, trusted for search and lists only. Every answer would
  still carry Radix code and an unpinned command, and an agent would have to know to ignore them.
- **A global install of the skill or the server.** Unpinned, and not shared with the team.
- **No skill.** An agent would guess component APIs that the CLI's documentation and registry
  answer.

## Consequences

- Updating the skill, with `skills update` or `skills add` again, drops the local changes and brings
  back the guide to the MCP server; the test names them, and they are reapplied.
- A CLI whose server reads the project's style and runs the pinned CLI needs a new record before
  the server is configured.
- The pre-commit lint skips the skill's assets, which belong to no package.
