// THE O2-LOW TRIGGER'S OWN WINDOW - the o2trigger tests (v0.884.0).
//
// The o2-low trigger front's own pricing byte (the front the page
// lead's own row named twice on face 145: the trigger must fire at o2
// low, not at the reset). The synthetic lines below ride the emitters'
// own grammar byte for byte (the v0.875.0 precedent); the face-145
// slices ride the artifact's own lines verbatim (F3's real stream +
// the real death lines).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SENTRY_PASS_RE } from '../../src/lib/sentry.mjs'
import { TRIGGER_O2_MAX, o2TriggerBook, o2TriggerConsistent, o2TriggerRow } from '../../src/lib/o2trigger.mjs'

// the emitters' own grammar, byte for byte
const hb = (n, ts) => `fleet [fleet] n=${n} ts=${ts}s rss=456M late=10ms mainLate=5ms`
const pass = (bot, n, o2) =>
  `${bot} [${bot}] water: pass ${n} head=wet shore=none land=n/a y=60.4 o2=${o2} probes=0 at=[-134,60,387]`
const died = (bot, cause) => `${bot} [${bot}] died - respawning (cause: server: ${cause} [kind=drown] | inferred: none)`

test('the grammar pin - the census\'s own band edge, the reuse law by import', () => {
  // the threshold is the census's own rescueBand edge (never invented)
  assert.equal(TRIGGER_O2_MAX, 10)
  // the pass grammar is the sentry's own RE (the one-parser law)
  assert.ok(SENTRY_PASS_RE.test(pass('F19', 0, 15)))
  assert.ok(SENTRY_PASS_RE.test(pass('F19', 3, 'reset(-1)')))
})

test('the crossing law - the first in-band read of a descent, the last one wins', () => {
  const lines = [
    hb(1, 20),
    pass('F12', 0, 11), // above the band
    hb(2, 40),
    pass('F12', 5, 8), // THE CROSSING (the descent's own entry)
    hb(3, 60),
    pass('F12', 9, 5) // in-band, no new crossing
  ]
  const b = o2TriggerBook(lines)
  assert.equal(b.deaths, 0, 'no death, no window - the stream only primes the state')
  // the crossing survives the in-band continuation; the death prices from it
  const lines2 = [...lines, hb(4, 80), died('F12', 'drowned')]
  const b2 = o2TriggerBook(lines2)
  assert.equal(b2.deaths, 1)
  assert.equal(b2.window.count, 1)
  assert.equal(b2.perDeath[0].window, 40, 'the window rides the last crossing (ts 40), not the stream start')
})

test('the re-crossing law - surfacing re-arms, the last descent prices', () => {
  const lines = [
    hb(1, 20),
    pass('F1', 0, 8), // crossing one (ts 20)
    hb(2, 40),
    pass('F1', 1, 19), // surfaced - the state re-arms
    hb(3, 60),
    pass('F1', 2, 7), // THE re-crossing (ts 60)
    hb(4, 90),
    died('F1', 'drowned')
  ]
  const b = o2TriggerBook(lines)
  assert.equal(b.window.count, 1)
  assert.equal(b.perDeath[0].window, 30, 'the window rides the LAST crossing (ts 60)')
})

test('the blind skin law - the reset judges nothing, clears nothing', () => {
  const lines = [
    hb(1, 20),
    pass('F13', 0, 2), // the crossing (the stream's own opening read)
    hb(2, 40),
    pass('F13', 1, 'reset(-1)'), // the sensor's death - the state stays
    hb(3, 55),
    pass('F13', 2, '?'), // the unknown skin - nothing
    hb(4, 70),
    died('F13', 'drowned')
  ]
  const b = o2TriggerBook(lines)
  assert.equal(b.crossed, 1)
  assert.equal(b.perDeath[0].window, 50, 'the crossing survives the blind skins')
})

test('the death reset law - the state never survives the death it joined', () => {
  const lines = [
    hb(1, 20),
    pass('F1', 0, 5),
    hb(2, 40),
    died('F1', 'drowned'),
    hb(3, 60),
    died('F1', 'drowned') // the second death: no new descent - the honest no-crossing
  ]
  const b = o2TriggerBook(lines)
  assert.equal(b.deaths, 2)
  assert.equal(b.crossed, 1)
  assert.equal(b.noCrossing, 1, 'the reset spent the crossing - the second death rides no window')
})

test('the face-145 battery - the artifact\'s own lines, byte for byte', () => {
  const lines = [
    'fleet [fleet] n=12 ts=241s rss=383M late=57ms mainLate=385ms',
    'F12 [F12] water: pass 0 head=wet shore=none land=n/a y=54.0 o2=11 probes=0 at=[-162,54,401]',
    'F12 [F12] water: pass 5 head=wet shore=none land=n/a y=57.8 o2=8 probes=0 at=[-162,58,401]',
    'fleet [fleet] n=13 ts=261s rss=385M late=62ms mainLate=728ms',
    'F12 [F12] water: pass 9 head=wet shore=none land=n/a y=61.3 o2=5 probes=0 at=[-162,61,401]',
    'F12 [F12] water: pass 13 head=dry shore=hit r=1 land=none y=63.5 o2=19 probes=0 at=[-160,64,401]',
    'F12 [F12] water: pass 17 head=dry shore=hit r=2 land=none y=64.0 o2=20 probes=0 at=[-159,64,401]',
    'F12 [F12] died - respawning (cause: server: suffocated in a wall [kind=suffocate] | inferred: fall/env (0s before death at [-141,58,397]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
    'fleet [fleet] n=14 ts=280s rss=385M late=62ms mainLate=72ms',
    'F3 [F3] water: pass 0 head=wet shore=none land=n/a y=58.7 o2=14 probes=0 at=[-140,59,385]',
    'F3 [F3] water: pass 7 head=dry shore=hit r=4 land=none y=62.8 o2=18 probes=0 at=[-139,63,386]',
    'F3 [F3] water: pass 12 head=wet shore=none land=n/a y=61.9 o2=20 probes=0 at=[-136,62,389]',
    'F3 [F3] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.0 (0s before death at [-143,61,387]) [the inference corroborates the server verdict])'
  ]
  const b = o2TriggerBook(lines)
  assert.ok(o2TriggerConsistent(b))
  assert.equal(b.deaths, 2)
  // F12: the crossing at the o2=8 read (ts 241), the death at ts 261 -
  // the window 20s (the trigger's own false-positive price: the death
  // was suffocate, the band read was real)
  assert.deepEqual(b.perDeath[0], { bot: 'F12', ts: 261, crossed: true, window: 20, lastO2: 20, lastO2Gap: 1, lastO2Span: 1, lastPassHead: 'dry' }, 'the last numeric read rides the seat with its own position and cadence and shore state (the v0.895.0 read gap + cadence, the v0.896.0 head)')
  // F3: never dipped into the band (14/18/20) - the honest no-crossing
  assert.deepEqual(b.perDeath[1], { bot: 'F3', ts: 280, crossed: false, window: null, lastO2: 20, lastO2Gap: 1, lastO2Span: 1, lastPassHead: 'wet' })
  assert.equal(b.noCrossing, 1)
  const row = o2TriggerRow(b)
  assert.ok(row.includes("the o2-low trigger's own window (v0.884.0)"))
  assert.ok(row.includes('deaths 2'))
  assert.ok(row.includes('crossed 1, window 20..20s (avg 20s)'))
  assert.ok(row.includes('no-crossing 1'))
  assert.ok(row.includes("the census's own band edge (<=10)"))
})

