// (v0.390.0) THE SHOOTER-BAND CENSUS - unit pins (the routecensus
// v0.388.0 test shape). Every anatomy constant is VERBATIM from the held
// artifacts: face 15 (36760275928) for the combat vocabulary, face 19
// (36802577873) for the honest zero baseline (a wet face with zero mob
// engagements reads zero, not null).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCombatLine, shooterCensus, SIEGE_MIN_SESSION_LEN } from '../../src/lib/shootercensus.mjs'

// face-15 verbatims (the ranged band + the verdict/shelter mechanics)
const RING_RANGED = 'F9 [F9] combat: shelter ring ranged mode: the full ring is refused, the arrow wall owns it vs skeleton@2.8'
const SHELTERING = 'F9 [F9] combat: sheltering from skeleton (arrow wall, cells 6/8, proximity re-verdict)'
const COOLDOWN = 'F1 [F1] combat: ranged cooldown armed vs skeleton (10s) - the chase never wins the arrow trade'
const VERDICT_FLIP = 'F12 [F12] combat: verdict flipped to flee vs zombie (hp 12.3)'
const SHELTER_TRY = 'F9 [F9] combat: shelter try vs skeleton (dist 2.8, proximity re-verdict)'
const SHELTER_SKIP_NO_WALL = 'F15 [F15] combat: shelter skip (open field: ring not buildable [-o -o -o -o], no arrow wall either vs drowned@6.9)'
const PAIR_PREEMPT = 'F9 [F9] combat: pair preempt (flip) vs skeleton (hp 20.0, 2 in reach) - the pair trade is never taken'
const YIELD = 'F11 [F11] combat: open-field yield vs spider (hp 10.5 < 14 in the dark) - the flee fired before the drain'
const FIGHTING = 'F9 [F9] combat: fighting drowned'
const FLEE_SHORE = 'F9 [F9] combat: flee toward shore (12,3 step 2) vs drowned (proximity)'

test('ring-ranged verbatim: verb, attacker, dist, ranged, arrow wall', () => {
  const e = parseCombatLine(RING_RANGED)
  assert.deepEqual(e, {
    bot: 'F9', verb: 'ring-ranged', attacker: 'skeleton', dist: 2.8, ranged: true
  })
})

test('sheltering with arrow wall: ranged even without @dist', () => {
  const e = parseCombatLine(SHELTERING)
  assert.equal(e.verb, 'sheltering')
  assert.equal(e.attacker, 'skeleton')
  assert.equal(e.dist, null)
  assert.equal(e.ranged, true)
})

test('ranged cooldown armed: the shooter class', () => {
  const e = parseCombatLine(COOLDOWN)
  assert.equal(e.verb, 'ranged-cooldown')
  assert.equal(e.attacker, 'skeleton')
  assert.equal(e.ranged, true)
})

test('verdict flip + (dist N.N) pricing form', () => {
  const flip = parseCombatLine(VERDICT_FLIP)
  assert.equal(flip.verb, 'verdict-flip')
  assert.equal(flip.attacker, 'zombie')
  const t = parseCombatLine(SHELTER_TRY)
  assert.equal(t.verb, 'shelter-try')
  assert.equal(t.dist, 2.8)
  assert.equal(t.ranged, false)
})

test('shelter skip with the no-arrow-wall prose stays UNRANGED', () => {
  const e = parseCombatLine(SHELTER_SKIP_NO_WALL)
  assert.equal(e.verb, 'shelter-skip')
  assert.equal(e.attacker, 'drowned')
  assert.equal(e.dist, 6.9)
  assert.equal(e.ranged, false, 'the negation prose (no arrow wall) is not a ranged event')
})

test('pair preempt + yield + fighting + flee-shore verb keys', () => {
  assert.equal(parseCombatLine(PAIR_PREEMPT).verb, 'pair-preempt')
  const y = parseCombatLine(YIELD)
  assert.equal(y.verb, 'open-field-yield')
  assert.equal(y.attacker, 'spider')
  assert.equal(parseCombatLine(FIGHTING).verb, 'fighting')
  assert.equal(parseCombatLine(FLEE_SHORE).verb, 'flee-shore')
})

