import { frozenBurstVerdict, STORM_BURST_MAX_STEP_MS, STORM_JUMP_MAX_STEP_MS } from '../../src/lib/stormguard.mjs'
import { HEARTBEAT_WORKER_SRC } from '../../src/lib/heartbeat.mjs'
import { test } from 'node:test'
import assert from 'node:assert'

// (v0.805.0) THE FROZEN BURST'S OWN FLOOR - the allocating freeze's sub-floor
// leg. The datum is fleet 37712326964 (face 88, the v0.802.0 tree): the main
// froze ~60s FLAT at 380M (the recoverable class - correctly no kill), then
// burst 380 -> 1004M in ONE 5s window (124.7MB/s) BELOW the 1200M floor - the
// freeze-storm kill (v0.235.0) could not fire, the jump watch (v0.311.0) only
// names, and the floor kill waited for 1004 -> 2144M with the V8 cliff one
// sample away (the race run 36292057377 lost to the unsymbolized exit 134).
// The verdict's shape: pulse frozen past the void + the step growing at >=
// the storm rate + still below the floor = kill NOW. Every recoverable shape
// fences (flat freeze, sub-rate swell, turning main, dead clock, junk).

test('constants pin: the burst step cap rides the jump watch law', () => {
  assert.strictEqual(STORM_BURST_MAX_STEP_MS, STORM_JUMP_MAX_STEP_MS)
  assert.strictEqual(STORM_BURST_MAX_STEP_MS, 25000)
})

test('the face-88 datum: 380 -> 1004M in one 5s step with the pulse frozen 75s kills below the floor', () => {
  const v = frozenBurstVerdict({ rssMb: 1004, prevRssMb: 380, stepMs: 5000, pulseFrozenMs: 75000 })
  assert.strictEqual(v.kill, true)
  assert.strictEqual(v.reason, 'frozen burst: main pulse frozen 75s, rss 380M -> 1004M (+624M in 5s = 124.8MB/s >= 40MB/s) - the closure cannot land')
  assert.strictEqual(v.rate, 124.8)
})

test('the same datum at the floor is the FLOOR BANDS own - the bands never double', () => {
  // face 88's actual FATAL shape: 1004 -> 2144M past the 1200M floor - the
  // v0.235.0 freeze-storm verdict owns that band byte for byte
  const v = frozenBurstVerdict({ rssMb: 2144, prevRssMb: 1004, stepMs: 5000, pulseFrozenMs: 80000 })
  assert.strictEqual(v.kill, false)
  assert.strictEqual(v.reason, 'past floor')
})

test('the recoverable flat freeze never kills (run63: 51s frozen, rss flat)', () => {
  const flat = frozenBurstVerdict({ rssMb: 367, prevRssMb: 367, stepMs: 5000, pulseFrozenMs: 51000 })
  assert.strictEqual(flat.kill, false)
  assert.strictEqual(flat.reason, 'not growing')
  const recede = frozenBurstVerdict({ rssMb: 360, prevRssMb: 367, stepMs: 5000, pulseFrozenMs: 51000 })
  assert.strictEqual(recede.kill, false)
  assert.strictEqual(recede.reason, 'not growing')
})

test('the slow swell stays sub-rate (36560130936 first leg: ~27MB/s over a starved window)', () => {
  const v = frozenBurstVerdict({ rssMb: 925, prevRssMb: 386, stepMs: 20000, pulseFrozenMs: 8000 })
  assert.strictEqual(v.kill, false)
  assert.strictEqual(v.reason, 'sub rate')
  assert.strictEqual(v.rate, 27)
})

test('the turning main never kills here - the two-strike path owns it', () => {
  const alive = frozenBurstVerdict({ rssMb: 1004, prevRssMb: 380, stepMs: 5000, pulseFrozenMs: 3999 })
  assert.strictEqual(alive.kill, false)
  assert.strictEqual(alive.reason, 'pulse alive')
})

test('junk pulse evidence never kills (the Number(null) masquerade lesson)', () => {
  for (const f of [null, undefined]) {
    const v = frozenBurstVerdict({ rssMb: 1004, prevRssMb: 380, stepMs: 5000, pulseFrozenMs: f })
    assert.strictEqual(v.kill, false, `pulse ${f}`)
    assert.strictEqual(v.reason, 'no pulse evidence', `pulse ${f}`)
  }
  for (const f of [NaN, -1]) {
    const v = frozenBurstVerdict({ rssMb: 1004, prevRssMb: 380, stepMs: 5000, pulseFrozenMs: f })
    assert.strictEqual(v.kill, false, `pulse ${f}`)
    assert.strictEqual(v.reason, 'no pulse evidence', `pulse ${f}`)
  }
})

