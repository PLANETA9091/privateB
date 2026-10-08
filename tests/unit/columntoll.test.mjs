//
// columntoll.test.mjs - the column's own toll lens' proofs (v0.837.0).
// The verbatim corpus is face 109's REAL line order (run 37783367117,
// fleet19.log lines 1339/1510/1686/1943/1946/1961/2014/2093/2269/2388/
// 2418/2479/2491/2576): F13 dug the column [-135,410] three times
// (1/4 -> 2/4 -> 3/4) and then drowned at [-135,49,409] - the join the
// field itself wrote.
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { TOLL_RADIUS, parseWetDigLine, parseDeathVerdict, columnToll, columnTollRow } from '../../src/lib/columntoll.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// face 109's real dig lines - byte-exact from fleet19.log (line order)
const D = [
  'F5 [F5] climb wet ascend: dug the ceiling water at [-128,62,387] (the water column owns every bearing - the vertical digs instead, 1/4)',
  'F13 [F13] climb wet ascend: dug the ceiling stone at [-136,54,411] (the water column owns every bearing - the vertical digs instead, 1/4)',
  'F15 [F15] climb wet ascend: dug the ceiling water at [-127,62,378] (the water column owns every bearing - the vertical digs instead, 1/4)',
  'F13 [F13] climb wet ascend: dug the ceiling water at [-135,51,410] (the water column owns every bearing - the vertical digs instead, 1/4)',
  'F13 [F13] climb wet ascend: dug the ceiling stone at [-135,53,410] (the water column owns every bearing - the vertical digs instead, 2/4)',
  'F13 [F13] climb wet ascend: dug the ceiling water at [-135,52,410] (the water column owns every bearing - the vertical digs instead, 3/4)',
  'F8 [F8] climb wet ascend: dug the ceiling water at [-123,47,402] (the water column owns every bearing - the vertical digs instead, 1/4)',
  'F8 [F8] climb wet ascend: dug the ceiling stone at [-118,48,407] (the water column owns every bearing - the vertical digs instead, 2/4)'
]
// face 109's real death verdicts - byte-exact (line order)
const KILL = [
  'F13 [F13] died - respawning (cause: server: drowned [kind=drown] | inferred: zombie@9.7 (0s before death at [-135,49,409]) [the inference CONTRADICTS the server verdict - the nearest harm was not the killer (the server kind stays the authority)])',
  'F11 [F11] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@0.9 (0s before death at [-143,59,398]) [the inference corroborates the server verdict])',
  'F13 [F13] died - respawning (cause: server: was slain by Spider [kind=mob by Spider] | inferred: spider@1.2 (0s before death at [-118,64,428]) [the inference corroborates the server verdict])',
  'F9 [F9] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@1.2 (0s before death at [-143,59,411]) [the inference corroborates the server verdict])',
  'F10 [F10] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.5 (0s before death at [-149,64,417]) [the inference corroborates the server verdict])',
  'F16 [F16] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@1.2 (0s before death at [-106,65,402]) [the inference corroborates the server verdict])'
]
const F109_ALL = [
  D[0], D[1], D[2], D[3], D[4], D[5], KILL[0], D[6], D[7],
  KILL[1], KILL[2], KILL[3], KILL[4], KILL[5]
]

// the OTHER sibling's line - the mirror fence (the deep-pocket ascend
// never rides the toll's dig book)
const F106_ASCEND = 'F8 [F8] water: deep-pocket ascend - dug the ceiling granite at [-141,53,417] (jump stalled 3+ passes, o2 6)'

test('the parsers: the real dig and death verdicts ride, the kind cell keeps its spaces, the mirror family is fenced out', () => {
  const dig = parseWetDigLine(D[4])
  assert.deepEqual(dig, { bot: 'F13', column: '-135,410', digs: 2 })
  const kill = parseDeathVerdict(KILL[0])
  assert.deepEqual(kill, { bot: 'F13', kind: 'drown', spot: '-135,49,409' })
  const mob = parseDeathVerdict(KILL[1])
  assert.equal(mob.kind, 'mob by Drowned') // the kind cell keeps its spaces
  assert.equal(mob.spot, '-143,59,398')
  // the mirror fence: neither family rides the other's book
  assert.equal(parseWetDigLine(F106_ASCEND), null)
  assert.equal(parseWetDigLine(KILL[0]), null)
  assert.equal(parseDeathVerdict(D[0]), null)
  // the junk battery: truncated, no inferred spot, non-strings
  assert.equal(parseDeathVerdict('F9 [F9] died - respawning (cause: server: drowned [kind=drown] | inferred: no spot rode this verdict)'), null)
  assert.equal(parseDeathVerdict('F9 [F9] died - respawning (cause: server: drowned [kind=drown]'), null)
  assert.equal(parseWetDigLine('  ' + D[0]), null)
  assert.equal(parseWetDigLine(''), null)
  assert.equal(parseWetDigLine(null), null)
  assert.equal(parseWetDigLine(42), null)
  assert.equal(parseDeathVerdict({ line: KILL[0] }), null)
})

