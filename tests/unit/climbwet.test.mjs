//
// climbwet.test.mjs - the water column's own dig lens' proofs (v0.836.0).
// The verbatim corpora are the field's REAL lines: face 106's four (run
// 37770102755, fleet19.log lines 1208/1251/1272/1297) + face 108's one
// (run 37779457427, line 1162). The non-water ceiling shape rides the
// emitter's own no-guard grammar (any diggable block at feet+2 passes the
// writer - in 26.2 water reads diggable:true, so water dominates the
// field; the constructed stone line pins the grammar's full breadth).
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseWetCeilingAscent, wetCeilingCensus, wetCeilingCensusRow } from '../../src/lib/climbwet.mjs'

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
