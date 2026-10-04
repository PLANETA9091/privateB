// (v0.607.0) THE BRIDGE REFUSAL BOOK - the tests. The face 37188370162
// (f83b64f = v0.606.0): 125 refusals (floor 67 / pocket 58), 4 landed fills,
// 19 failed climb cycles with the doom census naming only the stall. The book
// rides the walkfail book's test law: byte-exact rows, the face's own shape,
// the torn sweep, the junk battery, the sort law, the half boundary.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseBridgeRefusal,
  parseBridgeFill,
  bridgeRefusalClass,
  bridgeRefusalCensus,
  bridgeRefusalRow,
  parseServerRefusedFill,
  BRIDGE_SHARE,
  BRIDGE_BOOK_TORN_RE,
  BRIDGE_REFUSED_TORN_RE
} from '../../src/lib/climbbridge.mjs'

const FLOOR = 'F14 [F14] climb bridge: unavailable (no solid floor underfoot)'
const POCKET = 'F8 [F8] climb bridge: unavailable (no placeable block in the pocket)'
const STEP = 'F9 [F9] climb bridge: unavailable (the step cells are not clear (the dig ladder owns this level))'
const BUDGET = 'F1 [F1] climb bridge: unavailable (the bridge budget is spent (3/8))'
const GEOM = 'F2 [F2] climb bridge: unavailable (no geometry read)'
const FILL_PIT = 'F1 [F1] climb bridge: placed cobblestone at [-111,17,425] (pit) - the step re-judges'
const FILL_SUPPORT = 'F14 [F14] climb bridge: placed dirt at [-143,64,407] (support) - the step re-judges'

test('bridge refusal book: the clean faces', () => {
  assert.equal(BRIDGE_SHARE, 0.5)
  assert.equal(bridgeRefusalRow(bridgeRefusalCensus([])), 'bridge refusal book: none refused, none placed (the bridge never spoke this run)')
  assert.equal(bridgeRefusalRow(bridgeRefusalCensus([FILL_PIT, FILL_SUPPORT, 't-0s alive=19/19'])), 'bridge refusal book: none refused, 2 fill(s) placed (the climbs climbed clean)')
})

test('bridge refusal book: the face 37188370162 own shape - the floor owns the climb tax', () => {
  const lines = []
  for (let i = 0; i < 67; i++) lines.push(i % 2 ? FLOOR : FLOOR.replace('F14 [F14]', `F1${i % 6} [F1${i % 6}]`))
  for (let i = 0; i < 58; i++) lines.push(POCKET)
  lines.push(FILL_PIT, FILL_SUPPORT, 'F1 [F1] climb bridge: placed cobblestone at [-111,18,425] (support) - the step re-judges', 'F9 [F9] climb bridge: placed andesite at [-124,66,401] (pit) - the step re-judges')
  const c = bridgeRefusalCensus(lines)
  assert.equal(c.n, 125)
  assert.equal(c.places, 4)
  assert.equal(c.byClass.floor, 67)
  assert.equal(c.byClass.pocket, 58)
  // the refusal tags name the even-i rotation F10/F12/F14 (i%6 in {0,2,4})
  // + POCKET's F8 = 4 bots; the fills do NOT join the bot set (the book
  // counts the refusals' bots - the transport has no bot of its own)
  assert.equal(c.botCount, 4)
  assert.equal(
    bridgeRefusalRow(c),
    'bridge refusal book: 125 refusal(s) across 4 bot(s), 4 fill(s) placed - floor 67 (54%), pocket 58 (46%) - the floor owns the climb tax (the bot stands over its own hole - the support-under-self fill is the front)'
  )
})

test('bridge refusal book: the pocket class owns its own half', () => {
  const lines = [...Array(58).fill(POCKET), ...Array(57).fill(FLOOR)]
  const c = bridgeRefusalCensus(lines)
  assert.equal(c.byClass.pocket, 58)
  assert.equal(c.byClass.floor, 57)
  const row = bridgeRefusalRow(c)
  assert.ok(row.includes('the pocket owns the climb tax (the climb arrives empty-handed - the carried fill is the front)'))
  // the pct helper rounds - 57/115 = 49.6% reads 50% in the list; the verdict
  // rides the SORT (pocket first: 58 > 57), not the rounding
  assert.ok(row.includes('pocket 58 (50%), floor 57 (50%)'))
})

