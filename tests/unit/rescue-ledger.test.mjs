// (v0.368.0) THE RESCUE END-STATE LEDGER - the pairing of every 'drowning
// rescue start' with its terminus, per bot, in file order. All pure line
// arithmetic - every assertion is exact, no mocks, no timing. The face-14
// question ('53 starts / 27 completed - where do the other 26 go?') is the
// fixture suite's throughline: every `done` ladder value the machinery emits
// (miner.mjs's terminal line) must classify, junk must never invent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RESCUE_START_RE, RESCUE_END_CLASSES, RESCUE_MID_EVENTS,
  rescueEndClass, rescueEndSeconds, rescueLedger
} from '../../src/lib/rescue-ledger.mjs'

const start = (bot, verdict = 'drowning', o2 = 4) =>
  `${bot} water: drowning rescue start (${verdict}, oxygen ${o2})`
const end = (cls, bot, secs = 2.5, tail = '') =>
  `${bot} water: rescue ${cls}${tail} in ${secs}s`

test('every end class in the RESCUE_END_CLASSES ladder classifies its verbatim shape', () => {
  const shapes = {
    complete: end('complete', 'F1'),
    completeStandingWet: end('complete', 'F1', 2.5, ' (standing wet - shallow water is not drowning)'),
    released: end('released', 'F1', 4.0, ' (surface-safe, open water - no land known; the walk gate reopens)'),
    frozenStanddown: end('standing down', 'F1', 12.3, ' (frozen physics - the walk gate reopens, the reconnect lane owns a dead client)'),
    timeout: end('timeout', 'F10', 26.6, ' (still wet, 14 passes, 0 probes, tail dry/dry/dry)'),
    dead: end('aborted', 'F1', 9.9, ' (dead - the hazard stays at the death spot)'),
    botGone: end('aborted', 'F1', 0.2, ' (bot gone)'),
    abortedError: 'F1 water: rescue aborted (position is junk)'
  }
  for (const [key, line] of Object.entries(shapes)) {
    assert.equal(rescueEndClass(line), key, `the ${key} shape must classify`)
  }
})

test('junk never invents an end (the body-guard law)', () => {
  const junk = [
    null, undefined, 42, {},
    'F1 water: drowning rescue start (drowning, oxygen 3)', // a start is not an end
    'F1 water: rescue blind live (pass 2, air=low)', // a mid event is not an end
    'F1 water: shore transit stalled (r=3 after 4 passes - the walls own this swim; the release takes over)',
    'F1 water: repeat wet page at the same cell (o2 5) - standing down, the walk machinery owns the exit',
    'F1 water: rescue', 'F1 water: rescue completed in 1s', // the line reads 'complete', not 'completed'
    'F1 water: rescue abort in 1s', 'random log line', ''
  ]
  for (const line of junk) assert.equal(rescueEndClass(line), null)
})

test('rescueEndSeconds reads the duration tail and refuses junk', () => {
  assert.equal(rescueEndSeconds(end('timeout', 'F10', 26.6, ' (still wet, 14 passes, 0 probes, tail dry/dry/dry)')), 26.6)
  assert.equal(rescueEndSeconds('F1 water: rescue aborted (position is junk)'), null) // the catch path carries no duration
  assert.equal(rescueEndSeconds('F1 water: rescue complete in 0.0s'), 0)
  assert.equal(rescueEndSeconds(null), null)
  assert.equal(rescueEndSeconds('in 12s no water line'), null)
})

test('the ledger pairs a clean episode: one start, one end, nothing unclosed', () => {
  const r = rescueLedger([start('F1'), 'F1 water: pass 0 head=wet shore=none', end('complete', 'F1', 3.2)])
  assert.equal(r.totals.starts, 1)
  assert.equal(r.totals.complete, 1)
  assert.equal(r.totals.unclosed, 0)
  assert.equal(r.orphanEnds, 0)
  assert.deepEqual(r.perBot.F1, { starts: 1, complete: 1, completeStandingWet: 0, released: 0, frozenStanddown: 0, timeout: 0, dead: 0, botGone: 0, abortedError: 0, unclosed: 0 })
})

