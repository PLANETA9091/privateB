// (v0.426.0) THE FROZEN CENSUS - unit pins. The freeze family's own read:
// the frozen physics verdict, the frozen client relog (BOTH tree eras - the
// held faces predate the #S prefix and the gate tail), the v0.361.0 loop
// break, the v0.340.0 freeze-named diagnosis, the gate hold, the v0.381.0
// apex-rest exemption and the duplicate-login kick. The verbatims are the
// fleet's own words (faces 26/27) plus the current emitter's full form.
// One parser per emitter: the rescue END line stays the rescue ledger's.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseFrozenPhysics, parseFrozenRelog, parseFrozenLoopBreak,
  parseFreezeNamed, parseGateHold, parseApexRest, parseDuplicateKick,
  frozenCensus
} from '../../src/lib/frozencensus.mjs'

test('frozen-census: the face verbatim verdict (dry, the bob class)', () => {
  const line = 'F4 [F4] water: frozen physics (10 flat passes at y=46.2, o2=20) - standing down, the reconnect lane owns this'
  assert.deepEqual(parseFrozenPhysics(line), {
    bot: 'F4', passes: 10, y: 46.2, o2: '20', wet: false, fastWindow: false
  })
})

test('frozen-census: the wet verdict - the F10 split rides the emitter flag', () => {
  const line = 'F12 [F12] water: frozen physics (10 flat passes at y=57.2, o2=20, head WET) - standing down, the reconnect lane owns this'
  const p = parseFrozenPhysics(line)
  assert.equal(p.wet, true)
  assert.equal(p.o2, '20')
})

test('frozen-census: the legacy raw -1 sentinel is evidence, never a value', () => {
  const line = 'F14 [F14] water: frozen physics (10 flat passes at y=51.2, o2=-1, head WET) - standing down, the reconnect lane owns this'
  const p = parseFrozenPhysics(line)
  assert.equal(p.o2, '-1')
  const c = frozenCensus([line])
  assert.equal(c.verdicts.o2.n, 0) // no domain value
  assert.equal(c.verdicts.o2.reset, 0) // the legacy raw form is not the label either
  assert.equal(c.verdicts.o2.unknown, 1)
})

test('frozen-census: the fast window suffix parses', () => {
  const line = 'F6 [F6] water: frozen physics (4 flat passes at y=48.2, o2=2, head WET - the wet-critical fast window) - standing down, the reconnect lane owns this'
  const p = parseFrozenPhysics(line)
  assert.equal(p.passes, 4)
  assert.equal(p.fastWindow, true)
  assert.equal(p.o2, '2')
})

test('frozen-census: the relog, legacy era byte-for-byte (the held faces)', () => {
  const wet = 'F14 [F14] water: frozen client relog (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics'
  assert.deepEqual(parseFrozenRelog(wet), {
    bot: 'F14', streak: null, whyClass: 'head-wet', verdicts: 1,
    holdSec: null, o2: null, health: null, window: null, bypass: null, era: 'legacy'
  })
  const dry = 'F2 [F2] water: frozen client relog (3 consecutive frozen verdicts) - ending the session, the reconnect lane rebuilds the physics'
  assert.deepEqual(parseFrozenRelog(dry), {
    bot: 'F2', streak: null, whyClass: 'legacy', verdicts: 3,
    holdSec: null, o2: null, health: null, window: null, bypass: null, era: 'legacy'
  })
})

test('frozen-census: the relog, current era - the #S prefix and the full gate tail', () => {
  const line = 'F6 [F6] water: frozen client relog (#2 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 20s (the frozen-return gate) - o2=4 health=12 window=wet-critical fast'
  assert.deepEqual(parseFrozenRelog(line), {
    bot: 'F6', streak: 2, whyClass: 'head-wet', verdicts: 1,
    holdSec: 20, o2: '4', health: '12', window: 'wet-critical fast', bypass: null, era: 'current'
  })
})

test('frozen-census: the bypass echo names the void - both classes', () => {
  const crit = 'F1 [F1] water: frozen client relog (#1 consecutive) (frozen while head-wet (2 verdicts) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=0 health=9 window=legacy - o2=0 - the critical bypass voids the armed hold on the next page (the loop fuel)'
  const p1 = parseFrozenRelog(crit)
  assert.equal(p1.bypass, 'critical')
  assert.equal(p1.o2, '0')
  const wet = 'F9 [F9] water: frozen client relog (#3 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 40s (the frozen-return gate) - o2=reset(-1) health=14 window=legacy - o2=reset(-1) - the wet-cycler bypass voids the armed hold on the next page (the sentinel is not safety evidence)'
  const p2 = parseFrozenRelog(wet)
  assert.equal(p2.bypass, 'wet-cycler')
  assert.equal(p2.o2, 'reset(-1)')
  assert.equal(p2.health, '14')
})

