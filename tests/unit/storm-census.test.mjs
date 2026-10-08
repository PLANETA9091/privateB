// (v0.409.0) THE STORM EVENT CENSUS - unit pins (the seal-census v0.397.0
// test shape). The stormguard probe/fatal anatomies are VERBATIM from the
// held storm-face log (run36292057377 - the probe, the FATAL); the
// heartbeat line is the worker's own rail. The allocvalve flavors are
// pinned by ROUND-TRIP through the valve's own pure line builders
// (src/lib/allocvalve.mjs valveTransitionLine / valveWorkerCloseLine /
// valveFunnelCloseLine) - the builders ARE the emitters, so the census
// must parse their exact output or it lies. The gauge lines and the two
// euthanasia forms are NOT this census's (the mem-hb lens, v0.408.0, owns
// them - one parser per emitter). The honest zero baseline: a calm face
// (no storm events at all) reads zeros, not nulls.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  parseHeartbeat, parseStormProbe, parseStormFatal, parseRssJump,
  parseValveClose, parseValveOpen, stormCensus
} from '../../src/lib/stormcensus.mjs'
import {
  valveTransitionLine, valveWorkerCloseLine, valveFunnelCloseLine
} from '../../src/lib/allocvalve.mjs'

test('heartbeat line parses (the distress rail: late/mainLate peaks + the rss bookends)', () => {
  const hb = parseHeartbeat('[workerguard] b] n=2 ts=41s rss=312M late=10ms mainLate=281ms')
  assert.ok(hb)
  assert.equal(hb.n, 2)
  assert.equal(hb.tsS, 41)
  assert.equal(hb.rssM, 312)
  assert.equal(hb.lateMs, 10)
  assert.equal(hb.mainLateMs, 281)
})

test('storm probe parses verbatim (the run36292057377 first strike)', () => {
  const p = parseStormProbe('[stormguard] STORM PROBE: rss 1154M -> 2271M (+1117M in 5s = 223MB/s, mainLate 2190ms; last: pf:spin walk @+0.0s <- pf:queue walk @+-0.1s) - SURVIVING the first strike (run61 burst class: one window, main thread still ticking); a SECOND verdict after the 20s grace, or rss >= 3000M, kills')
  assert.ok(p)
  assert.equal(p.kind, 'probe')
  assert.equal(p.fromM, 1154)
  assert.equal(p.toM, 2271)
  assert.equal(p.gainM, 1117)
  assert.equal(p.windowS, 5)
  assert.equal(p.rateMBs, 223)
  assert.equal(p.mainLateMs, 2190)
})

test('storm fatal parses verbatim (the hard-ceiling kill)', () => {
  const f = parseStormFatal('[stormguard] FATAL (hard ceiling 3000M): rss 2271M -> 3094M (+823M in 5s = 164MB/s >= 40MB/s at rss >= 1200M floor; last: pf:spin walk @+0.0s) ')
  assert.ok(f)
  assert.equal(f.kind, 'fatal')
  assert.equal(f.reason, 'hard ceiling 3000M')
  assert.equal(f.fromM, 2271)
  assert.equal(f.toM, 3094)
  assert.equal(f.rateMBs, 164)
})