test('the face-14 question: starts without complete land in their named classes', () => {
  const lines = [
    start('F10', 'drowning'), end('timeout', 'F10', 26.6, ' (still wet, 14 passes, 0 probes, tail dry/dry/dry)'),
    start('F14', 'wet'), end('timeout', 'F14', 25.5, ' (still wet, 44 passes, 0 probes, tail dry/dry/dry)'),
    start('F12', 'drowning'), end('aborted', 'F12', 9.9, ' (dead - the hazard stays at the death spot)'),
    start('F15', 'wet'), end('released', 'F15', 4.0, ' (surface-safe, open water - no land known; the walk gate reopens)'),
    start('F6', 'drowning'), end('standing down', 'F6', 12.0, ' (frozen physics - the walk gate reopens, the reconnect lane owns a dead client)')
  ]
  const r = rescueLedger(lines)
  assert.equal(r.totals.starts, 5)
  assert.equal(r.totals.complete, 0)
  assert.equal(r.totals.timeout, 2)
  assert.equal(r.totals.dead, 1) // the drowning attribution
  assert.equal(r.totals.released, 1)
  assert.equal(r.totals.frozenStanddown, 1)
  assert.equal(r.totals.unclosed, 0)
  assert.equal(r.perBot.F10.timeout, 1)
  assert.equal(r.perBot.F14.timeout, 1)
  assert.equal(r.perBot.F12.dead, 1)
})

test('an episode open at EOF is unclosed (the FATAL-face class)', () => {
  const r = rescueLedger([start('F3'), 'F3 water: pass 1 head=wet shore=none probes=0'])
  assert.equal(r.totals.starts, 1)
  assert.equal(r.totals.unclosed, 1)
  assert.equal(r.perBot.F3.unclosed, 1)
})

test('a second start while open supersedes the old episode (the rebuild class)', () => {
  const r = rescueLedger([start('F1'), start('F1'), end('complete', 'F1')])
  assert.equal(r.totals.starts, 2)
  assert.equal(r.totals.unclosed, 1)
  assert.equal(r.totals.complete, 1)
  assert.equal(r.perBot.F1.starts, 2)
})

test('an end with no open episode is an orphan, never a pairing', () => {
  const r = rescueLedger([end('complete', 'F9', 1.0)])
  assert.equal(r.orphanEnds, 1)
  assert.equal(r.totals.complete, 0)
  assert.equal(r.perBot.F9, undefined)
})

test('bots interleave without cross-pairing (the per-bot sequential law)', () => {
  const lines = [
    start('F1'), start('F2'),
    end('timeout', 'F2', 20.0, ' (still wet, 8 passes, 1 probes, tail wet/dry/dry)'),
    end('complete', 'F1', 5.0)
  ]
  const r = rescueLedger(lines)
  assert.equal(r.totals.starts, 2)
  assert.equal(r.perBot.F1.complete, 1)
  assert.equal(r.perBot.F2.timeout, 1)
  assert.equal(r.perBot.F1.timeout ?? 0, 0)
  assert.equal(r.totals.unclosed, 0)
})

test('mid events count without closing episodes; the blindness bracket rides the end line', () => {
  const lines = [
    start('F12'),
    'F12 water: shore transit stalled (r=17 after 6 passes - the walls own this swim; the release takes over)',
    'F12 water: transit stalled (d=31 after 5 passes - the walls own this swim; the release takes over)',
    'F12 water: rescue blind live (pass 3, air=low, no ground truth yet - the climb flies on buoyancy alone)',
    end('complete', 'F12', 30.0, ' [BLIND: 3 passes, 0 shore scans hit, 0 standing probes - no ground truth ever gathered]')
  ]
  const r = rescueLedger(lines)
  assert.equal(r.midEvents.shoreStall, 1)
  assert.equal(r.midEvents.transitStall, 1)
  assert.equal(r.midEvents.blindLive, 1)
  assert.equal(r.midEvents.noGroundTruth, 1) // the bracket on the end line counts once
  assert.equal(r.totals.complete, 1) // the mid events did not consume the episode
  assert.equal(r.totals.unclosed, 0)
})

test('a start without a bot tag names nobody (junk stays junk)', () => {
  const r = rescueLedger(['water: drowning rescue start (drowning, oxygen 2)'])
  assert.equal(r.totals.starts, 0)
  assert.equal(r.totals.unclosed, 0)
})

test('the ladder and the start regex hold their shapes (the sync law)', () => {
  assert.equal(RESCUE_END_CLASSES.length, 8)
  assert.equal(RESCUE_END_CLASSES[RESCUE_END_CLASSES.length - 1].key, 'abortedError') // the catch path ranks last - the named aborts outrank it
  assert.equal(RESCUE_MID_EVENTS.length, 6)
  assert.ok(RESCUE_START_RE.test(start('F1')))
  assert.ok(!RESCUE_START_RE.test(end('complete', 'F1')))
})

