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
  parseBridgeGateWait,
  parsePitDonor,
  parsePlantClear,
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
  assert.equal(bridgeRefusalRow(mixed), 'bridge refusal book: 2 refusal(s) across 1 bot(s), 0 fill(s) placed - floor 2 (100%) - the floor owns the climb tax (the bot stands over its own hole - the support-under-self fill is the front) - the server refused 3 fill(s): self 2, support 1, 3 re-read(s) failed, 2 distinct cell(s), 1 repeat(s) (the refusal is the verdict) - the re-read never spoke (the blind leg owns the mass) - the repeat(s) name the geometry law (the rotate ladder owns those cells)') // the REFUSED_SELF pair shares ONE cell - the repeat rides; the WHOLLY-blind face (3/3) names the blind leg; the repeat mass names the geometry law
  // the scatter form carries the tail too
  const scatter = bridgeRefusalCensus([FLOOR, POCKET, REFUSED_SUPPORT, REFUSED_SUPPORT])
  assert.ok(bridgeRefusalRow(scatter).endsWith(' - the re-read never spoke (the blind leg owns the mass) - the repeat(s) name the geometry law (the rotate ladder owns those cells)')) // the twin lines share the cell; 2/2 blind; the geometry verdict rides last
  // the none-none form carries the tail when only the server spoke
  const only = bridgeRefusalCensus([REFUSED_SUPPORT, REFUSED_SELF])
  assert.equal(bridgeRefusalRow(only), 'bridge refusal book: none refused, none placed (the bridge never spoke this run) - the server refused 2 fill(s): self 1, support 1, 2 re-read(s) failed, 2 distinct cell(s), 0 repeat(s) (the refusal is the verdict) - the re-read never spoke (the blind leg owns the mass)')
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

test('server-refused fill: the cell grain prices the v0.168.0 transient doctrine (v0.616.0)', () => {
  // the mined face's cells are all distinct -> the repeat mass reads 0 (the
  // re-place ladder may convert - the doctrine holds on THIS face)
  const mined = bridgeRefusalCensus([REFUSED_SUPPORT, REFUSED_SELF, REFUSED_SELF,
    'F12 [F12] climb bridge: the server refused the self fill at [-148,65,420] - the rotate ladder owns it (held=dirt, 1.1b, ref=dirt, post=? (re-read failed))'])
  assert.equal(mined.refused, 4)
  assert.equal(mined.refusedUniqueCells, 3) // REFUSED_SELF's pair rides ONE cell
  assert.equal(mined.refusedCellRepeats, 1)
  // a REVISITED cell - the same cell refused twice - names the geometry law
  const revisit = bridgeRefusalCensus([REFUSED_SUPPORT, REFUSED_SUPPORT])
  assert.equal(revisit.refused, 2)
  assert.equal(revisit.refusedUniqueCells, 1)
  assert.equal(revisit.refusedCellRepeats, 1)
  const row = bridgeRefusalRow(revisit)
  assert.ok(row.includes('the server refused 2 fill(s): self 0, support 2, 2 re-read(s) failed, 1 distinct cell(s), 1 repeat(s)'))
  // junk census fields keep the fallback honest (uniq falls back to refused)
  assert.ok(bridgeRefusalRow({ refused: 2, refusedKinds: { self: 1, support: 1 }, refusedReReadFailed: 1 }).includes('2 distinct cell(s), 0 repeat(s)'))
  assert.equal(bridgeRefusalCensus([FLOOR]).refusedCellRepeats, 0) // the unavailable book never rides the cell grain
})

// (v0.617.0) THE UNDERFOOT RATE - the refused mass's own lever evidence. The
// collisions (#72, #73) taught the shape: the v0.615.0 lane landed the count
// tail, the v0.616.0 lane added the cell grain - the rate rides ON TOP of
// both. THE MINED FACE: the self fill landed 5 of 14 (36%) against the
// support fill's 46 of 52 (88%) - a 5x gap, the underfoot placement's own
// server face (the bot falls into the very cell the fill targets) - and the
// cell grain agrees: 15 distinct cells, 0 repeats, the transient face (not a
// doomed-cell geometry law). THE LAW: the clause speaks only when the
// comparison EXISTS - landed AND refused in the family - the v0.615.0/v0.616.0
// pinned faces (places=0) stay silent under it.
const FILL_SELF = 'F9 [F9] climb bridge: placed cobblestone at [-138,63,405] (self) - the step re-judges'

