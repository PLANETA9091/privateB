import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pinBill } from '../../src/lib/pinbill.mjs'

// THE ERA BYTE-EXACT - the 45th (run 37516287610, the end-phase face)
// rode the pinned seat (fire 0330's hand read): F17 79 of the face's 83
// transit launches at ONE target [-129,403] plus 51 passes standing at
// [-129,*,401] y=47.2. The lines below carry the face's own bytes; the
// bill's debut read names the seat the existing lenses rode between.

test('the seat rides by its own bytes - the 45th\'s F17 pin folds with its watch', () => {
  // the face's own transit spread: F17 79 at one aim, F11 3+1 elsewhere
  const t17 = 'F17 [F17] water: transit toward known land (oak_log) at [-129,403] d=2'
  const t11a = 'F11 [F11] water: transit toward known land (oak_log) at [-140,400] d=19'
  const t11b = 'F11 [F11] water: transit toward known land (oak_log) at [-124,386] d=8'
  // F17's own pass distribution across the seat's ground (the real counts)
  const p1 = 'F17 [F17] water: pass 3 head=dry shore=none land=oak_log d=2 y=47.2 o2=19 probes=0 at=[-129,47,401]'
  const p2 = 'F17 [F17] water: pass 5 head=wet shore=none land=n/a y=47.2 o2=20 probes=0 at=[-129,46,401]'
  const p3 = 'F17 [F17] water: pass 2 head=dry shore=none land=oak_log d=3 y=47.2 o2=18 probes=0 at=[-129,47,400]'
  const p4 = 'F17 [F17] water: pass 4 head=wet shore=none land=n/a y=46.9 o2=15 probes=0 at=[-129,46,400]'
  const p5 = 'F17 [F17] water: pass 6 head=dry shore=hit r=1 land=none y=47.1 o2=14 probes=0 at=[-128,47,400]'
  const face = [
    ...Array(79).fill(t17),
    ...Array(3).fill(t11a),
    t11b,
    ...Array(36).fill(p1),
    ...Array(10).fill(p2),
    ...Array(2).fill(p3),
    ...Array(2).fill(p4),
    p5
  ]
  const pb = pinBill(face)
  assert.ok(pb, 'the seat face opens the bill')
  assert.equal(pb.n, 83)
  assert.equal(pb.nPass, 51)
  // F17's launch book: one aim, the volume, the share
  assert.equal(pb.bots.F17.total, 79)
  assert.deepEqual(pb.bots.F17.targets, { '[-129,403]': 79 })
  // the watch groups the FEET's ground - [x,z], the y dropped:
  // [-129,47,401]x36 + [-129,46,401]x10 = 46, the sentry census's own spot
  assert.deepEqual(pb.bots.F17.passes, { '[-129,401]': 46, '[-129,400]': 4, '[-128,400]': 1 })
  // THE PIN VERDICT: 79/79 = 100% of 79 >= 10 - the seat named with its watch
  assert.deepEqual(pb.pinned, {
    F17: { target: '[-129,403]', launches: 79, of: 79, share: 100, watch: { pos: '[-129,401]', passes: 46 } }
  })
  // F11 rode 4 launches - the volume gate (10+) keeps the small books out
  assert.equal(pb.bots.F11.total, 4)
  assert.equal(pb.pinned.F11, undefined)
})

test('the mild pin - the 41st\'s F3 concentration folds, the 66% neighbor stays out', () => {
  // the 41st's own spread (run 37498980203): F3 10/11 at one aim, F14's
  // top held 8/12 = 66.7% - under the share gate, honest
  const face = [
    ...Array(10).fill('F3 [F3] water: transit toward known land (oak_log) at [-126,409] d=4'),
    'F3 [F3] water: transit toward known land (birch_log) at [-129,415] d=9',
    ...Array(8).fill('F14 [F14] water: transit toward known land (birch_log) at [-115,392] d=3'),
    ...Array(4).fill('F14 [F14] water: transit toward known land (sand) at [-133,395] d=5')
  ]
  const pb = pinBill(face)
  assert.ok(pb, 'the mild face opens the bill')
  assert.equal(pb.n, 23)
  assert.equal(pb.nPass, 0)
  assert.deepEqual(pb.bots.F3.targets, { '[-126,409]': 10, '[-129,415]': 1 })
  // 10/11 = 90.9% - the mild seat reads, no passes -> no watch
  assert.deepEqual(pb.pinned.F3, { target: '[-126,409]', launches: 10, of: 11, share: 90.9 })
  // F14: 8/12 = 66.7% < 70% - the spread's honest residual
  assert.deepEqual(pb.bots.F14.targets, { '[-115,392]': 8, '[-133,395]': 4 })
  assert.equal(pb.pinned.F14, undefined)
})