test('the row\'s honest silence - the zero deaths, the junk, the fence', () => {
  assert.equal(o2TriggerRow(o2TriggerBook([])), null)
  assert.equal(o2TriggerBook('not an array').deaths, 0)
  assert.equal(o2TriggerBook(null).deaths, 0)
  const junk = o2TriggerBook([null, 42, 'died - respawning', 'F1 died - respawning', undefined, {}])
  assert.equal(junk.deaths, 0)
  assert.equal(o2TriggerRow(null), null)
  assert.equal(o2TriggerRow(undefined), null)
  assert.equal(o2TriggerRow({}), null)
  // the fence battery: the tampered sums read inconsistent
  const b = o2TriggerBook([hb(1, 20), pass('F1', 0, 5), hb(2, 45), died('F1', 'drowned')])
  assert.equal(o2TriggerConsistent(b), true)
  assert.equal(o2TriggerConsistent({ ...b, deaths: 5 }), false)
  assert.equal(o2TriggerConsistent({ ...b, window: { ...b.window, sum: 99 } }), false)
  assert.equal(o2TriggerConsistent({ ...b, crossed: 0 }), false)
  assert.equal(o2TriggerRow({ ...b, deaths: 5 }), null)
})

test('the untimed honesty - a crossed death before the clock prices untimed', () => {
  const lines = [
    pass('F2', 0, 6), // the crossing before any heartbeat - untimed
    hb(1, 30),
    died('F2', 'drowned')
  ]
  const b = o2TriggerBook(lines)
  assert.equal(b.untimed, 1, 'the crossing exists, the clock does not - the window reads the honest null')
  assert.equal(b.window.count, 0)
  const row = o2TriggerRow(b)
  assert.ok(row.includes('untimed 1'))
})

test('the decompose WIRING pins - the import band + the print site ride the bytes', () => {
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes("import { o2TriggerBook, o2TriggerRow } from '../../src/lib/o2trigger.mjs'"), 'the import rides the band')
  assert.ok(src.includes('const o2t = o2TriggerBook(lines)'), 'the book call rides the print site')
  assert.ok(src.includes('o2TriggerRow(o2t)'), 'the row renders at the site')
  assert.ok(src.includes("import { o2TriggerKindBook, o2TriggerKindRow } from '../../src/lib/o2trigger.mjs'"), 'the kind join rides its own band line (the band-grows law)')
  assert.ok(src.includes('const o2tk = o2TriggerKindBook(lines)'), 'the kind book call rides the print site')
  assert.ok(src.includes('o2TriggerKindRow(o2tk)'), 'the kind row renders at the site')
})

// (v0.885.0) THE TRIGGER'S OWN KIND JOIN - the false-positive split the
// fire-0000 fold's own row named. The same emitters' grammar byte for
// byte; the death lines ride the artifact's own shapes (the server's
// own kind= vocabulary, never re-adjudicated).
// (v0.887.0) THE FALSE-POSITIVE'S OWN ANATOMY - the price's own split
// by the attacker's own word: drowned-melee (the band's own predator
// won the race) vs wrong-door (the rescue aimed at a door the water
// never owned).
import { parseDeathKind } from '../../src/lib/deathkinds.mjs'
import { O2_DEATH_KIND, o2TriggerKindBook, o2TriggerKindConsistent, o2TriggerKindRow } from '../../src/lib/o2trigger.mjs'

const diedKind = (bot, verb, kind, attacker) =>
  `${bot} [${bot}] died - respawning (cause: server: ${verb} [kind=${kind}${attacker ? ` by ${attacker}` : ''}] | inferred: none)`

test('the kind grammar pin - the census\'s own RE by import, the one-parser law', () => {
  assert.equal(O2_DEATH_KIND, 'drown', 'the trigger\'s own death word is the server\'s own bucket')
  // the byte-verbatim face-145 shapes: the mob kind carries the attacker,
  // the plain kinds ride bare
  assert.deepEqual(
    parseDeathKind('F3 [F3] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.0 (0s before death at [-143,61,387]) [the inference corroborates the server verdict])'),
    { bot: 'F3', kind: 'mob', attacker: 'Drowned' })
  assert.deepEqual(
    parseDeathKind('F9 [F9] died - respawning (cause: server: suffocated in a wall [kind=suffocate] | inferred: fall/env (0s before death at [-141,58,397]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'),
    { bot: 'F9', kind: 'suffocate', attacker: null })
  assert.deepEqual(
    parseDeathKind('F12 [F12] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-151,43,401]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'),
    { bot: 'F12', kind: 'drown', attacker: null })
  // the inferred-only family stays unkinded - the honest null
  assert.equal(parseDeathKind('F16 [F16] died - respawning (cause: drowning (0s before death at [-122,48,403]))'), null)
  assert.equal(parseDeathKind('junk'), null)
  assert.equal(parseDeathKind(42), null)
})

test('the false-positive split - the crossed deaths\' own kinds', () => {
  const lines = [
    hb(1, 20),
    pass('F12', 0, 5), // the crossing
    hb(2, 45),
    died('F12', 'drowned'), // the trigger's own death - the o2 seat
    hb(3, 60),
    pass('F9', 0, 4), // the crossing
    hb(4, 90),
    diedKind('F9', 'suffocated in a wall', 'suffocate') // the cost seat
  ]
  const b = o2TriggerKindBook(lines)
  assert.equal(b.deaths, 2)
  assert.equal(b.crossed, 2)
  assert.equal(b.kinds.o2, 1, 'drown on a crossing = the trigger\'s own class')
  assert.equal(b.kinds.falsePositive, 1, 'suffocate on a crossing = the false-positive price')
  assert.equal(b.kinds.crossedUnknown, 0)
  assert.equal(b.perDeath[0].kind, 'drown')
  assert.equal(b.perDeath[1].kind, 'suffocate')
  assert.ok(o2TriggerKindConsistent(b))
  assert.equal(b.kinds.fp.melee, 0, 'suffocate has no attacker - the true wrong door')
  assert.equal(b.kinds.fp.wrongDoor, 1)
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes("the o2-low trigger's own kind join (v0.896.0)"))
  assert.ok(row.includes('crossed drown 1 (the trigger\'s own)'))
  assert.ok(row.includes('crossed non-o2 1 (the false-positive price: wrong-door 1)'))
})

