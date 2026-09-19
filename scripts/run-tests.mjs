#!/usr/bin/env node
// Test runner: discovers test files and passes them EXPLICITLY to `node --test`.
// (Directory/glob arguments to --test behave differently across Node versions;
// explicit file paths work everywhere from Node 18 up.)
//
//   node scripts/run-tests.mjs unit         # pure unit tests
//   node scripts/run-tests.mjs integration # needs a running vanilla server
//   node scripts/run-tests.mjs all
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const what = process.argv[2] || 'unit'

function discover (dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...discover(p))
    else if (entry.name.endsWith('.test.mjs')) out.push(p)
  }
  return out
}

const suites = what === 'all' ? ['unit', 'integration'] : [what]
const files = suites.flatMap(s => discover(path.join(root, 'tests', s)))

if (!files.length) {
  console.error(`[run-tests] no test files found for "${what}"`)
  process.exit(1)
}
console.log(`[run-tests] ${files.length} test file(s):`)
for (const f of files) console.log(`  ${path.relative(root, f)}`)

const reporter = process.stdout.isTTY ? ['--test-reporter=spec'] : []
const res = spawnSync(process.execPath, ['--test', ...reporter, ...files], {
  stdio: 'inherit',
  cwd: root,
  timeout: 20 * 60 * 1000
})

if (res.error) {
  console.error(`[run-tests] failed to spawn node: ${res.error.message}`)
  process.exit(1)
}
process.exit(res.status ?? 1)
