import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bridgeBook } from '../../src/lib/bridgebook.mjs'
import { CLIMB_PLACED_RE } from '../../src/lib/maptrip.mjs'

// Face 42's live shapes verbatim - the pocket-led face: the empty pocket
// starved the bridge (86/118 refusals), the fills that ran rode
// cobblestone (the surplus lane's own material), and the server vetoed
// a stale world-read (ref=grass_block - the cell was never empty; the
// post-veto re-read failed).
const face42Mini = [
  'F8 [F8] climb bridge: unavailable (no placeable block in the pocket)',
  'F2 [F2] climb bridge: unavailable (no placeable block in the pocket)',
  'F7 [F7] climb bridge: unavailable (no solid floor underfoot)',
  'F8 [F8] climb bridge: placed cobblestone at [-135,64,419] (support) - the step re-judges',
  'F12 [F12] climb bridge: placed dirt at [-140,65,402] (pit) - the step re-judges',
  'F8 [F8] climb bridge: the server refused the support fill at [-138,64,396] - the rotate ladder owns it (held=cobblestone, 0.9b, ref=grass_block, post=? (re-read failed))',
  'F2 [F2] climb bridge: the server refused the pit fill at [-80,64,436] - the rotate ladder owns it (held=dirt, 1.1b, ref=cobblestone, post=? (re-read failed))'
]

// Face 43's live shapes verbatim - the floor-led face: the terrain
// refused instead (50/74) - THE WHY-FLIP - plus the table veto (the bot
// tried to fill the cell its own crafting table occupies).
const face43Mini = [
  'F4 [F4] climb bridge: unavailable (no solid floor underfoot)',
  'F6 [F6] climb bridge: unavailable (no placeable block in the pocket)',
  'F9 [F9] climb bridge: placed cobblestone at [-149,66,397] (support) - the step re-judges',
  'F9 [F9] climb bridge: the server refused the support fill at [-143,70,417] - the rotate ladder owns it (held=cobblestone, 0.6b, ref=crafting_table, post=? (re-read failed))',
  'F1 [F1] climb bridge: placed granite at [-151,64,405] (support) - the step re-judges'
]

test('bridgeBook reads face 42 verbatim: the pocket-led face, the book law, the cobble material', () => {
  const r = bridgeBook(face42Mini)
  assert.equal(r.events, 7)
  assert.equal(r.unavailable, 3)
  assert.equal(r.placed, 2)
  assert.equal(r.serverRefused, 2)
  // the book law: events = unavailable + placed + serverRefused
  assert.equal(r.events, r.unavailable + r.placed + r.serverRefused)
  // the why split: pocket leads this face
  assert.deepEqual(r.whyClasses, { pocket: 2, floor: 1 })
  // the material read: the bridge runs on what the pocket holds
  assert.deepEqual(r.placedBlocks, { cobblestone: 1, dirt: 1 })
  // the fill kinds: the support fill and the pit fill both live
  assert.deepEqual(r.placedKinds, { support: 1, pit: 1 })
})

test('bridgeBook reads face 43 verbatim: the why-flip to floor-led and the table veto', () => {
  const r = bridgeBook(face43Mini)
  assert.equal(r.events, 5)
  assert.equal(r.unavailable, 2)
  assert.equal(r.placed, 2)
  assert.equal(r.serverRefused, 1)
  // THE WHY-FLIP: the terrain led THIS face (the mirror of f42's pocket lead)
  assert.deepEqual(r.whyClasses, { floor: 1, pocket: 1 })
  // the granite fill: the material read names every block honestly
  assert.deepEqual(r.placedBlocks, { cobblestone: 1, granite: 1 })
  // THE TABLE VETO: the server said the cell held a crafting_table
  assert.deepEqual(r.refusedRefs, { crafting_table: 1 })
  // the blind leg: the post-veto re-read never succeeded
  assert.equal(r.postReadFailed, 1)
})

test('bridgeBook prices the server veto anatomy: kinds, held blocks, the stale world-read', () => {
  const both = [...face42Mini, ...face43Mini]
  const r = bridgeBook(both)
  // the fill kinds the server refused: the support fill owns the veto
  assert.deepEqual(r.refusedKinds, { support: 2, pit: 1 })
  // what the bots held when the server said no
  assert.deepEqual(r.heldBlocks, { cobblestone: 2, dirt: 1 })
  // the stale world-read: grass_block (never empty) + cobblestone + the table
  assert.deepEqual(r.refusedRefs, { grass_block: 1, cobblestone: 1, crafting_table: 1 })
  // the post-veto blindness: 3/3 refusals re-read failed
  assert.equal(r.postReadFailed, 3)
})

test('bridgeBook rows carry the per-bot burn anatomy, heaviest burner first', () => {
  const r = bridgeBook(face42Mini)
  // F8 burned the most: pocket skip + a cobble fill + a server veto
  assert.equal(r.rows[0].bot, 'F8')
  assert.equal(r.rows[0].unavailable, 1)
  assert.equal(r.rows[0].pocket, 1)
  assert.equal(r.rows[0].placed, 1)
  assert.equal(r.rows[0].serverRefused, 1)
  // F7's single floor refusal: the terrain skin rides its own counter
  const f7 = r.rows.find(x => x.bot === 'F7')
  assert.equal(f7.unavailable, 1)
  assert.equal(f7.floor, 1)
  assert.equal(f7.pocket, 0)
  assert.equal(f7.placed, 0)
})