test('underfoot rate: the mined face 37196201457 reads the lever WHOLE', () => {
  const lines = []
  for (let i = 0; i < 13; i++) lines.push(POCKET)
  for (let i = 0; i < 3; i++) lines.push(FLOOR)
  for (let i = 0; i < 9; i++) lines.push(`F3 [F3] climb bridge: the server refused the self fill at [-125,${64 - (i % 3)},${420 + i}] - the rotate ladder owns it (held=cobblestone, 1.1b, ref=cobblestone, post=? (re-read failed))`)
  for (let i = 0; i < 6; i++) lines.push(`F17 [F17] climb bridge: the server refused the support fill at [-116,${43 + (i % 2)},${409 + i}] - the rotate ladder owns it (held=cobblestone, 1.2b, ref=stone, post=? (re-read failed))`)
  for (let i = 0; i < 46; i++) lines.push(`F1 [F1] climb bridge: placed cobblestone at [${i},64,425] (support) - the step re-judges`)
  for (let i = 0; i < 16; i++) lines.push(`F2 [F2] climb bridge: placed dirt at [${i},65,426] (pit) - the step re-judges`)
  for (let i = 0; i < 5; i++) lines.push(FILL_SELF)
  const c = bridgeRefusalCensus(lines)
  assert.equal(c.refused, 15)
  assert.deepEqual(c.refusedKinds, { self: 9, support: 6 })
  assert.deepEqual(c.fillKinds, { support: 46, pit: 16, self: 5 })
  assert.equal(c.refusedUniqueCells, 15)
  assert.equal(c.refusedCellRepeats, 0)
  assert.equal(
    bridgeRefusalRow(c),
    'bridge refusal book: 16 refusal(s) across 2 bot(s), 67 fill(s) placed - pocket 13 (81%), floor 3 (19%) - the pocket owns the climb tax (the climb arrives empty-handed - the carried fill is the front) - the server refused 15 fill(s): self 9, support 6, 15 re-read(s) failed, 15 distinct cell(s), 0 repeat(s) (the refusal is the verdict) - the re-read never spoke (the blind leg owns the mass) - the self fill landed 5 of 14 (36%) - the underfoot placement is the suspect (the support fill rides 46 of 52 (88%))'
  )
})

test('underfoot rate: the verdict splits on the half boundary', () => {
  // at the half: 1 of 2 -> 'holds'
  const holds = bridgeRefusalRow(bridgeRefusalCensus([REFUSED_SELF, FILL_SELF]))
  assert.ok(holds.endsWith('1 distinct cell(s), 0 repeat(s) (the refusal is the verdict) - the re-read never spoke (the blind leg owns the mass) - the self fill landed 1 of 2 (50%) - the underfoot placement holds'), holds)
  // over the half: 3 of 4 -> 'holds'
  const over = bridgeRefusalRow(bridgeRefusalCensus([REFUSED_SELF, FILL_SELF, FILL_SELF.replace('[-138,63,405]', '[-138,63,406]'), FILL_SELF.replace('[-138,63,405]', '[-138,63,407]')]))
  assert.ok(over.endsWith(' - the re-read never spoke (the blind leg owns the mass) - the self fill landed 3 of 4 (75%) - the underfoot placement holds'), over)
  // under the half: 1 of 3 -> 'the suspect'
  const under = bridgeRefusalRow(bridgeRefusalCensus([REFUSED_SELF, REFUSED_SELF.replace('[-125,64,420]', '[-125,64,421]'), FILL_SELF]))
  assert.ok(under.endsWith('2 distinct cell(s), 0 repeat(s) (the refusal is the verdict) - the re-read never spoke (the blind leg owns the mass) - the self fill landed 1 of 3 (33%) - the underfoot placement is the suspect'), under)
})

