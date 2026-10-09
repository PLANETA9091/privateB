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
  assert.deepEqual(b.perDeath[0], { bot: 'F12', ts: 261, crossed: true, window: 20 })
  // F3: never dipped into the band (14/18/20) - the honest no-crossing
  assert.deepEqual(b.perDeath[1], { bot: 'F3', ts: 280, crossed: false, window: null })
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
  assert.ok(row.includes("the o2-low trigger's own kind join (v0.887.0)"))
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
  assert.equal(b.kinds.o2, 0)
  assert.equal(b.kinds.falsePositive, 0)
  assert.ok(o2TriggerKindConsistent(b))
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes('no-crossing mob 1/fall 1'))
})

test('the trigger\'s own kind in the misses - the blind spot names itself', () => {
  const lines = [
    hb(1, 20),
    died('F7', 'drowned') // a drown death with NO crossing - the sensor's blind seat
  ]
  const b = o2TriggerKindBook(lines)
  assert.deepEqual(b.kinds.noCrossing, { drown: 1 })
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes('no-crossing drown 1'))
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
  assert.ok(row.includes("the o2-low trigger's own kind join (v0.887.0)"))
  assert.ok(row.includes('crossed drown 1 (the trigger\'s own), crossed non-o2 1 (the false-positive price: wrong-door 1), no-crossing mob 1/fall 1'))
  assert.ok(row.includes('the kind join prices the trigger\'s own cost'))
})

// (v0.887.0) the kind join's first live face's own DEATH lines, byte
// for byte - face 148's own anatomy: the same attacker on both sides
// of the band (F9's Drowned INSIDE the crossing = the melee seat;
// F17's Drowned OUTSIDE it = the no-crossing miss). The pass lines
// ride the battery's own idiom - the crossings the fold needs.
test('the face-148 kind join - the drowned-melee seat\'s own live face', () => {
  const lines = [
    hb(1, 20),
    pass('F3', 0, 8), // the crossing
    'F3 [F3] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-119,47,393]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
    'F17 [F17] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.9 (0s before death at [-91,62,346]) [the inference corroborates the server verdict])', // never dipped
    hb(2, 40),
    pass('F6', 0, 4), // the crossing
    'F6 [F6] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-118,48,395]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
    hb(3, 60),
    pass('F9', 0, 6), // the crossing
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
  assert.deepEqual(b.kinds.noCrossing, { mob: 1 })
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes("the o2-low trigger's own kind join (v0.887.0)"))
  assert.ok(row.includes('crossed drown 2 (the trigger\'s own), crossed non-o2 1 (the false-positive price: drowned-melee 1), no-crossing mob 1'))
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
  const row = o2TriggerKindRow(b)
  assert.ok(row.includes('crossed non-o2 2 (the false-positive price: drowned-melee 1 / wrong-door 1)'))
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
