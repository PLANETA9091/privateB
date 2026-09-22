// Tests for the fleet no-path ledger in src/lib/nopath.mjs.
// The measured CPU storm this module closes: dispatch 35668657935 (the
// v0.61.0 fleet) burned its end phase on 16x 'chest unreachable (No path to
// the goal!)' - F4 alone tried 6 chests, F5 tried 5, several of the SAME
// cells from DIFFERENT bots, each verdict a FULL synchronous A* exhaustion
// that froze the one shared event loop and starved every other bot's digs
// and walks (124 climb-diag dig failures, 13 'still underground', banked=0).
// These pins guard the record/skip contract: a verdict is fleet-wide, lives
// 90s, hits within the XZ/Y tolerance, and never fires on junk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NOPATH_TTL_MS, NOPATH_RADIUS, NOPATH_DY, NOPATH_CAP, NOPATH_TIMEOUT_TTL_MS,
  recordNoPath, nearNoPath, isDeadChestVerdict
} from '../../src/lib/nopath.mjs'

test('policy constants stay sane', () => {
  assert.equal(NOPATH_TTL_MS, 90000, 'a verdict covers a whole end-phase chain attempt')
  assert.equal(NOPATH_RADIUS, 4, 'XZ hit radius: the same chest block, floored')
  assert.equal(NOPATH_DY, 4, 'Y tolerance: chest rows are flat; stairs read from +-a few')
  assert.equal(NOPATH_CAP, 24, 'the cap keeps the newest verdicts (drowning.mjs parity)')
  assert.ok(NOPATH_TTL_MS > 0 && NOPATH_RADIUS > 0)
})

test('recordNoPath: append, prune, cap-keeps-newest, and the input is NEVER mutated', () => {
  const t0 = 1000000
  const cell = { x: -129, y: 72, z: 415 }
  const empty = recordNoPath(undefined, cell, t0)
  assert.equal(empty.length, 1, 'a junk ledger still records')
  assert.deepEqual([empty[0].x, empty[0].y, empty[0].z], [-129, 72, 415])

  const ledger = [{ x: 0, y: 0, z: 0, at: t0 - NOPATH_TTL_MS - 1 }, { x: 5, y: 72, z: 410, at: t0 - 10 }]
  const before = JSON.stringify(ledger)
  const next = recordNoPath(ledger, cell, t0)
  assert.equal(JSON.stringify(ledger), before, 'the shared array is rewritten by the CALLER, not mutated here')
  assert.equal(next.length, 2, 'the dead entry is pruned, the live one kept, the new one appended')

  // cap: 26 records, cap 24 - the OLDEST drop off the front
  let grown = []
  for (let i = 0; i < 26; i++) grown = recordNoPath(grown, { x: i, y: 0, z: i }, t0 + i)
  assert.equal(grown.length, NOPATH_CAP)
  assert.equal(grown[0].x, 2, 'the two oldest cells left the front')
  assert.equal(grown[grown.length - 1].x, 25, 'the newest is last')

  // junk cells never enter
  assert.equal(recordNoPath([], null, t0).length, 0)
  assert.equal(recordNoPath([], { x: NaN, y: 1, z: 1 }, t0).length, 0)
  assert.equal(recordNoPath([], 'chest', t0).length, 0)
})

