// (v0.679.0) THE ORPHAN OWNER - the orphan end's per-bot attribution.
// The verbatim rows below are the 21st flight's own orphans
// (run 37413061352): F3 x4, F8 x1, F19 x3 - the dead-client class.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { orphanOwnerCensus } from '../../src/lib/orphanowner.mjs'

const F3_STANDDOWN = 'ORPHAN END: F3 [F3] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) [blind: 10 passes, 0 shore scans hit, 0 standing probes - no ground truth ever gathered] in 16.4s'
const F3_STANDDOWN_SHORT = 'ORPHAN END: F3 [F3] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) in 6.5s'
const F8_STANDDOWN = 'ORPHAN END: F8 [F8] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) in 19.4s'
const F3_TIMEOUT = 'ORPHAN END: F3 [F3] water: rescue timeout (still wet, 14 passes, 0 probes, tail wet/wet/wet) in 25.2s'
const F19_STANDDOWN = 'ORPHAN END: F19 [F19] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) [blind: 10 passes, 0 shore scans hit, 0 standing probes - no ground truth ever gathered] in 23.5s'
const F19_RELEASED = 'ORPHAN END: F19 [F19] water: rescue released (surface-safe, open water - no land known; the walk gate reopens) in 10.2s'

test('orphan-owner: the 21st flight orphan battery attributes every line', () => {
  const c = orphanOwnerCensus([
    F3_STANDDOWN,   // F3, frozenStanddown
    F8_STANDDOWN,   // F8, frozenStanddown
    F3_STANDDOWN_SHORT, // F3, frozenStanddown
    F3_TIMEOUT,     // F3, timeout
    F3_STANDDOWN_SHORT, // F3, frozenStanddown
    F19_STANDDOWN,  // F19, frozenStanddown
    F19_RELEASED,   // F19, released
    F3_TIMEOUT      // F3, timeout (the log's later repeat)
  ])
  assert.equal(c.total, 8)
  assert.deepEqual(c.owners, { F3: 5, F8: 1, F19: 2 })
  assert.deepEqual(c.byClass, { frozenStanddown: 5, timeout: 2, released: 1 })
  assert.equal(c.unattributed, 0)
})

test('orphan-owner: an untagged but classed line counts in byClass only', () => {
  const c = orphanOwnerCensus([
    'water: rescue timeout (still wet, 9 passes, 1 probes, tail dry/wet/dry) in 12.0s' // no bot tag
  ])
  assert.equal(c.total, 1)
  assert.deepEqual(c.owners, {})
  assert.deepEqual(c.byClass, { timeout: 1 })
  assert.equal(c.unattributed, 0)
})

test('orphan-owner: junk judges nothing - prose, non-strings, empty', () => {
  const c = orphanOwnerCensus([
    'the rescue stood down and the story went nowhere', // no tag, no end class -> unattributed
    null,
    42,
    undefined
  ])
  assert.equal(c.total, 0)
  assert.deepEqual(c.owners, {})
  assert.deepEqual(c.byClass, {})
  assert.equal(c.unattributed, 1) // the prose line; the non-strings are skipped, never counted
})

test('orphan-owner: non-array input returns the zero shape', () => {
  for (const bad of [null, undefined, 'a string', 42]) {
    const c = orphanOwnerCensus(bad)
    assert.deepEqual(c, { total: 0, owners: {}, byClass: {}, unattributed: 0 })
  }
})

test('orphan-owner: the raw ledger shape (no ORPHAN END decoration) attributes too', () => {
  // decompose passes the ledger's orphanEndLines verbatim - the raw log
  // lines carry the bot tag FIRST, no 'ORPHAN END: ' prefix.
  const c = orphanOwnerCensus([
    'F3 [F3] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) [blind: 10 passes, 0 shore scans hit, 0 standing probes - no ground truth ever gathered] in 16.4s',
    'F19 [F19] water: rescue timeout (still wet, 19 passes, 3 probes, tail dry/dry/dry) in 27.0s'
  ])
  assert.equal(c.total, 2)
  assert.deepEqual(c.owners, { F3: 1, F19: 1 })
  assert.deepEqual(c.byClass, { frozenStanddown: 1, timeout: 1 })
})

test('WIRING: the decompose prints the orphan owner row', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /orphan owners: \$\{owners\}/, 'the owner split prints in the ledger block')
  assert.match(src, /the dead-client class names its bot/, 'the row names its class')
})