test('the no-crossing deaths\' own kinds - the misses\' own families', () => {
  const lines = [
    hb(1, 20),
    diedKind('F3', 'was slain by Drowned', 'mob', 'Drowned'), // never dipped
    hb(2, 40),
    diedKind('F18', 'fell from a high place', 'fall') // no water at all
  ]
  const b = o2TriggerKindBook(lines)
  assert.equal(b.deaths, 2)
  assert.equal(b.noCrossing, 2)
  assert.deepEqual(b.kinds.noCrossing, { mob: 1, fall: 1 })
  // (v0.890.0) the miss seat's own predator - F3's Drowned never dipped
  assert.equal(b.kinds.miss.drowned, 1, 'the Drowned\'s own word on the no-crossing seat')
  assert.equal(b.perDeath[0].missClass, 'drowned')
  assert.equal(b.perDeath[0].attacker, 'Drowned')
  assert.equal(b.perDeath[1].missClass, null, 'the fall carries no predator')
  assert.equal(b.perDeath[1].attacker, null)
  // (v0.892.0) the readless predator seat - the proximity's honest silence
  assert.deepEqual(b.kinds.miss.predatorO2, { count: 0, min: null, max: null, gapMin: null, gapMax: null, spanMin: null, spanMax: null, dry: 0, wet: 0 })
  assert.equal(b.kinds.o2, 0)
  assert.equal(b.kinds.falsePositive, 0)
  assert.ok(o2TriggerKindConsistent(b))
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes('no-crossing mob 1/fall 1, the miss\'s own predator: drowned 1'))
})

test('the trigger\'s own kind in the misses - the blind spot names itself', () => {
  const lines = [
    hb(1, 20),
    died('F7', 'drowned') // a drown death with NO crossing - the sensor's blind seat
  ]
  const b = o2TriggerKindBook(lines)
  assert.deepEqual(b.kinds.noCrossing, { drown: 1 })
  assert.equal(b.kinds.miss.drowned, 0, 'the drown kind carries no attacker - no predator seat')
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes('no-crossing drown 1'))
  assert.ok(!row.includes('predator'), 'the zero-class silence holds')
})

test('the unkinded honesty - the inferred-only family counts unkinded', () => {
  const lines = [
    hb(1, 20),
    pass('F1', 0, 5),
    hb(2, 45),
    'F1 [F1] died - respawning (cause: drowning (0s before death at [-122,48,403]))', // no server verdict
    hb(3, 60),
    'F2 [F2] died - respawning (cause: unknown (no hp drop in the last 6s at [-122,48,403]))'
  ]
  const b = o2TriggerKindBook(lines)
  assert.equal(b.deaths, 2)
  assert.equal(b.kinds.crossedUnknown, 1, 'the crossed death without a verdict stays unkinded, counted')
  assert.equal(b.kinds.noCrossingUnknown, 1)
  assert.ok(o2TriggerKindConsistent(b))
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes('crossed unkinded 1'))
  assert.ok(row.includes('no-crossing unkinded 1'))
})

test('the face-145 kind join - the artifact\'s own death lines, byte for byte', () => {
  const lines = [
    'fleet [fleet] n=12 ts=241s rss=383M late=57ms mainLate=385ms',
    'F12 [F12] water: pass 0 head=wet shore=none land=n/a y=54.0 o2=8 probes=0 at=[-162,54,401]', // the crossing
    'F12 [F12] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-151,43,401]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
    'F9 [F9] water: pass 0 head=wet shore=none land=n/a y=58.0 o2=4 probes=0 at=[-141,58,397]', // the crossing
    'F9 [F9] died - respawning (cause: server: suffocated in a wall [kind=suffocate] | inferred: fall/env (0s before death at [-141,58,397]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
    'F3 [F3] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.0 (0s before death at [-143,61,387]) [the inference corroborates the server verdict])',
    'F18 [F18] died - respawning (cause: server: fell from a high place [kind=fall] | inferred: fall/env (0s before death at [-114,43,411]) [the inference corroborates the server verdict])'
  ]
  const b = o2TriggerKindBook(lines)
  assert.ok(o2TriggerKindConsistent(b))
  assert.equal(b.deaths, 4)
  assert.equal(b.crossed, 2)
  assert.equal(b.kinds.o2, 1, 'F12\'s drown = the trigger\'s own')
  assert.equal(b.kinds.falsePositive, 1, 'F9\'s suffocate = the cost the window book left unnamed')
  assert.equal(b.kinds.fp.melee, 0, 'suffocate\'s anatomy = the wrong door')
  assert.equal(b.kinds.fp.wrongDoor, 1)
  assert.deepEqual(b.kinds.noCrossing, { mob: 1, fall: 1 })
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes("the o2-low trigger's own kind join (v0.896.0)"))
  assert.ok(row.includes('crossed drown 1 (the trigger\'s own), crossed non-o2 1 (the false-positive price: wrong-door 1), no-crossing mob 1/fall 1'))
  assert.ok(row.includes("the miss's own predator: drowned 1"))
  assert.ok(!row.includes('last o2'), 'the readless predator seat rides the honest silence on the proximity')
  assert.deepEqual(b.kinds.miss.predatorO2, { count: 0, min: null, max: null, gapMin: null, gapMax: null, spanMin: null, spanMax: null, dry: 0, wet: 0 })
  assert.ok(row.includes('the kind join prices the trigger\'s own cost'))
})

