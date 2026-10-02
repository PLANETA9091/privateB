// (v0.457.0) THE SHELTER OUTCOME LEDGER's tests - the combat/night cure's
// price join. The verbatim line shapes are the field's own (the shooter
// census's anatomy doc + face 36/37's died/drop lines); the pairing law is
// the pocket killers' last-before-drop rule verbatim. A wording drift in
// the verb vocabulary breaks these loudly (the sibling-shape law).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shelterLedger, OUTCOME_OF_VERB, OUTCOME_CLASSES, distBand, KILL_DIST_RE } from '../../src/lib/shelterledger.mjs'

test('shelterLedger: the hand-counted join - the last verdict before each combat death names the class, the adjacent drop prices it', () => {
  const lines = [
    'b] n=10 ts=200s rss=300M late=5ms mainLate=0ms',
    'F1 [F1] combat: fighting skeleton@1.2',
    'F5 [F5] combat: shelter skip (open field: ring not buildable [-o oo -o oo], no arrow wall either vs drowned@6.9)',
    'F5 [F5] combat: fleeing skeleton@3.1',
    // F5's LAST verdict before the death is the flee - the skip before it
    // is history (the last-before rule)
    'F5 [F5] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@7.6 (0s before death at [-154,64,415]))',
    'F5 [F5] death drop: ~78u lost at [-154,64,415]',
    // F1 dies mid-fight, its drop follows after F5's pair (interleaved)
    'F1 [F1] died - respawning (cause: server: was slain by Spider [kind=mob by Spider] | inferred: spider@1.2 (0s before death at [-164,64,414]))',
    'F1 [F1] death drop: ~23u lost at [-164,64,414]'
  ]
  const r = shelterLedger(lines)
  assert.equal(r.combatDeaths, 2)
  assert.equal(r.otherDeaths, 0)
  assert.equal(r.unparsedDeaths, 0)
  assert.equal(r.unpriced, 0)
  assert.equal(r.pairMisses, 0)
  assert.deepEqual(r.rows.map(d => `${d.bot}:${d.outcome}:${d.lastVerb}:${d.u}`), ['F5:flee:fleeing:78', 'F1:fight:fighting:23'])
  assert.deepEqual(r.outcomes.flee, { n: 1, u: 78, bots: ['F5'] })
  assert.deepEqual(r.outcomes.fight, { n: 1, u: 23, bots: ['F1'] })
  assert.deepEqual(r.outcomes.sheltered, { n: 0, u: 0, bots: [] })
  // the tally's own law: the classes' n sum to the combat deaths
  assert.equal(Object.values(r.outcomes).reduce((s, o) => s + o.n, 0), r.combatDeaths)
})

test('shelterLedger: the outcome classes - died sheltered vs died mid-attempt vs ambushed', () => {
  const lines = [
    // F9 sealed the shelter and died INSIDE it - the wall itself failed
    'F9 [F9] combat: sheltering from skeleton (arrow wall, cells 6/8, proximity re-verdict)',
    'F9 [F9] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@4.0 (0s before death at [-150,64,410]))',
    'F9 [F9] death drop: ~40u lost at [-150,64,410]',
    // F2 was still negotiating (a wall miss, not sealed) - the machinery's price
    'F2 [F2] combat: shelter wall miss (open field: no diggable wall, ring next, drowned@0.9)',
    'F2 [F2] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@1.1 (0s before death at [-120,60,400]))',
    'F2 [F2] death drop: ~15u lost at [-120,60,400]',
    // F8 never spoke a combat line - the sentry never saw it
    'F8 [F8] died - respawning (cause: server: was slain by Spider [kind=mob by Spider] | inferred: spider@1.2 (0s before death at [-164,64,414]))'
  ]
  const r = shelterLedger(lines)
  assert.equal(r.combatDeaths, 3)
  assert.equal(r.rows[0].outcome, 'sheltered')
  assert.equal(r.rows[1].outcome, 'shelter-attempt')
  assert.equal(r.rows[1].lastVerb, 'shelter-wall-miss')
  assert.equal(r.rows[2].outcome, 'ambushed')
  assert.equal(r.rows[2].lastVerb, null)
  assert.equal(r.rows[2].u, null)
  assert.equal(r.unpriced, 1, 'the ambushed death carries no drop - unpriced, honest')
  assert.deepEqual(r.outcomes.sheltered.bots, ['F9'])
  assert.deepEqual(r.outcomes.ambushed.bots, ['F8'])
})

