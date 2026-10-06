import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bankDocket, doorstepStormCensus } from '../../src/lib/bankdocket.mjs'

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
    fuel: { total: 0, decide: 0, noPath: 0, retryTimeout: 0, other: 0 },
    iron: { total: 0, decide: 0, noPath: 0, retryTimeout: 0, other: 0, goalBrake: 0, rescueRefused: 0 },
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

test("the fuel lane's own door: the era's counts byte-exact (the 32nd: 19, the 34th: 21), the legs untouched", () => {
  // (v0.704.0) the live faces' proven shapes (raw-log reconciled): the
  // 32nd's 19 fuel doors ride decide 14 / no path 2 / retry 2 / the
  // water-rescue refusal 1, the 34th's 21 ride decide 17 / no path 3 /
  // retry 1. The fire-2130 worklog's '20x/27x' was the ad-hoc grep's
  // error (the lens corrects a third time). The bank's legs stay put.
  const decide = 'F11 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)'
  const noPath = 'F18 fuel commons: chest walk failed after the nudge (No path to the goal!)'
  const retry = 'F15 fuel commons: chest walk failed after the nudge (fuel commons walk @-119,379 (nudge retry): timeout after 3948ms)'
  const refused = 'F1 fuel commons: chest walk failed after the nudge (water rescue in progress (iron commune walk @-141,389 (nudge retry) refused))'
  const r32 = bankDocket([...Array(14).fill(decide), ...Array(2).fill(noPath), ...Array(2).fill(retry), refused])
  assert.deepEqual(r32.fuel, { total: 19, decide: 14, noPath: 2, retryTimeout: 2, other: 1 })
  assert.equal(r32.door.total, 0) // the bank's door leg never swallowed the fuel lane
  assert.equal(r32.pocket.total, 0)
  assert.equal(r32.bankLines, 0) // no 'bank' word rides the fuel door's skin
  const r34 = bankDocket([...Array(17).fill(decide), ...Array(3).fill(noPath), retry])
  assert.deepEqual(r34.fuel, { total: 21, decide: 17, noPath: 3, retryTimeout: 1, other: 0 })
  // the rescue-refused tail says 'nudge retry' too but never ': timeout
  // after' - the byte keeps it OUT of the retry cell (the honest other)
  const onlyRefused = bankDocket([refused])
  assert.equal(onlyRefused.fuel.other, 1)
  assert.equal(onlyRefused.fuel.retryTimeout, 0)
  // a mixed face: the fuel door rides beside live legs, nothing moves
  const mixed = bankDocket([
    'F4 [F4] hop: chest at [-115,79,415] d=28 zero: chest unreachable (Took to long to decide path to goal!)',
    'F4 bank: 0 (nothing to deposit)',
    decide
  ])
  assert.equal(mixed.door.total, 1)
  assert.equal(mixed.pocket.total, 1)
  assert.equal(mixed.fuel.total, 1)
})

test("the fuel lane's own door: the honest silence and the junk battery", () => {
  // a face whose fuel lane walked clean reads the zero cell - no door
  const clean = bankDocket(['F2 fuel commons: the nudge retry landed', 'F3 fuel commons: budget spent (4/4 units)'])
  assert.deepEqual(clean.fuel, { total: 0, decide: 0, noPath: 0, retryTimeout: 0, other: 0 })
  // junk lines inside a live face are skipped, never invented
  const j = bankDocket(['fuel commons: chest walk failed after the nudge', 123, null])
  assert.equal(j.fuel.total, 1)
  assert.equal(j.fuel.other, 1) // the bare skin (no why-tail) rides the honest other
  // junk input reads null (the smeltledger convention, inherited)
  assert.equal(bankDocket(42), null)
  assert.equal(bankDocket(undefined), null)
})

test("the iron commune's own door: the era's shapes byte-exact (the 32nd: 5 = 1+1+0+3, the 34th: 20 = 9+7+4+0)", () => {
  // the live faces' proven skins (raw-log reconciled): the decide marker,
  // the no-path verdict, the walk's own timeout byte, the water-rescue
  // refusals (the honest other - they say 'nudge retry' but never
  // ': timeout after', the fuel precedent)
  const decide = 'F11 iron commune: chest walk failed (Took to long to decide path to goal!)'
  const noPath = 'F1 iron commune: chest walk failed (No path to the goal!)'
  const timeout = 'F3 iron commune: chest walk failed (iron commune walk @-105,401: timeout after 1208ms)'
  const rescueRefused = 'F1 iron commune: chest walk failed (water rescue in progress (iron commune walk @-143,389 refused))'
  const r32 = bankDocket([...Array(1).fill(decide), ...Array(1).fill(noPath), ...Array(3).fill(rescueRefused)])
  assert.deepEqual(r32.iron, { total: 5, decide: 1, noPath: 1, retryTimeout: 0, other: 3, goalBrake: 0, rescueRefused: 3 })
  const r34 = bankDocket([...Array(9).fill(decide), ...Array(7).fill(noPath), ...Array(4).fill(timeout)])
  assert.deepEqual(r34.iron, { total: 20, decide: 9, noPath: 7, retryTimeout: 4, other: 0, goalBrake: 0, rescueRefused: 0 })
})

