// tests/unit/void-census.test.mjs
// (v0.421.0) THE VOID CENSUS - the out-of-world stamp's field read.
// The term established from the record, never assumed: "void" = the physical
// fall out of the world below the overworld floor (VOID_FLOOR_Y = -64) -
// the server prints 'fell out of the world [kind=other]'; "stamp" = the
// v0.277.0 'void context' snapshot (cell / depth / leg) the death handler
// prints for that death. Two void deaths stand in the fleet's history, both
// mute (pre-stamp trees): F12 [117,-90,0] depth 26 (the rim-dig era) and F3
// [118,-148,2] depth 84 (face 36392745638) - the ~17-blocks-east-of-anchor
// column (x 117-118, z 0-2) is the recurrence signature this census pins.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  VOID_CONTEXT_RE,
  VOID_SERVER_DEATH_RE,
  VOID_KNOWN_COLUMN,
  parseVoidContext,
  parseServerVoidDeath,
  voidCensus
} from '../../src/lib/voidcensus.mjs'
import { voidContextLine } from '../../src/lib/statcarry.mjs'

test('parseVoidContext: the F3 emitter shape round-trips off voidContextLine itself (the one-renderer law)', () => {
  const line = voidContextLine({ tag: 'F3', pos: { x: 118, y: -148, z: 2 }, leg: 'map trip gravel' })
  assert.equal(line, 'F3 death: void context (cell 118,-148,2, depth 84, leg map trip gravel)', 'the census reads the stamp the field will actually carry')
  const p = parseVoidContext(line)
  assert.deepEqual(p, { bot: 'F3', cell: { x: 118, y: -148, z: 2 }, depth: 84, leg: 'map trip gravel' })
})

test('parseVoidContext: the F12 history shape (the era\'s first mute death reads the same law)', () => {
  const p = parseVoidContext('F12 death: void context (cell 117,-90,0, depth 26, leg rim dig)')
  assert.deepEqual(p, { bot: 'F12', cell: { x: 117, y: -90, z: 0 }, depth: 26, leg: 'rim dig' })
})

test('parseVoidContext: the fleet-log pumped shape (the pump prefixes the plain name before the bracketed tag)', () => {
  const p = parseVoidContext('F3 [F3] death: void context (cell 118,-148,2, depth 84, leg map trip gravel)')
  assert.deepEqual(p, { bot: 'F3', cell: { x: 118, y: -148, z: 2 }, depth: 84, leg: 'map trip gravel' })
  const p2 = parseVoidContext('[F3] death: void context (cell 118,-148,2, depth 84, leg map trip gravel)')
  assert.equal(p2.bot, 'F3', 'the miner-side raw shape (no pump prefix) reads too')
})

test('parseVoidContext: the junk emitter family reads honestly (the never-null law\'s own shapes)', () => {
  assert.deepEqual(
    parseVoidContext(' death: void context (cell unknown, depth unknown, leg unknown)'),
    { bot: null, cell: null, depth: null, leg: 'unknown' },
    'an empty tag still stamps - the class has died in silence twice'
  )
  assert.deepEqual(
    parseVoidContext('[F5] death: void context (cell unknown, depth 0, leg unknown)'),
    { bot: 'F5', cell: null, depth: 0, leg: 'unknown' },
    'a junk cell cannot half-print, but a real depth is still a measurement'
  )
})

test('parseVoidContext: the negative depth rides UNCLAMPED (a y above the floor is the contradiction datum)', () => {
  const p = parseVoidContext('F9 [F9] death: void context (cell 0,-20,0, depth -12, leg next column)')
  assert.equal(p.depth, -12, 'never clamped - the contradiction is the datum')
})

test('parseVoidContext: the junk battery (prose, the other context lanes, non-strings - all rejected)', () => {
  assert.equal(parseVoidContext('F14 [F14] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg fuel commons walk @-137,386, wet unknown)'), null, 'the face-26 drown-context verbatim belongs to its own lens')
  assert.equal(parseVoidContext('F1 [F1] death: suffocate context (head gravel, o2 0, leg shaft dig)'), null)
  assert.equal(parseVoidContext('F4 [F4] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env)'), null)
  assert.equal(parseVoidContext('the void context of the plan is unclear'), null, 'prose is not a stamp')
  assert.equal(parseVoidContext(undefined), null)
  assert.equal(parseVoidContext(42), null)
  assert.equal(parseVoidContext('F3 death: void context (cell 118,-148.5,2, depth 84, leg x)'), null, 'a non-integer cell is not the emitter\'s shape - the escape hatch owns it')
})

