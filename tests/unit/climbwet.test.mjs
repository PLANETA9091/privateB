//
// climbwet.test.mjs - the water column's own dig lens' proofs (v0.836.0),
// the kept promise's own proofs (v0.840.0) and the shortfall's own shape's
// proofs (v0.842.0). The verbatim corpora are
// the field's REAL lines: face 106's four (run 37770102755, fleet19.log
// lines 1208/1251/1272/1297) + face 108's one (run 37779457427, line
// 1162). The non-water ceiling shape rides the emitter's own no-guard
// grammar (any diggable block at feet+2 passes the writer - in 26.2
// water reads diggable:true, so water dominates the field; the
// constructed stone line pins the grammar's full breadth).
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseWetCeilingAscent, wetCeilingCensus, wetCeilingCensusRow, wetColumnCompletion, wetColumnCompletionRow, wetColumnShortfall, wetColumnShortfallRow, wetColumnWaste, wetColumnWasteRow } from '../../src/lib/climbwet.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// face 106's real corpus - byte-exact from fleet19.log
const F106_F15 = 'F15 [F15] climb wet ascend: dug the ceiling water at [-134,62,385] (the water column owns every bearing - the vertical digs instead, 1/4)'
const F106_F10_A = 'F10 [F10] climb wet ascend: dug the ceiling water at [-148,62,389] (the water column owns every bearing - the vertical digs instead, 1/4)'
const F106_F10_B = 'F10 [F10] climb wet ascend: dug the ceiling water at [-148,61,389] (the water column owns every bearing - the vertical digs instead, 2/4)'
const F106_F10_C = 'F10 [F10] climb wet ascend: dug the ceiling water at [-148,60,389] (the water column owns every bearing - the vertical digs instead, 1/4)'
const F106_ALL = [F106_F15, F106_F10_A, F106_F10_B, F106_F10_C]

// face 108's real line - the same pocket where F11's deep-pocket ascend
// dug sandstone at y=55 (the sibling lanes met at one column)
const F108_F11 = 'F11 [F11] climb wet ascend: dug the ceiling water at [-166,54,406] (the water column owns every bearing - the vertical digs instead, 1/4)'

// the OTHER sibling's real line (face 106's deep-pocket ascend) - the
// mirror fence: neither family ever rides the other's book
const F106_ASCEND = 'F8 [F8] water: deep-pocket ascend - dug the ceiling granite at [-141,53,417] (jump stalled 3+ passes, o2 6)'

// the emitter's no-guard grammar: any diggable ceiling passes the writer
// (template-true construction, the stone line pins the breadth)
const STONE_F9 = 'F9 [F9] climb wet ascend: dug the ceiling stone at [-120,50,400] (the water column owns every bearing - the vertical digs instead, 3/4)'

test('the face-106/108 corpora verbatim: every real line parses to its own cells, the mirror family is fenced out', () => {
  const a = parseWetCeilingAscent(F106_F15)
  assert.deepEqual(a, { bot: 'F15', name: 'water', spot: '-134,62,385', column: '-134,385', dig: 1, budget: 4 })
  const b = parseWetCeilingAscent(F106_F10_B)
  assert.equal(b.bot, 'F10')
  assert.equal(b.spot, '-148,61,389') // the column's own gravity: 62 -> 61 -> 60
  assert.equal(b.column, '-148,389') // y-blind: the three F10 digs share one column
  assert.equal(b.dig, 2)
  assert.equal(b.budget, 4)
  const f108 = parseWetCeilingAscent(F108_F11)
  assert.equal(f108.spot, '-166,54,406')
  assert.equal(f108.dig, 1)
  // the mirror fence: the deep-pocket ascend line is a foreign family here
  assert.equal(parseWetCeilingAscent(F106_ASCEND), null)
  // the junk battery: truncated, untagged, leading space, non-strings
  assert.equal(parseWetCeilingAscent('F10 [F10] climb wet ascend: dug the ceiling water at [-148,62,389] (the water column owns every bearing'), null)
  assert.equal(parseWetCeilingAscent('climb wet ascend: dug the ceiling water at [-148,62,389] (the water column owns every bearing - the vertical digs instead, 1/4)'), null)
  assert.equal(parseWetCeilingAscent('  ' + F106_F15), null)
  assert.equal(parseWetCeilingAscent(''), null)
  assert.equal(parseWetCeilingAscent(null), null)
  assert.equal(parseWetCeilingAscent(42), null)
  assert.equal(parseWetCeilingAscent({ line: F106_F15 }), null)
})

