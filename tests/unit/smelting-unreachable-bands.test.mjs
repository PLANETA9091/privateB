// THE REACH BANDS - tests. (v0.582.0) The owner family's fifth seat, the
// cell cure's own instrument: the distance the walk failure happened at,
// banded. The cross's first verdict (fleet 37159189785: blast_furnace x
// machine-unreachable-no-path 3 of 6, 50.0% - the lattice's reach is the
// lever) aimed the lever; the bands aim the geometry - a walk that died at
// the door reads the dig cure, a walk that died deep reads the lattice.
// One grain law with the whole family (SMELT_NO_FUEL_OWNER_MIN = 3,
// SMELT_NO_FUEL_OWNER_LOCAL_SHARE = 0.5), the census's own tie law, the
// honest '-' bucket for the legacy entries that carry no distance.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  smeltAttemptDist,
  smeltReachBand,
  smeltUnreachableBandRow,
  SMELT_REACH_MOUTH, SMELT_REACH_FAR,
  SMELT_NO_FUEL_OWNER_MIN, SMELT_NO_FUEL_OWNER_LOCAL_SHARE,
} from '../../src/lib/smelting.mjs'

test('the constants: the bands are the fleet\'s own numbers, one grain law with the family', () => {
  assert.equal(SMELT_REACH_MOUTH, 6, 'the mouth is three stand-reaches (smeltWalkReach(1) = 2)')
  assert.equal(SMELT_REACH_FAR, 24, 'the deep field starts at half the 48b search radius')
  assert.equal(SMELT_NO_FUEL_OWNER_MIN, 3, 'the family\'s count floor')
  assert.equal(SMELT_NO_FUEL_OWNER_LOCAL_SHARE, 0.5, 'the family\'s half boundary')
})

test('smeltReachBand: the boundaries ride the constants (junk reads -)', () => {
  assert.equal(smeltReachBand(0), 'mouth')
  assert.equal(smeltReachBand(6), 'mouth', 'the mouth boundary is >= (6 reads mouth)')
  assert.equal(smeltReachBand(7), 'mid')
  assert.equal(smeltReachBand(24), 'mid', 'the deep boundary is >= (24 reads mid)')
  assert.equal(smeltReachBand(25), 'far')
  assert.equal(smeltReachBand(300), 'far')
  assert.equal(smeltReachBand(null), '-')
  assert.equal(smeltReachBand(undefined), '-')
  assert.equal(smeltReachBand(NaN), '-')
  assert.equal(smeltReachBand(Infinity), '-')
  assert.equal(smeltReachBand(-1), '-')
  assert.equal(smeltReachBand('torn'), '-')
})

test('smeltAttemptDist: the integer blocks the failure happened at (junk reads null)', () => {
  assert.equal(smeltAttemptDist({ entity: { position: { distanceTo: () => 7.4 } } }, { position: {} }), 7, 'rounds the vector\'s own read')
  assert.equal(smeltAttemptDist({ entity: { position: { distanceTo: () => 0 } } }, { position: {} }), 0, 'a zero distance is a read, not junk')
  assert.equal(smeltAttemptDist({}, { position: {} }), null, 'no entity reads null')
  assert.equal(smeltAttemptDist({ entity: {} }, { position: {} }), null, 'no position reads null')
  assert.equal(smeltAttemptDist({ entity: { position: { distanceTo: () => NaN } } }, { position: {} }), null, 'a NaN read is junk')
  assert.equal(smeltAttemptDist({ entity: { position: { distanceTo: () => Infinity } } }, { position: {} }), null, 'an infinite read is junk')
  assert.equal(smeltAttemptDist({ entity: { position: { distanceTo: () => -3 } } }, { position: {} }), null, 'a negative read is junk')
  assert.equal(smeltAttemptDist(null, null), null, ' outright nulls read null')
})

test('the trip form: a walk that died at the door names the dig cure', () => {
  assert.equal(
    smeltUnreachableBandRow([{ band: 'mouth', count: 3 }, { band: 'far', count: 2 }, { band: 'mid', count: 1 }]),
    'smelt unreachable bands: mouth carries 3 of 6 unreachable refusals (50.0%) - the walk died at the door: the cell\'s mouth is the wall - the dig is the cure',
  )
})

test('the far trip: a walk that died deep names the lattice', () => {
  assert.equal(
    smeltUnreachableBandRow([{ band: 'far', count: 4 }, { band: 'mouth', count: 2 }]),
    'smelt unreachable bands: far carries 4 of 6 unreachable refusals (66.7%) - the walk died deep: the lattice\'s reach is the wall - the budget is the front',
  )
})