// (v0.887.0) the kind join's first live face's own DEATH lines, byte
// for byte - face 148's own anatomy: the same attacker on both sides
// of the band (F9's Drowned INSIDE the crossing = the melee seat;
// F17's Drowned OUTSIDE it = the no-crossing miss). The pass lines
// ride the battery's own idiom; the heartbeats space the REAL face's
// own windows (F3 40s, F6 60s, F9 20s - the live seats' own spans).
test('the face-148 kind join - the drowned-melee seat\'s own live face', () => {
  const lines = [
    hb(1, 20),
    pass('F3', 0, 8), // the crossing
    hb(2, 60), // F3's window: 40s
    'F3 [F3] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-119,47,393]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
    'F17 [F17] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.9 (0s before death at [-91,62,346]) [the inference corroborates the server verdict])', // never dipped
    hb(3, 80),
    pass('F6', 0, 4), // the crossing
    hb(4, 140), // F6's window: 60s
    'F6 [F6] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-118,48,395]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
    hb(5, 160),
    pass('F9', 0, 6), // the crossing
    hb(6, 180), // F9's window: 20s - THE PREDATOR'S RACE IS FASTER
    'F9 [F9] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.2 (0s before death at [-127,61,386]) [the inference corroborates the server verdict])' // the melee seat
  ]
  const b = o2TriggerKindBook(lines)
  assert.ok(o2TriggerKindConsistent(b))
  assert.equal(b.deaths, 4)
  assert.equal(b.crossed, 3)
  assert.equal(b.kinds.o2, 2, 'F3\'s + F6\'s drown = the trigger\'s own')
  assert.equal(b.kinds.falsePositive, 1, 'F9\'s Drowned melee rode a real crossing')
  assert.equal(b.kinds.fp.melee, 1, 'the attacker\'s own word prices the near-miss seat')
  assert.equal(b.kinds.fp.wrongDoor, 0)
  // (v0.889.0) the melee seat's own window join - the race's own clock
  assert.deepEqual(b.kinds.fp.meleeWindow, { count: 1, min: 20, max: 20, sum: 20 }, 'F9\'s own 20s - the race the rescue lost')
  assert.equal(b.perDeath[0].window, 40, 'the o2 seat\'s own window rides untouched')
  assert.equal(b.perDeath[2].window, 60)
  assert.deepEqual(b.kinds.noCrossing, { mob: 1 })
  // (v0.890.0) the miss seat's own predator - F17's Drowned OUTSIDE the
  // band = the no-crossing miss where the predator WAS present
  assert.equal(b.kinds.miss.drowned, 1, 'the blind-spot seat named by the predator\'s own word')
  assert.equal(b.perDeath[1].missClass, 'drowned')
  assert.equal(b.perDeath[1].attacker, 'Drowned')
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes("the o2-low trigger's own kind join (v0.896.0)"))
  assert.ok(row.includes('crossed drown 2 (the trigger\'s own), crossed non-o2 1 (the false-positive price: drowned-melee 1 (window 20..20s avg 20s - the rescue\'s arrival budget: beat 20s)), no-crossing mob 1, the miss\'s own predator: drowned 1'))
  assert.deepEqual(b.kinds.miss.predatorO2, { count: 0, min: null, max: null, gapMin: null, gapMax: null, spanMin: null, spanMax: null, dry: 0, wet: 0 }, 'F17 rode no pass - the readless seat')
})

// (v0.891.0) the arrival budget - the fold's own floor prices the
// lever: the budget is a READ of the meleeWindow's own min cell (the
// tightest observed race), never a re-computation - the two-seat mass
// pins the budget against the avg's own temptation (20..40 avg 30:
// the budget rides 20, the floor)
test('the arrival budget - the fold\'s own floor prices the lever', () => {
  const lines = [
    hb(1, 20),
    pass('F1', 0, 5),
    hb(2, 45),
    diedKind('F1', 'was slain by Drowned', 'mob', 'Drowned'), // window 25
    hb(3, 80),
    pass('F2', 0, 6),
    hb(4, 115),
    diedKind('F2', 'was slain by Drowned', 'mob', 'Drowned') // window 35
  ]
  const b = o2TriggerKindBook(lines)
  assert.ok(o2TriggerKindConsistent(b))
  assert.equal(b.kinds.fp.melee, 2)
  assert.deepEqual(b.kinds.fp.meleeWindow, { count: 2, min: 25, max: 35, sum: 60 }, 'the two seats\' own mass')
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes('drowned-melee 2 (window 25..35s avg 30s - the rescue\'s arrival budget: beat 25s)'), 'the budget rides the fold\'s own floor, never the avg')
  assert.ok(!row.includes('beat 30s') && !row.includes('beat 35s'), 'neither the avg nor the max prices the lever')
})

test('the anatomy\'s both seats live - the row names only the live ones, joined', () => {
  const lines = [
    hb(1, 20),
    pass('F1', 0, 5),
    hb(2, 45),
    diedKind('F1', 'was slain by Drowned', 'mob', 'Drowned'), // the melee seat
    hb(3, 60),
    pass('F2', 0, 4),
    hb(4, 90),
    diedKind('F2', 'suffocated in a wall', 'suffocate') // the wrong-door seat
  ]
  const b = o2TriggerKindBook(lines)
  assert.ok(o2TriggerKindConsistent(b))
  assert.equal(b.kinds.fp.melee, 1)
  assert.equal(b.kinds.fp.wrongDoor, 1)
  assert.deepEqual(b.kinds.fp.meleeWindow, { count: 1, min: 25, max: 25, sum: 25 }, 'only the melee seat\'s clock joins - the wrong-door windows stay unjoined')
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes('crossed non-o2 2 (the false-positive price: drowned-melee 1 (window 25..25s avg 25s - the rescue\'s arrival budget: beat 25s) / wrong-door 1)'))
})

// (v0.889.0) the untimed melee seat - a crossing before the first
// heartbeat: the seat counts, the clock rides the honest silence (the
// blind-skin idiom)
test('the untimed melee seat - the clock rides the honest silence', () => {
  const lines = [
    pass('F1', 0, 5), // the crossing before any heartbeat - untimed
    diedKind('F1', 'was slain by Drowned', 'mob', 'Drowned')
  ]
  const b = o2TriggerKindBook(lines)
  assert.ok(o2TriggerKindConsistent(b))
  assert.equal(b.kinds.fp.melee, 1)
  assert.deepEqual(b.kinds.fp.meleeWindow, { count: 0, min: null, max: null, sum: 0 })
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes('crossed non-o2 1 (the false-positive price: drowned-melee 1)'))
  assert.ok(!row.includes('window'), 'the silent clock never names a span')
})