test('valve closes parse by ROUND-TRIP through the valve\'s own builders (every named flavor)', () => {
  // the plain ticker transition
  const plain = valveTransitionLine({ wasClosed: false, st: { closed: true, lastRss: 2626, lastRate: 190, remainingMs: 12000, strikes: 1 }, rssM: 2626, uptimeS: 480 })
  const pc = parseValveClose(plain)
  assert.ok(pc, 'plain CLOSED parses')
  assert.equal(pc.flavor, 'ticker')
  assert.equal(pc.rssM, 2626)
  assert.equal(pc.rateMBs, 190)
  assert.equal(pc.refusedS, 12)
  assert.equal(pc.strike, 1)
  assert.equal(pc.tsS, 480)

  // the v0.115.0 queue-pressure flavor (the run101 feeder cut)
  const qp = valveTransitionLine({ wasClosed: false, st: { closed: true, lastRss: 402, lastRate: 8, remainingMs: 15000, strikes: 1, lastSource: 'queue-pressure', lastQueued: 10, pressureStreak: 9 }, rssM: 402, uptimeS: 300 })
  const qc = parseValveClose(qp)
  assert.ok(qc, 'queue-pressure CLOSED parses')
  assert.equal(qc.flavor, 'queue-pressure')
  assert.equal(qc.queueQueued, 10)
  assert.equal(qc.queueSustainedS, 9)
  assert.equal(qc.refusedS, 15)
  assert.equal(qc.rssM, null, 'the queue-pressure line names no rss (+rate) pair')

  // the worker-probe applied close
  const wc = parseValveClose(valveWorkerCloseLine({ st: { lastRss: 2271, lastRate: 223, remainingMs: 15000, strikes: 2 }, tsS: 490 }))
  assert.ok(wc, 'worker-probe CLOSED parses')
  assert.equal(wc.flavor, 'worker-verdict')
  assert.equal(wc.rssM, 2271)
  assert.equal(wc.refusedS, 15)

  // the funnel's own storm close
  const fc = parseValveClose(valveFunnelCloseLine({ st: { lastRss: 1544, lastRate: 52, remainingMs: 9000, strikes: 1 }, tsS: 300 }))
  assert.ok(fc, 'funnel CLOSED parses')
  assert.equal(fc.flavor, 'funnel')
  assert.equal(fc.refusedS, 9)

  // the cell-applied funnel close (the run105 gap's line)
  const cc = parseValveClose(valveFunnelCloseLine({ st: { lastRss: 1800, lastRate: 60, remainingMs: 9000, strikes: 2 }, tsS: 310, who: 'cell' }))
  assert.ok(cc, 'cell-applied CLOSED parses')
  assert.equal(cc.flavor, 'worker-verdict')
  assert.equal(cc.rssM, 1800)

  // the v0.121.0 slow envelope
  const se = parseValveClose(valveFunnelCloseLine({ st: { lastRss: 700, lastRate: 30, remainingMs: 8000, strikes: 1 }, tsS: 200, who: 'slow envelope' }))
  assert.ok(se, 'slow-envelope CLOSED parses')
  assert.equal(se.flavor, 'slow-envelope')
  assert.equal(se.refusedS, 8)
})

test('valve open parses by round-trip', () => {
  const line = valveTransitionLine({ wasClosed: true, st: { closed: false, strikes: 1 }, rssM: 402, uptimeS: 512 })
  const o = parseValveOpen(line)
  assert.ok(o)
  assert.equal(o.kind, 'valve-open')
  assert.equal(o.rssM, 402)
  assert.equal(o.strikes, 1)
})

test('census accumulates the mixed synthetic face (peaks, flavors, the verdicts\' rss rides the peak)', () => {
  const c = stormCensus([
    '[workerguard] b] n=1 ts=21s rss=247M late=5ms mainLate=0ms',
    '[stormguard] STORM PROBE: rss 1154M -> 2271M (+1117M in 5s = 223MB/s, mainLate 2190ms; last: x) - SURVIVING the first strike',
    valveWorkerCloseLine({ st: { lastRss: 2271, lastRate: 223, remainingMs: 15000, strikes: 1 }, tsS: 300 }),
    valveTransitionLine({ wasClosed: false, st: { closed: true, lastRss: 402, lastRate: 8, remainingMs: 12000, strikes: 1, lastSource: 'queue-pressure', lastQueued: 8, pressureStreak: 5 }, rssM: 402, uptimeS: 350 }),
    valveTransitionLine({ wasClosed: true, st: { closed: false, strikes: 1 }, rssM: 402, uptimeS: 512 }),
    '[stormguard] FATAL (hard ceiling 3000M): rss 2271M -> 3094M (+823M in 5s = 164MB/s >= 40MB/s at rss >= 1200M floor; last: x)',
    '[workerguard] b] n=2 ts=41s rss=312M late=10ms mainLate=281ms'
  ])
  assert.equal(c.hb.count, 2)
  assert.equal(c.hb.maxLateMs, 10)
  assert.equal(c.hb.maxMainLateMs, 281)
  assert.equal(c.rss.firstM, 247, 'the hb series\' first bookend')
  assert.equal(c.rss.lastM, 312, 'the hb series\' last bookend')
  assert.equal(c.rss.peakM, 3094, 'the FATAL\'s own read rides the peak (the hb cadence never saw it)')
  assert.equal(c.storms.probes, 1)
  assert.equal(c.storms.fatals, 1)
  assert.equal(c.storms.peakStormRssM, 3094)
  assert.equal(c.storms.peakRateMBs, 223, 'the probe\'s rate is the sharpest the verdicts named')
  assert.equal(c.valve.closures, 2)
  assert.equal(c.valve.opens, 1)
  assert.equal(c.valve.byFlavor['worker-verdict'], 1)
  assert.equal(c.valve.byFlavor['queue-pressure'], 1)
  assert.equal(c.valve.maxRefusedS, 15)
  assert.equal(c.valve.peakCloseRssM, 2271)
})