test("the emitter's no-guard grammar: the non-water ceiling rides (the stone pin), the budget cell is read never invented", () => {
  const stone = parseWetCeilingAscent(STONE_F9)
  assert.deepEqual(stone, { bot: 'F9', name: 'stone', spot: '-120,50,400', column: '-120,400', dig: 3, budget: 4 })
  // the junk cells the grammar fences: garbage budget, missing dig
  assert.equal(parseWetCeilingAscent('F9 [F9] climb wet ascend: dug the ceiling water at [-120,50,400] (the water column owns every bearing - the vertical digs instead, x/4)'), null)
  assert.equal(parseWetCeilingAscent('F9 [F9] climb wet ascend: dug the ceiling water at [-120,50,400] (the water column owns every bearing - the vertical digs instead, 1)'), null)
})

test('the census on the real face-106 corpus: the column map owns the geography, the tie law holds', () => {
  const c = wetCeilingCensus(F106_ALL)
  assert.equal(c.ascends, 4)
  assert.deepEqual(c.names, { water: 4 })
  assert.deepEqual(c.spots, { '-134,62,385': 1, '-148,60,389': 1, '-148,61,389': 1, '-148,62,389': 1 })
  assert.equal(c.distinctSpots, 4)
  assert.equal(c.topSpot, '-134,62,385') // the four-singleton tie -> byte order owns it
  assert.equal(c.topSpotDigs, 1)
  assert.deepEqual(c.columns, { '-134,385': 1, '-148,389': 3 })
  assert.equal(c.distinctColumns, 2)
  assert.equal(c.topColumn, '-148,389') // F10's own column: three digs, one water column
  assert.equal(c.topColumnDigs, 3)
  assert.equal(c.maxDig, 2)
  assert.equal(c.budget, 4)
  // + face 108's line: the sibling lanes met at F11's pocket
  const mixed = wetCeilingCensus([...F106_ALL, F108_F11])
  assert.equal(mixed.ascends, 5)
  assert.equal(mixed.distinctSpots, 5)
  assert.equal(mixed.distinctColumns, 3)
  assert.equal(mixed.topColumn, '-148,389')
  assert.equal(mixed.maxDig, 2)
  // the stone line rides the census too (the no-guard grammar's own breadth)
  const stony = wetCeilingCensus([...F106_ALL, STONE_F9])
  assert.deepEqual(stony.names, { stone: 1, water: 4 })
  assert.equal(stony.maxDig, 3)
  // junk-safe: non-array null, empty/junk arrays the zero shape
  assert.equal(wetCeilingCensus(null), null)
  assert.equal(wetCeilingCensus('nope'), null)
  const zero = wetCeilingCensus([])
  assert.equal(zero.ascends, 0)
  assert.equal(zero.topSpot, null)
  assert.equal(zero.topColumn, null)
  assert.equal(zero.budget, null)
  const junk = wetCeilingCensus([F106_ASCEND, 'garbage', null, 7])
  assert.equal(junk.ascends, 0)
  assert.equal(junk.distinctColumns, 0)
})