test('nearNoPath: the radius, the Y band and the TTL decide the hit', () => {
  const t0 = 2000000
  const ledger = recordNoPath([], { x: -129, y: 72, z: 415 }, t0)
  // the same cell: hit
  assert.equal(nearNoPath(ledger, { x: -129, y: 72, z: 415 }, t0).hit, true)
  // within the XZ radius (dist 3 < 4): hit
  assert.equal(nearNoPath(ledger, { x: -126, y: 72, z: 415 }, t0).hit, true)
  // outside the XZ radius (dist 5 > 4): miss
  assert.equal(nearNoPath(ledger, { x: -124, y: 72, z: 415 }, t0).hit, false)
  // within the Y band (dy 4): hit
  assert.equal(nearNoPath(ledger, { x: -129, y: 76, z: 415 }, t0).hit, true)
  // outside the Y band (dy 5): miss
  assert.equal(nearNoPath(ledger, { x: -129, y: 77, z: 415 }, t0).hit, false)
  // fresh vs expired: the boundary is the TTL itself
  assert.equal(nearNoPath(ledger, { x: -129, y: 72, z: 415 }, t0 + NOPATH_TTL_MS - 1).hit, true, '1ms before the TTL: live')
  assert.equal(nearNoPath(ledger, { x: -129, y: 72, z: 415 }, t0 + NOPATH_TTL_MS).hit, false, 'AT the TTL: dead (age < ttl is the contract)')
})

test('nearNoPath: the ageMs names the FRESHEST matching verdict', () => {
  const t0 = 3000000
  let ledger = recordNoPath([], { x: 10, y: 64, z: 10 }, t0)
  ledger = recordNoPath(ledger, { x: 10, y: 64, z: 10 }, t0 + 5000)
  const r = nearNoPath(ledger, { x: 10, y: 64, z: 10 }, t0 + 6000)
  assert.equal(r.hit, true)
  assert.equal(r.ageMs, 1000, 'the freshest entry wins, not the first seen')
})

test('nearNoPath: junk never skips a chest (a skip costs the deposit, the hop only costs CPU)', () => {
  assert.equal(nearNoPath(undefined, { x: 1, y: 1, z: 1 }, 1000).hit, false, 'junk ledger = no hit')
  assert.equal(nearNoPath([], null, 1000).hit, false, 'junk cell = no hit')
  assert.equal(nearNoPath([{ x: 1, y: 1, z: 1 }], { x: 1, y: 1, z: 1 }, 1000).hit, false, 'an entry without .at is junk')
  assert.equal(nearNoPath([{ x: 1, y: 1, z: 1, at: 900 }], 'chest', 1000).hit, false, 'a junk query cell never hits')
  assert.equal(nearNoPath([{ x: NaN, y: 1, z: 1, at: 900 }], { x: 1, y: 1, z: 1 }, 1000).hit, false, 'a junk entry never hits')
})

// ---- v0.70.0: THE TIMEOUT VERDICT JOINS THE LEDGER ----
// MEASURED (run67, dispatch 35692049905, the v0.69.1 600s fleet): 24x 'chest
// unreachable (Took to long to decide path to goal!)' on the same y=69-72
// lake-bottom chests while the ledger only recorded /No path/i - every bot
// re-paid the walk AND the full A* exhaustion for the same dead geometry, and
// the exhaustion storm is the fuel of the run's one 44s main-thread freeze
// (the blackbox named 'pf:goal walk to chest' in the blocker chain).

test('v0.70.0 policy: the timeout verdict lives 45s - half the proven shape', () => {
  assert.equal(NOPATH_TIMEOUT_TTL_MS, 45000)
  assert.ok(NOPATH_TIMEOUT_TTL_MS < NOPATH_TTL_MS, 'a timeout is WEAKER evidence than a clean No path')
})

test('isDeadChestVerdict: the run67 message matrix', () => {
  // the exact run67 verdict strings
  assert.deepEqual(isDeadChestVerdict('Took to long to decide path to goal!'), { dead: true, timeout: true })
  assert.deepEqual(isDeadChestVerdict('No path to the goal!'), { dead: true, timeout: false })
  // a compound verdict (the hop line wraps the raw error) still parses
  assert.deepEqual(isDeadChestVerdict('chest unreachable (Took to long to decide path to goal!)'), { dead: true, timeout: true })
  assert.deepEqual(isDeadChestVerdict('chest unreachable (No path to the goal!)'), { dead: true, timeout: false })
  // transient exits are NOT geometry - the chest stays live
  assert.deepEqual(isDeadChestVerdict('water rescue in progress (walk to chest refused)'), { dead: false, timeout: false })
  assert.deepEqual(isDeadChestVerdict('Path was stopped before it could be completed!'), { dead: false, timeout: false })
  assert.deepEqual(isDeadChestVerdict('budget exhausted (walk floor)'), { dead: false, timeout: false })
  // junk never kills a chest
  assert.deepEqual(isDeadChestVerdict(''), { dead: false, timeout: false })
  assert.deepEqual(isDeadChestVerdict(null), { dead: false, timeout: false })
  assert.deepEqual(isDeadChestVerdict(undefined), { dead: false, timeout: false })
  assert.deepEqual(isDeadChestVerdict(42), { dead: false, timeout: false })
  // 'No path' wins when both shapes appear in one message (the stronger proof)
  assert.deepEqual(isDeadChestVerdict('No path (took to long)'), { dead: true, timeout: false })
})

