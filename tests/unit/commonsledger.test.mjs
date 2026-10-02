//
// commonsledger.test.mjs - THE COMMONS LEDGER (v0.502.0) unit tests.
// The lines are byte-verbatim from the stored faces (face 42 = run
// 36967273918, face 43 = run 36970605824, fleet19.log), hand-traced
// per bot first, then pinned. The join law: every ask joins forward
// to the commons sweep that answers it; the sweep closes only at a
// commons verdict (the interleaving-safe law - the F19 law: the
// bot's own death prose rides INSIDE the window); the ask's next
// torch verdict closes the aftermath.
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  commonsLedger, walkWhyClass,
  COMMONS_ANCHOR_RE, COMMONS_TOOK_RE, COMMONS_BUDGET_RE,
  COMMONS_DOOM_RE, COMMONS_DEATH_RE
} from '../../src/lib/commonsledger.mjs'
import { TORCH_RESUPPLY_RE } from '../../src/lib/torchbook.mjs'

// Face 42's F9 window, verbatim and in the live order: the ask opens
// the lane, the sweep walks, the 12s slice dies, the pocket re-reads
// dry. THE DEAD LETTER BOX in miniature.
const FACE42_MINI = [
  'F9 [F9] craft torches: skip (the pocket torch cap: held 0 of 64 - sticks 1 coals 0)', // a LATER lane's line before any ask - never read (no ask pending yet)
  'F9 [F9] craft torches: pocket coal dry (sticks 1) - the torch-coal resupply asks the commons (2 coal)',
  'F9 fuel commons: the anchor chest is read first',
  'F9 fuel commons: path nudge approach: 1 segment(s) walked in 4.9s, goal now d=16.1 (inside the direct envelope)',
  'F9 fuel commons: path nudge inside the direct envelope',
  'F9 fuel commons: the nudge spent the walk slice (-462ms left) - no re-goto clock',
  'F9 fuel commons: budget spent (0/1 units)',
  'F9 [F9] craft torches: skip (no coal: sticks 5 coals 0)' // THE STILL-DRY VERDICT
]

// Face 43's reads: F13's sweep, F3's vertical doom (the yard's
// altitude over the digger), and F13's body - the walk's price.
const FACE43_MINI = [
  'F13 fuel commons: the anchor chest is read first',
  'F13 fuel commons: path nudge approach: 1 segment(s) walked in 10.6s, goal now d=18.1 (inside the direct envelope)',
  'F13 fuel commons: path nudge inside the direct envelope',
  'F13 fuel commons: the nudge spent the walk slice (-74ms left) - no re-goto clock',
  'F13 fuel commons: budget spent (0/1 units)',
  'F3 fuel anchor scan: the palette read empty x1 - the singular probe rescued the scan (chest at [-117,79,411])', // the scan's prose - transparent
  'F3 fuel commons: the anchor chest is read first',
  'F3 fuel commons: chest at [-117,79,409] the yard stands 36 levels up over 4b lateral - the walk ladder cannot climb, the ask rides (the tithe owns the deep resupply)',
  'F3 fuel commons: budget spent (0/2 units)',
  'F13 [F13] death: drown context (o2 reset(-1), feet water, head water, rescue 42s ago, leg fuel commons walk @-145,391, wet 3s@last)'
]

// Face 42's F19 window: THE INTERLEAVING-SAFE LAW's own anchor. The
// bot's death prose rides INSIDE the sweep - and the nudge + the dry
// chests AFTER it still belong to the sweep (the walk reached the
// chest: the nudge retry landed; the chest answered: no fuel; the
// machinery returned: no verdict - the honest silent exhaust). The
// smelt leg's silent ask: no torch ask in front - lane smelt.
const F19_MINI = [
  'F19 fuel anchor scan returned empty (attempt 1/2) at [-130,69,421] yard d=15 - the palette empty-return class, the singular probe found nothing either', // the scan's prose - transparent
  'F19 fuel anchor scan: the palette read empty x1 - the singular probe rescued the scan (chest at [-132,81,420])', // rescued - transparent
  'F19 fuel commons: the anchor chest is read first', // THE OPENER
  'F19 [F19] died - respawning (cause: server: hit the ground too hard [kind=fall] | inferred: fall/env (0s before death at [-132,64,419]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
  'F19 [F19] death drop: pocket read empty at death (0u)',
  'F19 [F19] water: death spot memorized as a hazard at [-132,64,419] (4 live, fleet-wide)',
  'F19 fuel commons: path nudge approach: 1 segment(s) walked in 8.3s, goal now d=11.2 (inside the direct envelope)', // AFTER the death prose - still the sweep's
  'F19 fuel commons: path nudge inside the direct envelope',
  'F19 fuel commons: the nudge retry landed', // the walk REACHED the chest
  'F19 fuel commons: chest holds no fuel',
  'F19 fuel commons: chest holds no fuel',
  'F19 fuel commons: chest holds no fuel',
  'F19 smelt: 0 (raw_copper@-: no fuel; cobblestone@-: no fuel)', // the interleaved other lane - never a verdict
  'F19 fuel commons: chest holds no fuel',
  'F19 fuel commons: chest holds no fuel',
  'F19 fuel commons: budget spent (0/1 units)' // the TRUE verdict (the live window's tail; the exhaust shape is pinned synthetically below)
]

