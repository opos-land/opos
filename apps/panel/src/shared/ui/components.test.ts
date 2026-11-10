// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ui = import.meta.dirname

/** The components and compositions of this directory, tests aside. */
const components = readdirSync(ui).filter(
  (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name),
)

describe('shared/ui', () => {
  // components.json says rsc: false, so the CLI writes a component without the directive; one
  // added as another's dependency can keep it, and `shadcn add --diff` then shows a change.
  it('carries no "use client" directive', () => {
    const marked = components.filter((name) =>
      /^\s*['"]use client['"]/.test(readFileSync(join(ui, name), 'utf8')),
    )
    expect(marked).toEqual([])
  })
})