test('the death line\'s shooter inference NEVER double-counts (deathsweep owns it)', () => {
  const death = 'F6 [F6] died - respawning (cause: server: drowned [kind=drown] | inferred: skeleton@14.7 (0s before death at [-127,52,411]) [the inference CONTRADICTS the server verdict - the nearest harm was not the killer (the server kind stays the authority)])'
  assert.equal(parseCombatLine(death), null)
})

test('junk battery: non-string, no marker, truncated body, unknown verb', () => {
  assert.equal(parseCombatLine(null), null)
  assert.equal(parseCombatLine(42), null)
  assert.equal(parseCombatLine('some other line'), null)
  // truncated mid-body (the FATAL face) still lands, honestly
  const trunc = parseCombatLine('F9 [F9] combat: shelter tr')
  assert.equal(trunc.verb, 'other')
  // an unknown verb lands in otherVerbs keyed by its own first token
  const c = shooterCensus(['F9 [F9] combat: gravity slide engaged vs slime@1.0'])
  assert.equal(c.total, 1)
  assert.deepEqual(c.otherVerbs, { gravity: 1 })
})

test('face-15 style aggregate: counts, ranged split, maxDist', () => {
  const c = shooterCensus([
    RING_RANGED, SHELTERING, COOLDOWN, VERDICT_FLIP, SHELTER_TRY,
    SHELTER_SKIP_NO_WALL, PAIR_PREEMPT, YIELD, FIGHTING, FLEE_SHORE
  ])
  assert.equal(c.total, 10)
  assert.deepEqual(c.byAttacker, { skeleton: 5, zombie: 1, drowned: 3, spider: 1 })
  assert.equal(c.ranged.events, 3, 'ring-ranged + sheltering(arrow wall) + cooldown')
  assert.equal(c.ranged.arrowWall, 2)
  assert.equal(c.ranged.ringRangedRefused, 1)
  assert.equal(c.ranged.cooldownArmed, 1)
  assert.deepEqual(c.ranged.byAttacker, { skeleton: 3 })
  assert.equal(c.verdictFlips, 1)
  assert.equal(c.shelter.tries, 1)
  assert.equal(c.shelter.skips, 1)
  assert.equal(c.withDist, 3)
  assert.equal(c.maxDist, 6.9)
  assert.deepEqual(c.otherVerbs, {})
  assert.deepEqual(c.byBot, { F9: 6, F1: 1, F12: 1, F15: 1, F11: 1 })
})

test('face-19 baseline: the wet zero face reads an honest ZERO', () => {
  const c = shooterCensus([
    'F1 [F1] water: shore pinned (r=1 after 8 passes - the shoreline owns this swim; the release takes over)',
    'F3 bank trip: deliverable (clamp) - fleet pocket 495u at 0.3u/s needs 1654s vs 300s the final bank can never grant - the surplus must ride now - the trip fires early'
  ])
  assert.equal(c.total, 0)
  assert.deepEqual(c.byAttacker, {})
  assert.equal(c.ranged.events, 0)
  assert.equal(c.maxDist, null)
})

test('raw text blob input and empty input both hold', () => {
  const blob = shooterCensus(`${FIGHTING}\n${COOLDOWN}\n`)
  assert.equal(blob.total, 2)
  const empty = shooterCensus([])
  assert.equal(empty.total, 0)
  // (v0.394.0) the shelter aggregate carries the wall-miss row (default 0)
  assert.deepEqual(empty.shelter, { tries: 0, skips: 0, ringTries: 0, wallMiss: 0 })
})

// (v0.391.0) THE SHELTER-SKIP WHY TAXONOMY - face-15 verbatims
import { parseSkipWhys, SKIP_REASON_RES } from '../../src/lib/shootercensus.mjs'