test('underfoot rate: the comparison must EXIST - the silent faces', () => {
  // refusals without placements: the pocket front owns it, no rate noise
  const refusedOnly = bridgeRefusalRow(bridgeRefusalCensus([REFUSED_SELF, REFUSED_SELF, REFUSED_SUPPORT]))
  assert.ok(!refusedOnly.includes('landed'), refusedOnly)
  assert.ok(refusedOnly.endsWith(' - the re-read never spoke (the blind leg owns the mass) - the repeat(s) name the geometry law (the rotate ladder owns those cells)'), refusedOnly)
  // placements without refusals: no lever to price
  const placedOnly = bridgeRefusalRow(bridgeRefusalCensus([FILL_SELF, FILL_SELF, 'F1 [F1] climb bridge: placed cobblestone at [1,64,425] (support) - the step re-judges']))
  assert.equal(placedOnly, 'bridge refusal book: none refused, 3 fill(s) placed (the climbs climbed clean)')
  // the support paren needs its own landed AND refused
  const noSupRefusal = bridgeRefusalRow(bridgeRefusalCensus([REFUSED_SELF, FILL_SELF, 'F1 [F1] climb bridge: placed cobblestone at [1,64,425] (support) - the step re-judges']))
  assert.ok(noSupRefusal.endsWith(' - the re-read never spoke (the blind leg owns the mass) - the self fill landed 1 of 2 (50%) - the underfoot placement holds'), noSupRefusal)
  assert.ok(!noSupRefusal.includes('the support fill rides'), noSupRefusal)
})

test('underfoot rate: junk census fields stay silent, never crash', () => {
  assert.equal(bridgeRefusalRow(null), 'bridge refusal book: none refused, none placed (the bridge never spoke this run)')
  assert.equal(bridgeRefusalRow({ n: 1, byClass: { floor: 1 }, botCount: 1, refused: 1, refusedKinds: null }), 'bridge refusal book: 1 refusal(s) across 1 bot(s), 0 fill(s) placed - floor 1 (100%) - the floor owns the climb tax (the bot stands over its own hole - the support-under-self fill is the front) - the server refused 1 fill(s): self 0, support 0, 0 re-read(s) failed, 1 distinct cell(s), 0 repeat(s) (the refusal is the verdict)')
  const junkFills = { n: 0, byClass: {}, botCount: 0, places: 1, fillKinds: { self: NaN }, refused: 2, refusedKinds: { self: 2 }, refusedReReadFailed: 2 }
  assert.ok(!bridgeRefusalRow(junkFills).includes('landed'), 'a NaN fill count is not a landed fill')
})

// (v0.618.0) THE RE-READ BLIND MASS - the fleet 37200930827 face doubled the
// refused mass (15 -> 23) and the blind leg stayed WHOLE: 23 of 23 refusals
// carry 'post=? (re-read failed)', 46 of 46 across the two faces. The ROW
// gains its own name for the systematic face: when EVERY refusal's re-read
// failed, the re-read leg never spoke at all (the chunk read returns nothing
// at the recheck) - the wiring cure rides THIS name. The law: WHOLLY blind
// only (refused > 0 AND refusedReReadFailed === refused); a mixed face keeps
// its story on the per-line tails; the junk fallback (no field) is silent.
test('re-read blind mass: the wholly-blind face names itself (v0.618.0)', () => {
  // the whole-blind battery: every refusal's re-read failed -> the clause rides
  const blind = bridgeRefusalRow(bridgeRefusalCensus([REFUSED_SELF, REFUSED_SUPPORT,
    REFUSED_SELF.replace('[-125,64,420]', '[-125,65,420]')]))
  assert.ok(blind.includes('3 re-read(s) failed, 3 distinct cell(s), 0 repeat(s) (the refusal is the verdict) - the re-read never spoke (the blind leg owns the mass)'), blind)
  // the clause rides INSIDE the refused family - BEFORE the rate lever
  const lever = bridgeRefusalCensus([REFUSED_SELF, FILL_SELF])
  const leverRow = bridgeRefusalRow(lever)
  assert.ok(leverRow.indexOf('the re-read never spoke') < leverRow.indexOf('the self fill landed'), leverRow)
  // a MIXED face stays silent - the story rides the per-line tails
  const mixed = bridgeRefusalRow({ refused: 2, refusedKinds: { self: 1, support: 1 }, refusedReReadFailed: 1 })
  assert.ok(!mixed.includes('the re-read never spoke'), mixed)
  // the re-read CAN speak (post=ok) - the clause stays home
  const spoke = parseServerRefusedFill('climb bridge: the server refused the self fill at [1,2,3] - the rotate ladder owns it (held=dirt, 0.9b, ref=grass_block, post=air STILL OPEN (refused twice))')
  assert.equal(spoke.reReadFailed, false)
  // the junk fallback (a hand-built census without the field) is silent, never a lie
  assert.ok(!bridgeRefusalRow({ refused: 2, refusedKinds: { self: 2 } }).includes('the re-read never spoke'))
  // the empty and refused-free books never carry it
  assert.ok(!bridgeRefusalRow(bridgeRefusalCensus([])).includes('the re-read never spoke'))
  assert.ok(!bridgeRefusalRow(bridgeRefusalCensus([FLOOR, POCKET])).includes('the re-read never spoke'))
})

