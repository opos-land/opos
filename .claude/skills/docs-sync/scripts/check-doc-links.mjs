#!/usr/bin/env node
// Checks relative links and anchors in the repository's Markdown documents.
// Usage: node .claude/skills/docs-sync/scripts/check-doc-links.mjs [file.md ...]
// Without arguments it checks AGENTS.md, README.md, docs/PRODUCT.md and docs/PLAN.md.
// Exits 1 when a link points at a missing file or a missing heading.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'

const root = process.cwd()
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['AGENTS.md', 'README.md', 'docs/PRODUCT.md', 'docs/PLAN.md'].filter((f) => existsSync(f))

// Fenced blocks and inline code hold examples, not links; headings keep their inline code.
const stripFences = (text) => text.replace(/^```[\s\S]*?^```/gm, '')
const stripCode = (text) => stripFences(text).replace(/`[^`\n]*`/g, '``')

// GitHub's heading slugs, with -1, -2 suffixes for repeated headings.
function anchorsOf(path) {
  const slugs = new Set()
  const seen = new Map()
  for (const [, heading] of stripFences(readFileSync(path, 'utf8')).matchAll(/^#{1,6} +(.+?) *#*$/gm)) {
    const base = heading
      .replace(/`/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_\- ]/gu, '')
      .replace(/ /g, '-')
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    slugs.add(count ? `${base}-${count}` : base)
  }
  return slugs
}

const anchorCache = new Map()
const anchors = (path) => {
  if (!anchorCache.has(path)) anchorCache.set(path, anchorsOf(path))
  return anchorCache.get(path)
}

const problems = []
for (const file of files) {
  const text = stripCode(readFileSync(file, 'utf8'))
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z]+:/i.test(target)) continue
    const [pathPart, anchor] = target.split('#')
    const resolved = pathPart ? normalize(join(dirname(file), pathPart)) : file
    if (!existsSync(resolved)) {
      problems.push(`${file}: missing file ${target}`)
      continue
    }
    const isMarkdown = resolved.endsWith('.md') && statSync(resolved).isFile()
    if (anchor && isMarkdown && !anchors(resolved).has(anchor)) {
      problems.push(`${file}: missing anchor ${target} (in ${relative(root, resolved)})`)
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`Links and anchors OK in ${files.join(', ')}.`)
