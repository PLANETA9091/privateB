import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shelterLadder } from '../../src/lib/shieldledger.mjs'
import { parseCombatLine } from '../../src/lib/shootercensus.mjs'

// Face 43's live shapes verbatim (run 36970605824) - the ladder episodes
// and their own boundary lines (hand-traced: the machinery rides the
// episode, the boundary closes it).
const face43Mini = [
  // F19's pregate skip - the gate refused before any try (no open episode)
  'F19 [F19] combat: shelter skip (night=true armed=true hp=18.66666603088379 attackers=2 poison=off threat=spider@2.7)',
  // F17's episode: try -> miss -> skip (notbuildable) -> fleeing (laneLost)
  'F17 [F17] combat: shelter try vs spider (dist 1.2, sentry re-verdict)',
  'F17 [F17] combat: shelter wall miss (open field: no diggable wall, ring next, spider@1.2)',
  'F17 [F17] combat: shelter skip (open field: ring not buildable [oo oo -o oo] vs spider@1.2)',
  'F17 [F17] combat: fleeing spider (dist 4.0, hp 8.3, 2 nearby, proximity)',
  // F11's ringed episode: try -> miss -> ring try -> sheltering (THE RING DOOR)
  'F11 [F11] combat: shelter try vs creeper (dist 2.5, proximity re-verdict)',
  'F11 [F11] combat: shelter wall miss (open field: no diggable wall, ring next, creeper@2.5)',
  'F11 [F11] combat: shelter ring try vs creeper (dist 2.5, -z+x-x+z first, full ring, proximity re-verdict)',
  'F11 [F11] combat: sheltering from creeper (ring 8/8, proximity re-verdict)',
  // F5's re-scan pair: the same spider, the same dist, the same refusal -
  // ep1 closes laneLost (the fight took over), ep2 re-asks the same question
  'F5 [F5] combat: shelter try vs spider (dist 5.0, proximity pre-fight)',
  'F5 [F5] combat: shelter wall miss (open field: no diggable wall, ring next, spider@5.0)',
  'F5 [F5] combat: shelter skip (open field: ring not buildable [-o oo -o Bo] vs spider@5.0)',
  'F5 [F5] combat: fighting spider (dist 5.0, hp 11.0, 2 nearby, proximity)',
  'F5 [F5] combat: shelter try vs spider (dist 5.0, proximity re-verdict)',
  // the death closes ep2 (the scan outlived by the death)
  'F5 [F5] died - respawning (cause: server: was slain by Zombie Villager [kind=mob by Zombie] | inferred: zombie_villager@0.7 (0s before death at [-152,65,407]) [the inference CONTRADICTS the server verdict])'
]

test('shelterLadder reads face 43 verbatim: book 4/4 with the ring door and the re-scan pair', () => {
  const r = shelterLadder(face43Mini)
  assert.equal(r.tries, 4)
  assert.equal(r.ringed, 1)
  assert.equal(r.laneLost, 2)
  assert.equal(r.died, 1)
  assert.equal(r.open, 0)
  // the book law: tries = ringed + laneLost + died + open
  assert.equal(r.tries, r.ringed + r.laneLost + r.died + r.open)
  // the ring door: one ring try, and it LANDED (the ringed close)
  assert.equal(r.ringTries, 1)
  assert.equal(r.ringLanded, 1)
  assert.equal(r.ringRefused, 0)
  // the wall door: every try missed the wall (the open-field signature)
  assert.equal(r.wallMisses, 3)
  // the re-scan tax: F5's spider -> spider pair
  assert.equal(r.sameThreatRescans, 1)
  assert.equal(r.threatChangedRescans, 0)
  // the pregate: F19's gate-state skip with no open episode
  assert.equal(r.pregate, 1)
  assert.deepEqual(r.pregateClasses, { gateskip: 1 })
  // the first-skip classes: F17's + F5-ep1's refusals
  assert.deepEqual(r.skipClasses, { notbuildable: 2 })
})

test('shelterLadder rows carry the episode anatomy', () => {
  const r = shelterLadder(face43Mini)
  const f11 = r.rows.find(x => x.bot === 'F11')
  assert.deepEqual(
    { mob: f11.mob, dist: f11.dist, outcome: f11.outcome, wallMisses: f11.wallMisses, ringTries: f11.ringTries, skips: f11.skips, firstSkipClass: f11.firstSkipClass },
    { mob: 'creeper', dist: 2.5, outcome: 'ringed', wallMisses: 1, ringTries: 1, skips: 0, firstSkipClass: null }
  )
  const f5ep2 = r.rows.filter(x => x.bot === 'F5')[1]
  assert.equal(f5ep2.outcome, 'died')
  assert.equal(f5ep2.wallMisses, 0)
})

