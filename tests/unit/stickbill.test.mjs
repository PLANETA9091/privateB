//
// stickbill.test.mjs - THE STICK ECONOMY'S OWN BILL (v0.711.0) unit tests.
// The lines are byte-verbatim from the stored faces (the storm/torch/
// recovery/armory shapes exactly as the 37th = run37480184002 emitted
// them), in the live order - hand-traced first, then pinned. The era's
// face-level reads (the 37th 99: 7/2/2/88 self-rescued 53; the 36th 96:
// 7/0/0/89 self-rescued 55) ride the decompose surface, the mini faces
// pin the per-lane accounting here.
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stickBill } from '../../src/lib/stickbill.mjs'

// The four lanes' own lines, verbatim forms, one lane each plus the
// recovery open (the mid-fail attaches only under its open episode):
// bootstrap 1 (the stick-drought class), armory 2 (the sword's and the
// spare pick's own stick-miss), storm 1 (the craft stick's cooldown),
// torch 3 (the plank rung + the logs rung + the stick-floor skip) ->
// total 7, self-rescued 2 (the rungs; the skip is the floor, not an
// answer).
const MINI = [
  'F2 tool recovery: no pickaxe - spare-pick craft first',
  'F2 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap',
  'F3 sword: stick craft did not land',
  'F4 spare pick: stick craft did not land',
  'F2 craft stick: storm cooldown 3969ms left (3 consecutive timeouts) - refusing',
  'F12 [F12] craft torches: stick-dry but 10 planks held - one stick batch first',
  'F4 [F4] craft torches: stick-dry with logs held - one plank conversion first',
  'F4 [F4] craft torches: skip (no spare sticks: sticks 1 coals 0)'
]

test('stickBill: the four lanes fold into one bill (the mini face, byte-verbatim)', () => {
  const b = stickBill(MINI)
  assert.ok(b, 'the bill opens on a stick face')
  assert.deepEqual(b.lanes, [
    { lane: "the bootstrap's", total: 1 },
    { lane: "the armory's", total: 2 },
    { lane: "the storm's", total: 1 },
    { lane: "the torch's", total: 3 }
  ])
  assert.equal(b.total, 7)
  assert.equal(b.selfRescued, 2)
  assert.equal(b.plankRungs, 1)
  assert.equal(b.logsRungs, 1)
  assert.equal(b.stickSkips, 1)
})

test('stickBill: the honest silences (junk, empty, stick-free, non-string rows)', () => {
  assert.equal(stickBill(), null, 'no arg')
  assert.equal(stickBill(null), null, 'null')
  assert.equal(stickBill('F2 craft stick: storm cooldown 3969ms left (3 consecutive timeouts) - refusing'), null, 'a string is not a face (the array law)')
  assert.equal(stickBill([]), null, 'an empty face opens no bill')
  assert.equal(stickBill(['F2 [F2] water: hazard memorized at [-141,50,412] (1 live, fleet-wide)', 42, null]), null, 'a stick-free face with junk rows stays silent')
})

test('stickBill: a single-voice face rides its lane with the others at zero (the partial honesty)', () => {
  const b = stickBill([
    'F5 craft stick: storm cooldown 3970ms left (3 consecutive timeouts) - refusing'
  ])
  assert.ok(b, 'one storm refusal opens the bill')
  assert.deepEqual(b.lanes, [
    { lane: "the bootstrap's", total: 0 },
    { lane: "the armory's", total: 0 },
    { lane: "the storm's", total: 1 },
    { lane: "the torch's", total: 0 }
  ])
  assert.equal(b.total, 1)
  assert.equal(b.selfRescued, 0)
})

test('stickBill: the torch rungs are the self-rescue, the skips are not (the drought\u2019s two skins)', () => {
  const b = stickBill([
    'F6 [F6] craft torches: stick-dry but 14 planks held - one stick batch first',
    'F17 [F17] craft torches: stick-dry but 14 planks held - one stick batch first',
    'F4 [F4] craft torches: skip (no spare sticks: sticks 1 coals 0)'
  ])
  assert.ok(b)
  assert.equal(b.lanes[3].total, 3, 'the torch lane carries rungs + skips')
  assert.equal(b.selfRescued, 2, 'only the rungs answer the drought')
  assert.equal(b.stickSkips, 1)
  assert.equal(b.total, 3)
})

test('stickBill: an orphan mid-fail never bills the bootstrap lane (the open-episode law holds)', () => {
  const b = stickBill([
    'F9 tool recovery: spare craft failed (no sticks and no planks for sticks) - re-running the bootstrap'
  ])
  assert.equal(b, null, 'the orphan attaches nowhere and the face stays stick-free to the bill')
})
