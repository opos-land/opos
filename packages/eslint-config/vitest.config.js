import { release } from 'node:os'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // On WSL four workers at most: the stack shares its VM, whose clock steps under load.
    // VITEST_MAX_WORKERS still sets any count.
    maxWorkers: /microsoft/i.test(release()) ? 4 : undefined,
    include: ['*.test.js'],
  },
})