test('the row: byte-exact on the face-106/108 corpora, the honest silence on zero, the guards + the wiring', () => {
  const row = wetCeilingCensusRow(wetCeilingCensus(F106_ALL))
  assert.equal(
    row,
    "the water column's own dig (v0.836.0): 4 ascend(s) dug the ceiling (water x4), 4 spot(s) - [-134,62,385] owned 1 dig(s), 2 column(s) - [-148,389] owned 3 dig(s), max dig 2 of 4"
  )
  const row108 = wetCeilingCensusRow(wetCeilingCensus([F108_F11]))
  assert.equal(
    row108,
    "the water column's own dig (v0.836.0): 1 ascend(s) dug the ceiling (water x1), 1 spot(s) - [-166,54,406] owned 1 dig(s), 1 column(s) - [-166,406] owned 1 dig(s), max dig 1 of 4"
  )
  // the honest silence: zero ascends prints nothing
  assert.equal(wetCeilingCensusRow(wetCeilingCensus([])), null)
  assert.equal(wetCeilingCensusRow(wetCeilingCensus([F106_ASCEND])), null)
  // the guards: junk cells never render
  assert.equal(wetCeilingCensusRow(null), null)
  assert.equal(wetCeilingCensusRow(42), null)
  assert.equal(wetCeilingCensusRow([F106_F15]), null)
  assert.equal(wetCeilingCensusRow({ ascends: 0 }), null)
  assert.equal(wetCeilingCensusRow({ ascends: 1, names: {}, spots: {}, columns: {}, distinctSpots: NaN, distinctColumns: 0, topSpot: null, topSpotDigs: 0, topColumn: null, topColumnDigs: 0, maxDig: 0, budget: null }), null)
  // the wiring: the decompose additive row rides beside the deep-pocket seat
  const src = readFileSync(join(here, '../../scripts/fleet-mining/decompose.mjs'), 'utf8')
  assert.ok(src.includes("from '../../src/lib/climbwet.mjs'"), 'the import rides')
  assert.ok(src.includes('wetCeilingCensusRow(wetCeilingCensus(lines))'), 'the additive row rides')
  assert.ok(src.includes('v0.836.0'), 'the version tag rides')
})

test("the wet column's kept promise (v0.840.0): the real corpora's whole-spend law, the kept cell, the row byte-exact + the guards + the wiring", () => {
  // the real faces so far: the budget always outran the climb
  const f106 = wetColumnCompletion(F106_ALL)
  assert.deepEqual(f106, { ascends: 4, kept: 0, abandoned: 4, maxDig: 2, budget: 4 })
  // the stone line's 3/4 rides the same law (the deepest real face dig)
  const stony = wetColumnCompletion([...F106_ALL, STONE_F9])
  assert.deepEqual(stony, { ascends: 5, kept: 0, abandoned: 5, maxDig: 3, budget: 4 })
  // the kept cell: the whole spend rode the column (template-true 4/4
  // print - the counter reached the budget's own constant)
  const KEPT = 'F10 [F10] climb wet ascend: dug the ceiling water at [-148,59,389] (the water column owns every bearing - the vertical digs instead, 4/4)'
  const kept = wetColumnCompletion([F106_F10_A, KEPT])
  assert.deepEqual(kept, { ascends: 2, kept: 1, abandoned: 1, maxDig: 4, budget: 4 })
  // junk-safe: non-array null, zero ascends the zero shape, junk skipped
  assert.equal(wetColumnCompletion(null), null)
  assert.equal(wetColumnCompletion('nope'), null)
  assert.deepEqual(wetColumnCompletion([]), { ascends: 0, kept: 0, abandoned: 0, maxDig: 0, budget: null })
  assert.equal(wetColumnCompletion([F106_ASCEND, 'garbage', null, 7]).ascends, 0)
  // the row: byte-exact on the real face-106 corpus
  assert.equal(
    wetColumnCompletionRow(wetColumnCompletion(F106_ALL)),
    "the wet column's kept promise (v0.840.0): 0 of 4 ascend(s) kept the budget (the column's whole spend), 4 abandoned it early, max dig 2 of 4"
  )
  // the kept row + the '?' budget cell (read never invented)
  assert.equal(
    wetColumnCompletionRow(wetColumnCompletion([KEPT])),
    "the wet column's kept promise (v0.840.0): 1 of 1 ascend(s) kept the budget (the column's whole spend), 0 abandoned it early, max dig 4 of 4"
  )
  assert.equal(
    wetColumnCompletionRow({ ascends: 1, kept: 0, abandoned: 1, maxDig: 1, budget: null }),
    "the wet column's kept promise (v0.840.0): 0 of 1 ascend(s) kept the budget (the column's whole spend), 1 abandoned it early, max dig 1 of ?"
  )
  // the honest silence + the guards: junk cells never render
  assert.equal(wetColumnCompletionRow(wetColumnCompletion([])), null)
  assert.equal(wetColumnCompletionRow(null), null)
  assert.equal(wetColumnCompletionRow(42), null)
  assert.equal(wetColumnCompletionRow([F106_F15]), null)
  assert.equal(wetColumnCompletionRow({ ascends: 0, kept: 0, abandoned: 0, maxDig: 0, budget: null }), null)
  assert.equal(wetColumnCompletionRow({ ascends: 1, kept: NaN, abandoned: 1, maxDig: 1, budget: 4 }), null)
  // the wiring: the completion row rides beside the census seat
  const src2 = readFileSync(join(here, '../../scripts/fleet-mining/decompose.mjs'), 'utf8')
  assert.ok(src2.includes('wetColumnCompletionRow(wetColumnCompletion(lines))'), 'the additive row rides')
  assert.ok(src2.includes('v0.840.0'), 'the version tag rides')
})