test('frozen-census: the health ? and window ? junk pins ride honestly', () => {
  const line = 'F3 [F3] water: frozen client relog (#1 consecutive) (3 consecutive frozen verdicts) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=? health=? window=?'
  const p = parseFrozenRelog(line)
  assert.equal(p.whyClass, 'legacy')
  assert.equal(p.o2, '?')
  assert.equal(p.health, '?')
  assert.equal(p.window, '?')
})

test('frozen-census: the loop break - the critical-lungs veto and the cap, one grammar', () => {
  const veto = 'F6 [F6] water: frozen-relog loop break (#2 consecutive) (critical lungs on a proven column (o2=1, 2 relogs deep) - the reconnect spends the air the rescue still owns, the session rides the freeze) - the session rides the freeze, the sentry re-pages and the rescue re-verdicts'
  assert.deepEqual(parseFrozenLoopBreak(veto), {
    bot: 'F6', streak: 2, whyClass: 'critical-lungs', o2: '1', relogsDeep: 2
  })
  const cap = 'F6 [F6] water: frozen-relog loop break (#6 consecutive) (wet-relog loop proven (6 consecutive) - the relog lane feeds it, the transient stall rides the grace, the legacy threshold owns the next relog) - the session rides the freeze, the sentry re-pages and the rescue re-verdicts'
  assert.deepEqual(parseFrozenLoopBreak(cap), {
    bot: 'F6', streak: 6, whyClass: 'loop-cap', o2: null, relogsDeep: null
  })
})

test('frozen-census: the freeze named line (the v0.340.0 self-diagnosis)', () => {
  const line = 'F9 [F9] water: freeze named ticking-flat - the client state is play, the entity is finite, the chunk is loaded and physics claims enabled, but the tick age says the loop is flat'
  const p = parseFreezeNamed(line)
  assert.equal(p.bot, 'F9')
  assert.equal(p.cls, 'ticking-flat')
  assert.match(p.why, /tick age/)
})

test('frozen-census: the gate hold - the relog promise met by evidence', () => {
  const line = 'F14 [F14] water: frozen-return gate holds the page (7s left) - the fresh client walks the hazard-ledgered column out'
  assert.deepEqual(parseGateHold(line), { bot: 'F14', secsLeft: 7 })
})

test('frozen-census: the apex rest - the verdict NOT condemning', () => {
  const line = 'F12 [F12] water: apex rest held (10 flat passes at y=49.8, o2=0, head dry - the lungs own the clock, the release window owns the rest)'
  assert.deepEqual(parseApexRest(line), { bot: 'F12', passes: 10, y: 49.8, o2: '0' })
})

test('frozen-census: the duplicate-login kick parses, the timeout kick stays serverguard\'s', () => {
  const dup = 'F16 [F16] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"multiplayer.disconnect.duplicate_login"}}}'
  assert.deepEqual(parseDuplicateKick(dup), { bot: 'F16' })
  assert.equal(parseDuplicateKick('F6 [F6] KICKED: {"value":{"translate":"multiplayer.disconnect.timeout"}}'), null)
})

test('frozen-census: the junk battery - the neighbor lanes\' lines never parse', () => {
  const junk = [
    'F14 [F14] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) in 4.7s', // the rescue ledger's
    'F1 [F1] water: pass 3 head=wet shore=none land=none y=48.2 o2=5 probes=0 at=[-131,45,411]', // the sentry's
    'F9 [F9] water: gate bypassed (critical read o2=0) - the page rides, the hold does not own it', // the bypass branch's own line
    'F2 [F2] walk: timeout after 8000ms',
    'server guard: losses=1 (window 0/10) relogins=1 probe=n/a dead=no revives=0 restarts=0',
    'water: frozen physics without a bot tag - prose about freezes',
    null,
    42
  ]
  for (const j of junk) {
    assert.equal(parseFrozenPhysics(j), null, `physics ${typeof j}`)
    assert.equal(parseFrozenRelog(j), null, `relog ${typeof j}`)
    assert.equal(parseFrozenLoopBreak(j), null, `loop ${typeof j}`)
    assert.equal(parseFreezeNamed(j), null, `named ${typeof j}`)
    assert.equal(parseGateHold(j), null, `gate ${typeof j}`)
    assert.equal(parseApexRest(j), null, `apex ${typeof j}`)
    assert.equal(parseDuplicateKick(j), null, `kick ${typeof j}`)
  }
})