test('the melee window\'s own fence - the lying cells price nothing', () => {
  const lines = [
    hb(1, 20),
    pass('F1', 0, 5),
    hb(2, 45),
    diedKind('F1', 'was slain by Drowned', 'mob', 'Drowned') // window 25
  ]
  const b = o2TriggerKindBook(lines)
  assert.ok(o2TriggerKindConsistent(b))
  const fp = b.kinds.fp
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, fp: { ...fp, meleeWindow: { ...fp.meleeWindow, count: 2 } } } }), false, 'a count the fold never rode')
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, fp: { ...fp, meleeWindow: { ...fp.meleeWindow, sum: 26 } } } }), false)
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, fp: { ...fp, meleeWindow: { ...fp.meleeWindow, min: 24 } } } }), false)
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, fp: { ...fp, meleeWindow: null } } }), false)
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, fp: { ...fp, meleeWindow: { ...fp.meleeWindow, max: null } } } }), false)
  // the untimed melee seat carrying a window cell = the fence's own lie
  const untimed = o2TriggerKindBook([pass('F1', 0, 5), diedKind('F1', 'was slain by Drowned', 'mob', 'Drowned')])
  assert.equal(o2TriggerKindConsistent({ ...untimed, kinds: { ...untimed.kinds, fp: { ...untimed.kinds.fp, meleeWindow: { count: 1, min: 0, max: 0, sum: 0 } } } }), false)
  assert.equal(o2TriggerKindRow({ ...b, kinds: { ...b.kinds, fp: { ...fp, meleeWindow: { ...fp.meleeWindow, count: 9 } } } }), null)
})

test('the kind fence battery - the tampered books price nothing', () => {
  const lines = [
    hb(1, 20),
    pass('F1', 0, 5),
    hb(2, 45),
    died('F1', 'drowned')
  ]
  const b = o2TriggerKindBook(lines)
  assert.equal(o2TriggerKindConsistent(b), true)
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, o2: 5 } }), false, 'the seat must be the fold\'s own image')
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, falsePositive: 1 } }), false)
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, noCrossing: { mob: 1 } } }), false, 'a named cell the fold never rode breaks the fence')
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, noCrossingUnknown: 1 } }), false)
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: null }), false)
  assert.equal(o2TriggerKindConsistent(o2TriggerBook(lines)), false, 'the unkinded window book fails the kind fence')
  assert.equal(o2TriggerKindRow({ ...b, kinds: { ...b.kinds, o2: 9 } }), null)
  // the negative seat
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, crossedUnknown: -1 } }), false)
  // (v0.887.0) the anatomy's own fence: the sub-seats must sum to the
  // price and a class never leaks off the price's own seat
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, fp: { melee: 1, wrongDoor: 0 } } }), false, 'the melee seat the fold never rode breaks the fence')
  const fpBook = o2TriggerKindBook([
    hb(1, 20),
    pass('F2', 0, 4),
    hb(2, 45),
    diedKind('F2', 'suffocated in a wall', 'suffocate') // the wrong-door price
  ])
  assert.equal(fpBook.kinds.fp.wrongDoor, 1)
  assert.equal(o2TriggerKindConsistent({ ...fpBook, kinds: { ...fpBook.kinds, fp: { melee: 0, wrongDoor: 0 } } }), false, 'the price without its anatomy seat breaks the fence')
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, fp: null } }), false)
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, fp: { melee: -1, wrongDoor: 1 } } }), false)
  const leak = o2TriggerKindBook(lines)
  leak.perDeath[0].fpClass = 'melee' // the class leaked onto the o2 death
  assert.equal(o2TriggerKindConsistent(leak), false, 'the anatomy never rides the trigger\'s own seat')
  const meleeBook = o2TriggerKindBook([
    hb(1, 20),
    pass('F1', 0, 5),
    hb(2, 45),
    diedKind('F1', 'was slain by Drowned', 'mob', 'Drowned')
  ])
  assert.equal(meleeBook.perDeath[0].fpClass, 'melee')
  meleeBook.perDeath[0].fpClass = 'wrongDoor' // the lying class
  assert.equal(o2TriggerKindConsistent(meleeBook), false, 'the lying anatomy seat breaks the fence')
  assert.equal(o2TriggerKindRow(meleeBook), null)
})

test('the kind row\'s honest silence - the zero deaths, the junk input', () => {
  assert.equal(o2TriggerKindRow(o2TriggerKindBook([])), null)
  assert.equal(o2TriggerKindBook('not an array').deaths, 0)
  assert.equal(o2TriggerKindBook(null).kinds.o2, 0, 'the empty book still carries the kind cells')
  assert.equal(o2TriggerKindRow(null), null)
  assert.equal(o2TriggerKindRow(undefined), null)
  assert.equal(o2TriggerKindRow({}), null)
  // the junk between the deaths rides nothing - the alignment holds
  const b = o2TriggerKindBook([null, 42, hb(1, 20), pass('F1', 0, 5), {}, 'died - respawning', hb(2, 45), died('F1', 'drowned')])
  assert.equal(b.deaths, 1)
  assert.equal(b.kinds.o2, 1)
  assert.ok(o2TriggerKindConsistent(b))
})

// (v0.890.0) THE MISS SEAT'S OWN PREDATOR - the misses' own anatomy's
// own battery: the Drowned's own word on the no-crossing seat (the
// trigger's own blind spot - the predator was present, the trigger
// never saw the crossing); the other attackers stay unnamed (the
// second split waits for the mass - the honest defer).
test("the miss seat's own predator - the blind spot named by the attacker's own word", () => {
  const lines = [
    hb(1, 20),
    'F17 [F17] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.9 (0s before death at [-91,62,346]) [the inference corroborates the server verdict])', // never dipped - the predator's own blind-spot seat
    hb(2, 40),
    diedKind('F8', 'was slain by Zombie', 'mob', 'Zombie'), // the other attacker - unnamed
    hb(3, 60),
    diedKind('F5', 'fell from a high place', 'fall') // no water, no predator
  ]
  const b = o2TriggerKindBook(lines)
  assert.ok(o2TriggerKindConsistent(b))
  assert.equal(b.deaths, 3)
  assert.equal(b.noCrossing, 3)
  assert.deepEqual(b.kinds.noCrossing, { mob: 2, fall: 1 })
  assert.equal(b.kinds.miss.drowned, 1, "the Drowned's own word prices the blind-spot seat")
  assert.equal(b.perDeath[0].missClass, 'drowned')
  assert.equal(b.perDeath[0].attacker, 'Drowned')
  assert.equal(b.perDeath[1].missClass, null, 'the Zombie miss stays unnamed')
  assert.equal(b.perDeath[1].attacker, 'Zombie')
  assert.equal(b.perDeath[2].missClass, null)
  assert.equal(b.perDeath[2].attacker, null, 'the fall carries no attacker')
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes("the o2-low trigger's own kind join (v0.896.0)"))
  assert.ok(row.includes("no-crossing mob 2/fall 1, the miss's own predator: drowned 1"))
})

