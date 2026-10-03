// Tests for the air-bar ledger in src/lib/statcarry.mjs (v0.347.0).
// The storm row named the holder (F9 72%, F18 100% - two faces say the storm
// is ONE bot's air-bar lie) but never priced the lie's COST: every 'air-bar
// glitch override' hand BELIEVED the bar and paid a rescue (face 36700431959:
// F18's 213 lied reads carried two override hands - log lines 1264/1418,
// 'believing the bar'). The ledger prices the hands at the face level; a
// face of pure ignores prints nothing (the leanness law). The v0.346.0
// lesson applied at birth: the counter rides CARRY_FIELDS the day it ships.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { airBarLedgerRow, AIR_BAR_LEDGER_MIN_OVERRIDES, CARRY_FIELDS } from '../../src/lib/statcarry.mjs'

// the face-7 datum: F18's 213 lied reads carried 2 override hands
const FACE7 = [
  { name: 'F18', stats: { airGlitches: 213, airBarOverrides: 2 } },
  { name: 'F9', stats: { airGlitches: 5 } }
]

test('the floor is 1 - one override is one real rescue burn', () => {
  assert.equal(AIR_BAR_LEDGER_MIN_OVERRIDES, 1)
})

test('the face-7 datum: two hands on 213 lied reads, the holder named', () => {
  const line = airBarLedgerRow(FACE7)
  assert.match(line, /air-bar ledger: 2 override hands on 213 lied reads/)
  assert.match(line, /top F18 2/)
  assert.match(line, /each hand believed the lie and paid a rescue/)
})

test('the singular hand reads a hand, not hands', () => {
  const line = airBarLedgerRow([{ name: 'F3', stats: { airGlitches: 40, airBarOverrides: 1 } }])
  assert.match(line, /1 override hand on 40 lied reads/)
  assert.doesNotMatch(line, /hands/)
})

test('a face of pure ignores prints NOTHING (the leanness law)', () => {
  assert.equal(airBarLedgerRow([{ name: 'F1', stats: { airGlitches: 675, airBarOverrides: 0 } }]), null)
  assert.equal(airBarLedgerRow([{ name: 'F1', stats: { airGlitches: 50 } }]), null)
})

test('the junk battery: junk never prices a hand', () => {
  for (const m of [null, undefined, 'junk', {}, { name: 'F1' }, { name: 'F1', stats: null }, { name: 'F1', stats: 'junk' }, { name: 'F1', stats: { airBarOverrides: NaN } }, { name: 'F1', stats: { airBarOverrides: -1 } }, { name: 'F1', stats: { airBarOverrides: 0.4 } }]) {
    assert.equal(airBarLedgerRow([m]), null)
  }
  assert.equal(airBarLedgerRow(null), null)
  assert.equal(airBarLedgerRow(undefined), null)
  assert.equal(airBarLedgerRow('junk'), null)
})

test('the fractional hands floor (the counters are integers)', () => {
  // floor(0.9) = 0 - below the grain, silent
  assert.equal(airBarLedgerRow([{ name: 'F1', stats: { airBarOverrides: 0.9 } }]), null)
  // floor(1.9) = 1 - one hand (the storm row's own fractional precedent)
  assert.match(airBarLedgerRow([{ name: 'F1', stats: { airBarOverrides: 1.9 } }]), /1 override hand/)
})

test('the tie keeps the first name (byte-stable), a junk name reads ?', () => {
  const tie = airBarLedgerRow([
    { name: 'F2', stats: { airBarOverrides: 1, airGlitches: 10 } },
    { name: 'F1', stats: { airBarOverrides: 1, airGlitches: 10 } }
  ])
  assert.match(tie, /top F2 1/)
  assert.match(airBarLedgerRow([{ stats: { airBarOverrides: 1 } }]), /top \? 1/)
})

test('the top holder is the override max, not the lied-read max', () => {
  const line = airBarLedgerRow([
    { name: 'F5', stats: { airGlitches: 900, airBarOverrides: 1 } },
    { name: 'F6', stats: { airGlitches: 20, airBarOverrides: 3 } }
  ])
  // the total sums BOTH bots (4), the top names the max holder (F6 3)
  assert.match(line, /4 override hands on 920 lied reads/)
  assert.match(line, /top F6 3/)
})

test('the counter rides CARRY_FIELDS from birth (the v0.346.0 lesson applied the day it ships)', () => {
  assert.ok(CARRY_FIELDS.includes('airBarOverrides'))
  assert.ok(CARRY_FIELDS.includes('glitchAbandons'))
})

test('the wiring: the seed carries the counter, the override site counts it, the fleet prints the row after the storm row', () => {
  const seed = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // the stats seed carries the counter (re-tailed by the sync law: v0.357.0's wetRescueGlitches joins the seed)
  assert.match(seed, /airGlitches: 0, wetRescueGlitches: 0, glitchAbandons: 0, airBarOverrides: 0, claims: 0/)
  // the override hand counts INSIDE the streak-cap gate (the exact believe page)
  assert.match(seed, /if \(dryGlitchStreak === streakCap\) \{[^]*?stats\.airBarOverrides = \(stats\.airBarOverrides \?\? 0\) \+ 1[^]*?airGlitchLogLine\(\{ kind: 'override'/)
  // the counter rides the log band that names the override
  assert.match(seed, /stats\.airBarOverrides = \(stats\.airBarOverrides \?\? 0\) \+ 1/)
  const fleet = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the import rides the statcarry family (the v0.356.0 census joins the line
  // after the ledger it completes - the pin keeps the order strict; v0.535.0:
  // the otchetnost rows joined the family tail - the ledger's own order untouched)
  assert.match(fleet, /stormVerdictRow, airBarLedgerRow, sensorLiarRow, scoutReportRow, mapCoverageRow, snapshotScoutStats, seedScoutStats \} from '\.\.\/src\/lib\/statcarry\.mjs'/)
  // the row prints right after the storm row it prices, OUTSIDE the economy gate
  const ledgerIdx = fleet.indexOf('airBarLedgerRow(list)')
  const stormIdx = fleet.indexOf('stormVerdictRow({')
  const gateIdx = fleet.indexOf('const rescueEconomy = rescueEconomyDecode(')
  assert.ok(stormIdx > -1 && ledgerIdx > stormIdx, 'the ledger must print after the storm row')
  assert.ok(gateIdx > -1 && ledgerIdx < gateIdx, 'the ledger sits outside the rescue-economy gate')
  // the leanness guard: a healthy face prints nothing
  assert.match(fleet, /const airBarLedger = airBarLedgerRow\(list\)\nif \(airBarLedger\) console\.log\(airBarLedger\)/)
})
