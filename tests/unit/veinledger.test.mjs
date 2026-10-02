import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  veinLedger,
  VEIN_TERMINAL_RE, VEIN_GALLERY_RE, VEIN_TIERGUARD_RE,
  VEIN_DIGDOWN_RE, VEIN_STANCELANDED_RE, VEIN_DROPWALK_RE
} from '../../src/lib/veinledger.mjs'
import { dropWalkCensus } from '../../src/lib/dropwalk.mjs'

// The face-42 mini: live rows in the live order (face 42, the stored
// artifact 11210753776) - the terminal, the walk yield, the BARE
// gallery skin, the dropwalk boundary row, the dig refusals, the
// spares, the wide-goal triage, the support dig-down.
const FACE42_MINI = [
  'F9 [F9] vein sweep: 8 drop(s) in reach (19 dug)',
  'F9 [F9] vein sweep: +12u walked from the drops (19 dug)',
  'F9 vein sweep: 19 ores dug beside the gallery (floor lock)',
  'F9 [F9] vein sweep: the drop walk to [-129,46,407] failed - sweep drops: timeout after 8000ms (dy 2.0, range 2, walked 0.4)',
  'F6 [F6] vein sweep: lip dig refused - sealed floor (air 0, dy -0.9)',
  'F9 [F9] vein sweep: support dig refused - sealed under the ledge (air 0, dist 2.1, seal 3)',
  'F3 [F3] vein sweep: support dig refused - the support reads air (air null, dist 1.6)',
  'F12 [F12] vein sweep: ledge cut refused - the dy reads out of class (seal 3, dy 1.0770640224137296, dist 3.1)',
  'F19 [F19] vein sweep: 3 deep drop(s) skipped (dy < -2 - the lip sphere cannot reach, the walk was a guaranteed spiral)',
  'F1 [F1] vein sweep: 4 drop(s) already inside the goal - the zero-displacement walk spared (the instant done the spin book reads as churn)',
  'F3 [F3] vein sweep: 1 drop goal(s) refused before the goto (no standable cell in the arrival sphere - the walk was a proven burn)',
  'F9 [F9] vein sweep: 1 above-plane walk(s) timed out on the wide goal (range 2) - the ledge family (the v0.189.0 class, the triage names it)',
  'F9 [F9] vein sweep: 1 below-plane walk(s) still failed on the wide goal (range 2) - the drop rests deeper than the lip',
  'F8 [F8] vein sweep: the drop walks picked nothing (pocket delta 0, 0 failed walk(s))',
  'F10 [F10] vein sweep: 1 support dig-down(s) - the failed ledge walk shook the drop loose, the fall carries it to the magnet'
]

// The face-43 mini: live rows in the live order (face 43, the stored
// artifact 11216019077) - the tier guard's BOTH arities, the stance
// lane, the lip dig-down, the honest other-why refusals.
const FACE43_MINI = [
  'F12 [F12] vein sweep: ore tier guard - 11 copper_ore left for a stone pick (have wooden_pickaxe)',
  'F14 [F14] vein sweep: ore tier guard - 9 iron_ore, 3 copper_ore left for a stone pick (have wooden_pickaxe)',
  'F3 [F3] vein sweep: stance step armed - the ledge reads too high (dy 6, dist 2.4 - closing to the column)',
  'F3 [F3] vein sweep: high ledge stance landed - dist 1.5, the dig still refuses - the ledge reads too high, walked 0.9',
  'F3 [F3] vein sweep: 1 lip dig-down(s) - the range-2 arrival left the drop outside the magnet, the last mile dug',
  'F16 [F16] vein sweep: lip dig refused - the cover reads air (air null, dy -1.0)',
  'F3 [F3] vein sweep: ledge cut refused - the stand-off exceeds the magnet (seal 3, dy 2, dist 4.8)',
  'F17 [F17] vein sweep: support dig refused - the ledge reads too high (air 0, dist 2.9)'
]