test('junk rss never kills', () => {
  for (const r of [0, -5, NaN, Infinity, 'x']) {
    const v = frozenBurstVerdict({ rssMb: r, prevRssMb: 380, stepMs: 5000, pulseFrozenMs: 75000 })
    assert.strictEqual(v.kill, false, `rss ${r}`)
    assert.strictEqual(v.reason, 'junk rss', `rss ${r}`)
  }
})

test('the step clock fences: no clock, junk clock, dead clock', () => {
  for (const s of [null, undefined]) {
    const v = frozenBurstVerdict({ rssMb: 1004, prevRssMb: 380, stepMs: s, pulseFrozenMs: 75000 })
    assert.strictEqual(v.kill, false, `step ${s}`)
    assert.strictEqual(v.reason, 'no step clock', `step ${s}`)
  }
  for (const s of [0, -100, NaN]) {
    const v = frozenBurstVerdict({ rssMb: 1004, prevRssMb: 380, stepMs: s, pulseFrozenMs: 75000 })
    assert.strictEqual(v.kill, false, `step ${s}`)
    assert.strictEqual(v.reason, 'junk step', `step ${s}`)
  }
  const stale = frozenBurstVerdict({ rssMb: 1004, prevRssMb: 380, stepMs: 26000, pulseFrozenMs: 75000 })
  assert.strictEqual(stale.kill, false)
  assert.strictEqual(stale.reason, 'stale step')
  const edge = frozenBurstVerdict({ rssMb: 1150, prevRssMb: 150, stepMs: 25000, pulseFrozenMs: 75000 })
  assert.strictEqual(edge.kill, true, 'exactly 25s with storm rate is still a leg (below the floor)')
})

test('the rate bar override is honored', () => {
  const strict = frozenBurstVerdict({ rssMb: 1004, prevRssMb: 380, stepMs: 5000, pulseFrozenMs: 75000, rateMbS: 200 })
  assert.strictEqual(strict.kill, false)
  assert.strictEqual(strict.reason, 'sub rate')
  const loose = frozenBurstVerdict({ rssMb: 1004, prevRssMb: 380, stepMs: 5000, pulseFrozenMs: 75000, rateMbS: 100 })
  assert.strictEqual(loose.kill, true)
})

test('worker mirror: the frozen-burst kill rides the eval worker with its own named FATAL', () => {
  assert.match(HEARTBEAT_WORKER_SRC, /\[stormguard\] FATAL \(frozen burst:/, 'the named line')
  assert.match(HEARTBEAT_WORKER_SRC, /face 88 \(37712326964\) burst 380 -> 1004M at 124\.7MB\/s/, 'the precedent rides the line')
  assert.match(HEARTBEAT_WORKER_SRC, /sgJumpMaxStepMs && fbRate >= sgRate/, 'the step cap + the rate bar mirror the verdict')
})

test('worker mirror: the burst leg reads ONLY below the floor, after the floor band, before the two-strike', () => {
  const freezeIdx = HEARTBEAT_WORKER_SRC.indexOf('FREEZE-STORM EARLY KILL')
  const burstIdx = HEARTBEAT_WORKER_SRC.indexOf("if (!stopped && pvFrozen !== null && pvFrozen >= sgPulseVoidMs && r < sgFloor && fsPrev > 0 && r > fsPrev && sgWin.length >= 2)")
  const verdictIdx = HEARTBEAT_WORKER_SRC.indexOf('var v = sgVerdict()')
  assert.ok(freezeIdx > 0, 'the floor band exists')
  assert.ok(burstIdx > freezeIdx, 'the burst leg sits after the floor band (the band keeps priority)')
  assert.ok(verdictIdx > burstIdx, 'the burst leg returns before the two-strike path can run')
  assert.match(HEARTBEAT_WORKER_SRC, /THE FROZEN BURST'S OWN FLOOR - mirrored from/, 'the mirror names its reference')
})

test('worker mirror: the story rides the burst FATAL (the allocator phase evidence)', () => {
  const burstIdx = HEARTBEAT_WORKER_SRC.indexOf('[stormguard] FATAL (frozen burst:')
  const tail = HEARTBEAT_WORKER_SRC.slice(burstIdx, burstIdx + 1200)
  assert.match(tail, /sgStory\(8\)/, 'the burst FATAL carries the same story the freeze FATAL rides')
  assert.match(tail, /emergency SIGTERM keeps the story readable/, 'the exit-143 doctrine holds')
})