test('junk battery - the census never invents and never throws', () => {
  for (const junk of [null, undefined, 42, {}, [], 'b] n=1 ts=1s', '[stormguard] STORM PROBE: rss', 'FATAL (hard ceiling 3000M)', '[allocvalve] CLOSED with no tail', '[allocvalve] OPEN: rss M after closure (strikes N)', '']) {
    assert.equal(parseHeartbeat(junk), null, `hb rejects ${JSON.stringify(junk)}`)
    assert.equal(parseStormProbe(junk), null)
    assert.equal(parseStormFatal(junk), null)
    assert.equal(parseValveClose(junk), null)
    assert.equal(parseValveOpen(junk), null)
  }
  const c = stormCensus([null, 42, '', [], 'b] n=1 ts=1s rss=247M late=5ms mainLate=0ms'])
  assert.equal(c.hb.count, 1, 'only the well-formed line counts')
  assert.equal(stormCensus('not an array').hb.count, 0, 'a non-array reads the honest zero shape')
  assert.equal(stormCensus([]).hb.count, 0)
})

test('honest-zero pin - the calm face reads zeros where nothing fired', () => {
  const c = stormCensus([
    '[workerguard] b] n=1 ts=21s rss=247M late=5ms mainLate=0ms',
    '[workerguard] b] n=2 ts=41s rss=312M late=10ms mainLate=281ms'
  ])
  assert.equal(c.storms.probes, 0)
  assert.equal(c.storms.fatals, 0)
  assert.equal(c.valve.closures, 0)
  assert.equal(c.valve.opens, 0)
  assert.deepEqual(c.valve.byFlavor, {})
  assert.equal(c.rss.peakM, 312)
})

// (v0.804.0) THE FORMING LEG'S OWN CELL - the worker's RSS JUMP line (the
// v0.677.0 emitter's threshold verdict) joins the census. Face 88
// (37712326964) rode the leg UNREAD while the FATAL took the blame.
test('rss jump parses verbatim (the face-88 forming leg: the decimal rate, the floor byte)', () => {
  const j = parseRssJump('[stormguard] RSS JUMP: rss 380M -> 1004M (+624M in 5s = 124.7MB/s, below the 1200M floor - the forming-storm leg the kill lines never name; last: pf:spin wood trip @+0.0s <- pf:done walk @+-0.2s <- pf:goal walk @+-0.7s <- pf:queue walk @+-0.7s <- pf:done walk @+-0.7s <- pf:spin wood trip @+-1.1s <- pf:goal fuel commons wa @+-1.3s <- pf:queue fuel commons w @+-1.3s)')
  assert.ok(j)
  assert.equal(j.kind, 'rss-jump')
  assert.equal(j.fromM, 380)
  assert.equal(j.toM, 1004)
  assert.equal(j.gainM, 624)
  assert.equal(j.windowS, 5)
  assert.equal(j.rateMBs, 124.7)
  assert.equal(j.floorM, 1200)
  // the split-of-labor pin: the freeze-storm FATAL form is the mem-hb
  // lens' own cell (FREEZE_STORM_RE, v0.677.0) - this census never
  // re-reads it (one parser per emitter, the v0.408.0 law)
  assert.equal(parseStormFatal('[stormguard] FATAL (freeze storm: main pulse frozen 80s, rss 1004M -> 2144M growing past the 1200M floor - the closure cannot land; run 36292057377 spent the probe at 2271M and the ceiling SIGTERM lost the race to the V8 OOM at exit 134; last: pf:spin wood trip @+0.0s)'), null)
  // the census fold on the face-88 pair: the jump's own numbers ride the
  // peaks - the face's peak storm rate was the JUMP's 124.7MB/s, and the
  // freeze FATAL (memhb's cell) adds nothing here
  const c = stormCensus([
    '[stormguard] RSS JUMP: rss 380M -> 1004M (+624M in 5s = 124.7MB/s, below the 1200M floor - the forming-storm leg the kill lines never name; last: pf:spin wood trip @+0.0s)',
    '[stormguard] FATAL (freeze storm: main pulse frozen 80s, rss 1004M -> 2144M growing past the 1200M floor - the closure cannot land)',
  ])
  assert.deepEqual(c.storms, { probes: 0, fatals: 0, jumps: 1, peakStormRssM: 1004, peakRateMBs: 124.7 })
  assert.equal(c.rss.peakM, 1004) // the jump's toM rides the rss peak; the freeze FATAL is memhb's
})

