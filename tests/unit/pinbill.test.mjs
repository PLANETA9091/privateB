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

// (v0.723.0) THE NEAR PIN - the concentration the volume bar left
// unnamed: the share held (70%+) of 6..9 launches. The 46th (run
// 37520787094) is the cell's own motive: F17 rode 8/9 launches at ONE
// aim [-143,405] (88.9%) while the transit census's own row named THE
// PINNED SEAT (the walls class, d flat 14..13) - the bar's volume guard
// kept the bill's silence one launch short of the seat.

test("the near pin rides the 46th's own bytes - F17 8/9 the bar's one-launch short", () => {
  // the face's own transit spread: F17 8 at one aim (7x d=13 + 1x d=14 -
  // the d rides, the aim holds) + 1 birch wander; the real pass grounds
  const t1 = 'F17 [F17] water: transit toward known land (oak_log) at [-143,405] d=13'
  const t2 = 'F17 [F17] water: transit toward known land (oak_log) at [-143,405] d=14'
  const t3 = 'F17 [F17] water: transit toward known land (birch_log) at [-131,396] d=8'
  const p1 = 'F17 [F17] water: pass 7 head=wet shore=none land=n/a y=43.8 o2=20 probes=0 at=[-139,44,405]'
  const p2 = 'F17 [F17] water: pass 6 head=wet shore=none land=n/a y=61.5 o2=19 probes=0 at=[-161,61,404]'
  const face = [
    ...Array(7).fill(t1),
    t2,
    t3,
    ...Array(7).fill(p1),
    ...Array(2).fill(p2)
  ]
  const pb = pinBill(face)
  assert.ok(pb, 'the near-pin face opens the bill')
  assert.equal(pb.n, 9)
  // the volume bar's own verdict stays byte-stable (the v0.722.0 cell)
  assert.deepEqual(pb.pinned, {})
  // the near cell prices what the bar left unnamed - the watch rides
  assert.deepEqual(pb.nearPin, {
    F17: {
      target: '[-143,405]',
      launches: 8,
      of: 9,
      share: 88.9,
      watch: { pos: '[-139,405]', passes: 7 }
    }
  })
})

test("the pin is not near - the pin's own bot stays the pin's subject, a near bot rides beside it", () => {
  // the 45th's pin shape (12 at one aim) beside a near-shaped neighbor
  // (F11: 5 of 7 at one aim = 71.4%, the window's own share)
  const t17 = 'F17 [F17] water: transit toward known land (oak_log) at [-129,403] d=2'
  const t11a = 'F11 [F11] water: transit toward known land (oak_log) at [-140,400] d=19'
  const t11b = 'F11 [F11] water: transit toward known land (oak_log) at [-124,386] d=8'
  const face = [...Array(12).fill(t17), ...Array(5).fill(t11a), ...Array(2).fill(t11b)]
  const pb = pinBill(face)
  assert.deepEqual(pb.pinned, {
    F17: { target: '[-129,403]', launches: 12, of: 12, share: 100 }
  })
  assert.deepEqual(pb.nearPin, {
    F11: { target: '[-140,400]', launches: 5, of: 7, share: 71.4 }
  })
  assert.equal(pb.nearPin.F17, undefined)
})

test('the bars never invent - the floor, the share and the boundary bytes', () => {
  const t = (bot, x, z) => `${bot} [${bot}] water: transit toward known land (oak_log) at [${x},${z}] d=2`
  // (a) 6 launches, 5 at one aim - the floor's own byte (6 is in)
  const floorIn = pinBill([...Array(5).fill(t('F1', -129, 403)), t('F1', -140, 400)])
  assert.deepEqual(floorIn.nearPin, {
    F1: { target: '[-129,403]', launches: 5, of: 6, share: 83.3 }
  })
  // (b) 5 launches all one aim - below the near floor (the coincidence's seat)
  const floorOut = pinBill([...Array(5).fill(t('F2', -129, 403))])
  assert.deepEqual(floorOut.nearPin, {})
  // (c) 9 launches, 6 at one aim - below the share bar (66.7%: the
  // concentration never drops to catch a volume)
  const shareOut = pinBill([...Array(6).fill(t('F3', -129, 403)), t('F3', -140, 400), t('F3', -124, 386), t('F3', -135, 395)])
  assert.deepEqual(shareOut.nearPin, {})
  // (d) 10 launches, 7 at one aim - the pin's own boundary (70% exactly)
  const pinEdge = pinBill([...Array(7).fill(t('F4', -129, 403)), t('F4', -140, 400), t('F4', -124, 386), t('F4', -135, 395)])
  assert.deepEqual(pinEdge.pinned, {
    F4: { target: '[-129,403]', launches: 7, of: 10, share: 70 }
  })
  assert.deepEqual(pinEdge.nearPin, {})
  // (e) 10 launches, 6 at one aim - neither cell (60%)
  const neither = pinBill([...Array(6).fill(t('F5', -129, 403)), t('F5', -140, 400), t('F5', -124, 386), t('F5', -135, 395), t('F5', -150, 410)])
  assert.deepEqual(neither.pinned, {})
  assert.deepEqual(neither.nearPin, {})
})

test('the honest silences hold - the blob form and the empty cells', () => {
  assert.equal(pinBill(null), null)
  assert.equal(pinBill(''), null)
  assert.equal(pinBill([42, 'not a log line']), null)
  // the passes-only face: the fold reads, both verdict cells stay empty
  const p = 'F12 [F12] water: pass 0 head=wet shore=none land=n/a y=44.0 o2=18 probes=0 at=[-125,44,378]'
  const passesOnly = pinBill([p, p])
  assert.equal(passesOnly.n, 0)
  assert.equal(passesOnly.nPass, 2)
  assert.deepEqual(passesOnly.pinned, {})
  assert.deepEqual(passesOnly.nearPin, {})
  // the blob form rides the near cell the same (the v0.722.0 law)
  const face = [
    ...Array(8).fill('F17 [F17] water: transit toward known land (oak_log) at [-143,405] d=13'),
    'F17 [F17] water: transit toward known land (birch_log) at [-131,396] d=8'
  ]
  const pb = pinBill(face)
  assert.deepEqual(pb.nearPin, {
    F17: { target: '[-143,405]', launches: 8, of: 9, share: 88.9 }
  })
  assert.deepEqual(pinBill(face.join('\n') + '\n'), pb)
})