test('skip whys: the three canonical reasons parse from the verbatim prose', () => {
  assert.deepEqual(
    parseSkipWhys('shelter skip (open field: ring stock 0/2, ground earns nothing)'),
    ['ring-stock', 'ground-earns-nothing']
  )
  assert.deepEqual(
    parseSkipWhys('shelter skip (open field: no diggable wall, drowned@5.1)'),
    ['no-diggable-wall']
  )
  assert.deepEqual(
    parseSkipWhys('shelter skip (open field: ring not buildable [oo xo oo oo] vs zombie@0.7)'),
    ['ring-not-buildable']
  )
})

test('skip whys: the multi-reason co-occurrence and the junk safety', () => {
  assert.deepEqual(
    parseSkipWhys('shelter skip (open field: ring not buildable [-o -o -o -o], no arrow wall either vs drowned@6.9)'),
    ['ring-not-buildable', 'no-arrow-wall']
  )
  assert.deepEqual(parseSkipWhys(null), [])
  assert.deepEqual(parseSkipWhys(42), [])
  assert.deepEqual(parseSkipWhys('shelter skip (open field: ???)'), [])
})

test('census skipWhys: counts, co-occurrence sum > skips, unknown visibility', () => {
  const c = shooterCensus([
    'F2 [F2] combat: shelter skip (open field: ring stock 0/2, ground earns nothing)',
    'F2 [F2] combat: shelter skip (open field: no diggable wall, drowned@5.1)',
    'F2 [F2] combat: shelter skip (open field: ring not buildable [-o -o -o -o], no arrow wall either vs drowned@6.9)',
    'F2 [F2] combat: shelter skip (open field: something new entirely)'
  ])
  assert.equal(c.shelter.skips, 4)
  assert.deepEqual(c.skipWhys, {
    'ring-stock': 1,
    'ground-earns-nothing': 1,
    'no-diggable-wall': 1,
    'ring-not-buildable': 1,
    'no-arrow-wall': 1,
    unknown: 1
  })
  assert.deepEqual(SKIP_REASON_RES.map(([k]) => k).slice(0, 5), ['ring-stock', 'ground-earns-nothing', 'no-diggable-wall', 'ring-not-buildable', 'no-arrow-wall'])
})

test('face-19 baseline: zero skips read an empty skipWhys', () => {
  const c = shooterCensus(['F1 [F1] water: shore pinned (r=1 after 8 passes - the shoreline owns this swim; the release takes over)'])
  assert.equal(c.shelter.skips, 0)
  assert.deepEqual(c.skipWhys, {})
})

test('skip whys v2: the four drift forms the unknown bucket named (face-15 verbatims)', () => {
  assert.deepEqual(parseSkipWhys('shelter skip (open field: ring incomplete 6/8)'), ['ring-incomplete'])
  assert.deepEqual(parseSkipWhys('shelter skip (open field: arrow wall incomplete [empty/empty] vs skeleton@5.0)'), ['arrow-wall-incomplete'])
  assert.deepEqual(parseSkipWhys('shelter skip (night=true armed=true hp=20 attackers=4 poison=off threat=skeleton@3.1)'), ['night-context'])
  assert.deepEqual(parseSkipWhys('shelter skip (0,1: step-in incomplete)'), ['step-in-incomplete'])
  assert.deepEqual(parseSkipWhys('shelter skip (-1,0: cells not free)'), ['cells-not-free'])
  // the night line's threat= rides the bare-@ attacker form too
  const c = shooterCensus(['F2 [F2] combat: shelter skip (night=true armed=true hp=20 attackers=4 poison=off threat=skeleton@3.1)'])
  assert.equal(c.byAttacker.skeleton, 1)
  assert.deepEqual(c.skipWhys, { 'night-context': 1 })
  assert.deepEqual(SKIP_REASON_RES.map(([k]) => k).slice(5), ['ring-incomplete', 'arrow-wall-incomplete', 'night-context', 'step-in-incomplete', 'cells-not-free'])
})

