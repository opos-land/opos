# 0045. Run the deploy commands as Node scripts

- Status: Proposed
- Date: 2026-11-20

## Context

The deploy commands were mise tasks running shell scripts in `infra/`, with no root script
([0035](0035-describe-the-infrastructure-in-opentofu-units-run-by-terragrunt.md)): a script that
reads `env.yaml` with `awk`, one that wraps every other in the operator's key, and one per command,
each piping scw's JSON through inline Node to read it. None of them had a test: the root scripts in
`scripts/` have tests at full coverage in `pnpm test:scripts`, and a shell script has no place in
it. The commands handle the state's passphrase, the secrets the operators enter and the members of
the operators' group, where a mistake is costly and found only on a real environment.

## Decision

- Every deploy command is a root script, `pnpm deploy:<name>`, running `scripts/deploy.mjs`, with a
  mise task of the same name like every other root script
  ([0024](0024-list-the-root-commands-as-mise-tasks-that-run-the-pnpm-scripts.md)). The script
  takes the command's arguments and flags itself.
- OpenTofu, Terragrunt, scw and gh still come from mise; the script drives them and says to run it
  through mise when one is missing.
- The script is tested like every root script, against fakes of the tools it drives.
- OpenTofu's external key provider for the state is the same script.
- No shell script runs on an operator's machine. The scripts inside an image stay, since the web
  image has no Node.

The rest of 0035 stands.

## Alternatives

- **The shell scripts, with tests through bats.** A second test runner and language for a few
  hundred lines, and still `awk` reading YAML.
- **Folding the commands into the mise tasks.** Shorter, but the logic moves into TOML strings
  that nothing tests.
- **A script per command.** Each small, but each would repeat reading `env.yaml`, the operator's
  key and the runner of the tools.

## Consequences

- `pnpm deploy:<name>` runs without `mise run` only where mise's tools are on the path, as in a
  shell where mise is active.
- A change of a deploy command is a change of the `scripts` area, which a test leads.
- The permissions of an agent deny `deploy:secret-get` in its pnpm, mise and Node forms.
