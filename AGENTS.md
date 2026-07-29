# AGENTS.md

Instructions for agents working in this repository.

## Response format

**Start every response with `--- OPOS LAND ---`.** No exceptions, regardless of topic or response length.
The prefix carries no meaning — it signals that the instructions in this file are still being
applied.

Write responses in the language the user writes in.

## Repository

OPOS — a multitenant SaaS for running fantasy conventions. The project is at the planning stage:
there is no application code yet, only tooling configuration and the documents.

The product is a **core plus modules**. The two core documents describe what every module rests on;
each module is described end to end — product behaviour and implementation together — in one file
of its own.

Everything in this repository is written in English.

| File | Contains |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | the core, what we build and for whom: domain model, glossary, modules, roles and permissions, addresses, languages and markets, personal data, MVP scope |
| [docs/PLAN.md](docs/PLAN.md) | the core, how to build it: architecture, stack, core database schema, contract conventions, applications, environments, deployment, tests |
| [docs/modules/README.md](docs/modules/README.md) | what a module is, the module list, dependencies, shared patterns, and the template every module document follows |
| `docs/modules/<module>.md` | one module: behaviour, terms, flows, permissions, data, endpoints, and what it deliberately does not do |

## Prime rule: leave no document behind

**Every change agreed in a conversation lands in every document it touches, within the same turn.**
Never end a turn with one file updated and another not — even when the change "only concerns
engineering" or "only concerns the product". The other files almost always contain a statement that
just stopped being true.

A change belongs to one of two places, and the answer decides what else has to be read:

- **A module** — its file in `docs/modules/` is the one place its behaviour, data and endpoints are
  written down. Product and engineering live there together, so there is nothing to synchronise
  inside a module.
- **The core** — PRODUCT.md and PLAN.md, which still travel as a pair, because they split the same
  subject into what and how.

Procedure for every substantive change:

1. Decide whether it belongs to a module or to the core (table below).
2. Apply it there.
3. Read what is left looking for sentences the change invalidates — and fix them. A module change
   almost always touches the module list, the glossary or the MVP scope; a core change almost
   always touches something a module document assumed.
4. Check terminology against the [glossary](docs/PRODUCT.md#3-glossary). Product-wide terms belong
   there; a term only one module uses stays in that module's file.
5. Check that links and chapter numbers on every side still point where they should.
6. In the response to the user, state what changed in each file.

A fact has exactly one home. The core never repeats what a module document says — it points at it.
A module document never repeats what the core says — it assumes it.

### What goes where

| Change concerns | Module file | PRODUCT.md | PLAN.md |
|---|---|---|---|
| a new module | yes — the whole file | yes — module list, glossary, MVP scope | yes — `MODULES`, tree, seed, tests |
| behaviour, flow or screen inside one module | yes | no | no |
| a module's table, column, index or endpoint | yes | no | no |
| what `read` and `write` mean for a module | yes | no | no |
| data flowing between two modules | yes — both files | no | no |
| the permission model itself, the levels, anti-escalation | no | yes | yes — guards, contract |
| a name in the product-wide vocabulary | mention it | yes — glossary | yes — mapping to tables |
| a change in MVP scope | no | yes | yes — seed, tests |
| a core table, the contract conventions, RLS | no | no | yes |
| library choice, version, configuration | no | no | yes |
| language, market, time zone | no | yes | yes — schema, i18n |
| personal data, retention, GDPR | yes — what the module stores | yes | yes — schema, backups |
| address, domain, who sets it | no | yes | yes — routing, Traefik |

A change that lands in one file only still requires reading the others — step 3 of the procedure
always applies. In particular: a module that starts storing a new kind of personal data always
reaches PRODUCT.md, and a module that adds a table always obeys the RLS rule in PLAN.md.

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
- Terminology strictly from the glossary: tenant, edition, event, attendee, admin, org, head, user.

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
| `build` | Dockerfile, compose, EAS, bundlers |
| `ci` | GitHub Actions workflows |
| `revert` | reverting a commit |

Scopes: `api`, `panel`, `portal`, `cms`, `mobile`, `db`, `contract`, `i18n`, `e2e`, `infra`,
`repo`. The scope is optional, but when present it must come from this list — otherwise commitlint
rejects the message. A new scope goes into `commitlint.config.mjs` and into this table.

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
fix(api): reject an edition permission pointing at another tenant
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

The plan does not prescribe an order of work — it follows from dependencies between packages:
`packages/db` and `packages/contract` before the apps, the contract before the frontends. The
scope to cover is set by [MVP scope](docs/PRODUCT.md#11-mvp-scope-vs-beyond-mvp), and the readiness
criteria by [tests](docs/PLAN.md#16-tests) and the [smoke test](docs/PLAN.md#17-smoke-test).
