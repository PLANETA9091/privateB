import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deathCensusRecord, deathBucket, deathCensusRow, DEATH_CENSUS_LINE_RE, DEATH_CENSUS_OWN_SHARE, DEATH_CENSUS_MIN_OWN_MASS } from '../../src/lib/deathcensus.mjs'

// ---- (v0.656.0) THE DEATH'S OWN CENSUS ----
// fleet 37256535767 (the v0.655.0 face, the calm-air one): 33 deaths -
// Drowned x26 (78.8%), Zombie x3, Skeleton x2, Creeper x1, fall x1 - and the
// report had NO row for the mass: the face's #1 conversion killer (the deaths
// dropped the fleet's carried loot, unaccounted 683u, conversion 65.8% vs the
// calm 103.5%) was a per-face LOG DIVE (the fire-0739 hand count rode the
// same grain). The census gives the death mass the write-off family's own
// seat: the server verdict already names the killer, the row reads it.

const DROWNED_LINE = 'F10 [F10] died - respawning (cause: server: was impaled by Drowned [kind=mob by Drowned] | inferred: drowned@7.9 (0s before death at [-135,63,394]) [the inference corroborates the server verdict])'
const ZOMBIE_LINE = 'F7 [F7] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@2.1 (0s before death at [-131,36,423]))'
const SKELETON_LINE = 'F8 [F8] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@1.6 (0s before death at [-131,36,423]) [the inference corroborates the server verdict])'
const CREEPER_LINE = 'F14 [F14] died - respawning (cause: server: was blown up by Creeper [kind=explosion by Creeper] | inferred: creeper@3.0 (0s before death at [-131,36,423]))'
const FALL_LINE = 'F3 [F3] died - respawning (cause: server: fell from a high place [kind=fall] | inferred: fall@9.0 (0s before death at [-117,-90,0]))'
const DROWN_LINE = 'F12 [F12] died - respawning (cause: server: drowned [kind=drown] | inferred: drowning@8.0)'

test('deathCensusRecord: the face byte-exact - the five announce shapes parse their killer', () => {
  const drowned = deathCensusRecord(DROWNED_LINE)
  assert.deepEqual(drowned, { bot: 'F10', kind: 'mob', killer: 'Drowned' }, 'the mob kind carries the attacker as the killer')
  assert.deepEqual(deathCensusRecord(ZOMBIE_LINE), { bot: 'F7', kind: 'mob', killer: 'Zombie' })
  assert.deepEqual(deathCensusRecord(SKELETON_LINE), { bot: 'F8', kind: 'mob', killer: 'Skeleton' })
  assert.deepEqual(deathCensusRecord(CREEPER_LINE), { bot: 'F14', kind: 'explosion', killer: 'Creeper' }, 'the explosion kind carries its own attacker')
  assert.deepEqual(deathCensusRecord(FALL_LINE), { bot: 'F3', kind: 'fall', killer: null }, 'the plain kind reads no killer')
  assert.deepEqual(deathCensusRecord(DROWN_LINE), { bot: 'F12', kind: 'drown', killer: null }, 'the drown kind reads no killer')
})

test('deathCensusRecord: junk never invents - non-announce lines read null, an unparseable kind still counts as unknown', () => {
  assert.equal(deathCensusRecord(''), null)
  assert.equal(deathCensusRecord(null), null)
  assert.equal(deathCensusRecord(undefined), null)
  assert.equal(deathCensusRecord('F14 [F14] death drop: 12u at [-131,36,423] - the loss rides the census'), null, 'the death-drop snapshot is NOT a death announce')
  assert.equal(deathCensusRecord('F10 [F10] combat: fleeing drowned (dist 6.7, hp 12.0, 1 nearby, sentry)'), null, 'the combat band never rides the census')
  assert.equal(deathCensusRecord('water: death spot memorized as a hazard at [-135,63,394] (1 live, fleet-wide)'), null)
  const unknown = deathCensusRecord('F9 [F9] died - respawning (cause: unknown death)')
  assert.ok(unknown, 'an announce without a kind still counts - the mass never loses a body')
  assert.equal(unknown.kind, 'unknown')
  assert.equal(unknown.killer, null)
  assert.equal(unknown.bot, 'F9')
})

test('deathBucket: the killer outranks the kind, the generic mob alone is its own bucket, junk reads unknown', () => {
  assert.equal(deathBucket({ kind: 'mob', killer: 'Drowned' }), 'Drowned')
  assert.equal(deathBucket({ kind: 'explosion', killer: 'Creeper' }), 'Creeper')
  assert.equal(deathBucket({ kind: 'fall', killer: null }), 'fall')
  assert.equal(deathBucket({ kind: 'mob', killer: null }), 'mob', 'the generic mob without an attacker never swallows the row')
  assert.equal(deathBucket(null), 'unknown')
  assert.equal(deathBucket('junk'), 'unknown')
  assert.equal(deathBucket({}), 'unknown')
})