test('bridge refusal book: the step, budget, geometry and other verdicts', () => {
  // step 4 of 6 (67%) - a 3-3 step/pocket tie would hand the top to pocket
  // (the name-asc tie law: pocket < step), so the step owns on a majority
  const step = bridgeRefusalCensus([...Array(4).fill(STEP), POCKET, POCKET])
  assert.ok(bridgeRefusalRow(step).includes('the dig ladder owns the level (the step\'s dig is the front)'))
  const budget = bridgeRefusalCensus([...Array(3).fill(BUDGET), FLOOR, POCKET])
  assert.ok(bridgeRefusalRow(budget).includes('the bridge budget owns the tax (the fills spent - the cap is the front)'))
  const geom = bridgeRefusalCensus([GEOM, GEOM, GEOM, FLOOR, POCKET])
  assert.ok(bridgeRefusalRow(geom).includes('the geometry read is the front (the sensor, not the world)'))
  const moon = 'F3 [F3] climb bridge: unavailable (the moon is full)'
  const other = bridgeRefusalCensus([...Array(3).fill(moon), FLOOR, POCKET])
  assert.ok(bridgeRefusalRow(other).includes("that refusal's own cure is the front"))
  assert.equal(bridgeRefusalClass(moon), 'other')
})

test('bridge refusal book: the half boundary owns at exactly 50%', () => {
  // floor 3 of 6 = 50%: at most one class owns the half boundary, the sort
  // law's tie-break (name asc) hands the top to floor - the >= 50 law owns,
  // never a scatter (the walkfail book's own boundary law).
  const half = bridgeRefusalCensus([FLOOR, FLOOR, FLOOR, POCKET, POCKET, STEP])
  assert.equal(
    bridgeRefusalRow(half),
    'bridge refusal book: 6 refusal(s) across 3 bot(s), 0 fill(s) placed - floor 3 (50%), pocket 2 (33%), step 1 (17%) - the floor owns the climb tax (the bot stands over its own hole - the support-under-self fill is the front)'
  )
})

test('bridge refusal book: the true scatter (no class at the half)', () => {
  const scatter = bridgeRefusalCensus([FLOOR, FLOOR, POCKET, POCKET, STEP])
  assert.equal(
    bridgeRefusalRow(scatter),
    'bridge refusal book: 5 refusal(s) across 3 bot(s), 0 fill(s) placed - floor 2 (40%), pocket 2 (40%), step 1 (20%) - the refusals scatter (no class owns the climb tax)'
  )
  const tie = bridgeRefusalCensus([...Array(5).fill(FLOOR), ...Array(5).fill(POCKET)])
  // 5-5: both 50% - the sort law's tie-break (name asc) hands the top to
  // floor; the half boundary is >= 50 - floor owns, never a scatter.
  assert.ok(bridgeRefusalRow(tie).includes('the floor owns the climb tax'))
  assert.ok(bridgeRefusalRow(tie).includes('floor 5 (50%), pocket 5 (50%)'))
})

test('bridge refusal book: the bare tag form and the parser grammar', () => {
  const bare = 'climb bridge: unavailable (no solid floor underfoot)'
  const p = parseBridgeRefusal(bare)
  assert.deepEqual(p, { kind: 'bridge', bot: null, msg: 'no solid floor underfoot' })
  const tagged = parseBridgeRefusal(FLOOR)
  assert.deepEqual(tagged, { kind: 'bridge', bot: 'F14', msg: 'no solid floor underfoot' })
  assert.equal(bridgeRefusalClass(tagged.msg), 'floor')
  assert.equal(bridgeRefusalClass(STEP.match(/\((.*)\)$/)[1]), 'step')
  assert.equal(bridgeRefusalClass(null), 'other')
  assert.equal(bridgeRefusalClass(42), 'other')
  assert.equal(bridgeRefusalClass(''), 'other')
})

test('bridge refusal book: the fill parser - the transport proof', () => {
  const f1 = parseBridgeFill(FILL_PIT)
  assert.deepEqual(f1, { kind: 'bridge-fill', bot: 'F1', block: 'cobblestone', cell: { x: -111, y: 17, z: 425 }, fill: 'pit' })
  const f2 = parseBridgeFill(FILL_SUPPORT)
  assert.equal(f2.fill, 'support')
  assert.equal(f2.block, 'dirt')
  assert.equal(parseBridgeFill('F1 [F1] climb bridge: placed cobblestone at [-111,17,425] (pillar) - the step re-judges'), null)
  assert.equal(parseBridgeFill('F1 [F1] climb bridge: placed cobblestone at [-111,17] (pit) - the step re-judges'), null)
  assert.equal(parseBridgeFill(null), null)
  assert.equal(parseBridgeFill(42), null)
})