test('the crowd\'s wander - big books under the share gate read the empty pin cell', () => {
  // the 44th's own shape (run 37512568836): the top bots' shares sat
  // 41..59% - the fleet's launches wander, no seat
  const face = [
    ...Array(15).fill('F8 [F8] water: transit toward known land (oak_log) at [-126,409] d=6'),
    ...Array(12).fill('F8 [F8] water: transit toward known land (birch_log) at [-116,411] d=2'),
    ...Array(7).fill('F8 [F8] water: transit toward known land (sand) at [-133,395] d=8'),
    ...Array(16).fill('F1 [F1] water: transit toward known land (oak_log) at [-122,394] d=4'),
    ...Array(9).fill('F1 [F1] water: transit toward known land (birch_log) at [-115,392] d=6'),
    'F1 [F1] water: transit toward known land (oak_log) at [-127,388] d=3'
  ]
  const pb = pinBill(face)
  assert.ok(pb, 'the wander face opens the bill')
  assert.equal(pb.n, 60)
  // F8 15/34 = 44.1%, F1 16/26 = 61.5% - both under the gate
  assert.equal(pb.bots.F8.total, 34)
  assert.equal(pb.bots.F1.total, 26)
  assert.deepEqual(pb.pinned, {})
})

test('the honest silences - no face, junk, the stalled skin, and the passes-only bot', () => {
  assert.equal(pinBill(), null)
  assert.equal(pinBill(null), null)
  assert.equal(pinBill(''), null)
  assert.equal(pinBill(['junk line', 42, null]), null)
  // the shore-transit stall is the release's verdict, not a launch - the
  // 45th's own 84th transit-shaped byte stays out
  const stalled = [
    'F5 [F5] water: shore transit stalled (r=2 after 5 passes - the walls own this swim; the release takes over)'
  ]
  assert.equal(pinBill(stalled), null)
  // the passes-only bot: the bill reads the pass book, the pin cell stays
  // honestly empty (no launches, no aim, no seat)
  const watcher = [
    'F12 [F12] water: pass 1 head=wet shore=none land=n/a y=51.2 o2=18 probes=0 at=[-125,51,378]',
    'F12 [F12] water: pass 2 head=wet shore=none land=n/a y=51.2 o2=17 probes=0 at=[-125,51,378]'
  ]
  const pb = pinBill(watcher)
  assert.ok(pb, 'the pass book opens the bill')
  assert.equal(pb.n, 0)
  assert.equal(pb.nPass, 2)
  assert.deepEqual(pb.bots.F12.passes, { '[-125,378]': 2 })
  assert.deepEqual(pb.pinned, {})
})

test('the grammar\'s edges - the reset skin, the hit shore, the blob form, the neighbors out', () => {
  // the o2 mirror's reset skin + the shore hit's own byte (the space rides)
  const face = [
    'F12 [F12] water: pass 4 head=wet shore=none land=n/a y=51.2 o2=reset(-1) probes=0 at=[-125,51,378]',
    'F13 [F13] water: pass 9 head=dry shore=hit r=2 land=none y=62.3 o2=16 probes=0 at=[-125,62,379]',
    'F14 [F14] water: pass 3 head=dry shore=none land=oak_log d=2 y=47.2 o2=19 probes=0 at=[-129,47,401]',
    // the door family and the ask ladder stay out of the water's seat
    'F9 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F1 [F1] water: frozen physics (10 flat passes at y=47.2, o2=20, head WET) - standing down, the reconnect lane owns this'
  ]
  const pb = pinBill(face)
  assert.ok(pb, 'the edge face opens the bill')
  assert.equal(pb.n, 0)
  assert.equal(pb.nPass, 3)
  assert.deepEqual(pb.pinned, {})
  // the blob form folds the same (the raw log string rides)
  const blob = pinBill(face.join('\n') + '\n')
  assert.deepEqual(blob, pb)
})
