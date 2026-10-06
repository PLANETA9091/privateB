import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bankDocket } from '../../src/lib/bankdocket.mjs'

// Face 32's live shapes verbatim (run 37457243091, the silent-bank face:
// 143 bank-ish lines, 0u banked) - the docket's two legs ride the bank
// lane's own bytes; the door leg carries FOUR skins (the pure walk fail,
// the no-chest, the probe-wrapped decide-timeout, the lid timeout, the
// beyond-radius), the prose (holding / arrived / budget) never joins.
const face32Mini = [
  'F4 bank: 0 (nothing to deposit)', // the deposit byte fired, carried nothing - the empty-pocket leg
  'F16 [F16] hop: chest at [-141,79,389] d=20 zero: nothing to deposit', // the zero probe - the empty-pocket leg
  'F4 [F4] hop: chest at [-115,79,415] d=28 zero: chest unreachable (Took to long to decide path to goal!)', // the door leg in the probe's skin
  'F7 bank: chest unreachable', // the door leg, the pure skin
  'F11 food trip: 0 (no chest reached) - the plate rides to the next bank trip', // the door leg, the no-chest skin
  'F2 [F2] hop: chest at [-120,79,413] d=14 zero: cannot open chest (open chest: timeout after 10000ms)', // the lid stuck - the door leg
  'F3 [F3] hop: chest at [-105,79,413] d=51 zero: chest beyond the hop search radius 48 - walking home instead', // out of reach - the door leg
  'F16 [F16] direct deposit: 27 chest slots derived from the 63-slot view', // the machinery's view byte
  'F16 bank fallback: none (nothing to deposit)', // the fallback byte
  'F6 bank trip: fuel-tithe budget 240s', // the plan voice
  'F9 bank: holding 3', // prose - never a docket byte
  'F7 bank: yard walk arrived in 12s', // prose
  'F1 [F1] mem: ok' // noise
]

test('bankDocket reads face 32 byte-exact: the door leg owns the silence (45 vs 6 on the live face), four skins', () => {
  const r = bankDocket(face32Mini)
  assert.deepEqual(r.door, { unreachable: 2, decideTimeouts: 1, noChest: 1, lidTimeout: 1, beyondRadius: 1, total: 5 })
  assert.deepEqual(r.pocket, { zeroProbes: 1, depositZeros: 1, total: 2, nothingToDeposit: 3 })
  assert.equal(r.views, 1)
  assert.equal(r.fallbacks, 1)
  assert.equal(r.plans, 1)
  assert.equal(r.depositPositives, 0)
  // the bank-line skin rides (the yield lens' own denominator shape) -
  // the probe and view lines carry no 'bank' word, honest
  assert.equal(r.bankLines, 7)
})

test('bankDocket fork flips with the legs: the pocket-dominant face, the tie, the deposit positive', () => {
  // the pocket-dominant face: the chests opened, the pockets arrived empty
  const pocket = bankDocket([
    'F16 [F16] hop: chest at [-141,79,389] d=20 zero: nothing to deposit',
    'F16 [F16] hop: chest at [-120,79,413] d=8 zero: nothing to deposit',
    'F16 [F16] hop: chest at [-140,79,405] d=10 zero: nothing to deposit',
    'F4 bank: 0 (nothing to deposit)',
    'F7 bank: chest unreachable'
  ])
  assert.equal(pocket.door.total, 1)
  assert.equal(pocket.pocket.total, 4)
  // the tie: the legs split
  const tie = bankDocket([
    'F7 bank: chest unreachable',
    'F4 bank: 0 (nothing to deposit)'
  ])
  assert.equal(tie.door.total, 1)
  assert.equal(tie.pocket.total, 1)
  // a deposit byte with N > 0 is a positive - mass moved, neither leg
  const pos = bankDocket(['F9 bank: 12'])
  assert.equal(pos.depositPositives, 1)
  assert.equal(pos.door.total, 0)
  assert.equal(pos.pocket.total, 0)
})

