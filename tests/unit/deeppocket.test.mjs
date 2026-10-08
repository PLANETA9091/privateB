//
// deeppocket.test.mjs - the deep-pocket ascend's shape lens' own proofs
// (v0.835.0). The verbatim corpus is face 106's REAL six lines (run
// 37770102755, fleet19.log lines 660/1096/1222/1420/1435/1553) + the
// sibling family's real fence line (line 1208) + the dead shape's real
// earlier-face line. The lid/why grammar rides the emitter's own template
// with lidScanPlan's reachable why byte-exact (the field has not yet
// produced a lid dig - the grammar pin owns the first one's parse).
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseDeepPocketAscent, deepPocketCensus, deepPocketCensusRow } from '../../src/lib/deeppocket.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// face 106's real corpus - byte-exact from fleet19.log
const F106_GRANITE_O2_6 = 'F8 [F8] water: deep-pocket ascend - dug the ceiling granite at [-141,53,417] (jump stalled 3+ passes, o2 6)'
const F106_GRANITE_O2_20 = 'F8 [F8] water: deep-pocket ascend - dug the ceiling granite at [-141,53,417] (jump stalled 3+ passes, o2 20)'
const F106_GRANITE_O2_20B = 'F8 [F8] water: deep-pocket ascend - dug the ceiling granite at [-141,53,417] (jump stalled 3+ passes, o2 20)'
const F106_GRANITE_O2_7 = 'F8 [F8] water: deep-pocket ascend - dug the ceiling granite at [-141,53,417] (jump stalled 3+ passes, o2 7)'
const F106_CRAFT_O2_9 = 'F15 [F15] water: deep-pocket ascend - dug the ceiling crafting_table at [-136,58,389] (jump stalled 3+ passes, o2 9)'
const F106_STONE_O2_8 = 'F8 [F8] water: deep-pocket ascend - dug the ceiling stone at [-141,53,418] (jump stalled 3+ passes, o2 8)'
const F106_ALL = [
  F106_GRANITE_O2_6, F106_GRANITE_O2_20, F106_GRANITE_O2_20B,
  F106_GRANITE_O2_7, F106_CRAFT_O2_9, F106_STONE_O2_8
]

// the SIBLING family's real line (face 106 line 1208) - a different
// emitter's own voice, never this book's
const F106_CLIMB_WATER = 'F15 [F15] climb wet ascend: dug the ceiling water at [-134,62,385] (the water column owns every bearing - the vertical digs instead, 1/4)'

// the dead shape's real earlier-face line (the v0.707.0 toll's own family)
const DEAD_F5 = 'F5 [F5] water: deep-pocket ascend - dug the ceiling stone at [-118,49,402] (jump stalled 3+ passes, o2 reset(-1))'

// the lid grammar - the emitter template's own insertion with lidScanPlan's
// reachable why byte-exact (the one-parser-one-truth law: the regex must
// match the shape its own writer prints)
const LID_F13 = 'F13 [F13] water: deep-pocket ascend - dug the ceiling granite at [-127,50,412] through a 2-cell lid (jump stalled 3+ passes; the lid is 2 water cell(s) - the ceiling reads diggable at +2, o2 12)'
const LID_WHY = 'the lid is 2 water cell(s) - the ceiling reads diggable at +2'

test('the face-106 corpus verbatim: every real ascend line parses to its own cells, the sibling family is fenced out', () => {
  const g6 = parseDeepPocketAscent(F106_GRANITE_O2_6)
  assert.deepEqual(g6, {
    bot: 'F8', name: 'granite', spot: '-141,53,417', lid: 0, why: null,
    stall: 3, o2: 6, o2Raw: '6', dead: false
  })
  const craft = parseDeepPocketAscent(F106_CRAFT_O2_9)
  assert.equal(craft.bot, 'F15')
  assert.equal(craft.name, 'crafting_table')
  assert.equal(craft.spot, '-136,58,389')
  assert.equal(craft.o2, 9)
  const stone = parseDeepPocketAscent(F106_STONE_O2_8)
  assert.equal(stone.spot, '-141,53,418')
  assert.equal(stone.o2, 8)
  // the water ceiling CANNOT ride this line (the emitter's own guard) -
  // the sibling climb lane's real line is a foreign family, junk here
  assert.equal(parseDeepPocketAscent(F106_CLIMB_WATER), null)
  // the junk battery: truncated, untagged, leading space, non-strings
  assert.equal(parseDeepPocketAscent('F8 [F8] water: deep-pocket ascend - dug the ceiling granite at [-141,53,417] (jump stalled 3+ passes'), null)
  assert.equal(parseDeepPocketAscent('water: deep-pocket ascend - dug the ceiling granite at [-141,53,417] (jump stalled 3+ passes, o2 6)'), null)
  assert.equal(parseDeepPocketAscent('  ' + F106_GRANITE_O2_6), null)
  assert.equal(parseDeepPocketAscent(''), null)
  assert.equal(parseDeepPocketAscent(null), null)
  assert.equal(parseDeepPocketAscent(42), null)
  assert.equal(parseDeepPocketAscent({ line: F106_GRANITE_O2_6 }), null)
})