test('per-entry ttl: a timeout verdict expires on its own clock while a No path beside it stays live', () => {
  const t0 = 5000000
  const lake = { x: -121, y: 72, z: 400 } // a run67 lake-bottom chest
  // the exact v0.70.0 wiring shapes: timeout rides 45s, the clean verdict 90s
  let led = recordNoPath(undefined, lake, t0, { ttl: NOPATH_TIMEOUT_TTL_MS })
  led = recordNoPath(led, { x: -140, y: 69, z: 412 }, t0 + 1000) // a proven dead chest
  assert.equal(led.length, 2)
  assert.equal(led[0].ttl, NOPATH_TIMEOUT_TTL_MS, 'the entry carries its own ttl')
  assert.equal(led[1].ttl, NOPATH_TTL_MS)
  // t+46s: the timeout verdict expired, the No path verdict lives
  const mid = recordNoPath(led, null, t0 + 46000) // a junk record still prunes
  assert.equal(mid.length, 1, 'the timeout verdict expired at 45s')
  assert.equal(mid[0].x, -140)
  // nearNoPath agrees: the lake chest is skippable at t+10s, fresh again at t+46s
  assert.equal(nearNoPath(led, lake, t0 + 10000).hit, true)
  assert.equal(nearNoPath(led, lake, t0 + 46000).hit, false, 'the weak verdict does not outlive its 45s')
  assert.equal(nearNoPath(led, { x: -140, y: 69, z: 412 }, t0 + 46000).hit, true, 'the proven verdict rides its 90s')
})

test('per-entry ttl is backward compatible: entries without ttl ride the caller ttl (pre-v0.70.0 ledgers)', () => {
  const t0 = 5000000
  // a hand-built pre-v0.70.0 entry: {x,y,z,at} with NO ttl field
  const legacy = [{ x: -116, y: 72, z: 400, at: t0 }]
  // the default caller ttl keeps it alive at t+89s
  assert.equal(nearNoPath(legacy, { x: -116, y: 72, z: 400 }, t0 + 89000, {}).hit, true)
  // a recordNoPath prune with the default ttl keeps it too
  assert.equal(recordNoPath(legacy, null, t0 + 89000).length, 1)
  // and it dies at 90s exactly like before
  assert.equal(recordNoPath(legacy, null, t0 + 90000).length, 0)
})

test('the run67 regression shape: the FIRST timeout verdict ledgered means bot #2 never re-pays', () => {
  const t0 = 6000000
  const chest = { x: -156, y: 72, z: 410 } // F7's d=47 lake-bottom chest
  // F6 pays the walk + A* and records the timeout verdict (the deposit.mjs wiring)
  let led = recordNoPath(undefined, chest, t0, { ttl: NOPATH_TIMEOUT_TTL_MS })
  // F7's scan checks BEFORE the walk: within 45s the chest is skipped fleet-wide
  assert.equal(nearNoPath(led, chest, t0 + 30000).hit, true, 'the hop is skipped, the A* never runs')
  // at t+50s the chest is live again (a load-flaked verdict recovers)
  assert.equal(nearNoPath(led, chest, t0 + 50000).hit, false)
})