test('the forming leg rides the mixed face: the jump, the probe, the fatal fold the same peaks', () => {
  const c = stormCensus([
    '[workerguard] b] n=1 ts=21s rss=247M late=5ms mainLate=0ms',
    '[stormguard] RSS JUMP: rss 380M -> 1004M (+624M in 5s = 124.7MB/s, below the 1200M floor - the forming-storm leg the kill lines never name; last: pf:spin walk @+0.0s)',
    '[stormguard] STORM PROBE: rss 1154M -> 2271M (+1117M in 5s = 223MB/s, mainLate 2190ms; last: pf:spin walk @+0.0s) - SURVIVING the first strike',
    '[stormguard] FATAL (hard ceiling 3000M): rss 2271M -> 3094M (+823M in 5s = 164MB/s >= 40MB/s at rss >= 1200M floor; last: pf:spin walk @+0.0s) ',
  ])
  assert.equal(c.storms.jumps, 1)
  assert.equal(c.storms.probes, 1)
  assert.equal(c.storms.fatals, 1)
  assert.equal(c.storms.peakStormRssM, 3094) // the fatal's peak stands
  assert.equal(c.storms.peakRateMBs, 223) // the probe's rate stands over the jump's decimal
  // the decimal rate peaks when it is the face's own max (the honest peak law)
  const c2 = stormCensus([
    '[stormguard] RSS JUMP: rss 380M -> 1004M (+624M in 5s = 124.7MB/s, below the 1200M floor - the forming-storm leg the kill lines never name; last: pf:spin walk @+0.0s)',
    '[stormguard] FATAL (hard ceiling 3000M): rss 2271M -> 3094M (+823M in 5s = 64MB/s >= 40MB/s at rss >= 1200M floor; last: pf:spin walk @+0.0s) ',
  ])
  assert.equal(c2.storms.peakRateMBs, 124.7)
  assert.equal(c2.rss.peakM, 3094)
})

test('the jumps cell reads the honest zero on the calm face + the junk battery + the WIRING gates', async () => {
  const calm = stormCensus([
    '[workerguard] b] n=1 ts=21s rss=247M late=5ms mainLate=0ms',
    '[workerguard] b] n=2 ts=41s rss=312M late=10ms mainLate=281ms',
  ])
  assert.equal(calm.storms.jumps, 0)
  assert.equal(calm.storms.peakStormRssM, null)
  assert.equal(calm.storms.peakRateMBs, null)
  for (const junk of [null, undefined, 42, {}, [], '', '[stormguard] RSS JUMP: rss', '[stormguard] RSS JUMP: rss M -> M (+M in s = MB/s, below the M floor', 'RSS JUMP: rss 380M -> 1004M (+624M in 5s = 124.7MB/s, below the 1200M floor']) {
    assert.equal(parseRssJump(junk), null, `jump rejects ${JSON.stringify(junk)}`)
  }
  // the WIRING: the decompose row carries the jumps cell and the gates
  // ride the sum (the row fires where it was silent - face 88's own read)
  const src = await readFile(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('probes=${s.probes} fatals=${s.fatals} jumps=${s.jumps}'))
  assert.ok(src.includes('if (s.probes + s.fatals + s.jumps > 0) {'))
  assert.ok(src.includes('if (s.probes + s.fatals + s.jumps + v.closures > 0) {'))
})
