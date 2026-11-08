# 0021. Run the shadcn/ui skill and MCP server through the CLI each application pins

- Status: Accepted
- Date: 2026-11-08

## Context

shadcn/ui publishes an agent skill and an MCP server in its CLI. Their instructions run
`npx shadcn@latest`, and the skill runs `shadcn info` by itself each time it loads, with permission
to run the CLI again without asking. `npx` fetches whatever version was published last, past the
7-day `minimumReleaseAge` of pnpm
([0015](0015-run-a-pnpm-turborepo-monorepo-with-pinned-tools.md)). The panel and the portal each
pin the CLI and have their own `components.json`
([0020](0020-build-the-frontends-from-shadcn-ui-with-its-default-look.md)).

## Decision

- The skill lives in `.claude/skills/shadcn`, installed with
  `skills add shadcn/ui --skill shadcn --agent claude-code --copy`; `skills-lock.json` records its
  source. Its allowed tools and its injected context run `pnpm --dir apps/<app> exec shadcn`, and it
  tells the agent to run the CLI so. Its logos, Codex manifest and evals are left out.
- `.mcp.json` starts the CLI's MCP server the same way, from the panel.
- `.claude/shadcn.test.mjs` fails when either runs anything else.

The rule is in [ARCHITECTURE.md, Tooling and versions](../ARCHITECTURE.md#tooling-and-versions).

## Alternatives

- **The skill as published.** Each load would run the newest CLI, unreviewed and possibly hours old.
- **A global install of the skill or the server.** Unpinned, and not shared with the team.
- **No skill or server.** An agent would guess component APIs that the CLI's documentation and
  registry answer.

## Consequences

- Updating the skill, with `skills update` or `skills add` again, drops the local changes; the test
  names them, and they are reapplied.
- The MCP server reads the panel's `components.json`; both applications share its registry setup.
- The pre-commit lint skips the skill's assets, which belong to no package.