test("the miss predator's own fence - the lying seats price nothing", () => {
  const lines = [
    hb(1, 20),
    diedKind('F17', 'was slain by Drowned', 'mob', 'Drowned'), // the predator's own blind-spot seat
    hb(2, 40),
    diedKind('F8', 'was slain by Zombie', 'mob', 'Zombie')
  ]
  const b = o2TriggerKindBook(lines)
  assert.ok(o2TriggerKindConsistent(b))
  // the lying counter: a count the fold never rode
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { drowned: 2 } } }), false, 'a count the fold never rode')
  // the omission: the predator seat stripped of its marker - the seat lies by silence
  const stripped = o2TriggerKindBook(lines)
  stripped.perDeath[0].missClass = null
  assert.equal(o2TriggerKindConsistent(stripped), false, 'the omission lies like the leak')
  // the leak: the marker on the Zombie seat - the wrong predator
  const leak = o2TriggerKindBook(lines)
  leak.perDeath[1].missClass = 'drowned'
  assert.equal(o2TriggerKindConsistent(leak), false, 'the marker never rides the other attacker')
  // the leak: the marker on a fall death
  const fallBook = o2TriggerKindBook([hb(1, 20), diedKind('F5', 'fell from a high place', 'fall')])
  fallBook.perDeath[0].missClass = 'drowned'
  assert.equal(o2TriggerKindConsistent(fallBook), false, 'the marker never rides a fall')
  // the leak: the marker on a crossed death (the melee seat's own class is fpClass, never missClass)
  const crossedBook = o2TriggerKindBook([
    hb(1, 20), pass('F9', 0, 6), hb(2, 26),
    diedKind('F9', 'was slain by Drowned', 'mob', 'Drowned') // the melee seat
  ])
  assert.equal(crossedBook.kinds.fp.melee, 1)
  assert.equal(crossedBook.kinds.miss.drowned, 0, 'the melee seat is the price, not the miss')
  crossedBook.perDeath[0].missClass = 'drowned'
  assert.equal(o2TriggerKindConsistent(crossedBook), false, 'the marker never rides a crossed seat')
  // the shape: the miss cells missing / negative
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: null } }), false)
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { drowned: -1 } } }), false)
  // the lying row prices nothing
  assert.equal(o2TriggerKindRow({ ...b, kinds: { ...b.kinds, miss: { drowned: 9 } } }), null)
  // the zero-class silence: no Drowned miss - the row never names the predator clause
  const zombieOnly = o2TriggerKindBook([hb(1, 20), diedKind('F8', 'was slain by Zombie', 'mob', 'Zombie')])
  const zRow = o2TriggerKindRow(zombieOnly)
  assert.ok(zRow.includes('no-crossing mob 1'))
  assert.ok(!zRow.includes('predator'), 'the zero-class silence holds')
})

// (v0.892.0) THE MISS SEAT'S OWN PROXIMITY - the predator seat's own
// air: face 148's F17 died to the Drowned with the LAST water pass
// reading o2=20 head=dry shore=hit, 178 log lines before the death -
// the bot was DRY AT FULL AIR at its last read (the band edge's own
// innocence: the blind spot is the sensor's own sight, not the
// threshold's height). The pass line byte-verbatim from the artifact.
test("the miss seat's own proximity - the seat's own air names the band edge's own innocence", () => {
  const lines = [
    hb(1, 20),
    'F17 [F17] water: pass 28 head=dry shore=hit r=4 land=none y=62.8 o2=20 probes=0 at=[-102,63,365]', // the last read: DRY AT FULL AIR
    'F17 [F17] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.9 (0s before death at [-91,62,346]) [the inference corroborates the server verdict])', // never dipped
    hb(2, 40),
    'F8 [F8] water: pass 3 head=wet shore=none land=n/a y=59.1 o2=14 probes=0 at=[-95,59,350]', // a wet read close to the edge
    diedKind('F8', 'was slain by Drowned', 'mob', 'Drowned') // the second predator seat
  ]
  const b = o2TriggerKindBook(lines)
  assert.ok(o2TriggerKindConsistent(b))
  assert.equal(b.kinds.miss.drowned, 2)
  assert.deepEqual(b.kinds.miss.predatorO2, { count: 2, min: 14, max: 20, gapMin: 1, gapMax: 1, spanMin: null, spanMax: null, dry: 1, wet: 1 }, "the seats' own air fold - 20 (dry, full air) and 14 (wet, near the edge); both seats rode ONE read - the cadence's honest silence; the heads fold beside the air (the shore's own split)")
  assert.equal(b.perDeath[0].lastO2, 20, "F17's own last read rides the seat")
  assert.equal(b.perDeath[0].lastO2Gap, 1, "F17's own read distance - the sight span's own seat (the v0.893.0 byte)")
  assert.equal(b.perDeath[1].lastO2, 14)
  assert.equal(b.perDeath[1].lastO2Gap, 1)
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes("the o2-low trigger's own kind join (v0.896.0)"))
  assert.ok(row.includes("no-crossing mob 2, the miss's own predator: drowned 2 (last o2 14..20, read gap 1..1 lines, head dry 1/wet 1)"), "the heads ride the seat clause beside the sight span")
})

test("the proximity's own fence - the lying cells price nothing", () => {
  const lines = [
    hb(1, 20),
    'F17 [F17] water: pass 28 head=dry shore=hit r=4 land=none y=62.8 o2=20 probes=0 at=[-102,63,365]', // lastO2 20
    diedKind('F17', 'was slain by Drowned', 'mob', 'Drowned'),
    hb(2, 40),
    diedKind('F9', 'was slain by Drowned', 'mob', 'Drowned') // the readless seat
  ]
  const b = o2TriggerKindBook(lines)
  assert.ok(o2TriggerKindConsistent(b))
  assert.deepEqual(b.kinds.miss.predatorO2, { count: 1, min: 20, max: 20, gapMin: 1, gapMax: 1, spanMin: null, spanMax: null, dry: 1, wet: 0 }, 'the readless seat rides the honest silence')
  const po = b.kinds.miss.predatorO2
  // the lying count / min / max - the cells must be the seats' own fold
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, count: 2 } } } }), false, 'a count the fold never rode')
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, min: 19 } } } }), false)
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, max: 21 } } } }), false)
  // the count-0 coherence: min/max must ride the honest nulls
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { count: 0, min: 20, max: null } } } }), false)
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: null } } }), false)
  // a non-integer lastO2 on the seat breaks the window fence - the kind fence rides it
  const junk = o2TriggerKindBook(lines)
  junk.perDeath[0].lastO2 = 'twenty'
  assert.equal(o2TriggerKindConsistent(junk), false, 'the seat\'s own cell must be the fold\'s own number')
  // the lying row prices nothing
  assert.equal(o2TriggerKindRow({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, count: 9 } } } }), null)
  // the proximity's honest silence: both seats readless - the bare clause
  const readless = o2TriggerKindBook([hb(1, 20), diedKind('F9', 'was slain by Drowned', 'mob', 'Drowned')])
  assert.deepEqual(readless.kinds.miss.predatorO2, { count: 0, min: null, max: null, gapMin: null, gapMax: null, spanMin: null, spanMax: null, dry: 0, wet: 0 })
  const rRow = o2TriggerKindRow(readless)
  assert.ok(rRow.includes("the miss's own predator: drowned 1"))
  assert.ok(!rRow.includes('last o2'), 'the readless mass never names a span')
})