test('commonsLedger: face-42 mini - the ask, the walk, the dead letter', () => {
  const r = commonsLedger(FACE42_MINI)
  assert.ok(r, 'reads the face')
  const f9 = r.bots.F9
  assert.ok(f9, 'F9 present')
  assert.equal(f9.asks, 1)
  assert.equal(f9.askCoal, 2)
  assert.equal(f9.sweeps, 1)
  assert.equal(f9.laneTorch, 1)
  assert.equal(f9.laneSmelt, 0)
  assert.equal(f9.budgetSpent, 1)
  assert.equal(f9.delivered, 0)
  assert.equal(f9.units, 0)
  assert.equal(f9.nudges, 2)
  assert.equal(f9.spentSlice, 1)
  assert.equal(f9.stillDry, 1, 'the ask re-read a dry pocket')
  assert.equal(f9.rePlan, 0)
  // the cap line BEFORE the ask is never read as the aftermath
  assert.equal(f9.cap, 0)
  // the row shape
  const sweep = r.rows.find(x => x.type === 'sweep')
  assert.equal(sweep.lane, 'torch')
  assert.equal(sweep.cls, 'budgetSpent')
  assert.equal(sweep.units, 0)
  const ask = r.rows.find(x => x.type === 'ask')
  assert.equal(ask.cls, 'stillDry')
})

test('commonsLedger: face-43 mini - the doom shape and the body', () => {
  const r = commonsLedger(FACE43_MINI)
  const f13 = r.bots.F13
  assert.equal(f13.sweeps, 1)
  assert.equal(f13.budgetSpent, 1)
  assert.equal(f13.deaths, 1, 'the walk can kill - the drown names the leg')
  const f3 = r.bots.F3
  assert.equal(f3.sweeps, 1)
  assert.equal(f3.verticalDoom, 1)
  assert.deepEqual(f3.doomShapes, ['36up/4lat'], 'the yard stands 36 levels up over 4b lateral')
  assert.equal(f3.budgetSpent, 1, 'the doom excludes and the sweep continues to its verdict')
  const death = r.rows.find(x => x.type === 'death')
  assert.ok(death, 'the death row')
  assert.equal(death.cls, 'drownedOnTheWalk')
  assert.equal(death.bot, 'F13')
})

test('commonsLedger: the F19 law - the sweep survives the bot\'s own death prose', () => {
  const r = commonsLedger(F19_MINI)
  const f19 = r.bots.F19
  assert.equal(f19.sweeps, 1, 'one sweep - the death lines never split it')
  assert.equal(f19.laneSmelt, 1, 'no torch ask in front - the smelt leg\'s silent ask')
  assert.equal(f19.laneTorch, 0)
  assert.equal(f19.emptyChest, 5, 'the dry chests AFTER the death prose are the sweep\'s')
  assert.equal(f19.nudges, 2)
  assert.equal(f19.budgetSpent, 1, 'the true verdict closes it')
  assert.equal(f19.deaths, 0, 'this death is not the commons leg (fall, not the walk)')
})