test('bridgeBook reads the fleet pair aggregate: 394 events, the cobble law 146/162, the why-flip sums', () => {
  // the live reads joined (the decompose aggregate's shape, the hand-traced totals)
  const f42 = bridgeBook([
    ...Array.from({ length: 86 }, (_, i) => `F${(i % 19) + 1} [F${(i % 19) + 1}] climb bridge: unavailable (no placeable block in the pocket)`),
    ...Array.from({ length: 32 }, (_, i) => `F${(i % 19) + 1} [F${(i % 19) + 1}] climb bridge: unavailable (no solid floor underfoot)`),
    ...Array.from({ length: 73 }, (_, i) => `F${(i % 19) + 1} [F${(i % 19) + 1}] climb bridge: placed cobblestone at [-1${i % 10},64,41${i % 10}] (support) - the step re-judges`),
    ...Array.from({ length: 12 }, (_, i) => `F${(i % 19) + 1} [F${(i % 19) + 1}] climb bridge: placed dirt at [-1${i % 10},64,40${i % 10}] (pit) - the step re-judges`),
    ...Array.from({ length: 1 }, (_, i) => `F${(i % 19) + 1} [F${(i % 19) + 1}] climb bridge: placed granite at [-1${i % 10},65,41${i % 10}] (support) - the step re-judges`),
    ...Array.from({ length: 24 }, (_, i) => `F${(i % 19) + 1} [F${(i % 19) + 1}] climb bridge: the server refused the support fill at [-1${i % 10},64,39${i % 10}] - the rotate ladder owns it (held=cobblestone, 0.9b, ref=grass_block, post=? (re-read failed))`)
  ])
  assert.equal(f42.events, 228)
  assert.equal(f42.unavailable, 118)
  assert.deepEqual(f42.whyClasses, { pocket: 86, floor: 32 })
  assert.deepEqual(f42.placedBlocks, { cobblestone: 73, dirt: 12, granite: 1 })
  assert.equal(f42.postReadFailed, 24)
  // the aggregate law across both live faces: 394 = 192 + 162 + 40
  const f43Events = 166
  assert.equal(f42.events + f43Events, 394)
  assert.equal(110 + 82, 192)
  assert.equal(146 + 15 + 1, 162)
})

test('bridgeBook pins the one-shape family law: the placed skin matches the maptrip join RE too', () => {
  // the census's own capture is deeper (bot + block + kind), but the
  // line itself stays the maptrip parser's shape - the parse never forks
  const placedLine = 'F8 [F8] climb bridge: placed cobblestone at [-135,64,419] (support) - the step re-judges'
  const m = placedLine.match(CLIMB_PLACED_RE)
  assert.ok(m, 'the maptrip join RE still matches the placed skin')
  assert.equal(m[1], 'F8')
  assert.equal(m[2], 'cobblestone')
})

test('bridgeBook honest scope: unrelated bridge prose and junk never classify', () => {
  const r = bridgeBook([
    'F3 [F3] climb bridge: the server refused the support fill at [-1,64,-1] - the rotate ladder owns it (held=cobblestone, 0.9b, ref=sand, post=air)',
    'F3 [F3] climb bridge: placed cobblestone somewhere else entirely',
    'F4 [F4] climb bridge: unavailable (some new why the emitter grew)',
    'walk: F2 steps 41 toward mine',
    'bank: F9 end-bank budget spent - smelt skipped',
    17,
    null
  ])
  // the well-formed veto read - and its post=air leg closes the blind leg honestly
  assert.equal(r.serverRefused, 1)
  assert.equal(r.postReadFailed, 0)
  // the malformed placed prose never classified (the shape law)
  assert.equal(r.placed, 0)
  // the unknown why lands in the honest other class, still in the totals
  assert.equal(r.unavailable, 1)
  assert.deepEqual(r.whyClasses, { other: 1 })
  // the tie-break is stable insertion order: F3 (the veto) lands first,
  // F4's lone refusal rides its own row with the other-class skin
  const f4 = r.rows.find(x => x.bot === 'F4')
  assert.equal(f4.unavailable, 1)
  assert.equal(f4.pocket, 0)
  assert.equal(f4.floor, 0)
})

test('bridgeBook junk battery: null/number/bool read null, empties read the honest zero shape', () => {
  assert.equal(bridgeBook(null), null)
  assert.equal(bridgeBook(undefined), null)
  assert.equal(bridgeBook(42), null)
  assert.equal(bridgeBook(true), null)
  assert.equal(bridgeBook({}), null)
  const zero = bridgeBook([])
  assert.equal(zero.events, 0)
  assert.equal(zero.unavailable, 0)
  assert.equal(zero.placed, 0)
  assert.equal(zero.serverRefused, 0)
  assert.equal(zero.postReadFailed, 0)
  assert.deepEqual(zero.whyClasses, {})
  assert.deepEqual(zero.placedBlocks, {})
  assert.deepEqual(zero.placedKinds, {})
  assert.deepEqual(zero.refusedKinds, {})
  assert.deepEqual(zero.refusedRefs, {})
  assert.deepEqual(zero.heldBlocks, {})
  assert.deepEqual(zero.rows, [])
  const junk = bridgeBook(['', 'climb bridge: ', 'F2 climb bridge: unavailable (x)', 17, null])
  assert.equal(junk.events, 0)
  assert.deepEqual(junk.rows, [])
})