test('the join on the real face-109 corpus: F13 drown rides the dug column, the radius is Chebyshev 2, line order owns the clock', () => {
  assert.equal(TOLL_RADIUS, 2)
  const c = columnToll(F109_ALL)
  assert.equal(c.deaths, 6)
  assert.equal(c.totalDigs, 8)
  assert.equal(c.dugColumns, 6) // 8 digs across 6 y-blind columns
  assert.equal(c.joined, 1) // F13's drown rode the [-135,410] band; the five mob kills did not
  assert.deepEqual(c.kinds, { drown: 1 })
  assert.deepEqual(c.heaviest, { column: '-135,410', digs: 3, deaths: 1 })
  // the radius pin: Chebyshev 2 joins, 3 does not (the y-blind plane)
  const atTwo = columnToll([D[3], 'F9 [F9] died - respawning (cause: server: drowned [kind=drown] | inferred: zombie@1.0 (0s before death at [-137,49,412]) [the inference corroborates the server verdict])'])
  assert.equal(atTwo.joined, 1)
  const atThree = columnToll([D[3], 'F9 [F9] died - respawning (cause: server: drowned [kind=drown] | inferred: zombie@1.0 (0s before death at [-135,49,413]) [the inference corroborates the server verdict])'])
  assert.equal(atThree.joined, 0)
  // the line-order law: a death BEFORE any dig never joins
  const before = columnToll([KILL[0], D[3], D[4], D[5]])
  assert.equal(before.joined, 0)
  assert.equal(before.deaths, 1)
  // junk-safe: non-array null, the zero shape
  assert.equal(columnToll(null), null)
  assert.equal(columnToll('nope'), null)
  const zero = columnToll([])
  assert.equal(zero.deaths, 0)
  assert.equal(zero.joined, 0)
  assert.equal(zero.heaviest, null)
})

test('the row: byte-exact on the face-109 corpus, the cure-held form, the honest silence, the guards + the wiring', () => {
  const row = columnTollRow(columnToll(F109_ALL))
  assert.equal(
    row,
    "the column's own toll (v0.837.0): 1 of 6 death(s) rode a dug column (drown x1), the heaviest [-135,410] owned 3 dig(s) then 1 death(s)"
  )
  // the cure-held form: deaths rode no dug column (face 108's own shape:
  // 1 wet dig, 2 deaths, no join)
  const held = columnTollRow(columnToll([D[0], KILL[1], KILL[2]]))
  assert.equal(
    held,
    "the column's own toll (v0.837.0): 0 of 2 death(s) rode a dug column (1 wet dig(s) across the face) - the wet lane's cure held"
  )
  // the honest silence: no deaths, no toll question
  assert.equal(columnTollRow(columnToll(D)), null)
  assert.equal(columnTollRow(columnToll([])), null)
  // the guards: junk cells never render
  assert.equal(columnTollRow(null), null)
  assert.equal(columnTollRow(42), null)
  assert.equal(columnTollRow([KILL[0]]), null)
  assert.equal(columnTollRow({ deaths: 0, joined: 0, totalDigs: 0, kinds: {}, heaviest: null }), null)
  assert.equal(columnTollRow({ deaths: NaN, joined: 0, totalDigs: 0, kinds: {}, heaviest: null }), null)
  // the wiring: the decompose additive row rides beside the sibling seats
  const src = readFileSync(join(here, '../../scripts/fleet-mining/decompose.mjs'), 'utf8')
  assert.ok(src.includes("from '../../src/lib/columntoll.mjs'"), 'the import rides')
  assert.ok(src.includes('columnTollRow(columnToll(lines))'), 'the additive row rides')
  assert.ok(src.includes('v0.837.0'), 'the version tag rides')
})