// (v0.620.0) THE GEOMETRY VERDICT - the fleet 37203144265 face gave the
// v0.616.0 cell grain its >0 side at last: 40 refused, 36 distinct, 4
// REPEATS (F15/F8 share [-91,59,398]; F12's self+support share
// [-117,65,395]). The row now speaks the verdict the v0.616.0 law named:
// repeat(s) > 0 = the CELL itself refuses (the rotate ladder truly owns
// those cells); 0 repeats = the transient face (the re-place ladder
// converts). Junk-safe: the fallback (no field) reads 0 and stays silent.
test('geometry verdict: the repeat mass names the doomed cells (v0.620.0)', () => {
  // the repeat battery: the REFUSED_SELF pair shares ONE cell -> the verdict rides
  const rep = bridgeRefusalRow(bridgeRefusalCensus([REFUSED_SELF, REFUSED_SELF, REFUSED_SELF.replace('[-125,64,420]', '[-125,65,421]')]))
  assert.ok(rep.endsWith('2 distinct cell(s), 1 repeat(s) (the refusal is the verdict) - the re-read never spoke (the blind leg owns the mass) - the repeat(s) name the geometry law (the rotate ladder owns those cells)'), rep)
  // the verdict rides LAST - after the blind mass and the rate lever
  const lever = bridgeRefusalRow(bridgeRefusalCensus([REFUSED_SELF, REFUSED_SELF, FILL_SELF]))
  assert.ok(lever.indexOf('the repeat(s) name the geometry law') > lever.indexOf('the re-read never spoke'), lever)
  assert.ok(lever.indexOf('the repeat(s) name the geometry law') > lever.indexOf('the self fill landed'), lever)
  // the all-unique face stays transient-quiet (the v0.616.0 doctrine's own side)
  const uniq = bridgeRefusalRow(bridgeRefusalCensus([REFUSED_SELF, REFUSED_SUPPORT]))
  assert.ok(!uniq.includes('geometry law'), uniq)
  // the junk fallback (a census without the field) reads 0 repeats - silent, never a lie
  assert.ok(!bridgeRefusalRow({ refused: 2, refusedKinds: { self: 2 }, refusedReReadFailed: 2 }).includes('geometry law'))
  // the unavailable-only book never carries it
  assert.ok(!bridgeRefusalRow(bridgeRefusalCensus([FLOOR, POCKET])).includes('geometry law'))
})

// (v0.621.0) THE GATE'S OWN BOOK - the v0.619.0 underfoot gate's three forms
// printed 53 lines on their first field flight (fleet 37205134738: 43 reads,
// 9 refuses, 1 still waits) and the book saw NONE of them. One parser, three
// verdicts; the tail rides the row's very end; the bots set stays the refusal
// book's own; junk-safe end to end.
test('gate wait: the mined forms parse byte-exact (v0.621.0)', () => {
  const reads = parseBridgeGateWait('F7 [F7] climb bridge: the self fill waited and grounded - the re-plan reads the self fill')
  assert.deepEqual(reads, { kind: 'gate-wait', bot: 'F7', result: 'reads', fill: 'self' })
  const readsSup = parseBridgeGateWait('F4 [F4] climb bridge: the self fill waited and grounded - the re-plan reads the support fill')
  assert.equal(readsSup.result, 'reads')
  assert.equal(readsSup.fill, 'support')
  const refuses = parseBridgeGateWait('F4 [F4] climb bridge: the self fill waited and grounded - the re-plan refuses (the step cells are not clear (the dig ladder owns this level))')
  assert.deepEqual(refuses, { kind: 'gate-wait', bot: 'F4', result: 'refuses', why: 'the step cells are not clear (the dig ladder owns this level)' })
  const waits = parseBridgeGateWait('F4 [F4] climb bridge: the self fill still waits for ground - the ladder owns it')
  assert.deepEqual(waits, { kind: 'gate-wait', bot: 'F4', result: 'still-waits' })
  // the bare form keeps parsing (the tag is optional)
  const bare = parseBridgeGateWait('climb bridge: the self fill waited and grounded - the re-plan reads the pit fill')
  assert.equal(bare.bot, null)
  assert.equal(bare.fill, 'pit')
  // junk keeps the null
  assert.equal(parseBridgeGateWait(null), null)
  assert.equal(parseBridgeGateWait(undefined), null)
  assert.equal(parseBridgeGateWait(42), null)
  assert.equal(parseBridgeGateWait(FILL_SELF), null) // the placed fill is NOT a gate line
  assert.equal(parseBridgeGateWait('F2 [F2] climb bridge: the self fill waited and grounded - the re-plan (torn'), null)
})