test("the wet column's shortfall (v0.842.0): the deficit histogram's own law, the nearest miss, the row byte-exact + the guards + the wiring", () => {
  const KEPT_4_4 = 'F10 [F10] climb wet ascend: dug the ceiling water at [-148,59,389] (the water column owns every bearing - the vertical digs instead, 4/4)'
  // the corpus rides the file's own verbatim faces (the family's own lines)
  const F106 = [F106_F15, F106_F10_A, F106_F10_B, F106_F10_C]
  const s106 = wetColumnShortfall(F106)
  assert.ok(s106 && s106.ascends === 4 && s106.priced === 4, 'every matched ascend is priced (the regex is numeric-only)')
  assert.equal(s106.kept, 0, 'face 106 kept nothing (the completion cross-check)')
  assert.deepEqual(s106.hist, { 2: 1, 3: 3 }, 'the deficits 2x1 3x3 - the whole shape, ascending')
  assert.equal(s106.maxDeficit, 3, 'max deficit 3')
  assert.equal(s106.minShort, 2, 'the nearest miss 2 - one climb reached 2 of 4')
  assert.equal(s106.budget, 4, 'the budget is the faces own print')
  assert.equal(wetColumnShortfallRow(s106), "the wet column's shortfall (v0.842.0): 4 of 4 ascend(s) priced (the budget's own reach), the deficits 2x1 3x3 (max 3, the nearest 2 short)")
  // the kept cell rides 0 - the completion's own law, the mutual fence
  const MIX = [...F106, KEPT_4_4]
  const sMix = wetColumnShortfall(MIX)
  assert.equal(sMix.kept, wetColumnCompletion(MIX).kept, 'the kept cells agree across the two lenses (the mutual fence)')
  assert.deepEqual(sMix.hist, { 0: 1, 2: 1, 3: 3 }, 'the kept class rides 0x1')
  assert.equal(wetColumnShortfallRow(sMix), "the wet column's shortfall (v0.842.0): 5 of 5 ascend(s) priced (the budget's own reach), the deficits 0x1 2x1 3x3 (max 3, the nearest 2 short)")
  // all kept: the nearest cell honestly absent
  const sKept = wetColumnShortfall([KEPT_4_4])
  assert.equal(sKept.minShort, null, 'nothing short - the nearest reads null')
  assert.equal(wetColumnShortfallRow(sKept), "the wet column's shortfall (v0.842.0): 1 of 1 ascend(s) priced (the budget's own reach), the deficits 0x1 (max 0)")
  // the zero + junk shapes
  assert.equal(wetColumnShortfallRow(wetColumnShortfall(['no ascend here'])), null, 'a face with no ascend stays silent')
  assert.equal(wetColumnShortfall(null), null, 'null in null out (the o2gap convention)')
  assert.equal(wetColumnShortfall('junk'), null, 'a string is not an array')
  assert.equal(wetColumnShortfallRow(null), null, 'null row in null out')
  assert.equal(wetColumnShortfallRow('junk'), null, 'a string is not a shape')
  assert.equal(wetColumnShortfallRow([]), null, 'an array is not a shape')
  assert.equal(wetColumnShortfallRow({ ascends: 0, priced: 0 }), null, 'the zero shape stays silent')
  // the wiring: the shortfall row rides beside the completion seat
  const src3 = readFileSync(join(here, '../../scripts/fleet-mining/decompose.mjs'), 'utf8')
  assert.ok(src3.includes("wetColumnShortfall, wetColumnShortfallRow, wetColumnWaste, wetColumnWasteRow } from '../../src/lib/climbwet.mjs'"), 'the shortfall rides the family import')
  assert.ok(src3.includes('wetColumnShortfallRow(wetColumnShortfall(lines))'), 'the shortfall row prints beside the completion seat')
  assert.ok(src3.includes('v0.842.0'), 'the version tag rides')
})

