// (v0.382.0) THE HONEST LEDGER pins - the same live cell re-records as a
// REFRESH, not a twin. Face 36802577873's pocket [-110,62,375] was memorized
// FIVE times by two bots ('hazard memorized ... 5 live' -> '10 live' for ONE
// cell): every re-entry rescue re-pushed the record, the ledger's count lied
// to the census, and the zone envelopes derived from the records leaned
// toward the duplicated cell. The cure: the dedupe with the longer-tenure
// rule - a rescue record never shortens a death spot's v0.209.0 tenure, a
// death spot landing on a rescue cell extends it, an expired twin never
// dedupes, distinct cells (the pocket's y-variants) stay distinct records.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordWaterHazard, HazardLedger, WATER_HAZARD_TTL_MS, WATER_DEATH_TTL_MS, WATER_HAZARD_CAP, waterHazardAlive } from '../../src/lib/drowning.mjs'

const CELL = { x: -110, y: 62, z: 375 }

test('honest ledger: the F19 shape - five rescues, ONE record', () => {
  let ledger = []
  for (let i = 0; i < 5; i++) ledger = recordWaterHazard(ledger, CELL, 1000 + i * 5000)
  assert.equal(ledger.length, 1,
    'the same live cell five times is ONE hazard - the count the census reads must be honest')
  assert.equal(ledger[0].x, -110)
  assert.equal(ledger[0].at, 1000 + 4 * 5000, 'the refresh renews the twin\'s at (the cell is hazardous NOW)')
})

test('honest ledger: the pure law - the caller\'s old objects are never mutated', () => {
  const t0 = 1000
  const first = recordWaterHazard([], CELL, t0)
  const before = { ...first[0] }
  recordWaterHazard(first, CELL, t0 + 9000)
  assert.deepEqual(first[0], before, 'the old array\'s record keeps its own at - the returned array owns fresh records')
})

test('honest ledger: a rescue re-record never shortens a death spot\'s tenure', () => {
  const t0 = 1000
  // the death spot lands first (the v0.209.0 long tenure)
  let ledger = recordWaterHazard([], CELL, t0, { recordTtlMs: WATER_DEATH_TTL_MS })
  // the rescue re-records the same cell later (the default tenure)
  ledger = recordWaterHazard(ledger, CELL, t0 + 60000)
  assert.equal(ledger.length, 1)
  assert.equal(ledger[0].ttl, WATER_DEATH_TTL_MS, 'the longer tenure wins')
  assert.equal(waterHazardAlive(ledger[0], t0 + 60000 + WATER_HAZARD_TTL_MS + 1000, WATER_HAZARD_TTL_MS), true,
    'the death spot outlives the default ttl after the rescue refresh')
})

test('honest ledger: a death spot extends a rescue cell\'s tenure', () => {
  const t0 = 1000
  let ledger = recordWaterHazard([], CELL, t0) // the plain rescue record
  assert.equal(ledger[0].ttl, undefined, 'the plain record keeps the v0.62.0 shape (no ttl field)')
  ledger = recordWaterHazard(ledger, CELL, t0 + 1000, { recordTtlMs: WATER_DEATH_TTL_MS })
  assert.equal(ledger.length, 1)
  assert.equal(ledger[0].ttl, WATER_DEATH_TTL_MS, 'the death spot\'s ttl adopts onto the twin')
  assert.equal(waterHazardAlive(ledger[0], t0 + 1000 + WATER_HAZARD_TTL_MS + 1000, WATER_HAZARD_TTL_MS), true)
})

test('honest ledger: two rescue records keep the default tenure', () => {
  const t0 = 1000
  let ledger = recordWaterHazard([], CELL, t0)
  ledger = recordWaterHazard(ledger, CELL, t0 + 30000)
  assert.equal(ledger.length, 1)
  assert.equal(ledger[0].ttl, undefined,
    'equal default tenures never invent a ttl field (the plain record\'s shape survives the refresh)')
  assert.equal(waterHazardAlive(ledger[0], t0 + 30000 + WATER_HAZARD_TTL_MS - 1, WATER_HAZARD_TTL_MS), true)
  assert.equal(waterHazardAlive(ledger[0], t0 + 30000 + WATER_HAZARD_TTL_MS, WATER_HAZARD_TTL_MS), false,
    'the tenure refresh reads the LATEST at, not the first')
})

test('honest ledger: distinct cells stay distinct (the pocket\'s y-variants)', () => {
  const t0 = 1000
  let ledger = recordWaterHazard([], { x: -110, y: 61.7, z: 375 }, t0)
  ledger = recordWaterHazard(ledger, { x: -110, y: 62.4, z: 375 }, t0 + 1000)
  assert.equal(ledger.length, 2, 'y=61 and y=62 are two data points, not a twin')
  // the same-cell floored re-record IS a twin
  ledger = recordWaterHazard(ledger, { x: -109.6, y: 61.2, z: 375.4 }, t0 + 2000)
  assert.equal(ledger.length, 2, 'the floors collapse to the same cell - the refresh wins')
  assert.equal(ledger[0].at, t0 + 2000)
})

test('honest ledger: an expired twin never dedupes - a fresh record is a fresh fact', () => {
  const t0 = 1000
  let ledger = recordWaterHazard([], CELL, t0)
  // past the default tenure the prune removes the dead record
  ledger = recordWaterHazard(ledger, CELL, t0 + WATER_HAZARD_TTL_MS + 1000)
  assert.equal(ledger.length, 1)
  assert.equal(ledger[0].at, t0 + WATER_HAZARD_TTL_MS + 1000, 'the new record carries the new clock')
})

test('honest ledger: the junk battery and the cap ride untouched', () => {
  const t0 = 1000
  assert.deepEqual(recordWaterHazard([], null, t0), [], 'junk pos prunes only')
  assert.deepEqual(recordWaterHazard([], { x: NaN, y: 1, z: 1 }, t0), [])
  let many = []
  for (let i = 0; i < WATER_HAZARD_CAP + 5; i++) {
    many = recordWaterHazard(many, { x: i, y: 62, z: 375 + i }, t0 + i)
  }
  assert.equal(many.length, WATER_HAZARD_CAP, 'the cap bounds the honest ledger the same way')
  assert.equal(many[many.length - 1].x, WATER_HAZARD_CAP + 4, 'the newest record survives the cap')
})

test('honest ledger: the HazardLedger wrapper reads the honest count', () => {
  let t = 1000
  const ledger = new HazardLedger({ now: () => t })
  for (let i = 0; i < 5; i++) {
    t += 5000
    const live = ledger.record(CELL)
    assert.equal(live, 1, `rescue ${i + 1}: 'N live, fleet-wide' reads ONE for the same cell`)
  }
  // a distinct cell grows the count; a death spot on the twin refreshes it
  t += 5000
  assert.equal(ledger.record({ x: -141, y: 62, z: 392 }), 2)
  t += 5000
  assert.equal(ledger.record(CELL, { ttlMs: WATER_DEATH_TTL_MS }), 2, 'the death-spot re-record refreshes, never twins')
})