test('gate wait: the census counts the family and the tail rides last (v0.621.0)', () => {
  const gate = (s) => `F${s} [F${s}] climb bridge: the self fill waited and grounded - the re-plan reads the self fill`
  const refuse = (w) => `F3 [F3] climb bridge: the self fill waited and grounded - the re-plan refuses (${w})`
  const lines = [
    gate('7'), gate('9'), refuse('the support is already solid'),
    'F4 [F4] climb bridge: the self fill still waits for ground - the ladder owns it',
    REFUSED_SELF, FILL_SELF, FLOOR
  ]
  const c = bridgeRefusalCensus(lines)
  assert.equal(c.gates, 4)
  assert.equal(c.gateReads, 2)
  assert.equal(c.gateRefuses, 1)
  assert.equal(c.gateStillWaits, 1)
  assert.deepEqual(c.gateReadKinds, { self: 2 })
  assert.deepEqual(c.gateRefuseWhys, { 'the support is already solid': 1 })
  // the bots set stays the REFUSAL book's own (the gate lines never join it)
  assert.equal(c.botCount, 1) // FLOOR's F14 only; the refused/fill families never joined either
  const row = bridgeRefusalRow(c)
  assert.ok(row.endsWith(' - the gate waited 4 time(s): 2 reads, 1 refuses, 1 still waiting'), row)
  // the tail rides AFTER the geometry verdict (the family's newest evidence last)
  const repRow = bridgeRefusalRow(bridgeRefusalCensus([REFUSED_SELF, REFUSED_SELF, gate('7')]))
  assert.ok(repRow.indexOf('the repeat(s) name the geometry law') < repRow.indexOf('the gate waited'), repRow)
  // the junk fallback (no fields) is silent, never a lie
  assert.ok(!bridgeRefusalRow({ refused: 1 }).includes('the gate waited'))
  // the old faces (no gate lines) stay byte-stable
  assert.equal(bridgeRefusalRow(bridgeRefusalCensus([FLOOR, POCKET])), 'bridge refusal book: 2 refusal(s) across 2 bot(s), 0 fill(s) placed - floor 1 (50%), pocket 1 (50%) - the floor owns the climb tax (the bot stands over its own hole - the support-under-self fill is the front)')
})

