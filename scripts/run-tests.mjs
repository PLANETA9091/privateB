#!/usr/bin/env node
// Test runner: runs every test file in its OWN child process with a hard timeout and
// --test-force-exit.
//
// Why not one big `node --test tests/unit`?
//   * a single leaked timer/handle in any module keeps the whole child alive forever
//     (the fly ticker did exactly that: the 15-minute CI job died with no diagnostics)
//   * one hanging file then blocks every file queued behind it
//
// Per-file isolation means a hang is KILLED at the timeout, reported as a failure of
// exactly that file, and the remaining files still run. --test-force-exit (Node 22.5+)
// additionally turns "tests all passed but the process lingers" into a normal exit 0.
//
//   node scripts/run-tests.mjs unit         # pure unit tests
//   node scripts/run-tests.mjs integration  # needs a running vanilla server
//   node scripts/run-tests.mjs all
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const what = process.argv[2] || 'unit'
const FILE_TIMEOUT_MS = Number(process.env.TEST_FILE_TIMEOUT_MS || 120000)

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
console.log(`[run-tests] ${files.length} test file(s), ${FILE_TIMEOUT_MS / 1000}s hard timeout each:`)
for (const f of files) console.log(`  ${path.relative(root, f)}`)

// --test-force-exit exists from Node 22.5; probe once so older runtimes still work.
const probe = spawnSync(process.execPath, ['--test-force-exit', '--test', '-e', 'process.exit(0)'], { timeout: 15000 })
const forceExit = probe.status === 0
if (!forceExit) console.log('[run-tests] --test-force-exit not supported here, relying on the per-file timeout')

let failed = 0
for (const f of files) {
  const rel = path.relative(root, f)
  console.log(`\n[run-tests] === ${rel} ===`)
  const args = ['--test']
  if (forceExit) args.push('--test-force-exit')
  args.push(f)
  const res = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: root, timeout: FILE_TIMEOUT_MS })
  const timedOut = res.error && res.error.code === 'ETIMEDOUT'
  if (timedOut) {
    failed++
    console.error(`[run-tests] FAILED (hung, killed at ${FILE_TIMEOUT_MS / 1000}s): ${rel}`)
  } else if (res.error) {
    failed++
    console.error(`[run-tests] FAILED to spawn: ${rel}: ${res.error.message}`)
  } else if (res.status !== 0) {
    failed++
    console.error(`[run-tests] FAILED (exit ${res.status}): ${rel}`)
  } else {
    console.log(`[run-tests] PASSED: ${rel}`)
  }
}

console.log(`\n[run-tests] ${files.length - failed}/${files.length} file(s) passed`)
process.exit(failed ? 1 : 0)
