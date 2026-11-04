#!/usr/bin/env node
// Claude Code PostToolUse hook for Edit and Write: after a migration is edited, hands the rules of
// a migration back to the agent as additional context. It never blocks and always exits 0.
import { readFileSync } from 'node:fs'

const migration = /(^|\/)packages\/db\/drizzle\/[^/]+\.sql$/

const reminder = [
  'A migration changed. Before it is done:',
  '- every tenant table gets `enable row level security` and `force row level security`, and a policy named `tenant_isolation` of the shape the other tables use;',
  "- every function sets `search_path = ''` and schema-qualifies what it touches;",
  '- a SECURITY DEFINER function ends with `revoke execute ... from public` and grants only the roles that need it;',
  '- packages/db/src/verify.ts checks the new rule, and `pnpm db:verify` passes;',
  '- a table, a column without a default, a permission or a role also changes packages/db/src/seed.ts, and `pnpm db:seed` runs twice without error;',
  '- run the tenant-isolation-reviewer agent before the PR.',
].join('\n')

try {
  const event = JSON.parse(readFileSync(0, 'utf8'))
  const path = event?.tool_input?.file_path
  if (typeof path === 'string' && migration.test(path)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reminder },
      }),
    )
  }
} catch {
  // Input that is not JSON is no edit of a migration.
}