test('pit donor book: the pocket cure speaks (v0.623.0)', () => {
  const donates = (s, name, cell) => `F${s} [F${s}] climb bridge: the pocket is empty - the pit donates a ${name} at [${cell}] - the fill refunds it`
  const digRef = (s, name, cell) => `F${s} [F${s}] climb bridge: the pit donor refused at [${cell}] (${name}) - the ladder owns it`
  // the byte-exact parses (both forms, the tag law rides)
  assert.deepEqual(parsePitDonor(donates('6', 'dirt', '-91,59,398')), { kind: 'pit-donor', bot: 'F6', result: 'donates', name: 'dirt' })
  assert.deepEqual(parsePitDonor(digRef('9', 'granite', '-91,60,398')), { kind: 'pit-donor', bot: 'F9', result: 'refused', name: 'granite' })
  // the refused form's name may be 'unknown' (the plan's nullish donorName)
  assert.equal(parsePitDonor(digRef('9', 'unknown', '-91,60,398')).name, 'unknown')
  // junk and the family's near-misses stay null
  assert.equal(parsePitDonor(''), null)
  assert.equal(parsePitDonor(undefined), null)
  assert.equal(parsePitDonor(donates('6', 'Dirt', '-91,59,398')), null) // names are lowercase block ids
  assert.equal(parsePitDonor('F6 [F6] climb bridge: the pocket is empty - the pit donates a dirt at [-91,59,398] (torn'), null)
  // the census counts the family; the names ride their own map
  const lines = [donates('6', 'dirt', '-91,59,398'), donates('6', 'dirt', '-91,60,398'), donates('7', 'cobblestone', '-117,65,395'), digRef('9', 'granite', '-88,59,401')]
  const c = bridgeRefusalCensus(lines)
  assert.equal(c.pitDonated, 3)
  assert.equal(c.pitDonorRefused, 1)
  assert.deepEqual(c.pitDonorNames, { dirt: 2, cobblestone: 1 })
  assert.equal(c.botCount, 0) // the bots set stays the refusal book's own
  // the lens law: the donor lines match none of the family's other parsers
  assert.equal(c.n, 0)
  assert.equal(c.places, 0)
  assert.equal(c.refused, 0)
  assert.equal(c.gates, 0)
  // the tail rides the row's VERY END (after the gate tail - newest last)
  const withGate = bridgeRefusalCensus([...lines, 'F4 [F4] climb bridge: the self fill still waits for ground - the ladder owns it'])
  const row = bridgeRefusalRow(withGate)
  assert.ok(row.endsWith(' - the pit donated 3 fill(s), 1 dig(s) refused'), row)
  assert.ok(row.indexOf('the gate waited') < row.indexOf('the pit donated'), row)
  // a refused-only donor face still speaks (the cure's honest half)
  assert.ok(bridgeRefusalRow(bridgeRefusalCensus([digRef('9', 'granite', '-88,59,401')])).endsWith(' - the pit donated 0 fill(s), 1 dig(s) refused'))
  // the old faces (no donor lines) stay byte-stable; the junk fallback silent
  assert.ok(!bridgeRefusalRow(bridgeRefusalCensus([FLOOR])).includes('the pit donated'))
  assert.ok(!bridgeRefusalRow({ refused: 1 }).includes('the pit donated'))
})

test('open cell confession: the fresh read\'s word priced per kind (v0.626.0)', () => {
  const refused = (s, kind, cell) => `F${s} [F${s}] climb bridge: the server refused the support fill at [${cell}] - the rotate ladder owns it (held=cobblestone, 0.8b, ref=stone, post=${kind} STILL OPEN (refused twice))`
  // the census grain: each parsed refusal confesses its post kind
  const lines = [
    refused('4', 'air', '-116,43,407'),
    refused('1', 'air', '-110,67,409'),
    refused('7', 'leaf_litter', '-117,45,407'),
    refused('4', 'leaf_litter', '-120,64,383'),
    refused('3', 'water', '-110,47,421')
  ]
  const c = bridgeRefusalCensus(lines)
  assert.equal(c.refused, 5)
  assert.deepEqual(c.refusedPostKinds, { air: 2, leaf_litter: 2, water: 1 })
  // the tail rides INSIDE the refused family: after the verdict paren, before the blind mass
  const row = bridgeRefusalRow(c)
  assert.ok(row.includes(' - the open cells confess: air 2, leaf_litter 2, water 1'), row)
  assert.ok(row.indexOf('(the refusal is the verdict)') < row.indexOf('the open cells confess'), row)
  // the newest-last law: the confession rides before the gate tail and the donor tail
  const withGate = bridgeRefusalRow(bridgeRefusalCensus([...lines, 'F4 [F4] climb bridge: the self fill still waits for ground - the ladder owns it', `F6 [F6] climb bridge: the pocket is empty - the pit donates a dirt at [-91,59,398] - the fill refunds it`]))
  assert.ok(withGate.includes('the open cells confess: air 2, leaf_litter 2, water 1'), withGate)
  assert.ok(withGate.indexOf('the open cells confess') < withGate.indexOf('the gate waited'), withGate)
  assert.ok(withGate.indexOf('the gate waited') < withGate.indexOf('the pit donated'), withGate)
  // the sort law: count desc, ties by name asc
  assert.ok(row.indexOf('air 2') < row.indexOf('leaf_litter 2'), row)
  // the wholly-blind face ('?') never confesses - the blind clause owns it
  const blind = bridgeRefusalCensus([REFUSED_SELF, REFUSED_SUPPORT])
  assert.deepEqual(blind.refusedPostKinds, { '?': 2 })
  const blindRow = bridgeRefusalRow(blind)
  assert.ok(!blindRow.includes('the open cells confess'), blindRow)
  assert.ok(blindRow.includes('the re-read never spoke'), blindRow)
  // a partial face confesses ONLY the kinds that spoke (the '?' kind filtered)
  const mixed = bridgeRefusalCensus([refused('4', 'air', '-116,43,407'), REFUSED_SELF])
  const mixedRow = bridgeRefusalRow(mixed)
  assert.ok(mixedRow.includes(' - the open cells confess: air 1'), mixedRow)
  // the junk fallback (no field) is silent, never a lie; the old faces byte-stable
  assert.ok(!bridgeRefusalRow({ refused: 1 }).includes('the open cells confess'))
  assert.ok(!bridgeRefusalRow(bridgeRefusalCensus([FLOOR])).includes('the open cells confess'))
  // the torn line never confesses (it failed the full grammar)
  const torn = bridgeRefusalCensus(['F4 [F4] climb bridge: the server refused the support fill at [-116,43,407] - the rotate ladder owns it (held=cobblestone'])
  assert.equal(torn.refusedTorn, 1)
  assert.deepEqual(torn.refusedPostKinds, {})
})

