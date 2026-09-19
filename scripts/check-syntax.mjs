#!/usr/bin/env node
// Syntax-checks every .mjs file in the repo (src, scripts, testbed, tests).
// Catches "bot wrote broken JavaScript" before a bot wastes 20 minutes of
// fleet time on a module that never imports.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIRS = ['src', 'scripts', 'testbed', 'tests']
const SKIP = new Set(['node_modules', 'server', 'world', 'logs', '__pycache__'])

function walk (dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.name.endsWith('.mjs')) out.push(p)
  }
  return out
}

const files = DIRS.flatMap(d => {
  const abs = path.join(root, d)
  return fs.existsSync(abs) ? walk(abs) : []
})

let failed = 0
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (e) {
    failed++
    console.error(`SYNTAX FAIL: ${path.relative(root, file)}`)
    console.error(e.stderr?.toString() || e.message)
  }
}
console.log(`[check-syntax] ${files.length} files checked, ${failed} broken`)
process.exit(failed ? 1 : 0)