// (v0.393.0) THE COMBAT-WHALE LENS - the bot x verb cross
test('byBotVerb: the whale cross pins each bot\'s verb split', () => {
  const c = shooterCensus([
    RING_RANGED, SHELTERING, COOLDOWN, VERDICT_FLIP, SHELTER_TRY,
    SHELTER_SKIP_NO_WALL, PAIR_PREEMPT, YIELD, FIGHTING, FLEE_SHORE
  ])
  assert.deepEqual(c.byBotVerb.F9, {
    'ring-ranged': 1, sheltering: 1, 'shelter-try': 1,
    'pair-preempt': 1, fighting: 1, 'flee-shore': 1
  })
  assert.deepEqual(c.byBotVerb.F1, { 'ranged-cooldown': 1 })
  assert.deepEqual(c.byBotVerb.F12, { 'verdict-flip': 1 })
  // the cross row sums match the byBot row
  for (const [b, n] of Object.entries(c.byBot)) {
    assert.equal(Object.values(c.byBotVerb[b]).reduce((s, x) => s + x, 0), n)
  }
})

test('byBotVerb: the untagged line lands in unknown; the zero face is empty', () => {
  const c = shooterCensus(['someone combat: fighting drowned'])
  assert.deepEqual(c.byBotVerb.unknown, { fighting: 1 })
  const zero = shooterCensus(['F1 [F1] water: shore pinned (r=1 after 8 passes - the shoreline owns this swim; the release takes over)'])
  assert.deepEqual(zero.byBotVerb, {})
})

// (v0.394.0) THE HONEST WALL MISS - the wall-scan verdict is a ROUTE MARKER
// (the ring attempt follows and may succeed), not a skip. The fleet line
// renamed 'shelter skip (open field: no diggable wall, ...)' ->
// 'shelter wall miss (open field: no diggable wall, ring next, ...)'.
const WALL_MISS = 'F15 [F15] combat: shelter wall miss (open field: no diggable wall, ring next, drowned@5.1)'

test('shelter wall miss: its own verb, priced attacker, never a skip', () => {
  const e = parseCombatLine(WALL_MISS)
  assert.equal(e.verb, 'shelter-wall-miss')
  assert.equal(e.bot, 'F15')
  assert.equal(e.attacker, 'drowned')
  assert.equal(e.dist, 5.1)
  // the whole-shape read: one miss line, ZERO skips, no why rows
  const c = shooterCensus([WALL_MISS])
  assert.equal(c.shelter.wallMiss, 1)
  assert.equal(c.shelter.skips, 0)
  assert.deepEqual(c.skipWhys, {})
})

test('the honest sequence: wall miss -> ring try -> sheltering reads ONE attempt', () => {
  // the old naming logged a 'skip' for an attempt that SUCCEEDED - the
  // census read 2 lines per attempt (face 15: 150 skips over 76 tries)
  const c = shooterCensus([
    WALL_MISS,
    'F15 [F15] combat: shelter ring try vs drowned (dist 5.1, -x+z-x-z first, full ring, proximity re-verdict)',
    'F15 [F15] combat: sheltering from drowned (ring 8/8, proximity re-verdict)'
  ])
  assert.equal(c.shelter.wallMiss, 1)
  assert.equal(c.shelter.skips, 0)
  assert.equal(c.shelter.ringTries, 1)
  assert.equal(c.byVerb.sheltering, 1)
  assert.equal(c.byAttacker.drowned, 3, 'the attacker is priced on all three lines')
  assert.deepEqual(c.skipWhys, {})
})

test('the miss line\'s threat-gone form: unpriced attacker, still its own verb', () => {
  const c = shooterCensus(['F3 [F3] combat: shelter wall miss (open field: no diggable wall, ring next, threat gone)'])
  assert.equal(c.shelter.wallMiss, 1)
  assert.equal(c.shelter.skips, 0)
  const e = parseCombatLine('F3 [F3] combat: shelter wall miss (open field: no diggable wall, ring next, threat gone)')
  assert.equal(e.verb, 'shelter-wall-miss')
  assert.equal(e.attacker, null)
})