test('shelterLadder prices the prose span the ladder burned', () => {
  const r = shelterLadder(face43Mini)
  // spans (0-based idx): F17 4-1=3, F11 8-5=3, F5 ep1 12-9=3, F5 ep2 14-13=1
  assert.deepEqual(r.prose, { min: 1, median: 3, max: 3 })
})

test('shelterLadder verb-key pin: the ring try rides parseCombatLine as ring-try', () => {
  // the regression the live run caught: 'shelter ring try' routes to the
  // verb key 'ring-try' (most-specific-first), never 'shelter-ring-try'
  assert.equal(parseCombatLine('F11 [F11] combat: shelter ring try vs creeper (dist 2.5, -z+x-x+z first, full ring, proximity re-verdict)').verb, 'ring-try')
  const r = shelterLadder([
    'F3 [F3] combat: shelter try vs zombie (dist 3.0, proximity)',
    'F3 [F3] combat: shelter ring try vs zombie (dist 3.0, -x+z-z+x first, full ring, proximity)',
    'F3 [F3] combat: sheltering from zombie (ring 8/8, proximity)'
  ])
  assert.equal(r.ringTries, 1)
  assert.equal(r.ringLanded, 1)
  assert.equal(r.rows[0].outcome, 'ringed')
})

test('shelterLadder skip-class grammar: the five live refusals named', () => {
  const r = shelterLadder([
    'F1 [F1] combat: shelter try vs drowned (dist 4.5, proximity pre-fight)',
    'F1 [F1] combat: shelter skip (open field: ring stock 2/8, ground earns nothing)',
    'F2 [F2] combat: shelter try vs drowned (dist 4.5, proximity pre-fight)',
    'F2 [F2] combat: shelter skip (open field: ring incomplete 7/8)',
    'F3 [F3] combat: shelter try vs zombie (dist 4.7, proximity pre-fight)',
    'F3 [F3] combat: shelter skip (1,0: step-in incomplete)',
    'F4 [F4] combat: shelter try vs zombie (dist 0.6, sentry pre-fight)',
    'F4 [F4] combat: shelter skip (open field: ring not buildable [-o -o oo oo] vs zombie@0.6)',
    'F5 [F5] combat: shelter try vs zombie (dist 2.0, proximity)',
    'F5 [F5] combat: shelter skip (some future refusal wording the emitter grew)'
  ])
  assert.deepEqual(r.skipClasses, { nostock: 1, incomplete: 1, stepin: 1, notbuildable: 1, other: 1 })
  assert.equal(r.tries, 5)
  assert.equal(r.open, 5) // every episode rides to the tail - the skips are machinery
  assert.equal(r.book !== undefined, false) // no invented keys
})

test('shelterLadder mid-walk twin: a second try over an open episode closes it open', () => {
  const r = shelterLadder([
    'F9 [F9] combat: shelter try vs zombie (dist 2.0, proximity)',
    'F9 [F9] combat: shelter try vs skeleton (dist 3.0, proximity)'
  ])
  assert.equal(r.tries, 2)
  assert.equal(r.open, 2) // the twin closes the stale one; the fresh one rides to the tail
  assert.deepEqual(r.rows.map(x => x.outcome), ['open', 'open'])
  assert.deepEqual(r.rows.map(x => x.mob), ['zombie', 'skeleton']) // the fresh try owns its own episode
})

test('shelterLadder re-scan law: the mob change is not a same-threat re-scan', () => {
  const r = shelterLadder([
    'F7 [F7] combat: shelter try vs spider (dist 5.0, proximity)',
    'F7 [F7] combat: fleeing spider (dist 5.0, hp 10.0, 1 nearby, proximity)',
    'F7 [F7] combat: shelter try vs creeper (dist 2.5, proximity)',
    'F7 [F7] combat: sheltering from creeper (ring 8/8, proximity)'
  ])
  assert.equal(r.sameThreatRescans, 0)
  assert.equal(r.threatChangedRescans, 1)
})

test('shelterLadder zero law: no shelter verbs reads the honest zero shape', () => {
  const r = shelterLadder(['F1 [F1] combat: fighting zombie (dist 2.0, hp 20.0, 0 nearby, proximity)'])
  assert.deepEqual(r, {
    tries: 0, ringed: 0, laneLost: 0, died: 0, open: 0, pregate: 0,
    wallMisses: 0, ringTries: 0, ringLanded: 0, ringRefused: 0,
    sameThreatRescans: 0, threatChangedRescans: 0,
    skipClasses: {}, pregateClasses: {}, wallMissTiming: null, prose: null, rows: []
  })
})