// (v0.893.0) THE READ GAP'S OWN SEAT - the sight span's own price:
// the face-148 read named the byte (the bot's last read rode 178 log
// lines before the death - the reads were too sparse to see the
// descent). The gap is the fold's own distance (the death line's own
// index minus the last numeric read's own index), the predatorO2's
// own gapMin/gapMax fold, the row's own clause.
test("the read gap's own seat - the sight span's own price rides the predator clause", () => {
  const lines = [
    hb(1, 20),
    'F17 [F17] water: pass 28 head=dry shore=hit r=4 land=none y=62.8 o2=20 probes=0 at=[-102,63,365]', // the last read - DRY AT FULL AIR
    'fleet [fleet] n=12 ts=261s rss=383M late=57ms mainLate=385ms', // the sight span's own filler - the reads were sparse
    'F12 [F12] steer: hazard defer: coal_ore@-122,59,388 held behind the ledger (d 4.1)', // junk between rides nothing
    'F17 [F17] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.9 (0s before death at [-91,62,346]) [the inference corroborates the server verdict])', // the death 3 lines after the read
    hb(2, 40),
    diedKind('F9', 'was slain by Drowned', 'mob', 'Drowned') // the readless seat
  ]
  const b = o2TriggerKindBook(lines)
  assert.ok(o2TriggerKindConsistent(b))
  assert.equal(b.kinds.miss.drowned, 2)
  assert.equal(b.perDeath[0].lastO2Gap, 3, "F17's own sight span - 3 lines from the last read to the death")
  assert.equal(b.perDeath[0].lastO2Span, null, 'the one-read seat rides the honest null cadence')
  assert.equal(b.perDeath[1].lastO2Gap, null, 'the readless seat rides the honest null')
  assert.deepEqual(b.kinds.miss.predatorO2, { count: 1, min: 20, max: 20, gapMin: 3, gapMax: 3, spanMin: null, spanMax: null, dry: 1, wet: 0 }, 'the gap fold rides only the seats that read; the cadence stays silent on the one-read seat')
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes("the o2-low trigger's own kind join (v0.896.0)"))
  assert.ok(row.includes("the miss's own predator: drowned 2 (last o2 20..20, read gap 3..3 lines, head dry 1)"), 'the sight span and the shore state ride the seat clause')
  // the gap's own fence - the lying cells price nothing
  const po = b.kinds.miss.predatorO2
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, gapMin: 2 } } } }), false, 'a min the fold never rode')
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, gapMax: 9 } } } }), false)
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, gapMin: null, gapMax: 3 } } } }), false, 'the pair rides together')
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, gapMin: -1, gapMax: 3 } } } }), false, 'the gap counts lines, never debts')
  // a gap without its own read lies (the window fence's own law)
  const gapped = o2TriggerKindBook(lines)
  gapped.perDeath[1].lastO2Gap = 5
  assert.equal(o2TriggerKindConsistent(gapped), false, 'the gap without its own read prices nothing')
  // a non-integer gap on the seat breaks the window fence - the kind fence rides it
  const junk = o2TriggerKindBook(lines)
  junk.perDeath[0].lastO2Gap = 'three'
  assert.equal(o2TriggerKindConsistent(junk), false, "the seat's own gap must be the fold's own number")
  // the readless mass: the bare clause holds - no gap span ever named
  const bare = o2TriggerKindBook([hb(1, 20), diedKind('F9', 'was slain by Drowned', 'mob', 'Drowned')])
  const bareRow = o2TriggerKindRow(bare)
  assert.ok(bareRow.includes("the miss's own predator: drowned 1"))
  assert.ok(!bareRow.includes('read gap'), 'the readless mass never names a gap')
})