test('deathCensusRow: THE FACE BYTE-EXACT - the v0.655.0 face\'s 33-death read', () => {
  const recs = []
  for (let i = 0; i < 26; i++) recs.push(deathCensusRecord(DROWNED_LINE))
  for (let i = 0; i < 3; i++) recs.push(deathCensusRecord(ZOMBIE_LINE))
  for (let i = 0; i < 2; i++) recs.push(deathCensusRecord(SKELETON_LINE))
  recs.push(deathCensusRecord(CREEPER_LINE))
  recs.push(deathCensusRecord(FALL_LINE))
  assert.equal(recs.length, 33)
  assert.equal(deathCensusRow(recs),
    'death census: 33 deaths - Drowned x26 (78.8%), Zombie x3, Skeleton x2, Creeper x1, fall x1 - Drowned owns the mass',
    'the face\'s own row: the killer names the front, no log dive')
})

test('deathCensusRow: the sort law - counts desc, names asc on ties; the own-mass floors hold both gates', () => {
  // the tie law: x1-x1 reads name asc (byte order)
  const pair = [{ kind: 'fall', killer: null }, { kind: 'mob', killer: 'Zombie' }]
  assert.equal(deathCensusRow(pair), 'death census: 2 deaths - Zombie x1 (50.0%), fall x1', 'the tie breaks by name; the share rides the top bucket only; the tail stays silent under the mass floor')
  // the share floor: 100% of a 3-death mass names no owner
  const trio = [{ kind: 'mob', killer: 'Drowned' }, { kind: 'mob', killer: 'Drowned' }, { kind: 'mob', killer: 'Drowned' }]
  assert.equal(deathCensusRow(trio), 'death census: 3 deaths - Drowned x3 (100.0%)', 'a mass under MIN_OWN_MASS never names an owner')
  // both floors pass: the tail names the owner
  const quad = [...trio, { kind: 'mob', killer: 'Drowned' }]
  assert.equal(deathCensusRow(quad), 'death census: 4 deaths - Drowned x4 (100.0%) - Drowned owns the mass', 'the mass floor met, the owner speaks')
  // the share floor: a真 split (40%) reads no owner - the half boundary itself TRIPS (the family's own >= law, the write-off whys row's 'exactly the half boundary trips')
  const split = [{ kind: 'mob', killer: 'Drowned' }, { kind: 'mob', killer: 'Drowned' }, { kind: 'fall', killer: null }, { kind: 'mob', killer: 'Zombie' }, { kind: 'fall', killer: null }]
  assert.equal(deathCensusRow(split), 'death census: 5 deaths - Drowned x2 (40.0%), fall x2, Zombie x1', 'a split mass names no owner')
  // the singular form
  assert.equal(deathCensusRow([{ kind: 'fall', killer: null }]), 'death census: 1 death - fall x1 (100.0%)', 'one death reads the singular')
})

test('deathCensusRow: the healthy silence - empty and junk masses read null', () => {
  assert.equal(deathCensusRow([]), null)
  assert.equal(deathCensusRow(null), null)
  assert.equal(deathCensusRow(undefined), null)
  assert.equal(deathCensusRow('junk'), null)
  assert.equal(deathCensusRow([null, 'junk', 42]).startsWith('death census: 3 deaths'), true, 'torn records still count their bodies - the mass never loses one')
})

test('deathCensusRow: the constants pin', () => {
  assert.equal(DEATH_CENSUS_OWN_SHARE, 0.5)
  assert.equal(DEATH_CENSUS_MIN_OWN_MASS, 4)
  assert.ok(DEATH_CENSUS_LINE_RE.test('F10 [F10] died - respawning (cause: server: x)'))
  assert.ok(!DEATH_CENSUS_LINE_RE.test('F10 [F10] death drop: 12u'), 'the death-drop snapshot never matches the announce')
})

test('deathCensus: THE WIRING PIN - the observe rides the log filter, the row rides the report beside the decode (v0.656.0)', () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes("import { deathCensusRecord, deathCensusRow } from '../src/lib/deathcensus.mjs'"), 'the census module rides the fleet import band')
  assert.ok(src.includes('const deathCensusRecords = []'), 'the records array lives beside the drop census twin')
  // the observe sits AT the filter pass - the record rides the same composed
  // line the log prints; it rides ABOVE the one-liner (the census's own
  // announce guard keeps the filter's byte - the three regression pins read it)
  const observe = src.indexOf('const drec = deathCensusRecord(`${name} ${m}`)')
  assert.ok(observe > 0, 'the observe parses the composed line at the filter pass')
  const filter = src.indexOf('console.log(`${name} ${m}`)')
  assert.ok(filter > 0 && observe < filter && filter - observe < 1800, 'the observe rides its own filter site (the window search - the census comment rides between, and the receipt-key comment block joined the window at v0.839.0 - the filter\'s own annotation)')
  // the report row sits after the unaccounted decode it completes, before the drop census
  const row = src.indexOf('try { console.log(deathCensusRow(deathCensusRecords)) }')
  assert.ok(row > 0, 'the report row prints the census')
  const decode = src.indexOf('unaccounted mass decode')
  const dropRow = src.indexOf('try { console.log(dropCensusRow(dropCensusRecords)) }')
  assert.ok(row > decode && row < dropRow, 'the row sits between the decode it completes and the drop census (the report order law)')
})