test('commonsLedger: the delivered grammar - the success the field never showed', () => {
  const lines = [
    'F5 [F5] craft torches: pocket coal dry (sticks 2) - the torch-coal resupply asks the commons (2 coal)',
    'F5 fuel commons: the anchor chest is read first',
    'F5 fuel commons: took 2 units (2 x coal) from a yard chest',
    'F5 [F5] craft torches: 1 batch(es) -> 4 torches (sticks 2 coals 2)'
  ]
  const r = commonsLedger(lines)
  const f5 = r.bots.F5
  assert.equal(f5.sweeps, 1)
  assert.equal(f5.delivered, 1)
  assert.equal(f5.units, 2)
  assert.equal(f5.rePlan, 1, 'the terminal closes the ask as a re-plan')
  assert.equal(f5.stillDry, 0)
})

test('commonsLedger: the silent exhaust and the honest open', () => {
  // a sweep that exhausts through excludes reads the honest exhaust
  // when the log's tail (or the bot's next sweep) closes it
  const lines = [
    'F8 fuel commons: the anchor chest is read first',
    'F8 fuel commons: chest at [10,80,10] the yard stands 37 levels up over 1b lateral - the walk ladder cannot climb, the ask rides (the tithe owns the deep resupply)',
    'F8 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F8 [F8] walk: the dig resumes' // interleaved prose - never a verdict
  ]
  const r = commonsLedger(lines)
  const f8 = r.bots.F8
  assert.equal(f8.sweeps, 1)
  assert.equal(f8.silentExhaust, 1, 'no verdict - the tail closes the honest exhaust')
  assert.equal(f8.verticalDoom, 1)
  assert.equal(f8.walkFail, 1)
  assert.deepEqual(f8.walkFailWhys, { 'No path to the goal!': 1 })
  // the ask at the tail with no torch verdict: the honest open
  const lines2 = [
    'F4 [F4] craft torches: pocket coal dry (sticks 1) - the torch-coal resupply asks the commons (2 coal)',
    'F4 fuel commons: the anchor chest is read first',
    'F4 fuel commons: budget spent (0/1 units)'
  ]
  const r2 = commonsLedger(lines2)
  const f4 = r2.bots.F4
  assert.equal(f4.asks, 1)
  assert.equal(f4.askOpen, 1, 'no torch verdict after - the honest open')
  assert.equal(f4.sweeps, 1)
  assert.equal(f4.laneTorch, 1)
})

test('commonsLedger: the zero-field grammar classes pinned synthetically', () => {
  const lines = [
    'F2 fuel commons: the anchor chest is read first',
    'F2 fuel commons: no yard chest in range',
    'F2 fuel commons: the anchor chest is read first',
    'F2 fuel commons: open failed (open fuel chest: timeout after 10000ms)',
    'F2 fuel commons: open failed after the cover dig (timeout after 10000ms)',
    'F2 fuel commons: the chest block vanished after the cover dig',
    'F2 fuel commons: the cover dig stands down (not at the chest)',
    'F2 fuel commons: the clicks lied (ghost clicks) - the window is still open, re-firing the same plan once',
    'F2 fuel commons: the re-segment spent the walk slice (340ms left) - the exclude owns the chest',
    'F2 fuel commons: envelope re-segment nudge inside the direct envelope',
    'F2 fuel commons: the clicks lied twice - nothing landed in the pocket (ghost clicks)'
  ]
  const r = commonsLedger(lines)
  const f2 = r.bots.F2
  assert.equal(f2.sweeps, 2)
  assert.equal(f2.noChest, 1, 'the c===0 break - the grammar owns it (0 in field)')
  assert.equal(f2.ghost, 1, 'the twice-lied verdict closes the second sweep')
  assert.equal(f2.openFail, 2, 'both open-fail skins')
  assert.equal(f2.blockVanished, 1)
  assert.equal(f2.coverStandDown, 1)
  assert.equal(f2.ghostRetry, 1)
  assert.equal(f2.spentSlice, 1)
  assert.equal(f2.resegments, 1)
  assert.equal(f2.silentExhaust, 0)
})

test('commonsLedger: the one-parser law - torchbook\'s own ask skin', () => {
  // the RE identity: the lib imports, never re-creates
  const re = commonsLedger && TORCH_RESUPPLY_RE
  assert.ok(re)
  assert.ok(re.test('F9 [F9] craft torches: pocket coal dry (sticks 1) - the torch-coal resupply asks the commons (2 coal)'))
  // other lanes' lines never open a sweep and never close an ask
  const lines = [
    'F6 [F6] climb: walkable surface at y=63 (+1 levels, dug=0) - the walk takes over (blocked step)',
    'F6 fuel commons: chest holds no fuel', // commons line outside a sweep - not ours to read
    'F6 [F6] craft torches: skip (no coal: sticks 1 coals 0)'
  ]
  const r = commonsLedger(lines)
  assert.equal(r.bots.F6, undefined, 'no sweep opened - the honest zero bot')
  assert.equal(r.rows.length, 0)
})