test('bridge refusal book: the self fill parses - the v0.610.0 cure joins the kind vocabulary', () => {
  const f = parseBridgeFill('F14 [F14] climb bridge: placed cobblestone at [-120,63,405] (self) - the step re-judges')
  assert.deepEqual(f, { kind: 'bridge-fill', bot: 'F14', block: 'cobblestone', cell: { x: -120, y: 63, z: 405 }, fill: 'self' }, 'the support-under-self fill lands its own kind')
  const c = bridgeRefusalCensus(['F14 [F14] climb bridge: placed cobblestone at [-120,63,405] (self) - the step re-judges', FILL_PIT, FLOOR])
  assert.equal(c.places, 2)
  assert.equal(c.fillKinds.self, 1)
  assert.equal(c.fillKinds.pit, 1)
  assert.equal(c.n, 1, 'the refusal count is untouched by the fill')
  // the wrong-kind refusal still rides unparsed (the grammar stays strict)
  assert.equal(parseBridgeFill('F1 [F1] climb bridge: placed cobblestone at [-111,17,425] (pillar) - the step re-judges'), null)
})

test('bridge refusal book: the torn sweep and the junk battery', () => {
  const c = bridgeRefusalCensus([
    'F2 [F2] climb bridge: unavailable (no solid floor',
    'climb bridge: unavailable (',
    FLOOR,
    null,
    42,
    '',
    'F2 [F2] climb bridge: unavailable ()',
    'F2 [F2] climb bridge: placeBlock failed'
  ])
  assert.equal(c.n, 2) // FLOOR + the empty-why refusal (a refusal that never names a class is still a refusal)
  assert.equal(c.unparsed, 2) // the torn pair
  assert.equal(c.byClass.other, 1)
  assert.equal(c.byClass.floor, 1)
  assert.ok(BRIDGE_BOOK_TORN_RE.test('F2 [F2] climb bridge: unavailable (no solid floor'))
})

test('bridge refusal book: junk census fields never crash the row', () => {
  assert.equal(bridgeRefusalRow(null), 'bridge refusal book: none refused, none placed (the bridge never spoke this run)')
  assert.equal(bridgeRefusalRow({}), 'bridge refusal book: none refused, none placed (the bridge never spoke this run)')
  assert.equal(bridgeRefusalRow({ n: NaN }), 'bridge refusal book: none refused, none placed (the bridge never spoke this run)')
  assert.equal(bridgeRefusalRow({ n: -5 }), 'bridge refusal book: none refused, none placed (the bridge never spoke this run)')
  const junk = bridgeRefusalCensus([FLOOR, FLOOR, FLOOR])
  junk.byClass.broken = NaN
  junk.byClass.negative = -3
  const row = bridgeRefusalRow(junk)
  assert.ok(row.startsWith('bridge refusal book: 3 refusal(s) across 1 bot(s), 0 fill(s) placed - floor 3 (100%)'))
  assert.ok(row.includes('the floor owns the climb tax'))
})

// (v0.615.0) THE SERVER-REFUSED FILL - the self-fill's first flight (fleet
// 37196201457, cc64cf9 = v0.613.0): 15 server refusals (self 9, support 6),
// ALL 15 with 'post=? (re-read failed)' - the re-read cannot speak after a
// refusal. The byte-exact mined forms ride the battery.
const REFUSED_SUPPORT = 'F17 [F17] climb bridge: the server refused the support fill at [-116,43,409] - the rotate ladder owns it (held=cobblestone, 1.2b, ref=stone, post=? (re-read failed))'
const REFUSED_SELF = 'F3 [F3] climb bridge: the server refused the self fill at [-125,64,420] - the rotate ladder owns it (held=cobblestone, 1.1b, ref=cobblestone, post=? (re-read failed))'

test('server-refused fill: the mined face parses byte-exact', () => {
  const p = parseServerRefusedFill(REFUSED_SUPPORT)
  assert.equal(p.kind, 'server-refused-fill')
  assert.equal(p.bot, 'F17')
  assert.equal(p.fill, 'support')
  assert.deepEqual(p.cell, { x: -116, y: 43, z: 409 })
  assert.equal(p.held, 'cobblestone')
  assert.equal(p.arm, 1.2)
  assert.equal(p.ref, 'stone')
  assert.equal(p.post, '? (re-read failed)')
  assert.equal(p.reReadFailed, true)
  const s = parseServerRefusedFill(REFUSED_SELF)
  assert.equal(s.bot, 'F3')
  assert.equal(s.fill, 'self')
  assert.equal(s.ref, 'cobblestone')
  assert.equal(s.reReadFailed, true)
  // the no-BRIDGE-repetition bare form keeps parsing (the tag is optional)
  const bare = parseServerRefusedFill('climb bridge: the server refused the self fill at [1,2,3] - the rotate ladder owns it (held=dirt, 0.9b, ref=grass_block, post=ok)')
  assert.equal(bare.bot, null)
  assert.equal(bare.reReadFailed, false) // the re-read CAN speak - the flag rides the keyword
  // junk keeps the null (the torn sweep owns the prefix-only lines)
  assert.equal(parseServerRefusedFill(null), null)
  assert.equal(parseServerRefusedFill(undefined), null)
  assert.equal(parseServerRefusedFill(42), null)
  assert.equal(parseServerRefusedFill('climb bridge: the server refused the self fill (torn'), null)
  assert.equal(parseServerRefusedFill(FILL_PIT), null) // the landed fill is NOT a refused fill
  assert.ok(BRIDGE_REFUSED_TORN_RE.test('F2 [F2] climb bridge: the server refused the'))
})

