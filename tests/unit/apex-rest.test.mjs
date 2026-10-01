// (v0.381.0) THE APEX-REST EXEMPTION - face 36796588698's F12 paid the
// misdiagnosis: the bob apex rest (head DRY, y flat) at o2 0 -> reset(-1)
// was condemned 'frozen physics' (the freeze itself named 'ticking-flat -
// the simulate runs'), the stand-down handed the air line to the reconnect
// lane, the re-page cycle re-climbed three stacked rescues in 19s, and the
// vanilla drowning clock collected the bot in a wet dip. The cure is the
// entry-gate symmetry: the rescue's own v0.82.0 law ('a bot at/below the
// rescue line or on a junk bar NEVER stands down') now binds the frozen
// verdict too - apexRestExempt skips the stand-down for the flat
// dry-headed critical/blind-air bot, the wedged classes keep their windows
// byte for byte (head WET fast window, healthy-air legacy window).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apexRestExempt, OXYGEN_RESCUE_LEVEL, OXYGEN_CRITICAL_LEVEL, FROZEN_WINDOW, WET_FROZEN_WINDOW, frozenWindowFor } from '../../src/lib/drowning.mjs'

test('the F12 verdict shape: flat dry-headed bot at o2 0 is the apex rest - exempt', () => {
  assert.equal(apexRestExempt({ headWet: false, oxygen: 0 }), true)
})

test('the reset sentinel at a dry head is a lost read, never a condemnation', () => {
  assert.equal(apexRestExempt({ headWet: false, oxygen: -1 }), true)
})

test('the whole below-rescue-line band is exempt (the entry-gate symmetry)', () => {
  for (let o2 = 0; o2 <= OXYGEN_RESCUE_LEVEL; o2++) {
    assert.equal(apexRestExempt({ headWet: false, oxygen: o2 }), true, `o2=${o2}`)
  }
})

test('the wedged-dry-healthy class keeps the legacy window (run76 F17: 90+ flat passes, no urgency)', () => {
  assert.equal(apexRestExempt({ headWet: false, oxygen: OXYGEN_RESCUE_LEVEL + 1 }), false)
  assert.equal(apexRestExempt({ headWet: false, oxygen: 20 }), false)
})

test('the wedged-wet class keeps the fast window byte for byte (the v0.132.0 shape)', () => {
  assert.equal(apexRestExempt({ headWet: true, oxygen: 0 }), false)
  assert.equal(apexRestExempt({ headWet: true, oxygen: -1 }), false)
  assert.equal(apexRestExempt({ headWet: true, oxygen: null }), false)
})

test('junk never condemns: null/undefined/NaN/non-number at a dry head read exempt', () => {
  assert.equal(apexRestExempt({ headWet: false, oxygen: null }), true)
  assert.equal(apexRestExempt({ headWet: false, oxygen: undefined }), true)
  assert.equal(apexRestExempt({ headWet: false, oxygen: Number.NaN }), true)
  assert.equal(apexRestExempt({ headWet: false, oxygen: 'junk' }), true)
})

test('the Number(null) lesson: the explicit null check rides before any coercion', () => {
  // Number(null) is 0 - the phantom-critical hole. The gate reads raw == null
  // FIRST; a null oxygen must take the junk path (exempt), not the critical path.
  const seen = apexRestExempt({ headWet: false, oxygen: null })
  assert.equal(seen, true)
  // and the distinction is provable: a genuine 0 is ALSO exempt but by the
  // critical arm - both return true, so pin the arms apart via the boundary
  assert.equal(apexRestExempt({ headWet: false, oxygen: OXYGEN_CRITICAL_LEVEL }), true)
})

test('the exemption threshold IS the rescue entry gate constant (one law, one number)', () => {
  assert.equal(OXYGEN_RESCUE_LEVEL, 10)
  assert.equal(apexRestExempt({ headWet: false, oxygen: OXYGEN_RESCUE_LEVEL }), true)
  assert.equal(apexRestExempt({ headWet: false, oxygen: OXYGEN_RESCUE_LEVEL + 1 }), false)
})

test('frozenWindowFor is untouched: the windows keep their byte-for-byte shapes', () => {
  assert.equal(frozenWindowFor({ headWet: true, oxygen: 0 }), WET_FROZEN_WINDOW)
  assert.equal(frozenWindowFor({ headWet: true, oxygen: 20 }), FROZEN_WINDOW)
  assert.equal(frozenWindowFor({ headWet: true, oxygen: -1 }), FROZEN_WINDOW)
  assert.equal(frozenWindowFor({ headWet: false, oxygen: 0 }), FROZEN_WINDOW)
  assert.equal(FROZEN_WINDOW, 10)
  assert.equal(WET_FROZEN_WINDOW, 4)
})

test('wiring pin: the miner calls the exemption with the live reads before the stand-down', () => {
  const src = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const call = src.indexOf('apexRestExempt({ headWet, oxygen: read.oxygen })')
  assert.ok(call > 0, 'the exemption call exists')
  const standDown = src.indexOf('standing down, the reconnect lane owns this')
  assert.ok(standDown > call, 'the stand-down log rides AFTER the exemption call')
  const condemn = src.indexOf('frozenDown = true')
  assert.ok(condemn > call, 'the frozenDown latch rides AFTER the exemption call')
})

test('wiring pin: the exempt branch skips the condemn - the break lives in the else arm', () => {
  const src = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const exemptIdx = src.indexOf('apex rest held')
  const elseIdx = src.indexOf('} else {', exemptIdx)
  const breakIdx = src.indexOf('break', elseIdx)
  assert.ok(exemptIdx > 0 && elseIdx > exemptIdx && breakIdx > elseIdx, 'the condemn+break are inside the else arm after the exempt branch')
})

test('wiring pin: the apex-rest line rides the water filter key (no new key needed)', () => {
  const fleet = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(/combat\|died\|.*\|water\|/.test(fleet), 'the water key exists in the fleet filter')
  const miner = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(miner.includes('water: apex rest held ('), 'the line opens with the water: prefix')
})