test('the pit refusal joins the book (v0.630.0)', () => {
  // the fleet 37216259817 face's own line - byte-exact from the mined log
  const pitRef = 'F9 [F9] climb bridge: the server refused the pit fill at [-101,64,378] - the rotate ladder owns it (held=cobblestone, 1.1b, ref=crafting_table, post=leaf_litter STILL OPEN (refused twice))'
  const r = parseServerRefusedFill(pitRef)
  assert.deepEqual(r, { kind: 'server-refused-fill', bot: 'F9', fill: 'pit', cell: { x: -101, y: 64, z: 378 }, held: 'cobblestone', arm: 1.1, ref: 'crafting_table', post: 'leaf_litter STILL OPEN (refused twice)', reReadFailed: false })
  // the census grain: the pit refusal counts, confesses, and keys its cell
  const c = bridgeRefusalCensus([pitRef])
  assert.equal(c.refused, 1)
  assert.deepEqual(c.refusedKinds, { pit: 1 })
  assert.deepEqual(c.refusedPostKinds, { leaf_litter: 1 })
  assert.equal(c.refusedUniqueCells, 1)
  assert.equal(c.refusedReReadFailed, 0)
  assert.equal(c.refusedTorn, 0)
  assert.equal(c.botCount, 0) // the bots set stays the unavailable book's own (the family's convention)
  // the tail's gated pit clause rides inside the kinds segment
  const row = bridgeRefusalRow(c)
  assert.ok(row.includes(' - the server refused 1 fill(s): self 0, support 0, pit 1, 0 re-read(s) failed, 1 distinct cell(s), 0 repeat(s) (the refusal is the verdict)'), row)
  // the pit refusal confesses through the open-cell grain (the plant front's own word)
  assert.ok(row.includes(' - the open cells confess: leaf_litter 1'), row)
  // the pit family is NOT the underfoot law - no rate verdict on a pit-only face
  assert.ok(!row.includes('the self fill landed'), row)
  // the old self/support faces stay byte-stable (no pit clause, the exact pre-widening byte)
  const oldFace = bridgeRefusalRow(bridgeRefusalCensus(['F17 [F17] climb bridge: the server refused the support fill at [-116,43,409] - the rotate ladder owns it (held=cobblestone, 1.2b, ref=stone, post=? (re-read failed))']))
  assert.ok(oldFace.includes(' - the server refused 1 fill(s): self 0, support 1, 1 re-read(s) failed, 1 distinct cell(s), 0 repeat(s) (the refusal is the verdict) - the re-read never spoke (the blind leg owns the mass)'), oldFace)
  assert.ok(!oldFace.includes(' pit '), oldFace)
  // the torn pit line still rides its own bucket (it failed the full grammar)
  const torn = bridgeRefusalCensus(['F9 [F9] climb bridge: the server refused the pit fill at [-101,64,378'])
  assert.equal(torn.refusedTorn, 1)
  assert.equal(torn.refused, 0)
})