test('parseServerVoidDeath: the field\'s recorded verdict shape (the worklog\'s own verbatim family)', () => {
  const p = parseServerVoidDeath('F3 [F3] died - respawning (cause: server: fell out of the world [kind=other] | inferred: fall/env)')
  assert.deepEqual(p, { bot: 'F3', kindOther: true })
  const raw = parseServerVoidDeath('[F3] died - respawning (cause: server: fell out of the world [kind=other])')
  assert.equal(raw.bot, 'F3', 'the miner-side raw shape reads too')
  const oddKind = parseServerVoidDeath('F3 [F3] died - respawning (cause: server: fell out of the world [kind=fall])')
  assert.deepEqual(oddKind, { bot: 'F3', kindOther: false }, 'the verb convicts, the kind split stays honest')
  assert.equal(parseServerVoidDeath('F14 [F14] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env)'), null, 'a drown death is not the void class')
  assert.equal(parseServerVoidDeath(''), null)
})

test('voidCensus: the accumulation hand-counted (stamps + a server death + the prose escape hatch)', () => {
  const lines = [
    'F3 [F3] death: void context (cell 118,-148,2, depth 84, leg map trip gravel)',
    'F12 death: void context (cell 117,-90,0, depth 26, leg rim dig)',
    'F7 [F7] died - respawning (cause: server: fell out of the world [kind=other] | inferred: fall/env)',
    'F7 death: void context (cell 120,-70,5, depth 6, leg shaft dig)',
    'F14 [F14] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg fuel commons walk @-137,386, wet unknown)',
    'the void context of the plan is unclear'
  ]
  const c = voidCensus(lines)
  assert.equal(c.stamps, 3)
  assert.deepEqual(c.byBot, { F3: 1, F12: 1, F7: 1 })
  assert.deepEqual(c.byLeg, { 'map trip gravel': 1, 'rim dig': 1, 'shaft dig': 1 })
  assert.equal(c.cells.length, 3)
  assert.deepEqual(c.byColumn, { '118,2': 1, '117,0': 1, '120,5': 1 })
  assert.deepEqual(c.depths, { n: 3, min: 6, max: 84, unknown: 0 })
  assert.equal(c.knownColumn, 2, 'F3 and F12 land on the recorded column - the recurrence signature repeats')
  assert.equal(c.serverVoidDeaths, 1)
  assert.equal(c.serverKindOther, 1)
  assert.equal(c.muted, false, 'the stamp spoke for its death - no mute flag')
  assert.equal(c.unparsed, 1, 'the prose line is counted, never dropped')
})

test('voidCensus: THE MUTE FLAG - a server void death with zero stamp lines (the emit site\'s health read)', () => {
  const c = voidCensus(['F3 [F3] died - respawning (cause: server: fell out of the world [kind=other])'])
  assert.equal(c.serverVoidDeaths, 1)
  assert.equal(c.stamps, 0)
  assert.equal(c.muted, true, 'a pre-v0.277.0 tree is legitimately mute; otherwise the verb gate failed - the front opens either way')
})

test('voidCensus: the honest zeros (a silent face reads zeros, not absence)', () => {
  const c = voidCensus([])
  assert.deepEqual(c, {
    stamps: 0,
    byBot: {},
    byLeg: {},
    cells: [],
    byColumn: {},
    depths: { n: 0, min: null, max: null, unknown: 0 },
    knownColumn: 0,
    serverVoidDeaths: 0,
    serverKindOther: 0,
    muted: false,
    unparsed: 0
  })
  const calm = voidCensus([
    'F14 [F14] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg fuel commons walk @-137,386, wet unknown)',
    'F4 [F4] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@9.7)',
    'F6 [F6] water: frozen client relog (#1 consecutive)'
  ])
  assert.equal(calm.stamps, 0)
  assert.equal(calm.serverVoidDeaths, 0)
  assert.equal(calm.muted, false)
  assert.equal(calm.unparsed, 0)
  assert.equal(voidCensus(undefined).stamps, 0, 'a junk call reads the zero census, never throws')
  assert.equal(voidCensus(null).muted, false)
})

test('voidCensus: the unknown-depth share (a junk floor reads the depth unknown - the cell still counts)', () => {
  const c = voidCensus(['F8 [F8] death: void context (cell 118,-148,2, depth unknown, leg unknown)'])
  assert.deepEqual(c.depths, { n: 0, min: null, max: null, unknown: 1 })
  assert.equal(c.knownColumn, 1, 'the column signature does not need the depth')
})

test('the record constants: VOID_KNOWN_COLUMN carries the history cells, not a guess', () => {
  assert.deepEqual(VOID_KNOWN_COLUMN, { minX: 117, maxX: 118, minZ: 0, maxZ: 2 })
  assert.ok(VOID_SERVER_DEATH_RE.test('F3 [F3] died - respawning (cause: server: fell out of the world [kind=other])'))
  assert.ok(VOID_CONTEXT_RE.test('F12 death: void context (cell 117,-90,0, depth 26, leg rim dig)'))
})