test('the HISTORICAL skip form still parses byte-identical (faces 15/18/19)', () => {
  const oldLine = 'F15 [F15] combat: shelter skip (open field: no diggable wall, drowned@5.1)'
  const e = parseCombatLine(oldLine)
  assert.equal(e.verb, 'shelter-skip')
  const c = shooterCensus([oldLine])
  assert.equal(c.shelter.skips, 1)
  assert.equal(c.shelter.wallMiss, 0)
  assert.deepEqual(c.skipWhys, { 'no-diggable-wall': 1 })
})

// (v0.395.0) THE WHALE-FEED LENS - the session walk pins. The [hb] ts=
// heartbeat is the log's own clock; a continuous fighter's lines ride one
// session across ticks, an explicit end verb or a > 45s silence splits.
const hb = (n, ts) => `[hb] n=${n} ts=${ts}s rss=251M late=5ms mainLate=0ms`

test('whale-feed: continuous engagement across hb ticks is ONE session', () => {
  const c = shooterCensus([
    hb(1, 40),
    'F2 [F2] combat: fighting skeleton',
    hb(2, 55),
    'F2 [F2] combat: flee kite hop vs skeleton@4.0',
    hb(3, 70),
    'F2 [F2] combat: fight ended vs skeleton (hp 18.0)'
  ])
  assert.equal(c.sessions.byBot.F2.sessions, 1)
  assert.equal(c.sessions.byBot.F2.maxLen, 3)
  assert.equal(c.sessions.gapS, 45)
  assert.deepEqual(c.sessions.endVerbs, ['fight-ended', 'open-field-yield'])
})

test('whale-feed: a >45s silence splits the siege (maxLen remembers the bigger half)', () => {
  const c = shooterCensus([
    hb(1, 40),
    'F2 [F2] combat: fighting skeleton',
    'F2 [F2] combat: flee kite hop vs skeleton@4.0',
    'F2 [F2] combat: shelter try vs skeleton (dist 2.8)',
    hb(2, 120),
    'F2 [F2] combat: fighting drowned'
  ])
  assert.equal(c.sessions.byBot.F2.sessions, 2)
  assert.equal(c.sessions.byBot.F2.maxLen, 3)
})

test('whale-feed: explicit ends split sessions even with zero time gap', () => {
  const c = shooterCensus([
    'F2 [F2] combat: fighting skeleton',
    'F2 [F2] combat: fight ended vs skeleton (hp 18.0)',
    'F2 [F2] combat: fighting skeleton',
    'F2 [F2] combat: open-field yield vs spider (hp 10.5 < 14 in the dark)',
    'F2 [F2] combat: fighting zombie'
  ])
  assert.equal(c.sessions.byBot.F2.sessions, 3)
  assert.equal(c.sessions.byBot.F2.maxLen, 2)
})

test('whale-feed: per-bot isolation + the honest zero + junk safety', () => {
  const c = shooterCensus([
    hb(1, 30),
    'F2 [F2] combat: fighting skeleton',
    'F9 [F9] combat: fight ended vs skeleton (hp 20.0)',
    'F9 [F9] combat: fighting zombie',
    null,
    42,
    'not a combat line'
  ])
  assert.equal(c.sessions.byBot.F2.sessions, 1)
  assert.equal(c.sessions.byBot.F9.sessions, 2)
  const zero = shooterCensus(['launching 19 bots for 600s', hb(1, 20)])
  assert.deepEqual(zero.sessions.byBot, {})
})

// (v0.400.0) THE SIEGE VERDICT - the diffusion read: a bot whose longest
// session reaches SIEGE_MIN_SESSION_LEN carries THE SIEGE. The separation
// is the live face-15 gap: the churn octave F12 maxes at 53, the siege F2
// runs 278. The stream builder rides the same cadence the real log shows
// (five combat lines per ~20s heartbeat tick - no false gap splits).
const siegeStream = (bot, n, startTs = 40) => {
  const out = []
  for (let i = 0; i < n; i++) {
    if (i % 5 === 0) out.push(hb(1 + i / 5, startTs + (i / 5) * 20))
    out.push(`${bot} [${bot}] combat: fighting skeleton`)
  }
  return out
}