test('plant clear book: the confession cure speaks (v0.628.0)', () => {
  const clears = (s, fill, name, cell) => `F${s} [F${s}] climb bridge: the ${fill} fill's cell holds a ${name} at [${cell}] - the plant clears first`
  const pcRef = (s, name, cell) => `F${s} [F${s}] climb bridge: the plant clear refused at [${cell}] (${name}) - the ladder owns it`
  // the byte-exact parses (both forms, the tag law rides)
  assert.deepEqual(parsePlantClear(clears('6', 'dirt', 'leaf_litter', '-91,59,398')), { kind: 'plant-clear', bot: 'F6', result: 'clears', fillKind: 'dirt', name: 'leaf_litter' })
  assert.deepEqual(parsePlantClear(pcRef('9', 'short_grass', '-91,60,398')), { kind: 'plant-clear', bot: 'F9', result: 'refused', name: 'short_grass' })
  // the refused form's name may be 'unknown' (the plan's nullish plantName)
  assert.equal(parsePlantClear(pcRef('9', 'unknown', '-91,60,398')).name, 'unknown')
  // junk and the family's near-misses stay null
  assert.equal(parsePlantClear(''), null)
  assert.equal(parsePlantClear(undefined), null)
  assert.equal(parsePlantClear(clears('6', 'dirt', 'Leaf_Litter', '-91,59,398')), null) // names are lowercase block ids
  assert.equal(parsePlantClear("F6 [F6] climb bridge: the dirt fill's cell holds a leaf_litter at [-91,59,398] (torn"), null)
  assert.equal(parsePlantClear('F6 [F6] climb bridge: the plant clear refused at [-91,59,398] (short_grass) - the ladder owns it (extra'), null)
  // the census counts the family; the names ride their own map
  const lines = [clears('6', 'dirt', 'leaf_litter', '-91,59,398'), clears('6', 'support', 'leaf_litter', '-91,60,398'), clears('7', 'pit', 'short_grass', '-117,65,395'), pcRef('9', 'short_grass', '-88,59,401')]
  const c = bridgeRefusalCensus(lines)
  assert.equal(c.plantCleared, 3)
  assert.equal(c.plantClearRefused, 1)
  assert.deepEqual(c.plantClearNames, { leaf_litter: 2, short_grass: 1 })
  assert.equal(c.botCount, 0) // the bots set stays the refusal book's own
  // the lens law: the plant lines match none of the family's other parsers
  assert.equal(c.n, 0)
  assert.equal(c.places, 0)
  assert.equal(c.refused, 0)
  assert.equal(c.gates, 0)
  assert.equal(c.pitDonated, 0)
  // the tail rides the row's VERY END (after the gate tail AND the donor tail - newest last)
  const withGate = bridgeRefusalCensus([...lines, 'F4 [F4] climb bridge: the self fill still waits for ground - the ladder owns it', 'F6 [F6] climb bridge: the pocket is empty - the pit donates a dirt at [-91,59,398] - the fill refunds it'])
  const row = bridgeRefusalRow(withGate)
  assert.ok(row.endsWith(' - the plant cleared 3 cell(s), 1 clear(s) refused'), row)
  assert.ok(row.indexOf('the gate waited') < row.indexOf('the pit donated'), row)
  assert.ok(row.indexOf('the pit donated') < row.indexOf('the plant cleared'), row)
  // a refused-only face still speaks (the cure's honest half)
  assert.ok(bridgeRefusalRow(bridgeRefusalCensus([pcRef('9', 'short_grass', '-88,59,401')])).endsWith(' - the plant cleared 0 cell(s), 1 clear(s) refused'))
  // the old faces (no plant lines) stay byte-stable; the junk fallback silent
  assert.ok(!bridgeRefusalRow(bridgeRefusalCensus([FLOOR])).includes('the plant cleared'))
  assert.ok(!bridgeRefusalRow({ refused: 1 }).includes('the plant cleared'))
})
