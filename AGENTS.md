# AGENTS.md

Instructions for agents working in this repository.

## Response format

**Start every response with `--- OPOS LAND ---`.** No exceptions, regardless of topic or response length.
The prefix carries no meaning — it signals that the instructions in this file are still being
applied.

Write responses in the language the user writes in.

## Repository

OPOS — a multitenant platform for running fantasy conventions, free for conventions. `apps/api`, the
core of `apps/panel`, the account screens of `apps/portal`, the sign-in and the conventions list of
`apps/admin`, and the shared packages they need exist; deployment and the modules waiting for their
domain owner are still to be built. Everything in this repository is written in English.

| File | Holds |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | what we build and for whom: glossary, tenant and edition, roles and permissions, addresses, modules, design, languages, personal data, MVP scope |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | the rules of the code that no single file shows: boundaries, tenant isolation, invariants, permissions, sessions, conventions, environments, the rules the modules waiting for their owner keep, the checklist for adding a feature |
| [docs/adr](docs/adr/README.md) | decision records: one decision each, with its context, the alternatives turned down and its consequences |
| [docs/specs](docs/specs/README.md) | feature specs: a feature's business rules, shape and tests, accepted before its code, frozen once it is built |
| [docs/briefs](docs/briefs/README.md) | working material that binds nothing: briefs, reviews, research before a spec; everything above holds over it ([0028](docs/adr/0028-keep-non-binding-briefs-in-docs-briefs.md)) |
| [CONTRIBUTORS.md](CONTRIBUTORS.md) | who holds each role the documents name, such as each module's domain owner; the one file naming people ([0027](docs/adr/0027-name-the-holders-of-roles-in-contributors-md.md)) |

## Documents hold rules, the code holds the rest

The code and its tests are the documentation of how things work: read them. The two documents keep
only what the code cannot say — the intent, the business rules and the rules whose breach is not
visible in one file. A detail the code holds (a column, a value, a screen's behaviour, a list of
files) never enters them.

- A change that alters a rule one of the documents states updates that document in the same change;
  a change of product behaviour also reads the other document for a sentence it makes untrue. The
  `docs-sync` skill is the procedure.
- Where a document and the code disagree, say so and ask which is right; never settle it silently.
- A code comment explains its code on its own; it cites a document only by file and heading
  (`docs/ARCHITECTURE.md, Tenant isolation`).

**Decisions get records, features get specs.** What is decided but not built, and why anything is
the way it is, lives beside the documents
([0001](docs/adr/0001-record-decisions-and-specify-features.md)):

- A decision that is hard to reverse or that the code does not explain — a part of the stack, a
  boundary, a security mechanism, a hosting choice, a way of working, an alternative turned down —
  gets a record in `docs/adr/` in the change that makes it. An accepted record is not rewritten: a
  new one supersedes it. The document that states the rule links the record.
- A new module, table, group of routes or flow across screens starts with a spec in `docs/specs/`,
  accepted by its domain owner and the team before its code. The PR that completes the feature
  carries its lasting rules into the documents and its decisions into records, and marks the spec
  `Implemented`; from then on it is frozen.
- A record and an implemented spec hold what was decided at their date: where they disagree with
  the documents or the code, those hold, and the disagreement needs no report. A record marked
  `reconstructed, to confirm` holds reasons inferred later; correct them when the user knows the
  real ones.

**Meeting decisions take precedence** over the documents, this file and the configuration. When the
user brings a meeting note, carry each decision into what it affects, as the target state; where the
note is ambiguous or contradicts itself, ask before writing. The note itself never enters the
repository, and personal names only in [CONTRIBUTORS.md](CONTRIBUTORS.md): roles instead.