test('siege verdict: a bot reaching the bound is named - the F2 shape reads SIEGE', () => {
  const c = shooterCensus(siegeStream('F2', 125))
  assert.equal(c.sessions.byBot.F2.sessions, 1)
  assert.equal(c.sessions.byBot.F2.maxLen, 125)
  assert.deepEqual(c.sessions.siegeByBot, { F2: 125 })
  assert.equal(c.sessions.siegeMinLen, SIEGE_MIN_SESSION_LEN)
  assert.equal(SIEGE_MIN_SESSION_LEN, 120)
})

test('siege verdict: churn stays under the bound - the F12 octave reads none', () => {
  const lines = [
    ...siegeStream('F12', 53),
    hb(99, 300),
    ...siegeStream('F12', 26, 300)
  ]
  const c = shooterCensus(lines)
  assert.equal(c.sessions.byBot.F12.sessions, 2)
  assert.equal(c.sessions.byBot.F12.maxLen, 53)
  assert.deepEqual(c.sessions.siegeByBot, {})
})

test('siege verdict: the bound is inclusive + the honest zero on a silent face', () => {
  const edge = shooterCensus(siegeStream('F7', 120))
  assert.deepEqual(edge.sessions.siegeByBot, { F7: 120 })
  const silent = shooterCensus(['launching 19 bots for 600s'])
  assert.deepEqual(silent.sessions.siegeByBot, {})
  assert.equal(silent.sessions.siegeMinLen, 120)
})

// (v0.398.0) THE SEAL-STOCK BASELINE - the ring-stock have/need pairs off
// the skip prose. The battery is the CORRECTED LIVE face-15 read (the
// artifact re-downloaded, the census run on the real log): seen 43,
// zeroHave 41 - 0/2=27, 0/8=6, 0/1=4, 0/7=3, 7/8=2, 0/6=1 (the a84d6d2
// hand count said 40/43 and 0/2=26 - the mechanical read wins). The
// census must reproduce the live distribution from the same verbatim
// shapes.
const stockSkip = (stock) => `F2 [F2] combat: shelter skip (open field: ring stock ${stock}, ground earns nothing)`

test('seal-stock: the corrected live face-15 distribution reproduces mechanically', () => {
  const lines = [
    ...Array.from({ length: 27 }, () => stockSkip('0/2')),
    ...Array.from({ length: 6 }, () => stockSkip('0/8')),
    ...Array.from({ length: 4 }, () => stockSkip('0/1')),
    ...Array.from({ length: 2 }, () => stockSkip('0/7')),
    ...Array.from({ length: 2 }, () => stockSkip('7/8')),
    stockSkip('0/6'),
    'F3 [F3] combat: shelter skip (open field: ring stock 0/7 after digging 1)'
  ]
  const c = shooterCensus(lines)
  assert.equal(c.ringStock.seen, 43)
  assert.equal(c.ringStock.zeroHave, 41)
  assert.deepEqual(c.ringStock.pairs, { '0/2': 27, '0/8': 6, '0/1': 4, '0/7': 3, '7/8': 2, '0/6': 1 })
  // the ring-stock why key co-counts (the co-occurrence law)
  assert.equal(c.skipWhys['ring-stock'], 43)
})

test('seal-stock: nonzero have stays out of zeroHave; non-stock skips never count', () => {
  const c = shooterCensus([
    stockSkip('2/8'),
    stockSkip('1/2'),
    'F4 [F4] combat: shelter skip (open field: no diggable wall, drowned@5.1)',
    'F5 [F5] combat: shelter wall miss (open field: no diggable wall, ring next, drowned@5.1)'
  ])
  assert.equal(c.ringStock.seen, 2)
  assert.equal(c.ringStock.zeroHave, 0)
  assert.deepEqual(c.ringStock.pairs, { '2/8': 1, '1/2': 1 })
})

test('seal-stock: the honest zero + junk safety', () => {
  const c = shooterCensus(['launching 19 bots', hb(1, 30), 'F9 [F9] combat: fighting skeleton', null, 7])
  assert.deepEqual(c.ringStock, { seen: 0, zeroHave: 0, pairs: {} })
})