test('bankDocket honest zeros and the junk battery', () => {
  // a face with no bank bytes reads the honest zero shape
  assert.deepEqual(bankDocket(['F1 [F1] combat: fighting zombie (dist 2.0, hp 20.0, 0 nearby, proximity)']), {
    bankLines: 0,
    door: { unreachable: 0, decideTimeouts: 0, noChest: 0, lidTimeout: 0, beyondRadius: 0, total: 0 },
    pocket: { zeroProbes: 0, depositZeros: 0, total: 0, nothingToDeposit: 0 },
    views: 0, fallbacks: 0, plans: 0, depositPositives: 0
  })
  // junk-safe: non-input reads null (the smeltledger convention)
  assert.equal(bankDocket(42), null)
  assert.equal(bankDocket(null), null)
  assert.equal(bankDocket(undefined), null)
  // junk lines inside a live face are skipped, never invented
  const j = bankDocket(['bank:', 123, 'chest unreachable'])
  assert.equal(j.door.unreachable, 1)
  assert.equal(j.pocket.total, 0)
  assert.equal(j.plans, 0)
})

test("the door's rate dial: the era's own rates ride byte-exact (45/143 = 31.5%, 25/123 = 20.3%)", () => {
  // the live faces' proven counts (the docket's byte-exact reads), scaled
  // to the visit lane: the 32nd's door 45 + pocket 6 over 143 visit-lines,
  // the 33rd's door 25 over 123 - the door failures HALVED as the bank
  // moved 0 -> 1785u (the door is the bank's own thermostat)
  const doorLine = 'F4 [F4] hop: chest at [-115,79,415] d=28 zero: chest unreachable (Took to long to decide path to goal!)'
  const pocketLine = 'F16 [F16] hop: chest at [-141,79,389] d=20 zero: nothing to deposit'
  const face32 = [...Array(45).fill(doorLine), ...Array(6).fill(pocketLine)]
  const r32 = bankDocket(face32, 143)
  assert.deepEqual(r32.rate, { visits: 143, doorPct: 31.5, pocketPct: 4.2 })
  const r33 = bankDocket([...Array(25).fill(doorLine)], 123)
  assert.deepEqual(r33.rate, { visits: 123, doorPct: 20.3, pocketPct: 0 })
  // the rounding rides the bankYield convention (x1000 round / 10): the
  // mini's own legs over a small lane read one honest decimal
  const mini = bankDocket(face32Mini, 16)
  assert.deepEqual(mini.rate, { visits: 16, doorPct: 31.3, pocketPct: 12.5 })
})

test("the door's rate dial honest silence: no visits, junk visits, or a legless face reads no rate", () => {
  // no second arg - the v0.700.0 shape untouched (the rate stays out)
  assert.equal(bankDocket(face32Mini).rate, undefined)
  // junk visits: zero, negative, non-number, NaN - the yield dial's own law
  assert.equal(bankDocket(face32Mini, 0).rate, undefined)
  assert.equal(bankDocket(face32Mini, -5).rate, undefined)
  assert.equal(bankDocket(face32Mini, '143').rate, undefined)
  assert.equal(bankDocket(face32Mini, NaN).rate, undefined)
  // a legless face with a live lane count names no silence
  assert.equal(bankDocket(['F9 bank: 12', 'F6 bank trip: fuel-tithe budget 240s'], 200).rate, undefined)
})

test("the decide skin's own count: the era's A* shares byte-exact (the 32nd: 19 of 39, the 34th: 27 of 35)", () => {
  // the live faces' proven counts (raw-log reconciled): the decide marker
  // ('Took to long to decide path to goal!') rides INSIDE the unreachable
  // branch only - the marker's other rides (the fuel lane's 'chest walk
  // failed after the nudge') stay OUT of the docket's door leg
  const decide = 'F4 [F4] hop: chest at [-115,79,415] d=28 zero: chest unreachable (Took to long to decide path to goal!)'
  const bare = 'F7 bank: chest unreachable'
  const r32 = bankDocket([...Array(19).fill(decide), ...Array(20).fill(bare)])
  assert.equal(r32.door.unreachable, 39)
  assert.equal(r32.door.decideTimeouts, 19)
  const r34 = bankDocket([...Array(27).fill(decide), ...Array(8).fill(bare)])
  assert.equal(r34.door.unreachable, 35)
  assert.equal(r34.door.decideTimeouts, 27)
  // the fuel lane's own door family stays unclassified (not the bank
  // lane's leg) - the next fire's front
  const fuel = bankDocket(['F1 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)'])
  assert.equal(fuel.door.total, 0)
  assert.equal(fuel.door.decideTimeouts, 0)
})