test('frozen-census: the hand-counted accumulation - the held faces\' shape in miniature', () => {
  const lines = [
    'F4 [F4] water: frozen physics (10 flat passes at y=46.2, o2=20) - standing down, the reconnect lane owns this',
    'F12 [F12] water: frozen physics (10 flat passes at y=57.2, o2=20, head WET) - standing down, the reconnect lane owns this',
    'F14 [F14] water: frozen physics (10 flat passes at y=51.2, o2=-1, head WET) - standing down, the reconnect lane owns this',
    'F14 [F14] water: frozen client relog (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics',
    'F2 [F2] water: frozen client relog (3 consecutive frozen verdicts) - ending the session, the reconnect lane rebuilds the physics',
    'F16 [F16] KICKED: {"value":{"translate":"multiplayer.disconnect.duplicate_login"}}'
  ]
  const c = frozenCensus(lines)
  assert.equal(c.verdicts.n, 3)
  assert.equal(c.verdicts.wet, 2)
  assert.equal(c.verdicts.dry, 1)
  assert.equal(c.verdicts.yMin, 46.2)
  assert.equal(c.verdicts.yMax, 57.2)
  assert.deepEqual(c.verdicts.o2, { n: 2, sum: 40, min: 20, reset: 0, unknown: 1, avg: 20 })
  assert.equal(c.relogs.n, 2)
  assert.equal(c.relogs.why.headWet, 1)
  assert.equal(c.relogs.why.legacy, 1)
  assert.equal(c.relogs.era.legacy, 2)
  assert.equal(c.relogs.streakMax, null) // the legacy era carries no #S
  assert.equal(c.dupKicks.n, 1)
  assert.equal(c.unparsed, 0)
})

test('frozen-census: the current-era accumulation - holds, bypasses, the streak max', () => {
  const lines = [
    'F6 [F6] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=4 health=12 window=wet-critical fast',
    'F6 [F6] water: frozen client relog (#2 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 20s (the frozen-return gate) - o2=1 health=9 window=legacy - o2=1 - the critical bypass voids the armed hold on the next page (the loop fuel)',
    'F6 [F6] water: frozen-relog loop break (#3 consecutive) (critical lungs on a proven column (o2=0, 3 relogs deep) - the reconnect spends the air the rescue still owns, the session rides the freeze) - the session rides the freeze, the sentry re-pages and the rescue re-verdicts',
    'F14 [F14] water: frozen-return gate holds the page (7s left) - the fresh client walks the hazard-ledgered column out',
    'F12 [F12] water: apex rest held (10 flat passes at y=49.8, o2=0, head dry - the lungs own the clock, the release window owns the rest)'
  ]
  const c = frozenCensus(lines)
  assert.equal(c.relogs.n, 2)
  assert.equal(c.relogs.streakMax, 2)
  assert.equal(c.relogs.era.current, 2)
  assert.deepEqual(c.relogs.holds, { n: 2, min: 10, max: 20, sum: 30 })
  assert.deepEqual(c.relogs.bypass, { critical: 1, wetCycler: 0 })
  assert.deepEqual(c.relogs.window, { legacy: 1, fast: 1, unknown: 0 })
  assert.deepEqual(c.loopBreaks, { n: 1, why: { criticalLungs: 1, loopCap: 0 } })
  assert.equal(c.gateHolds, 1)
  assert.deepEqual(c.apexRests, { n: 1, byBot: { F12: 1 } })
})

test('frozen-census: the escape hatch counts a freeze-lane line the grammar refused', () => {
  const c = frozenCensus(['F7 [F7] water: frozen physics (broken tail without the verdict verdict)'])
  assert.equal(c.unparsed, 1)
  assert.equal(c.verdicts.n, 0)
})

test('frozen-census: the honest zero - a face with no freeze family reads zeros', () => {
  const c = frozenCensus(['F1 [F1] walk: timeout after 8000ms', 'nothing here'])
  assert.equal(c.verdicts.n, 0)
  assert.equal(c.relogs.n, 0)
  assert.equal(c.loopBreaks.n, 0)
  assert.equal(c.freezeNamed.n, 0)
  assert.equal(c.gateHolds, 0)
  assert.equal(c.apexRests.n, 0)
  assert.equal(c.dupKicks.n, 0)
  assert.equal(c.unparsed, 0)
})