test("the emitter's own grammar: the three o2 labels ride (numeric, the reset sentinel dead, the '?' junk label) + the lid/why pair", () => {
  const num = parseDeepPocketAscent('F7 [F7] water: deep-pocket ascend - dug the ceiling stone at [-120,50,400] (jump stalled 3+ passes, o2 12)')
  assert.equal(num.o2, 12)
  assert.equal(num.o2Raw, '12')
  assert.equal(num.dead, false)
  const dead = parseDeepPocketAscent(DEAD_F5)
  assert.equal(dead.o2, null) // the sentinel never invents a number
  assert.equal(dead.o2Raw, 'reset(-1)')
  assert.equal(dead.dead, true)
  const unk = parseDeepPocketAscent('F7 [F7] water: deep-pocket ascend - dug the ceiling stone at [-120,50,400] (jump stalled 3+ passes, o2 ?)')
  assert.equal(unk.o2, null)
  assert.equal(unk.dead, false) // '?' is the junk label, not the toll's family
  assert.equal(unk.o2Raw, '?')
  const lid = parseDeepPocketAscent(LID_F13)
  assert.equal(lid.lid, 2)
  assert.equal(lid.why, LID_WHY)
  assert.equal(lid.o2, 12)
  // the float label the /^\d+$/ contract fences (the research law's own pin)
  assert.equal(parseDeepPocketAscent('F7 [F7] water: deep-pocket ascend - dug the ceiling stone at [-120,50,400] (jump stalled 3+ passes, o2 6.5)'), null)
})

test('the census on the real face-106 corpus: the repeat whale, the o2 floor, the honest zero lid lane', () => {
  const c = deepPocketCensus(F106_ALL)
  assert.equal(c.ascends, 6)
  assert.deepEqual(c.names, { crafting_table: 1, granite: 4, stone: 1 })
  assert.deepEqual(c.spots, { '-136,58,389': 1, '-141,53,417': 4, '-141,53,418': 1 })
  assert.equal(c.distinctSpots, 3)
  assert.equal(c.topSpot, '-141,53,417') // F8 bought out of the same pocket FOUR times
  assert.equal(c.topSpotDigs, 4)
  assert.equal(c.o2Floor, 6)
  assert.equal(c.numericReads, 6)
  assert.equal(c.deadReads, 0)
  assert.equal(c.lidDigs, 0)
  assert.equal(c.maxLid, 0)
  assert.deepEqual(c.whys, {})
  // + the dead line and the lid line: the sentinel never prices the floor
  const mixed = deepPocketCensus([...F106_ALL, DEAD_F5, LID_F13])
  assert.equal(mixed.ascends, 8)
  assert.equal(mixed.deadReads, 1)
  assert.equal(mixed.numericReads, 7)
  assert.equal(mixed.o2Floor, 6)
  assert.equal(mixed.lidDigs, 1)
  assert.equal(mixed.maxLid, 2)
  assert.deepEqual(mixed.whys, { [LID_WHY]: 1 })
  // the tie law: two singletons -> the byte order owns the top spot
  const tie = deepPocketCensus([F106_CRAFT_O2_9, F106_STONE_O2_8])
  assert.equal(tie.topSpot, '-136,58,389') // '-136...' < '-141...' byte order
  assert.equal(tie.topSpotDigs, 1)
  // junk-safe: non-array null, empty/junk arrays the zero shape
  assert.equal(deepPocketCensus(null), null)
  assert.equal(deepPocketCensus('nope'), null)
  const zero = deepPocketCensus([])
  assert.equal(zero.ascends, 0)
  assert.equal(zero.topSpot, null)
  assert.equal(zero.o2Floor, null)
  const junk = deepPocketCensus([F106_CLIMB_WATER, 'garbage', null, 7])
  assert.equal(junk.ascends, 0)
  assert.equal(junk.distinctSpots, 0)
})

test('the row: byte-exact on the face-106 corpus, the honest silence on zero, the guards + the wiring', () => {
  const row = deepPocketCensusRow(deepPocketCensus(F106_ALL))
  assert.equal(
    row,
    "the deep-pocket ascend's own book (v0.835.0): 6 ascend(s) dug the ceiling (crafting_table x1, granite x4, stone x1), 3 spot(s) - [-141,53,417] owned 4 dig(s), o2 floor 6 over 6 numeric reading(s), 0 lid dig(s) (deepest 0), 0 dead read(s)"
  )
  // the mixed corpus's own row: the floor stays over the numeric reads only
  const mrow = deepPocketCensusRow(deepPocketCensus([...F106_ALL, DEAD_F5]))
  assert.equal(
    mrow,
    "the deep-pocket ascend's own book (v0.835.0): 7 ascend(s) dug the ceiling (crafting_table x1, granite x4, stone x2), 4 spot(s) - [-141,53,417] owned 4 dig(s), o2 floor 6 over 6 numeric reading(s), 0 lid dig(s) (deepest 0), 1 dead read(s)"
  )
  // the honest silence: zero ascends prints nothing
  assert.equal(deepPocketCensusRow(deepPocketCensus([])), null)
  assert.equal(deepPocketCensusRow(deepPocketCensus([F106_CLIMB_WATER])), null)
  // the guards: junk cells never render
  assert.equal(deepPocketCensusRow(null), null)
  assert.equal(deepPocketCensusRow(42), null)
  assert.equal(deepPocketCensusRow([F106_GRANITE_O2_6]), null)
  assert.equal(deepPocketCensusRow({ ascends: 0 }), null)
  assert.equal(deepPocketCensusRow({ ascends: NaN, names: {}, spots: {}, distinctSpots: 0, topSpot: null, topSpotDigs: 0, o2Floor: null, numericReads: 0, deadReads: 0, lidDigs: 0, maxLid: 0, whys: {} }), null)
  // the wiring: the decompose additive row rides beside the aquifer's seat
  const src = readFileSync(join(here, '../../scripts/fleet-mining/decompose.mjs'), 'utf8')
  assert.ok(src.includes("from '../../src/lib/deeppocket.mjs'"), 'the import rides')
  assert.ok(src.includes('deepPocketCensusRow(deepPocketCensus(lines))'), 'the additive row rides')
  assert.ok(src.includes('v0.835.0'), 'the version tag rides')
})