// (v0.895.0) THE READ CADENCE'S OWN SEAT - the gap's own next byte:
// the gap alone cannot split the two levers (a UNIFORM slow cadence
// and a cadence that STOPPED both read huge gaps). The span is the
// last TWO reads' own distance (the fold's own cells, never
// re-computed): span near the gap prices the uniform cadence, span
// far below the gap prices the stopped sentry. The chain is the
// value's own: the value <- the gap <- the span.
test("the read cadence's own seat - the span splits the uniform from the stopped", () => {
  const lines = [
    hb(1, 20),
    'F17 [F17] water: pass 12 head=wet shore=none land=n/a y=60.1 o2=18 probes=0 at=[-99,60,362]', // the first read
    'F17 [F17] water: pass 16 head=wet shore=none land=n/a y=61.0 o2=20 probes=0 at=[-100,61,363]', // the second read - span 1
    'fleet [fleet] n=12 ts=261s rss=383M late=57ms mainLate=385ms', // filler
    'F17 [F17] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.9 (0s before death at [-91,62,346]) [the inference corroborates the server verdict])', // gap 2, span 1 - the UNIFORM seat
    hb(2, 40),
    'F8 [F8] water: pass 3 head=wet shore=none land=n/a y=59.1 o2=14 probes=0 at=[-95,59,350]', // the first read
    'fleet [fleet] n=13 ts=281s rss=384M late=58ms mainLate=72ms', // filler
    'fleet [fleet] n=14 ts=301s rss=385M late=59ms mainLate=73ms', // filler
    'F8 [F8] water: pass 9 head=wet shore=none land=n/a y=60.2 o2=16 probes=0 at=[-94,60,352]', // the second read - span 3
    diedKind('F8', 'was slain by Drowned', 'mob', 'Drowned') // gap 1, span 3 - the SPARSE seat
  ]
  const b = o2TriggerKindBook(lines)
  assert.ok(o2TriggerKindConsistent(b))
  assert.equal(b.kinds.miss.drowned, 2)
  assert.equal(b.perDeath[0].lastO2Gap, 2, 'the uniform seat\'s own sight span')
  assert.equal(b.perDeath[0].lastO2Span, 1, 'the uniform seat\'s own cadence - reads came tight, the gap is the quiet tail')
  assert.equal(b.perDeath[1].lastO2Gap, 1)
  assert.equal(b.perDeath[1].lastO2Span, 3, 'the sparse seat\'s own cadence - the reads themselves were far apart')
  assert.deepEqual(b.kinds.miss.predatorO2, { count: 2, min: 16, max: 20, gapMin: 1, gapMax: 2, spanMin: 1, spanMax: 3, dry: 0, wet: 2 }, 'the gap and the cadence fold side by side (the last reads\' own air: 20 and 16); both seats read WET - the shore stays innocent on this mass')
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes("the o2-low trigger's own kind join (v0.896.0)"))
  assert.ok(row.includes("the miss's own predator: drowned 2 (last o2 16..20, read gap 1..2 lines, cadence 1..3 lines, head wet 2)"), 'the cadence rides the seat clause beside the sight span')
  // the span's own fence - the lying cells price nothing
  const po = b.kinds.miss.predatorO2
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, spanMin: 0 } } } }), false, 'a span the fold never rode')
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, spanMax: 9 } } } }), false)
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, spanMin: null, spanMax: 3 } } } }), false, 'the pair rides together')
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, spanMin: -1, spanMax: 3 } } } }), false, 'the span counts lines, never debts')
  // the chain is the value's own: the span without its gap lies
  const chained = o2TriggerKindBook(lines)
  chained.perDeath[0].lastO2Gap = null
  assert.equal(o2TriggerKindConsistent(chained), false, 'the span without its own gap prices nothing')
  // a non-integer span on the seat breaks the window fence
  const junk = o2TriggerKindBook(lines)
  junk.perDeath[1].lastO2Span = 'three'
  assert.equal(o2TriggerKindConsistent(junk), false, "the seat's own span must be the fold's own number")
  // the one-read mass: the bare gap clause holds - no cadence ever named
  const oneRead = o2TriggerKindBook([
    hb(1, 20),
    'F17 [F17] water: pass 28 head=dry shore=hit r=4 land=none y=62.8 o2=20 probes=0 at=[-102,63,365]',
    diedKind('F17', 'was slain by Drowned', 'mob', 'Drowned')
  ])
  assert.deepEqual(oneRead.kinds.miss.predatorO2, { count: 1, min: 20, max: 20, gapMin: 1, gapMax: 1, spanMin: null, spanMax: null, dry: 1, wet: 0 }, 'the one-read seat rides the honest null cadence')
  const oneRow = o2TriggerKindRow(oneRead)
  assert.ok(oneRow.includes("the miss's own predator: drowned 1 (last o2 20..20, read gap 1..1 lines, head dry 1)"))
  assert.ok(!oneRow.includes('cadence'), 'the one-read mass never names a cadence')
})

// (v0.896.0) THE LAST READ'S OWN HEAD - the cadence's own next byte:
// the stopped sentry's own mass (gap 197/cadence 11, gap 87/cadence 5)
// left the WHY open - the face-148 read's own shape names the shore's
// own question ('o2=20 head=dry shore=hit': DRY at the last read, then
// the water-pass stream went quiet). The head state is the parse's own
// field (the one-parser law): a DRY last read prices the shore's own
// quiet, a WET last read prices the in-water quiet - the dry-side
// lever named by the seat's own word.
test("the last read's own head - the shore state prices the stopped sentry's own quiet", () => {
  const lines = [
    hb(1, 20),
    'F17 [F17] water: pass 28 head=dry shore=hit r=4 land=none y=62.8 o2=20 probes=0 at=[-102,63,365]', // the last read: DRY AT FULL AIR - the shore's own quiet followed
    'F17 [F17] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.9 (0s before death at [-91,62,346]) [the inference corroborates the server verdict])',
    hb(2, 40),
    'F8 [F8] water: pass 3 head=wet shore=none land=n/a y=59.1 o2=14 probes=0 at=[-95,59,350]', // the wet read - the stream stayed water-side
    diedKind('F8', 'was slain by Drowned', 'mob', 'Drowned')
  ]
  const b = o2TriggerKindBook(lines)
  assert.ok(o2TriggerKindConsistent(b))
  assert.equal(b.perDeath[0].lastPassHead, 'dry', "F17's own last read rode DRY - the shore's own state")
  assert.equal(b.perDeath[1].lastPassHead, 'wet', "F8's own last read rode WET - the water's own state")
  assert.deepEqual(b.kinds.miss.predatorO2, { count: 2, min: 14, max: 20, gapMin: 1, gapMax: 1, spanMin: null, spanMax: null, dry: 1, wet: 1 }, 'the heads fold beside the air - one shore quiet, one water-side')
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes("the o2-low trigger's own kind join (v0.896.0)"))
  assert.ok(row.includes("the miss's own predator: drowned 2 (last o2 14..20, read gap 1..1 lines, head dry 1/wet 1)"), 'the heads ride the seat clause beside the sight span')
  // the head's own fence - the lying cells price nothing
  const po = b.kinds.miss.predatorO2
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, dry: 2 } } } }), false, 'a dry the fold never rode')
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, wet: 9 } } } }), false)
  assert.equal(o2TriggerKindConsistent({ ...b, kinds: { ...b.kinds, miss: { ...b.kinds.miss, predatorO2: { ...po, dry: 0, wet: 1 } } } }), false, 'the sum must be the reads\' own count')
  // the pair shares one seat: the head without its own read lies
  const headed = o2TriggerKindBook(lines)
  headed.perDeath[1].lastPassHead = null
  assert.equal(o2TriggerKindConsistent(headed), false, 'the read without its own head prices nothing')
  // the head without its read lies the other way
  const headless = o2TriggerKindBook(lines)
  headless.perDeath[0].lastO2 = null
  headless.perDeath[0].lastO2Gap = null
  assert.equal(o2TriggerKindConsistent(headless), false, 'the head without its own read prices nothing')
  // an invalid head word prices nothing
  const word = o2TriggerKindBook(lines)
  word.perDeath[0].lastPassHead = 'soaked'
  assert.equal(o2TriggerKindConsistent(word), false, "the head must be the parse's own word")
  // the readless mass: the bare clause holds - no head ever named
  const readless = o2TriggerKindBook([hb(1, 20), diedKind('F9', 'was slain by Drowned', 'mob', 'Drowned')])
  assert.equal(readless.perDeath[0].lastPassHead, null, 'the readless seat rides the honest null head')
  const rRow = o2TriggerKindRow(readless)
  assert.ok(rRow.includes("the miss's own predator: drowned 1"))
  assert.ok(!rRow.includes('head'), 'the readless mass never names a head')
})
