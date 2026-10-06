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
  assert.deepEqual(r.door, { unreachable: 2, noChest: 1, lidTimeout: 1, beyondRadius: 1, total: 5 })
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
    door: { unreachable: 0, noChest: 0, lidTimeout: 0, beyondRadius: 0, total: 0 },
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