test('the mid trip reads mixed (no band owns the wall)', () => {
  assert.equal(
    smeltUnreachableBandRow([{ band: 'mid', count: 3 }, { band: 'mouth', count: 1 }]),
    'smelt unreachable bands: mid carries 3 of 4 unreachable refusals (75.0%) - the walk died in the near field: no band owns the wall - the reach reads mixed',
  )
})

test('the blind form: the legacy no-distance entries can lead and the row names the blindness', () => {
  assert.equal(
    smeltUnreachableBandRow([{ band: '-', count: 4 }, { band: 'mouth', count: 2 }]),
    'smelt unreachable bands: - carries 4 of 6 unreachable refusals (66.7%) - an unnamed distance leads: the bands stay blind',
  )
})

test('the 0.5 boundary trips at >= (the family\'s own shape)', () => {
  const at = smeltUnreachableBandRow([{ band: 'mouth', count: 3 }, { band: 'far', count: 3 }])
  // a 3-by-3 tie reads far first (the census's own tie law: count desc, band
  // asc - 'far' sorts before 'mouth'), and exactly the half boundary trips
  assert.match(at, /^smelt unreachable bands: far carries 3 of 6 unreachable refusals \(50\.0%\) - the walk died deep/)
  const under = smeltUnreachableBandRow([{ band: 'far', count: 3 }, { band: 'mouth', count: 2 }, { band: 'mid', count: 2 }])
  assert.match(under, /^smelt unreachable bands: no band \(top far 3 of 7, 42\.9%\)/, '3 of 7 (42.9%) reads no band')
  assert.match(under, /the reach reads mixed, the cures point different ways$/)
})

test('the floor: exactly the family minimum speaks, under it stays quiet', () => {
  assert.match(smeltUnreachableBandRow([{ band: 'far', count: SMELT_NO_FUEL_OWNER_MIN }]), /carries 3 of 3/)
  assert.equal(smeltUnreachableBandRow([{ band: 'far', count: SMELT_NO_FUEL_OWNER_MIN - 1 }]), null)
  assert.equal(smeltUnreachableBandRow([]), null, 'an empty ledger is quiet')
})

test('the merge law: multiple entries of one band merge into one read', () => {
  assert.equal(
    smeltUnreachableBandRow([{ band: 'mouth', count: 2 }, { band: 'mouth', count: 2 }, { band: 'far', count: 2 }]),
    'smelt unreachable bands: mouth carries 4 of 6 unreachable refusals (66.7%) - the walk died at the door: the cell\'s mouth is the wall - the dig is the cure',
  )
})

test('the tie law: count desc, band asc (far sorts before mouth)', () => {
  const row = smeltUnreachableBandRow([{ band: 'mouth', count: 3 }, { band: 'far', count: 3 }])
  assert.match(row, /^smelt unreachable bands: far carries 3 of 6/, 'the alphabetical tie reads far first')
})

test('the junk battery: null, lookalikes and impossible counts never enter', () => {
  assert.equal(smeltUnreachableBandRow(null), null, 'null feed is quiet')
  assert.equal(smeltUnreachableBandRow('not an array'), null, 'a lookalike feed is quiet')
  assert.equal(
    smeltUnreachableBandRow([{ band: 'mouth', count: 0 }, { band: 'far', count: -2 }, { band: 'mid', count: NaN }, { band: 'far', count: 'torn' }, { band: 'far', count: 1.9 }, { band: 'far', count: 3 }]),
    'smelt unreachable bands: far carries 4 of 4 unreachable refusals (100.0%) - the walk died deep: the lattice\'s reach is the wall - the budget is the front',
    'junk counts are skipped, the floored real count still counts',
  )
  const unnamed = smeltUnreachableBandRow([{ band: '', count: 3 }, { band: null, count: 2 }, { band: 'mouth', count: 1 }])
  assert.match(unnamed, /^smelt unreachable bands: - carries 5 of 6/, 'a nameless band reads its honest - bucket, never dropped')
})

test('the wiring pin: the feed, the ledger and the print ride fleet19', () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /const finalSmeltUnreachableBand = new Map\(\)/, 'the band ledger exists')
  assert.match(src, /smeltReachBand\(sa\.dist\)/, 'the feed eats the attempt\'s own dist field')
  assert.match(src, /smeltUnreachableBandRow\(\[\.\.\.finalSmeltUnreachableBand\]/, 'the row reads its own ledger')
  assert.match(src, /if \(smeltUnreachableBand\) console\.log\(smeltUnreachableBand\)/, 'the print follows the leanness law')
})

test('the wiring pin: the push sites compute the distance (the sweep\'s own catch scope)', () => {
  const lib = readFileSync(new URL('../../src/lib/smelting.mjs', import.meta.url), 'utf8')
  const hits = lib.match(/dist: smeltAttemptDist\(bot, machineBlock\)/g) || []
  assert.equal(hits.length, 4, 'all four unreachable push sites carry the dist field')
})