test('the iron nudge skin rides IRON, not fuel - the v0.704.0 cross-contamination corrected', () => {
  // the double-prefix nudge skin is the iron lane's own ride: the
  // prefix-blind fuel cell swallowed it (the era's fuel reads 19/21 were
  // 18+1 and 15+6); the prefix anchor takes it home
  const ironNudge = 'F3 iron commune: iron commune: chest walk failed after the nudge (Took to long to decide path to goal!)'
  const r = bankDocket([ironNudge])
  assert.deepEqual(r.iron, { total: 1, decide: 1, noPath: 0, retryTimeout: 0, other: 0, goalBrake: 0, rescueRefused: 0 })
  assert.deepEqual(r.fuel, { total: 0, decide: 0, noPath: 0, retryTimeout: 0, other: 0 })
  // a MENTION is not a member: the fuel refused-tail names an iron walk
  // inside its parens - the line stays the fuel lane's
  const fuelRefused = 'F1 fuel commons: chest walk failed after the nudge (water rescue in progress (iron commune walk @-141,389 (nudge retry) refused))'
  const m = bankDocket([fuelRefused])
  assert.equal(m.fuel.total, 1)
  assert.equal(m.iron.total, 0)
})

test("the doorstep storm's census: the era's sums byte-exact + the honest silence battery", () => {
  // the 36th's maiden read (run 37474596256, the v0.705.0 decompose's
  // own cells folded): 26 + 13 + 3 = 42 doors, the decide skins
  // 9 + 4 + 2 = 15 of 42 = 35.7% - the storm cooled across the era
  // (the 32nd's 68 = 45+18+5, the 34th's 78 = 43+15+20) while its
  // decide core stayed a third of the toll
  const decide = 'F4 [F4] hop: chest at [-115,79,415] d=28 zero: chest unreachable (Took to long to decide path to goal!)'
  const bare = 'F7 bank: chest unreachable'
  const fuelDoor = 'F2 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)'
  const ironDoor = 'F11 iron commune: chest walk failed (No path to the goal!)'
  const r36 = bankDocket([
    ...Array(9).fill(decide), ...Array(12).fill(bare), // the bank's 21 unreachable (9 decide) + 5 no-chest below
    ...Array(5).fill('F3 food trip: 0 (no chest reached) - the lane walked empty'),
    ...Array(4).fill(fuelDoor),
    ...Array(6).fill(fuelDoor.replace(/Took[^)]*/, 'No path to the goal!')),
    ...Array(2).fill(fuelDoor.replace(/Took[^)]*/, '(nudge retry): timeout after 900ms')),
    ...Array(1).fill(fuelDoor.replace(/Took[^)]*/, 'water rescue in progress (iron commune walk @-141,389 refused)')),
    ...Array(2).fill(ironDoor.replace('iron commune: chest walk failed', 'iron commune: iron commune: chest walk failed after the nudge').replace(/No path[^)]*/, 'Took to long to decide path to goal!')),
    ...Array(1).fill(ironDoor)
  ])
  assert.equal(r36.door.total, 26)
  assert.equal(r36.fuel.total, 13)
  assert.equal(r36.iron.total, 3)
  const s36 = doorstepStormCensus(r36)
  assert.equal(s36.total, 42)
  assert.equal(s36.decide, 15)
  assert.equal(s36.decidePct, 35.7)
  assert.deepEqual(s36.lanes.map(l => [l.lane, l.total]), [["the bank's", 26], ["the fuel's", 13], ["the iron's", 3]])
  // a doorless face reads the honest silence - no door anywhere, no
  // storm to census (the pocket leg does not own the storm)
  const pocketOnly = bankDocket(['F16 [F16] hop: chest at [-141,79,389] d=20 zero: nothing to deposit'])
  assert.equal(doorstepStormCensus(pocketOnly), null)
  assert.equal(doorstepStormCensus(bankDocket(['F2 bank: 12 (the mass moved)'])), null)
  // junk reads null (the smeltledger convention, inherited)
  assert.equal(doorstepStormCensus(null), null)
  assert.equal(doorstepStormCensus(42), null)
  assert.equal(doorstepStormCensus(undefined), null)
})

test("the iron's other skin: the goal brake and the water rescue's refusal named (the era's reads byte-exact)", () => {
  // the 37th's other 6 = the GOAL BRAKE (the walk governor's own rate
  // limiter turning a goal storm away - 'goal brake: N goals in 5s')
  const goalBrake = 'F6 iron commune: chest walk failed (goal brake: 6 goals in 5s - iron commune walk @-129,420 refused for 5s)'
  const r37 = bankDocket([...Array(6).fill(goalBrake)])
  assert.deepEqual(r37.iron, { total: 6, decide: 0, noPath: 0, retryTimeout: 0, other: 6, goalBrake: 6, rescueRefused: 0 })
  // the 32nd's other 3 = the WATER-RESCUE REFUSAL (the rescue lane flying
  // prices the walk) - the era's oldest 'other' finally named
  const rescueRefused = 'F1 iron commune: chest walk failed (water rescue in progress (iron commune walk @-126,389 refused))'
  const r32 = bankDocket([...Array(3).fill(rescueRefused)])
  assert.deepEqual(r32.iron, { total: 3, decide: 0, noPath: 0, retryTimeout: 0, other: 3, goalBrake: 0, rescueRefused: 3 })
  // an 'other' that names neither tail stays silent inside the residual
  // (the honest split: the named tails never claim the cell)
  const unnamed = bankDocket(['F9 iron commune: chest walk failed (the walk gave up on its own)'])
  assert.deepEqual(unnamed.iron, { total: 1, decide: 0, noPath: 0, retryTimeout: 0, other: 1, goalBrake: 0, rescueRefused: 0 })
  // the other is a residual, never a member of the sum's claim: a mixed
  // face keeps both counts honest
  const mixed = bankDocket([goalBrake, rescueRefused, unnamed.other ? 'x' : 'x'].slice(0, 2))
  assert.equal(mixed.iron.other, 2)
  assert.equal(mixed.iron.goalBrake, 1)
  assert.equal(mixed.iron.rescueRefused, 1)
})