test('shelterLedger: the excluded lanes - drown deaths and their drops never read as misses, the legacy no-token death counted honestly', () => {
  const lines = [
    // the water lane: parsed kind, excluded from the outcomes
    'F15 [F15] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-130,47,396]))',
    'F15 [F15] death drop: ~52u lost at [-130,47,396]',
    // the legacy cause shape: no kind token at all - counted, never classed
    'F16 [F16] died - respawning (cause: drowning (0s before death at [-118,45,389]))',
    // then a real combat death to prove the tallies split
    'F1 [F1] combat: fleeing skeleton@3.1',
    'F1 [F1] died - respawning (cause: server: was slain by Spider [kind=mob by Spider] | inferred: spider@1.2 (0s before death at [-164,64,414]))',
    'F1 [F1] death drop: ~23u lost at [-164,64,414]'
  ]
  const r = shelterLedger(lines)
  assert.equal(r.combatDeaths, 1)
  assert.equal(r.otherDeaths, 1)
  assert.equal(r.unparsedDeaths, 1)
  assert.equal(r.pairMisses, 0, 'the excluded deaths\' drops consume their own windows silently - never a miss')
  assert.deepEqual(r.rows.map(d => d.bot), ['F1'])
  assert.equal(r.outcomes.flee.n, 1)
})

test('shelterLedger: the explosion family is the combat lane\'s subject; a drop with no prior died is a pairMiss', () => {
  const lines = [
    'F4 [F4] died - respawning (cause: server: was killed by explosion [kind=explosion by Creeper] | inferred: creeper@2.2 (0s before death at [-140,60,410]))',
    'F4 [F4] death drop: ~66u lost at [-140,60,410]',
    // a drop whose bot never died in this log - honest miss, never guessed
    'F7 [F7] death drop: ~12u lost at [-100,60,400]'
  ]
  const r = shelterLedger(lines)
  assert.equal(r.combatDeaths, 1)
  assert.equal(r.rows[0].outcome, 'ambushed')
  assert.equal(r.rows[0].u, 66)
  assert.equal(r.pairMisses, 1)
})

test('shelterLedger: the verb -> class map pins (the cure fork reads THROUGH this map)', () => {
  assert.equal(OUTCOME_OF_VERB.sheltering, 'sheltered')
  for (const v of ['shelter-try', 'shelter-wall-miss', 'shelter-skip', 'ring-try', 'ring-ranged', 'shelter-dig-earn', 'shelter-earn']) {
    assert.equal(OUTCOME_OF_VERB[v], 'shelter-attempt', `${v} is the machinery still negotiating`)
  }
  for (const v of ['fighting', 'fight-ended']) assert.equal(OUTCOME_OF_VERB[v], 'fight')
  for (const v of ['fleeing', 'flee-ladder', 'flee-kite', 'flee-shore', 'flee-bearing', 'verdict-flip', 'open-field-yield']) {
    assert.equal(OUTCOME_OF_VERB[v], 'flee')
  }
  assert.equal(OUTCOME_OF_VERB['ranged-cooldown'], 'ranged')
  assert.equal(OUTCOME_OF_VERB.other, 'other')
  assert.deepEqual(OUTCOME_CLASSES, ['sheltered', 'shelter-attempt', 'fight', 'flee', 'ranged', 'other', 'ambushed'])
})

test('shelterLedger: the honest nulls - junk, empty, wrong types read zero, never fabricated', () => {
  assert.equal(shelterLedger([]).combatDeaths, 0)
  assert.equal(shelterLedger(null).combatDeaths, 0)
  assert.equal(shelterLedger(undefined).combatDeaths, 0)
  assert.equal(shelterLedger('not an array but a blob').combatDeaths, 0)
  const junk = shelterLedger(['some prose line', 'F1 combat: nothing', 42, null, 'F1 [F1] death drop: ~5u lost at [0,0,0]'])
  assert.equal(junk.combatDeaths, 0)
  assert.equal(junk.pairMisses, 1, 'the junk drop still counts its miss - the honest sweep')
  assert.equal(shelterLedger(['F1 [F1] died - respawning (cause: server: drowned [kind=drown])']).otherDeaths, 1)
  assert.equal(shelterLedger(['F1 [F1] died - respawning (cause: unknown (0s before death at [0,0,0]))']).unparsedDeaths, 1)
})