test('junk arrays return the zero ledger, never a throw', () => {
  for (const junk of [null, undefined, 'not an array', 42]) {
    const r = rescueLedger(junk)
    assert.equal(r.totals.starts, 0)
    assert.deepEqual(r.midEvents, {})
    assert.equal(r.orphanEnds, 0)
  }
  assert.equal(rescueLedger([null, 42, {}]).totals.starts, 0) // junk lines inside a real array are skipped
})

// (v0.370.0) THE FORENSICS - the counts name the anomaly, the lines name its
// story. Every assertion exact; the cap keeps a whale face bounded.

test('an orphan end line is collected verbatim (the count names it, the line tells it)', () => {
  const line = end('complete', 'F7')
  const r = rescueLedger([line])
  assert.equal(r.orphanEnds, 1)
  assert.deepEqual(r.orphanEndLines, [line])
})

test('a superseded start leaves the OLD start line in unclosedLines (the rebuild story)', () => {
  const first = start('F2')
  const second = start('F2')
  const r = rescueLedger([first, second, end('complete', 'F2')])
  assert.equal(r.totals.unclosed, 1)
  assert.deepEqual(r.unclosedLines, [first]) // the old episode's marker, not the new start
})

test('an EOF-open episode leaves its start line in unclosedLines (the FATAL-face class)', () => {
  const only = start('F2')
  const r = rescueLedger([only])
  assert.equal(r.totals.unclosed, 1)
  assert.deepEqual(r.unclosedLines, [only])
})

test('the timeout budget is attributed per bot and never crosses (F10 x2 vs F14)', () => {
  const r = rescueLedger([
    start('F10'),
    end('timeout', 'F10', 20.5, ' (still wet, 14 passes, 0 probes, tail dry/dry/dry)'),
    start('F14'),
    end('timeout', 'F14', 31.5, ' (still wet, 44 passes, 1 probes, tail dry/dry/dry)'),
    start('F10'),
    end('timeout', 'F10', 8, ' (still wet, 3 passes, 0 probes, tail dry/dry/dry)'),
    start('F10'),
    end('complete', 'F10', 1.5) // a non-timeout end never feeds the budget
  ])
  assert.equal(r.totals.timeout, 3)
  assert.equal(r.timeoutSecondsByBot.F10, 28.5)
  assert.equal(r.timeoutSecondsByBot.F14, 31.5)
  assert.ok(!('F1' in r.timeoutSecondsByBot))
})

test('the forensics lines cap at 12 while the counts stay honest', () => {
  const lines = []
  for (let i = 0; i < 15; i++) lines.push(end('complete', 'F7')) // 15 orphans
  const r = rescueLedger(lines)
  assert.equal(r.orphanEnds, 15) // the count never truncates
  assert.equal(r.orphanEndLines.length, 12) // the story caps
})

test('the zero ledger carries the forensics fields empty (junk stays junk)', () => {
  for (const junk of [null, undefined, 'not an array']) {
    const r = rescueLedger(junk)
    assert.deepEqual(r.orphanEndLines, [])
    assert.deepEqual(r.unclosedLines, [])
    assert.deepEqual(r.timeoutSecondsByBot, {})
  }
  const r = rescueLedger([null, 42, {}])
  assert.deepEqual(r.orphanEndLines, [])
  assert.deepEqual(r.unclosedLines, [])
  assert.deepEqual(r.timeoutSecondsByBot, {})
})

// (v0.728.0) THE SAVED FACE - the starts' own collective verdict. The end
// histogram prices every terminus; the calm paradox (v0.701.0) prices the
// 0-death face's lane churn; the BUSY face's water win (deaths rode, none
// of them drown) had no owner. The era's bytes below are verbatim fleet-log
// lines (the 46th run 37520787094, the 47th run 37524391418, the 48th run
// 37530997515); the start volumes ride repeated real start lines (the
// excerpt law - the counts stay the logs' own).

const realStart48 = 'F10 [F10] water: drowning rescue start (drowning, oxygen 14)'
const realStart48b = 'F9 [F9] water: drowning rescue start (drowning, oxygen 4)'
const realStart47 = 'F13 [F13] water: drowning rescue start (drowning, oxygen 15)'
const realRelease48 = 'F10 [F10] water: rescue released (surface-safe, open water - no land known; the walk gate reopens) in 9.0s'