test('vein ledger: the face-42 mini in the live order (the terminal, the yield, the bare gallery, the refusals, the spares)', () => {
  const g = veinLedger(FACE42_MINI)
  assert.ok(g, 'the book reads the face')

  // F9 is SIX lives: the terminal, the yield, the gallery (the BARE
  // prefix skin), the support refusal, the above-plane timeout and
  // the below-plane fail. The drop-walk row is dropwalk's - unread.
  assert.deepEqual(g.bots.F9, {
    terminals: 1, terminalDrops: 8, terminalDug: 19,
    yields: 1, yieldU: 12, yieldDug: 19,
    gallery: 1, galleryOres: 19, galleryFloorLock: 1, galleryOreDetour: 0,
    lipRefusals: 0,
    supportRefusals: 1, supportSeal: 3,
    ledgeRefusals: 0,
    deepSkips: 0, deepSkippedDrops: 0,
    spared: 0, sparedDrops: 0,
    goalRefusals: 0, goalRefusedDrops: 0,
    aboveTimeouts: 1, aboveWalks: 1,
    belowFails: 1, belowWalks: 1,
    pickedNothings: 0, pickedDelta: 0, pickedFailedWalks: 0,
    tierGuards: 0, tierGuardOres: 0,
    digDowns: 0, digDownDrops: 0, digDownSupport: 0, digDownLip: 0,
    stanceArmed: 0, stanceLanded: 0, stanceWalked: 0,
    total: 6
  })
  // F3: the air-null support refusal + the proven-burn goal refusal.
  assert.equal(g.bots.F3.supportRefusals, 1)
  assert.equal(g.bots.F3.goalRefusals, 1)
  assert.equal(g.bots.F3.goalRefusedDrops, 1)
  // F19's guaranteed-spiral refusal: 3 drops never walked.
  assert.deepEqual(
    [g.bots.F19.deepSkips, g.bots.F19.deepSkippedDrops], [1, 3])
  // F1's zero-displacement spare: 4 drops inside the goal.
  assert.deepEqual([g.bots.F1.spared, g.bots.F1.sparedDrops], [1, 4])
  // F10's support dig-down (the fall carries it to the magnet).
  assert.deepEqual(
    [g.bots.F10.digDowns, g.bots.F10.digDownSupport, g.bots.F10.digDownLip],
    [1, 1, 0])
  // F8's picked-nothing: the walk burned, the pocket paid zero.
  assert.deepEqual(
    [g.bots.F8.pickedNothings, g.bots.F8.pickedDelta, g.bots.F8.pickedFailedWalks],
    [1, 0, 0])

  assert.equal(g.totals.total, 14)
  assert.deepEqual(g.totals.terminals, 1)
  assert.deepEqual(
    [g.totals.terminalDrops, g.totals.terminalDug], [8, 19])
  assert.deepEqual([g.totals.yields, g.totals.yieldU], [1, 12])
  assert.equal(g.totals.galleryFloorLock, 1)
  assert.equal(g.totals.galleryOreDetour, 0)
  assert.deepEqual(g.totals.lipWhys, { 'sealed floor': 1 })
  assert.deepEqual(g.totals.supportWhys, {
    'sealed under the ledge': 1, 'the support reads air': 1
  })
  assert.equal(g.totals.supportSeal, 3)
  assert.deepEqual(g.totals.ledgeWhys, { 'the dy reads out of class': 1 })
  assert.equal(g.totals.deepSkippedDrops, 3)
  assert.equal(g.totals.sparedDrops, 4)
  assert.equal(g.totals.goalRefusedDrops, 1)
  assert.equal(g.totals.aboveWalks, 1)
  assert.equal(g.totals.belowWalks, 1)
  assert.equal(g.totals.tierGuards, 0)
})

test('vein ledger: the face-43 mini in the live order (the tier guard both arities, the stance lane, the lip dig-down)', () => {
  const g = veinLedger(FACE43_MINI)
  assert.ok(g, 'the book reads the face')

  // F3 is FOUR lives: the stance armed, the stance landed, the lip
  // dig-down and the stand-off ledge cut.
  assert.equal(g.bots.F3.total, 4)
  assert.deepEqual(
    [g.bots.F3.stanceArmed, g.bots.F3.stanceLanded, g.bots.F3.stanceWalked],
    [1, 1, 0.9])
  assert.deepEqual(
    [g.bots.F3.digDowns, g.bots.F3.digDownLip], [1, 1])
  assert.deepEqual(
    [g.bots.F3.ledgeRefusals], [1])
  // F12's single-ore guard: 11 copper refused.
  assert.deepEqual(
    [g.bots.F12.tierGuards, g.bots.F12.tierGuardOres], [1, 11])
  // F14's multi-ore guard: 9 iron + 3 copper = 12 units in one row.
  assert.deepEqual(
    [g.bots.F14.tierGuards, g.bots.F14.tierGuardOres], [1, 12])
  // F16's honest other-why lip refusal (the cover reads air).
  assert.equal(g.bots.F16.lipRefusals, 1)
  // F17's too-high support refusal (no seal in the anatomy).
  assert.deepEqual(
    [g.bots.F17.supportRefusals, g.bots.F17.supportSeal], [1, 0])

  assert.equal(g.totals.total, 8)
  // The units sum per ore NAME across both arities: 14 copper + 9 iron.
  assert.deepEqual(g.totals.tierGuardNames, {
    copper_ore: 14, iron_ore: 9
  })
  assert.equal(g.totals.tierGuardOres, 23)
  assert.deepEqual(g.totals.stanceArmedWhys, { 'the ledge reads too high': 1 })
  assert.deepEqual(g.totals.stanceLandedWhys, { 'the ledge reads too high': 1 })
  assert.equal(g.totals.stanceWalked, 0.9)
  assert.deepEqual(g.totals.lipWhys, { 'the cover reads air': 1 })
  assert.deepEqual(g.totals.ledgeWhys, { 'the stand-off exceeds the magnet': 1 })
  assert.deepEqual(g.totals.supportWhys, { 'the ledge reads too high': 1 })
})