test('shelterLadder junk battery: null/blob/junk lines judge nothing or nothing priced', () => {
  assert.equal(shelterLadder(null), null)
  assert.equal(shelterLadder(undefined), null)
  assert.equal(shelterLadder(42), null)
  assert.equal(shelterLadder({ lines: [] }), null)
  const blob = face43Mini.join('\n')
  assert.equal(shelterLadder(blob).tries, 4)
  const junky = shelterLadder([null, 5, '', ...face43Mini, { a: 1 }])
  assert.equal(junky.tries, 4)
  assert.equal(junky.ringed, 1)
})

test('shelterLadder face-42 live anchors: the nostock drain and the arrow wall landing', () => {
  // face 42's F11 re-scanned the same drowned while the ring stock drained
  // 2/8 -> 2/7 -> 2/6 - the fifth try's arrow wall finally landed
  const r = shelterLadder([
    'F11 [F11] combat: shelter try vs drowned (dist 4.7, proximity pre-fight)',
    'F11 [F11] combat: shelter wall miss (open field: no diggable wall, ring next, drowned@4.7)',
    'F11 [F11] combat: shelter skip (open field: ring stock 2/8, ground earns nothing)',
    'F11 [F11] combat: fighting drowned (dist 4.7, hp 20.0, 1 nearby, proximity)',
    'F11 [F11] combat: shelter try vs drowned (dist 5.2, proximity)',
    'F11 [F11] combat: shelter wall miss (open field: no diggable wall, ring next, drowned@5.2)',
    'F11 [F11] combat: shelter ring try vs drowned (dist 5.2, -z+z-x+x first, arrow wall, proximity)',
    'F11 [F11] combat: sheltering from drowned (arrow wall, cells 2/8, proximity)'
  ])
  assert.deepEqual(r.skipClasses, { nostock: 1 })
  assert.equal(r.sameThreatRescans, 1)
  assert.equal(r.ringLanded, 1)
  const ringRow = r.rows.find(x => x.ringTries === 1)
  assert.equal(ringRow.outcome, 'ringed')
})

test('shelterLadder rides parseCombatLine - one parser per shape for the verbs', () => {
  // a line parseCombatLine rejects never opens nor closes
  const r = shelterLadder([
    'no marker here',
    'F2 [F2] combat: shelter try vs zombie (dist 2.0, proximity)',
    'F2 [F2] died - respawning (cause: server: [kind=mob by Zombie])'
  ])
  assert.equal(r.tries, 1)
  assert.equal(r.died, 1)
})

test('shelterLadder wallMissTiming reads the 25th face byte-exact: 3 misses, every threat already inside 5u', () => {
  // face 25 (run 37424678301) verbatim - the open-field signature's own
  // clock: the wall was asked only after the drowned stood close
  const r = shelterLadder([
    'F12 [F12] combat: shelter try vs drowned (dist 2.6, proximity pre-fight)',
    'F12 [F12] combat: shelter wall miss (open field: no diggable wall, ring next, drowned@2.6)',
    'F12 [F12] combat: shelter ring try vs drowned (dist 2.6, +z-x+x-z first, full ring, proximity pre-fight)',
    'F12 [F12] combat: shelter skip (open field: ring incomplete 6/8)',
    'F12 [F12] combat: shelter try vs drowned (dist 4.0, proximity pre-fight)',
    'F12 [F12] combat: shelter wall miss (open field: no diggable wall, ring next, drowned@4.0)',
    'F12 [F12] combat: shelter skip (open field: ring not buildable [BB BB BB -o] vs drowned@4.0)',
    'F13 [F13] combat: shelter try vs drowned (dist 4.6, proximity pre-fight)',
    'F13 [F13] combat: shelter wall miss (open field: no diggable wall, ring next, drowned@4.6)',
    'F12 [F12] combat: fighting drowned (dist 2.6, hp 16.8, 1 nearby, proximity)'
  ])
  assert.deepEqual(r.wallMissTiming, { n: 3, min: 2.6, median: 4, max: 4.6, within5: 3 })
  assert.equal(r.wallMisses, 3)
})

test('shelterLadder wallMissTiming honest silence: no misses reads null, junk reads null', () => {
  // a face with tries but zero wall misses never invents a timing
  const r = shelterLadder([
    'F2 [F2] combat: shelter try vs zombie (dist 2.0, proximity)',
    'F2 [F2] combat: sheltering from zombie (ring 8/8, proximity)'
  ])
  assert.equal(r.wallMissTiming, null)
  // junk-safe: non-string-blob reads null (the smeltledger convention)
  assert.equal(shelterLadder(42), null)
  assert.equal(shelterLadder(null), null)
})