// the 48th's two combat deaths - mob and explosion kinds (the fence's own
// era bytes: neither is the drown kind, neither counts)
const realDeathMob48 = 'F7 [F7] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.5 (0s before death at [-91,70,422]) [the inference corroborates the server verdict])'
const realDeathExplosion48 = 'F15 [F15] died - respawning (cause: server: was blown up by Creeper [kind=explosion by Creeper] | inferred: creeper@2.7 (0s before death at [-108,64,383]) [the inference corroborates the server verdict])'

// the 47th's trio - every drown death of the face, the server kind the
// authority while the inference rode its fall/env blind (the o2Blind's own
// faces)
const realDrownDeaths47 = [
  'F1 [F1] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-126,53,408]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
  'F13 [F13] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-137,54,428]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
  'F10 [F10] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-134,51,411]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
]

// the 46th's single death - the hound's own (the mob-by-Drowned fence)
const realDeathMobByDrowned46 = 'F16 [F16] died - respawning (cause: server: was impaled by Drowned [kind=mob by Drowned] | inferred: drowned@12.9 (0s before death at [-107,63,368]) [the inference corroborates the server verdict])'

test('the 48th reads THE SAVED FACE: 45 starts, 2 combat deaths, 0 drown-kind', () => {
  const lines = []
  for (let i = 0; i < 43; i++) lines.push(i % 2 ? realStart48 : realStart48b)
  lines.push(realStart48, realStart48b) // 45 starts, the log's own shapes
  lines.push(realRelease48, end('complete', 'F9', 3.2))
  lines.push(realDeathMob48, realDeathExplosion48) // the combat price rode
  const r = rescueLedger(lines)
  assert.equal(r.saved.starts, 45)
  assert.equal(r.saved.drownDeaths, 0)
  assert.equal(r.saved.verdict, 'THE SAVED FACE')
})

test('the 47th reads not saved: the trio counted by the server kind, the inference blind ignored', () => {
  const lines = []
  for (let i = 0; i < 118; i++) lines.push(i % 3 === 0 ? realStart47 : (i % 3 === 1 ? realStart48 : realStart48b))
  for (const d of realDrownDeaths47) lines.push(d)
  const r = rescueLedger(lines)
  assert.equal(r.saved.starts, 118)
  assert.equal(r.saved.drownDeaths, 3) // the server kind stays the authority
  assert.equal(r.saved.verdict, null) // the deaths' own bills own the read
})

test('the 46th reads THE SAVED FACE beside the hound fence: mob-by-Drowned never counts', () => {
  const lines = []
  for (let i = 0; i < 23; i++) lines.push(realStart48) // the 46th's 23 starts
  lines.push(realDeathMobByDrowned46) // the hound won - another grammar
  const r = rescueLedger(lines)
  assert.equal(r.saved.starts, 23)
  assert.equal(r.saved.drownDeaths, 0) // the fence held
  assert.equal(r.saved.verdict, 'THE SAVED FACE')
})

test("the bar's own edge: 20 starts in, 19 out (the volume the claim needs)", () => {
  const twenty = Array.from({ length: 20 }, () => realStart48)
  const nineteen = twenty.slice(1)
  assert.equal(rescueLedger(twenty).saved.verdict, 'THE SAVED FACE')
  const out = rescueLedger(nineteen)
  assert.equal(out.saved.starts, 19)
  assert.equal(out.saved.drownDeaths, 0)
  assert.equal(out.saved.verdict, null) // the sparse calm proves nothing
})

test('junk never invents the verdict: prose kind tokens, blob lines, the zero shape', () => {
  // the anatomy-sweep's prose quoting the kind never counts (the fence)
  const prose = '  ~ the anatomy sweep filtered a line quoting [kind=drown] in prose'
  const blob = 'F1 water: rescue complete in 0.0s (the blob form)'
  const r = rescueLedger([prose, blob, null, 42, {}, realDeathMob48])
  assert.equal(r.saved.starts, 0)
  assert.equal(r.saved.drownDeaths, 0)
  assert.equal(r.saved.verdict, null)
  const empty = rescueLedger([])
  assert.deepEqual(empty.saved, { starts: 0, drownDeaths: 0, verdict: null })
  const junk = rescueLedger(null)
  assert.deepEqual(junk.saved, { starts: 0, drownDeaths: 0, verdict: null })
})
