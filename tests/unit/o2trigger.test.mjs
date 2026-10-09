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
})