test("the wet column's own waste (v0.845.0): the water class's own law, the calm verdict, the row byte-exact + the consistency fence + the wiring", () => {
  // face 114's real corpus (run 37812213897, fleet19.log lines
  // 1382/1540/1622/2509): three water digs + one solid - the family's
  // own why leg priced on the field's own words
  const F114_F16 = 'F16 [F16] climb wet ascend: dug the ceiling dirt at [-138,53,385] (the water column owns every bearing - the vertical digs instead, 1/4)'
  const F114_F7 = 'F7 [F7] climb wet ascend: dug the ceiling water at [-141,50,412] (the water column owns every bearing - the vertical digs instead, 1/4)'
  const F114_F10 = 'F10 [F10] climb wet ascend: dug the ceiling water at [-177,62,413] (the water column owns every bearing - the vertical digs instead, 1/4)'
  const F114_F9 = 'F9 [F9] climb wet ascend: dug the ceiling water at [-129,62,392] (the water column owns every bearing - the vertical digs instead, 1/4)'
  const F114 = [F114_F16, F114_F7, F114_F10, F114_F9]
  const w114 = wetColumnWaste(F114)
  assert.deepEqual(w114, { digs: 4, water: 3, solid: 1 }, 'face 114: 3 of 4 digs rode water')
  assert.equal(
    wetColumnWasteRow(w114),
    "the wet column's own waste (v0.845.0): 3 of 4 dig(s) spent on water (a water cell buys no headroom - the dig's own purpose defeated), 1 on solid"
  )
  // the field's own weight: face 106 rode ALL water (4 of 4) - the
  // wasted class owns the whole book
  const w106 = wetColumnWaste(F106_ALL)
  assert.deepEqual(w106, { digs: 4, water: 4, solid: 0 }, 'face 106: every dig rode water')
  assert.equal(
    wetColumnWasteRow(w106),
    "the wet column's own waste (v0.845.0): 4 of 4 dig(s) spent on water (a water cell buys no headroom - the dig's own purpose defeated), 0 on solid"
  )
  // the calm verdict renders (the v0.423.0 lesson): the all-solid face
  // prints 0 wasted - the cure's success signature, not a silence
  const calm = wetColumnWaste([STONE_F9])
  assert.deepEqual(calm, { digs: 1, water: 0, solid: 1 })
  assert.equal(
    wetColumnWasteRow(calm),
    "the wet column's own waste (v0.845.0): 0 of 1 dig(s) spent on water (a water cell buys no headroom - the dig's own purpose defeated), 1 on solid"
  )
  // the mutual fence: the waste's digs and the completion's ascends read
  // the SAME line set (one parser one truth)
  assert.equal(w114.digs, wetColumnCompletion(F114).ascends, 'the waste and the completion agree on the line set')
  assert.equal(w106.digs, wetColumnCompletion(F106_ALL).ascends, 'the fence holds on face 106 too')
  // the zero + junk shapes
  assert.equal(wetColumnWaste(null), null, 'null in null out (the o2gap convention)')
  assert.equal(wetColumnWaste('junk'), null, 'a string is not an array')
  assert.deepEqual(wetColumnWaste([]), { digs: 0, water: 0, solid: 0 }, 'the zero shape')
  assert.equal(wetColumnWaste([F106_ASCEND, 'garbage', null, 7]).digs, 0, 'the mirror family and junk judge nothing')
  assert.equal(wetColumnWasteRow(wetColumnWaste([])), null, 'a face with no priced dig stays silent')
  assert.equal(wetColumnWasteRow(null), null, 'null row in null out')
  assert.equal(wetColumnWasteRow('junk'), null, 'a string is not a shape')
  assert.equal(wetColumnWasteRow([]), null, 'an array is not a shape')
  assert.equal(wetColumnWasteRow({ digs: 0, water: 0, solid: 0 }), null, 'the zero shape stays silent')
  // the guards: non-finite and self-inconsistent shapes never render
  assert.equal(wetColumnWasteRow({ digs: 4, water: NaN, solid: 1 }), null, 'a NaN cell invents nothing')
  assert.equal(wetColumnWasteRow({ digs: 4, water: 2, solid: 1 }), null, 'the consistency fence: water + solid must equal digs')
  assert.equal(wetColumnWasteRow({ digs: 4, water: 5, solid: -1 }), null, 'the fence holds for the negative escape too')
  assert.equal(wetColumnWasteRow({ digs: -1, water: 0, solid: 0 }), null, 'a negative digs reads junk')
  // the wiring: the waste row rides beside the shortfall's seat
  const src4 = readFileSync(join(here, '../../scripts/fleet-mining/decompose.mjs'), 'utf8')
  assert.ok(src4.includes('wetColumnWasteRow(wetColumnWaste(lines))'), 'the waste row prints beside the shortfall seat')
  assert.ok(src4.includes('v0.845.0'), 'the version tag rides')
})