**Business rules come from the domain owner.** Each module's rules are set by its domain owner
([PRODUCT.md 7](docs/PRODUCT.md#7-modules)). A module still waiting for its owner — today reviews,
tickets with payments and the scanner, and attendee registrations — is not built, and its tables,
routes, screens and flows are not invented: the documents hold only the rules any shape of it keeps
([architecture](docs/ARCHITECTURE.md#modules-waiting-for-their-domain-owner)). Asked to build one,
say so and ask for the owner's rules first; they land in the module's spec before the code.

## Document style

- **English everywhere** — documents, code, comments (`//`, `/* */`, `#`, `--`, JSDoc, TODO,
  including `lefthook.yml`, compose files, SQL migrations and `.env.example`), identifiers, route
  paths, source messages, branches and commits. The only Polish in the repository is the `pl`
  translation catalog and the renderings a brief quotes. No emoji.
- The documents and the specs state the target state only: no change history, no alternatives, no
  "why" chapters; those belong in a decision record. A short operational instruction is fine.
- Tables where the content has structure; anchors updated together with headings.
- Terminology strictly from the glossary: tenant, edition, programme item, speaker, like, review,
  ticket type, order, ticket, scanner, attendee, admin, org, head, user, core, module, booth.

## Commits

Conventional Commits, in English, atomic, enforced by commitlint in the `commit-msg` hook:
`<type>(<scope>): <subject>`, the subject imperative and lowercase with no trailing period, the
header up to 72 characters; an optional body says why.

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

Scopes: `api`, `panel`, `portal`, `admin`, `cms`, `db`, `contract`, `i18n`, `e2e`, `infra` (Traefik,
compose, `infra/`, `supabase/`), `repo`. A new scope goes into `commitlint.config.mjs` and this
list.

- A Drizzle migration goes in the same commit as the schema change that produced it.
- `.po` catalogs with the `pl` translations go in the same commit as the code introducing the
  messages; compiled catalogs never enter the repository.
- A change in `packages/contract` that breaks consumers: `!` after the scope and a
  `BREAKING CHANGE:` footer.
- Every commit leaves the repository green; a refactor does not travel with a feature.

Branches follow the same scheme (`feat/tenant-rls`). They start from `develop` and their PRs target
`develop`; `main` changes only through a PR from `develop` ([CI](docs/ARCHITECTURE.md#ci)). Never
push to `main` directly.

## Working with code

`mise install` installs Node, enables corepack for pnpm and runs `pnpm install`, which installs
dependencies and wires up the hooks. `mise tasks` lists the root commands with what each does; every
one also runs as `pnpm <name>`, the form the documents use. Dependencies younger than 7 days are
rejected by `minimumReleaseAge` — that is policy, not a failure
([versions](docs/ARCHITECTURE.md#tooling-and-versions)). The API tests need
the database: `pnpm infra:init` once in a new checkout, then `pnpm infra:up`. `pnpm test:e2e` also
needs `pnpm db:migrate && pnpm db:seed` and Chromium (`pnpm --filter @opos/e2e exec playwright
install chromium`), and does not run beside the API tests. Before every PR: typecheck, lint and
tests green.

Every user-facing string sits in a Lingui macro and is translated into `pl` in the same commit,
reusing the glossary renderings ([localization](docs/ARCHITECTURE.md#localization)).

**CI gates** ([CI](docs/ARCHITECTURE.md#ci)): a PR into `main` needs the jobs `check`, `e2e` and
`secrets` green; `secrets` scans the whole history, so a secret in any commit fails it. An action is
pinned by a full commit hash, and `${{ github.* }}` never appears in a `run` step: it goes through
`env`.

**The seed follows the schema.** A change that adds a table, a column without a default, a
permission or a role, or a data state the tests rely on updates
[packages/db/src/seed.ts](packages/db/src/seed.ts) in the same PR. Run `pnpm db:seed` twice before
the PR; `packages/db/test/seed.test.ts` fails when the second run changes a row count.

**Tests sit by what they need.** A unit test goes next to the file it tests as `<name>.test.ts`
(`.test.js` in `packages/eslint-config`); an integration test, which needs Postgres, Supabase Auth or
HTTP, goes into the `test/` directory of its package or application; an e2e test into `e2e`. New
code with logic of its own gets a unit test in the same commit.

### Tests first

Every change of code starts with its test: write or change the test, watch it fail for the reason
the change addresses, then change the code. A rule that already holds gets a test that passes at
once — break the code on purpose once to see the test catch it.

| Area | Code | Its tests |
|---|---|---|
| `rls` | `packages/db/drizzle/*.sql`, `packages/db/src/schema/`, `packages/db/src/{rls,verify,tenants,client,roles,migration-url}.ts`, `packages/db/src/scripts/roles.ts` | `packages/db/test/*.test.ts` |
| `rbac` | `apps/api/src/common/{permissions,als,guards,database,decorators}/`, `apps/api/src/modules/` but `mail/` and `health/`, `apps/api/src/app.module.ts`, `packages/contract/src/*.ts` but `errors.ts` and `index.ts` | `apps/api/test/*.test.ts`, `apps/api/src/**/*.test.ts` |
| `api`, `panel`, `portal`, `admin` | the rest of `apps/<name>/` | a `*.test.*` anywhere in the same application |
| `db`, `contract`, `i18n`, `eslint-config` | the rest of `packages/<name>/` | a `*.test.*` anywhere in the same package |
| `scripts`, `claude` | `scripts/`, `.claude/` | a `*.test.*` in the same directory tree, run by `pnpm test:scripts` |
| `unlisted` | code anywhere else | none: a new directory of code gets its area here and in the script first |

Code is a script or SQL file. Tests and what serves them (`test/` helpers, `fixtures/`, the `e2e`
package), type declarations, tool configuration files, `locales/` catalogs and built output are not.
A file belongs to the first area that matches it. A deleted test, or a test file with no `describe`,
`it` or `test` call, is no test; deleted or moved-out code is a change of its area.

[scripts/tests-first.mjs](scripts/tests-first.mjs) holds this table and enforces it in the Claude
Code hooks ([.claude/settings.json](.claude/settings.json): an `Edit` or `Write` of an area's code is
refused while no test of that area changed; after a `Bash` command it reports such a change), in
lefthook `commit-msg` and in CI on every PR not into `main`, commit by commit. The hooks fail closed
and stand aside during a merge, rebase, cherry-pick or revert; a broken script is restored with
`! git restore scripts/tests-first.mjs`.

A change that needs no test — a rename, a comment, a moved import — says why in a
`No-Test-Reason: <reason>` trailer of its commit message. An agent the hook refuses asks the user
instead of working around it. A moved area path or a new directory of code changes the table here
and in the script together.

**Gates.** [.claude/hooks/migration-reminder.mjs](.claude/hooks/migration-reminder.mjs) hands the
rules of a migration as context after it is edited. The permissions in
[.claude/settings.json](.claude/settings.json) deny reading the real `.env` files and the Supabase
signing keys (the `.env.example` templates stay readable) and ask the user before an edit of the
settings, `.claude/agents`, `.claude/hooks`, `scripts/tests-first.mjs`, `scripts/check-migrations.mjs`,
`scripts/bff-boundary.mjs`, `lefthook.yml`, `.github/workflows` or `.github/rulesets`.
[.claude/agent-docs.test.mjs](.claude/agent-docs.test.mjs) checks that the paths this file and the
agent files cite exist and that the area names here equal those of the script.

**Reviewers.** Before a PR, run the `tenant-isolation-reviewer` agent when the change touches
`packages/db` or `apps/api`, and the `i18n-reviewer` agent when it touches user-facing text, a `.po`
catalog or `packages/i18n`. Both only report; fix what they find first.

**The panel, the portal and the admin application never talk to Supabase.** The API is their only
backend: no `@supabase/*` package, no Supabase address or key, no `VITE_*` variable naming Supabase.
The `react` ESLint preset and [scripts/bff-boundary.mjs](scripts/bff-boundary.mjs) refuse a breach
in a hook, in lefthook `pre-commit` and in CI
([boundary](docs/ARCHITECTURE.md#applications-and-packages)). A breach is fixed in the application,
never allowed by an exception.

**Every page names itself in the browser tab** through `usePageTitle` of `shared/lib/page-title.ts`,
called before the page's first `return`; `src/app/pages.test.ts` of each application fails on a page
that does not ([frontends](docs/ARCHITECTURE.md#frontends)).

**Every write tells its outcome in a notification**: a success, a warning for a refusal the member
can act on, an error for a failure. The query client of each application notifies every mutation; a
new one names its success in `meta.success` when "The changes are saved." says too little, and a
write outside a mutation calls `notifySuccess` or `notifyFailure` of `shared/lib/notify.ts`. Beside
a form stays only the validation of its fields
([0022](docs/adr/0022-tell-the-outcome-of-every-write-in-a-notification.md)).

**An action no screen can undo asks first in a modal** that names what goes, says what goes with it
and that it cannot be undone: `IrreversibleAction` of `shared/ui`, or its `alert-dialog` composed
the same way when the action needs more than one press. A change the same screen reverses asks
nothing ([0023](docs/adr/0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md)).

**A tracker runs only through the consent banner.** Anything the portal does not strictly need for
what the visitor asked is a tracker: analytics, an advertising pixel, a screen recorder, a
third-party embed, a script, stylesheet or font from another origin, and the cookies or browser
storage of such a tool. It becomes an entry of `TRACKERS` in
[apps/portal/src/features/consent/trackers.ts](apps/portal/src/features/consent/trackers.ts), its
script loaded in `load` through `loadScript`, its purpose in a Lingui macro with its `pl`
translation, its cookies named; the banner, the privacy settings and the withdrawal then cover it
with no change, and the banner shows only while the list holds an entry. Never a tag manager, which
loads tools out of the list's sight. The first tracker is a product decision: ask before adding it,
and change `docs/PRODUCT.md` 10 and the privacy page with it, in a decision record. **The panel and
the admin application hold no tracker.** `src/app/third-party.test.ts` of each application refuses a
script or an iframe created outside the consent feature and anything loaded from another origin by
`index.html` or a stylesheet
([0026](docs/adr/0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)).

**Dev and production are shared.** A working checkout never points at them: no `supabase link`, no
remote database URL, project reference or access token in a `.env` or `mise.local.toml`; they change
only through the deploy workflow ([environments](docs/ARCHITECTURE.md#environments)).

**No AI-generated graphics.** Never generate images, illustrations, logos or icons, and never add
them to the repository. Where no design exists yet, use shadcn/ui's defaults unchanged and real copy
([PRODUCT.md 8](docs/PRODUCT.md#8-design-and-public-image)); they are not a finished look.

**Screens are built from shadcn/ui** in each application's `src/shared/ui`
([frontends](docs/ARCHITECTURE.md#frontends)). A component comes from the CLI the application pins,
`pnpm --dir apps/panel exec shadcn add <name>` or the same for `apps/portal` and `apps/admin`, never
`npx shadcn@latest`, and stays as the CLI writes it but for formatting, lint fixes and its own texts
moved into Lingui macros; the look changes through the tokens of `src/styles.css`. The `shadcn`
skill ([.claude/skills/shadcn/SKILL.md](.claude/skills/shadcn/SKILL.md)) runs that CLI, and no MCP
server runs it ([0021](docs/adr/0021-run-the-shadcn-skill-through-the-pinned-cli.md));
[.claude/shadcn.test.mjs](.claude/shadcn.test.mjs) keeps them so.

**Adding a feature.** A new feature starts from its accepted spec, and a new table, route or screen
follows the [checklist](docs/ARCHITECTURE.md#adding-a-feature) step by step, with the `program`
slice as its reference. Between parts of the product the order follows the dependencies between
packages, the scope is [the MVP](docs/PRODUCT.md#11-mvp-scope-vs-beyond-mvp), and the readiness
criteria are the [tests](docs/ARCHITECTURE.md#tests).