test('server-refused fill: the census counts the mined face whole', () => {
  const c = bridgeRefusalCensus([REFUSED_SUPPORT, REFUSED_SELF, REFUSED_SELF,
    'F12 [F12] climb bridge: the server refused the self fill at [-148,65,420] - the rotate ladder owns it (held=dirt, 1.1b, ref=dirt, post=? (re-read failed))',
    FILL_PIT, FLOOR])
  assert.equal(c.refused, 4)
  assert.equal(c.refusedKinds.self, 3)
  assert.equal(c.refusedKinds.support, 1)
  assert.equal(c.refusedReReadFailed, 4) // every mined refusal's re-read failed
  assert.equal(c.places, 1) // the landed fill keeps its own grain
  assert.equal(c.n, 1) // the unavailable refusal keeps its own grain
  assert.equal(c.refusedTorn, 0)
  // the torn refused line rides its own bucket (not the unavailable one)
  const t = bridgeRefusalCensus(['F2 [F2] climb bridge: the server refused the'])
  assert.equal(t.refusedTorn, 1)
  assert.equal(t.refused, 0)
  assert.equal(t.unparsed, 0)
})

test('server-refused fill: the tail rides every verdict byte-exact', () => {
  // the mined face's own mix: the unavailable book floor-owned AND the refused mass
  const mixed = bridgeRefusalCensus([FLOOR, FLOOR, REFUSED_SUPPORT, REFUSED_SELF, REFUSED_SELF])
  assert.equal(bridgeRefusalRow(mixed), 'bridge refusal book: 2 refusal(s) across 1 bot(s), 0 fill(s) placed - floor 2 (100%) - the floor owns the climb tax (the bot stands over its own hole - the support-under-self fill is the front) - the server refused 3 fill(s): self 2, support 1, 3 re-read(s) failed (the refusal is the verdict)')
  // the scatter form carries the tail too
  const scatter = bridgeRefusalCensus([FLOOR, POCKET, REFUSED_SUPPORT, REFUSED_SUPPORT])
  assert.ok(bridgeRefusalRow(scatter).endsWith(' - the server refused 2 fill(s): self 0, support 2, 2 re-read(s) failed (the refusal is the verdict)'))
  // the none-none form carries the tail when only the server spoke
  const only = bridgeRefusalCensus([REFUSED_SUPPORT, REFUSED_SELF])
  assert.equal(bridgeRefusalRow(only), 'bridge refusal book: none refused, none placed (the bridge never spoke this run) - the server refused 2 fill(s): self 1, support 1, 2 re-read(s) failed (the refusal is the verdict)')
})

test('server-refused fill: old faces stay byte-stable (the tail only speaks when refused > 0)', () => {
  assert.equal(bridgeRefusalRow(bridgeRefusalCensus([])), 'bridge refusal book: none refused, none placed (the bridge never spoke this run)')
  assert.equal(bridgeRefusalRow(bridgeRefusalCensus([FILL_PIT])), 'bridge refusal book: none refused, 1 fill(s) placed (the climbs climbed clean)')
  const floorOnly = bridgeRefusalRow(bridgeRefusalCensus([FLOOR, FLOOR, FLOOR]))
  assert.equal(floorOnly, 'bridge refusal book: 3 refusal(s) across 1 bot(s), 0 fill(s) placed - floor 3 (100%) - the floor owns the climb tax (the bot stands over its own hole - the support-under-self fill is the front)')
  // junk census fields never crash the tail
  assert.equal(bridgeRefusalRow({ n: 2, byClass: { floor: 2 }, botCount: 1, refused: NaN }), 'bridge refusal book: 2 refusal(s) across 1 bot(s), 0 fill(s) placed - floor 2 (100%) - the floor owns the climb tax (the bot stands over its own hole - the support-under-self fill is the front)')
  assert.equal(bridgeRefusalRow(null), 'bridge refusal book: none refused, none placed (the bridge never spoke this run)')
})
