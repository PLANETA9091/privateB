// The shell fence pins (v0.550.0) - the fleet harness's own shell seats bound.
//
// THE SEAM: the shell harness around the fleet carried unbounded children of
// the same frozen-book class the fleet wires fenced (0.539.0-0.546.0):
//   1. server.sh cmd wrote the command into the cmd.fifo with a naked
//      redirection - a fifo write with NO reader on the other end blocks
//      FOREVER (a dead JVM or a dead tail wrapper = nobody drains the fifo =
//      the console hangs eternally).
//   2. fleet-run.sh launched setup-yard.mjs (its own little bot program) with
//      no bound - a silent login inside the builder hangs the whole launch.
//
// THE WIRE: both seats ride timeout - the yard build ends at 120s (|| true
// keeps the flow, the yard is optional); the fifo write happens INSIDE a
// timeout child (the parent's own redirection would block BEFORE timeout
// could ever arm) with an honest failure line when no reader shows up in 10s.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const serverSrc = readFileSync(new URL('../../scripts/server.sh', import.meta.url), 'utf8')
const fleetRunSrc = readFileSync(new URL('../../scripts/fleet-run.sh', import.meta.url), 'utf8')
const shardsSrc = readFileSync(new URL('../../scripts/unit-shards.sh', import.meta.url), 'utf8')

test('THE WIRE: the cmd fifo write rides a timeout child - the naked redirection is gone', () => {
  assert.ok(
    serverSrc.includes('timeout 10 bash -c'),
    'the bounded child present'
  )
  assert.ok(
    serverSrc.includes('the fifo had no reader in 10s'),
    'the honest failure line rides the fence'
  )
  assert.equal(
    (serverSrc.match(/printf '%s\\n' "\$2" > "\$DIR\/cmd\.fifo"/g) || []).length,
    0,
    'ZERO naked fifo redirection - the eternal-hang seat is dead'
  )
})

test('THE WIRE: the yard builder rides timeout 120 at the caller - the naked launch is gone', () => {
  assert.equal(
    (fleetRunSrc.match(/timeout 120 node "\$ROOT\/scripts\/setup-yard\.mjs"/g) || []).length,
    1,
    'exactly one bounded yard seat'
  )
  assert.equal(
    (fleetRunSrc.match(/^\s*node "\$ROOT\/scripts\/setup-yard\.mjs"/gm) || []).length,
    0,
    'ZERO naked node launches of the yard builder (line-anchored: the bounded form rides timeout, not a bare node start)'
  )
  assert.ok(
    fleetRunSrc.includes('|| true'),
    'the yard stays optional - the fence never blocks the fleet launch'
  )
})

test('THE NEIGHBOR LAW: the sharded unit runner keeps its per-file bound', () => {
  assert.ok(
    shardsSrc.includes('timeout 25 node --test'),
    'the per-file timeout 25 stays - the fence composes, it never unbounds'
  )
})

test('THE PHYSICS: a fifo with no reader blocks until the timeout kills the child - with a reader it passes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pvb-fifo-'))
  const fifo = join(dir, 'cmd.fifo')
  execFileSync('mkfifo', [fifo])
  // no reader: the open blocks, the timeout lands, exit 124 (the class the fence kills)
  const starving = (() => {
    try {
      execFileSync('timeout', ['1', 'bash', '-c', 'printf "%s\\n" "$1" > "$2"', '_', 'say hi', fifo])
      return 0
    } catch (e) {
      return e.status
    }
  })()
  assert.equal(starving, 124, 'no reader = the child is killed by the timeout, not hung forever')
  // a reader drains the fifo: the same bounded child passes through
  const fed = execFileSync('bash', ['-c', `cat ${JSON.stringify(fifo)} & r=$!; timeout 5 bash -c 'printf "%s\\n" "$1" > "$2"' _ 'say hi' ${JSON.stringify(fifo)}; wait $r`])
  assert.equal(fed.toString(), 'say hi\n', 'a reader present = the command lands whole')
  rmSync(dir, { recursive: true, force: true })
})
