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
  NOPATH_TTL_MS, NOPATH_RADIUS, NOPATH_DY, NOPATH_CAP,
  recordNoPath, nearNoPath
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