test('commonsLedger: the book law and the totals', () => {
  const r = commonsLedger([...FACE42_MINI, ...FACE43_MINI, ...F19_MINI])
  const t = r.totals
  // the book law: sweeps = delivered + budgetSpent + ghost + noChest + silentExhaust
  assert.equal(t.sweeps, t.delivered + t.budgetSpent + t.ghost + t.noChest + t.silentExhaust)
  // the ask law: asks = rePlan + stillDry + cap + reserve + error + askOpen
  assert.equal(t.asks, t.rePlan + t.stillDry + t.cap + t.reserve + t.error + t.askOpen)
  assert.equal(t.asks, 1, 'the aggregate fixture carries exactly one ask (F9\'s)')
  assert.equal(t.sweeps, 4)
  assert.equal(t.deaths, 1)
  assert.equal(t.units, 0, 'the dead letter box - zero units across the whole book')
})

test('commonsLedger: the junk battery and the honest zero', () => {
  assert.equal(commonsLedger(null), null)
  assert.equal(commonsLedger(undefined), null)
  assert.equal(commonsLedger(42), null)
  const r = commonsLedger([])
  assert.ok(r)
  assert.deepEqual(r.bots, {})
  assert.deepEqual(r.totals.doomShapes, [])
  assert.deepEqual(r.rows, [])
  assert.equal(r.totals.sweeps, 0)
  const junk = commonsLedger([
    42, null, '', '   ',
    'b] n=1 ts=21s rss=255M late=6ms mainLate=0ms',
    't-0s alive=19/19 mined=1971 map=897p/17ch banked=0 smelted=5 pocket=1693u/226s | sand=32 gravel=55 dirt=252 stone=4',
    '[F19] sweep walk refused by a 4s cooldown - waiting it out once on this machine (a cooldown is a clock, not a verdict)',
    'F1 [F1] shelter: ring try (target drowned d=3, ring stock 2/8)',
    'F1 fuel commons: chest holds no fuel' // anatomy outside a sweep - dropped
  ])
  assert.deepEqual(junk.bots, {})
  assert.equal(junk.rows.length, 0)
})

test('commonsLedger: the why class and the grammar heads', () => {
  assert.equal(walkWhyClass('Took to long to decide path to goal!'), 'Took to long to decide path to goal!')
  assert.equal(walkWhyClass('No path to the goal!'), 'No path to the goal!')
  assert.equal(walkWhyClass('water rescue in progress (iron commune walk @-143,391 (nudge retry'), 'water rescue in progress')
  assert.equal(walkWhyClass(null), '')
  // the anchor read is the opener, byte-exact
  assert.ok(COMMONS_ANCHOR_RE.test('F9 fuel commons: the anchor chest is read first'))
  assert.ok(!COMMONS_ANCHOR_RE.test('F9 fuel anchor scan: the palette read empty x1 - the singular probe rescued the scan (chest at [-132,81,420])'))
  assert.ok(COMMONS_TOOK_RE.test('F5 fuel commons: took 2 units (2 x coal) from a yard chest'))
  assert.ok(COMMONS_BUDGET_RE.test('F9 fuel commons: budget spent (0/1 units)'))
  assert.ok(COMMONS_DOOM_RE.test('F3 fuel commons: chest at [-117,79,409] the yard stands 36 levels up over 4b lateral - the walk ladder cannot climb, the ask rides (the tithe owns the deep resupply)'))
  assert.ok(COMMONS_DEATH_RE.test('F13 [F13] death: drown context (o2 reset(-1), feet water, head water, rescue 42s ago, leg fuel commons walk @-145,391, wet 3s@last)'))
  assert.ok(!COMMONS_DEATH_RE.test('F1 [F1] death: drown context (o2 reset(-1), feet water, head water, rescue 42s ago, leg bank walk @-145,391, wet 3s@last)'))
})