test('the waste cure (v0.846.0): the water ceiling is refused at the dig gate', () => {
  const src = readFileSync(join(here, '../../src/bots/miner.mjs'), 'utf8')
  // the cure's own condition: the deep-pocket lane's guard, ported to the
  // wet-ascend dig site - a WATER ceiling never digs (the server cannot
  // break water; the v0.845.0 row priced the class 14 of 15 across four
  // faces), the refuse falls through to the surface handoff byte for byte
  assert.ok(src.includes('if (aceil && aceil.diggable === true && isWaterName(aceil.name) !== true) {'),
    'the guard rides the wet-ascend dig gate (the deep-pocket precedent ported)')
  // the budget increments only PAST the guard - a refused water ceiling
  // consumes no room (the budget bounds REAL digs)
  const gateIdx = src.indexOf('if (aceil && aceil.diggable === true && isWaterName(aceil.name) !== true) {')
  const incIdx = src.indexOf('wetAscendDigs++')
  assert.ok(gateIdx !== -1 && incIdx > gateIdx, 'the budget increments past the guard, never before it')
  assert.ok(gateIdx < src.indexOf('withTimeout(bot.dig(aceil)'), 'the dig rides past the guard too')
  // the sibling's own fence still stands (the port removed nothing)
  assert.ok(src.includes('isWaterName(ceil.name) !== true'), 'the deep-pocket guard keeps its own seat')
  // the cure names itself in the source (the version tag rides)
  assert.ok(src.includes('(v0.846.0) THE WASTE CURE'), 'the cure names itself in the source')
})