test('vein ledger: the both-faces aggregate with the cross-face name-merge law (F3 AND F12 are both lives)', () => {
  const g = veinLedger([...FACE42_MINI, ...FACE43_MINI])
  assert.ok(g, 'the book reads the merged face')
  // F3: 2 (face 42) + 4 (face 43) = 6. F12: 1 + 1 = 2.
  assert.equal(g.bots.F3.total, 6)
  assert.equal(g.bots.F12.total, 2)
  // F12's two lives are DIFFERENT classes: the ledge cut + the tier guard.
  assert.equal(g.bots.F12.ledgeRefusals, 1)
  assert.equal(g.bots.F12.tierGuards, 1)
  assert.equal(g.totals.total, 22)
  // The per-total distribution: two bots at 6, one at 2, eight at 1.
  assert.deepEqual(g.totals.veinBots, { 6: 2, 2: 1, 1: 8 })
})

test('vein ledger: the scope pins (the dropwalk boundary both ways, the bare gallery skin, the honest non-lane zero)', () => {
  // The ownership boundary: the live drop-walk fail row is dropwalk's.
  const dropwalkRow = 'F9 [F9] vein sweep: the drop walk to [-129,46,407] failed - sweep drops: timeout after 8000ms (dy 2.0, range 2, walked 0.4)'
  assert.ok(VEIN_DROPWALK_RE.test(dropwalkRow), 'the boundary RE reads the drop-walk row')
  // ...and the vein ledger reads ZERO of it (the honest empty face).
  const alone = veinLedger([dropwalkRow])
  assert.equal(alone.totals.total, 0)
  assert.deepEqual(alone.bots, {})
  // ...and dropwalk's own census still owns it (the both-ways pin).
  const dw = dropWalkCensus([dropwalkRow])
  assert.ok(dw, 'dropwalk reads its own row')
  assert.ok(dw.fails >= 1, 'dropwalk counts the fail')

  // The bare gallery skin: no [F9] tag, still the bot's own row.
  const bare = 'F9 vein sweep: 19 ores dug beside the gallery (floor lock)'
  assert.ok(VEIN_GALLERY_RE.test(bare))
  const bg = veinLedger([bare])
  assert.equal(bg.bots.F9.gallery, 1)

  // The terminal's RE does not swallow the gallery row and vice versa.
  assert.ok(!VEIN_TERMINAL_RE.test(bare))

  // A foreign lane's line reads zero (no cross-lane capture).
  const foreign = veinLedger([
    'F9 [F9] climb diag: level at y=67 did not rise (food=20, dug=1) feet=air support=oak_leaves step=air head=air',
    'F9 [F9] craft torches: skip (no coal: sticks 4 coals 0)',
    'F9 [F9] climb pounce probe: the signature declined (support=null, step=null, head=null) - the well census continues'
  ])
  assert.equal(foreign.totals.total, 0)
  assert.deepEqual(foreign.bots, {})
})

test('vein ledger: the junk battery and the honest zero', () => {
  // Junk input: non-array reads null.
  assert.equal(veinLedger(null), null)
  assert.equal(veinLedger(undefined), null)
  assert.equal(veinLedger('F9 [F9] vein sweep: 8 drop(s) in reach (19 dug)'), null)
  assert.equal(veinLedger(42), null)
  // Junk rows inside the array are skipped, honest rows still read.
  const g = veinLedger([
    null, undefined, 42, { bot: 'F9' }, '',
    'F9 [F9] vein sweep: 8 drop(s) in reach (19 dug)',
    'garbage line without a lane'
  ])
  assert.ok(g, 'the book survives the junk battery')
  assert.equal(g.totals.total, 1)
  assert.equal(g.totals.terminals, 1)
  // The empty face reads the honest zero.
  const z = veinLedger([])
  assert.deepEqual(z.bots, {})
  assert.equal(z.totals.total, 0)
  assert.deepEqual(z.totals.tierGuardNames, {})
  assert.deepEqual(z.totals.stanceArmedWhys, {})
  // The stance-landed RE's group order: dist, why, walked.
  const sm = VEIN_STANCELANDED_RE.exec(
    'F13 [F13] vein sweep: high ledge stance landed - dist 0.6, the dig still refuses - the ledge reads too high, walked 1.0')
  assert.deepEqual(sm.slice(1), ['F13', '0.6', 'the ledge reads too high', '1.0'])
  // The dig-down RE's kind capture: bot, count, kind (support vs lip).
  assert.equal(VEIN_DIGDOWN_RE.exec(
    'F10 [F10] vein sweep: 1 support dig-down(s) - the failed ledge walk shook the drop loose, the fall carries it to the magnet')[3],
  'support')
  // The tier guard RE's WIDE list capture (the arity-one case too).
  assert.equal(VEIN_TIERGUARD_RE.exec(
    'F12 [F12] vein sweep: ore tier guard - 11 copper_ore left for a stone pick (have wooden_pickaxe)')[2],
  '11 copper_ore')
})