// (v0.459.0) THE FLEE FORK's tests - the disengage cure's own pricing. The
// death-time killer distance rides the died line's inference tail; the
// inferred NAME stays unread (the server kind token is the authority - it
// can contradict the hp-inferrer, face 38's F8-slew-F9 line). The bands:
// close <=4 (the flee gained NOTHING), mid (4 < d <= 8), far (> 8 - the
// flee gained and the arc/blast won anyway).
test('shelterLedger: the kill dist, the bands, and the chase/crossfire split - hand-counted', () => {
  const lines = [
    // F5 flees a skeleton and the SKELETON makes the kill at melee range:
    // chasedDown true, close - the chase won
    'F5 [F5] combat: fleeing skeleton@3.1',
    'F5 [F5] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@1.0 (0s before death at [-154,64,415]))',
    'F5 [F5] death drop: ~78u lost at [-154,64,415]',
    // F2 flees a zombie but a SKELETON takes the kill from far: crossfire,
    // far - the arrows won
    'F2 [F2] combat: fleeing zombie@2.0',
    'F2 [F2] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@10.7 (0s before death at [-150,64,410]))',
    'F2 [F2] death drop: ~15u lost at [-150,64,410]',
    // F8 dies with no readable inference (blind): null, never guessed
    'F8 [F8] combat: fleeing drowned@1.5',
    'F8 [F8] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: fall/env (0s before death at [-118,45,389]))',
    // F9 dies mid-band: 5.5 is inside the arc, out of melee
    'F9 [F9] combat: fleeing zombie@2.2',
    'F9 [F9] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@5.5 (0s before death at [-130,60,400]))',
    'F9 [F9] death drop: ~9u lost at [-130,60,400]'
  ]
  const r = shelterLedger(lines)
  assert.equal(r.combatDeaths, 4)
  assert.deepEqual(r.rows[0].distBand, 'close')
  assert.equal(r.rows[0].killDist, 1.0)
  assert.equal(r.rows[0].chasedDown, true)
  assert.deepEqual(r.rows[1].distBand, 'far')
  assert.equal(r.rows[1].chasedDown, false, 'the kind token\'s killer differs from the fled attacker - crossfire')
  assert.equal(r.rows[2].killDist, null)
  assert.equal(r.rows[2].distBand, null)
  assert.equal(r.rows[2].chasedDown, true, 'the blind inference still pairs the chase - the name join needs no ruler, only the DIST reads null')
  assert.deepEqual(r.rows[3].distBand, 'mid')
  assert.equal(r.rows[3].chasedDown, true)
  // the face-level band tally counts every combat death exactly once
  assert.deepEqual(r.distBands, { close: 1, mid: 1, far: 1, unpriced: 1 })
  assert.equal(r.distBands.close + r.distBands.mid + r.distBands.far + r.distBands.unpriced, r.combatDeaths)
  // the boundaries pin the vocabulary: 4 is close, 8 is mid, 8.1 is far
  assert.equal(r.rows[0].killDist <= 4, true)
})

test('shelterLedger: the authority law - the inferred NAME is never read, the kind token names the chase', () => {
  // the hp-inferrer guesses 'skeleton' but the server says the ZOMBIE made
  // the kill: the chase split reads the token, not the guess
  const lines = [
    'F1 [F1] combat: fleeing zombie@2.4',
    'F1 [F1] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: skeleton@3.0 (0s before death at [-140,60,410]))',
    'F1 [F1] death drop: ~12u lost at [-140,60,410]'
  ]
  const r = shelterLedger(lines)
  assert.equal(r.rows[0].chasedDown, true, 'the token says Zombie, the verdict attacker is zombie - the chase, whatever the guess said')
  assert.equal(r.rows[0].killDist, 3.0, 'the distance rides the same inference - the ruler, not the name')
  // the band vocabulary's own edges: 4 close / 8 mid / 8.01 far / junk null
  assert.deepEqual([distBand(4), distBand(4.01), distBand(8), distBand(8.01), distBand(0), distBand(null), distBand(undefined), distBand(NaN)], ['close', 'mid', 'mid', 'far', 'close', null, null, null])
  assert.equal(KILL_DIST_RE.exec('inferred: skeleton@7.6 (0s before death at [-154,64,415])')[1], '7.6')
  assert.equal(KILL_DIST_RE.exec('inferred: fall/env (0s before death at [0,0,0])'), null, 'the blind shape carries no ruler')
})
