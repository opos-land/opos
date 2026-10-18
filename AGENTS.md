# AGENTS.md

Instructions for agents working in this repository.

## Response format

**Start every response with `--- OPOS LAND ---`.** No exceptions, regardless of topic or response length.
The prefix carries no meaning — it signals that the instructions in this file are still being
applied.

Write responses in the language the user writes in.

## Repository

OPOS — a multitenant platform for running fantasy conventions, free for conventions. The project is
at the planning stage: there is no application code yet, only tooling configuration and two
documents.

Everything in this repository is written in English.

| File | Contains |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | what we build and for whom: domain model, glossary, roles and permissions, addresses, modules, design, languages and markets, personal data, MVP scope |
| [docs/PLAN.md](docs/PLAN.md) | how to build it: architecture, stack, database schema, API contract, applications, Supabase, environments, deployment, tests |

## Meeting decisions take precedence

Decisions from team meetings override what the repository says — the documents, this file and the
tooling configuration. When the user brings a meeting note:

1. Carry every decision into the repository following the prime rule below: both documents, this
   file and the configuration it affects.
2. Where the note contradicts the repository, the note wins.
3. Where the note is ambiguous, or a decision forces a choice the note does not make, ask before
   writing. Never settle a contradiction silently.
4. The note itself does not enter the repository — only its decisions, written as the target state.
5. No personal names in the documents; describe roles instead.

## Prime rule: update both documents together

**Every change agreed in a conversation lands in both documents within the same turn.** Never end
a turn with one file updated and the other not — even when the change "only concerns engineering"
or "only concerns the product". The other file almost always contains a statement that just
stopped being true.

Procedure for every substantive change:

1. Decide which side the change belongs to (table below).
2. Apply it there.
3. Read the other file looking for sentences the change invalidates — and fix them.
4. Check terminology against the [glossary](docs/PRODUCT.md#3-glossary).
5. Check that links and chapter numbers on both sides still point where they should.
6. In the response to the user, state what changed in each file.

### What goes where

| Change concerns | PRODUCT.md | PLAN.md |
|---|---|---|
| new feature or a change in MVP scope | yes | yes — contract, apps, tests |
| name of a domain concept | yes — glossary | yes — mapping to tables |
| permission rule, who can do what | yes | yes — guards, contract |
| new endpoint | only when it changes product behaviour | yes |
| database column, index, migration | no | yes |
| library choice, version, configuration | no | yes |
| language, market, time zone | yes | yes — schema, i18n |
| personal data, retention, GDPR | yes | yes — schema, backups |
| address, domain, who sets it | yes | yes — routing, Traefik |

A change that lands only in PLAN.md still requires reviewing PRODUCT.md — step 3 of the procedure
always applies.

## Document style

- **English everywhere.** Documents, code, comments in code and configuration files, identifiers,
  route paths, source messages, branch names and commits. The only Polish in the repository is the
  `pl` translation catalog. No emoji in documents, code or commits.
- The comment rule has no exceptions: `//`, `/* */`, `#`, `--`, JSDoc, TODO and FIXME are always
  English, including in `lefthook.yml`, `docker-compose*.yml`, SQL migrations and `.env.example`.
  The only exception is `.md` files, which are documentation, not code.
- **Write "how it is meant to be", not "what we changed and why".** The documents describe the
  target state. They contain no change history, no lists of decisions with alternatives, no
  "why this way" chapters and no comparisons with a previous version. Rationale stays in the
  conversation.
- Exception: a short operational note is fine when it is an instruction rather than a
  justification ("step 3 before step 1 ends in a Let's Encrypt rate limit").
- Tables instead of paragraphs wherever the content has structure.
- Specifics instead of generalities: column names, status codes, paths, limits.
- Tables of contents and anchors updated together with headings.
- Terminology strictly from the glossary: tenant, edition, event, attendee, admin, org, head, user,
  core, module, booth.

## Commits

Conventional Commits, in English, atomic. Enforced by commitlint in the `commit-msg` hook.

```
<type>(<scope>): <subject>

<body — optional, explains "why", not "what">

<footer — BREAKING CHANGE, issue references>
```

Subject in the imperative mood (`add`, not `added`), lowercase, no trailing period, header up to
72 characters.

| Type | When |
|---|---|
| `feat` | new feature or new endpoint |
| `fix` | bug fix |
| `refactor` | structural change without behaviour change |
| `perf` | optimisation |
| `test` | integration tests, e2e, fixtures |
| `docs` | project documents, README |
| `chore` | dependencies, configuration, tooling |
| `build` | Dockerfile, compose, bundlers |
| `ci` | GitHub Actions workflows |
| `revert` | reverting a commit |

Scopes: `api`, `panel`, `portal`, `cms`, `db`, `contract`, `i18n`, `e2e`, `infra`, `repo`.
`infra` covers Traefik, compose and `infra/supabase`. The scope is optional, but when present it
must come from this list — otherwise commitlint rejects the message. A new scope goes into `commitlint.config.mjs` and into this table.

Rules commitlint will not check, but which still apply:

- A Drizzle migration goes in the same commit as the schema change that produced it.
- `.po` catalogs go in the same commit as the code introducing the messages; compiled catalogs
  are build artifacts and never enter the repository.
- A change in `packages/contract` that breaks consumers: `!` after the scope and a
  `BREAKING CHANGE:` footer.
- Every commit leaves the repository green — not just the end of the branch.
- A refactor does not travel in the same commit as a feature.
- The message is in English; commitlint will not verify that.

```
feat(db): add tenant and edition schema
feat(api): add tenant and edition permission guards
fix(api): reject edition membership pointing at another tenant
test(e2e): cover organizer invitation flow
chore(repo): pin node and pnpm versions
```

Branches follow the same scheme: `feat/tenant-rls`, `fix/refresh-rotation`.

## Working with code

There is no application code yet — the repository holds tooling configuration and the documents.
Once code exists, the [execution rules](docs/PLAN.md#18-execution-rules) from PLAN.md apply: pinned
Node and pnpm versions, every user-facing string inside a Lingui macro, green typecheck, lint and
tests before every PR.

`pnpm install` installs dependencies and wires up the hooks. Dependencies younger than 7 days are
rejected by `minimumReleaseAge` — that is policy, not a failure.

**No AI-generated graphics.** Never generate images, illustrations, logos or icons, and never add
them to the repository. UI follows the designer's designs; where none exists yet, use plain blocks
and real copy ([PRODUCT.md 8](docs/PRODUCT.md#8-design-and-public-image)). Do not ship
component-library defaults as a finished look.

The plan does not prescribe an order of work — it follows from dependencies between packages:
the Supabase services (`infra/supabase`) before `packages/db`, because the schema references
`auth.users`; `packages/db` and `packages/contract` before the apps, the contract before the
frontends. The scope to cover is set by [MVP scope](docs/PRODUCT.md#11-mvp-scope-vs-beyond-mvp),
and the readiness criteria by [tests](docs/PLAN.md#16-tests) and the
[smoke test](docs/PLAN.md#17-smoke-test).
