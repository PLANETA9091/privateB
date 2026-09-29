import { rssJumpVerdict, STORM_JUMP_GAIN_MB_DEFAULT, STORM_JUMP_MAX_STEP_MS } from '../../src/lib/stormguard.mjs'
import { HEARTBEAT_WORKER_SRC } from '../../src/lib/heartbeat.mjs'
import { test } from 'node:test'
import assert from 'node:assert'

// (v0.311.0) THE SUB-FLOOR JUMP WATCH - the forming-storm leg the kill lines
// never name. The datum is fleet 36560130936 (the 1930 fire's post-mortem):
// rss 386M flat for 420s, then 386 -> 925M in ONE guard window while the main
// still ticked (mainLate 1415 -> 2549ms) - no line named it, the next line
// was the FATAL at 984 -> 2006M. The verdict's band is the SUB-FLOOR jump:
// one guard-tick step gaining >= 150M while rss is still below the 1200M
// floor. The floor band stays the kill lines' own.

test('constants pin: 150M gain bar, 25s max step', () => {
  assert.strictEqual(STORM_JUMP_GAIN_MB_DEFAULT, 150)
  assert.strictEqual(STORM_JUMP_MAX_STEP_MS, 25000)
})

test('the 36560130936 datum: 386 -> 925M in one 5s step is a named jump', () => {
  const v = rssJumpVerdict({ rssMb: 925, prevRssMb: 386, stepMs: 5000 })
  assert.strictEqual(v.jump, true)
  assert.ok(v.reason.includes('rss jump 386M -> 925M'), v.reason)
  assert.ok(v.reason.includes('+539M in 5s'), v.reason)
  assert.ok(v.reason.includes('107.8MB/s'), v.reason)
  assert.ok(v.reason.includes('below the 1200M floor'), v.reason)
  assert.strictEqual(v.rate, 107.8)
})

test('the same datum at the heartbeat cadence (20s step) still jumps', () => {
  const v = rssJumpVerdict({ rssMb: 925, prevRssMb: 386, stepMs: 20000 })
  assert.strictEqual(v.jump, true)
  assert.strictEqual(v.rate, 27) // 539/20 = 26.95 -> the verdict's 1-decimal round reads 27
})

test('healthy band oscillation never jumps (+30M step, the run92 width)', () => {
  const v = rssJumpVerdict({ rssMb: 416, prevRssMb: 386, stepMs: 5000 })
  assert.strictEqual(v.jump, false)
  assert.strictEqual(v.reason, 'sub jump')
})

test('exactly at the bar is a jump (>= the gain bar)', () => {
  const v = rssJumpVerdict({ rssMb: 536, prevRssMb: 386, stepMs: 5000 })
  assert.strictEqual(v.jump, true)
})

test('a step past the floor is the kill lines band - never a jump', () => {
  // the 36560130936 terminal leg: the FATAL owns it
  const v = rssJumpVerdict({ rssMb: 2006, prevRssMb: 984, stepMs: 5000 })
  assert.strictEqual(v.jump, false)
  assert.strictEqual(v.reason, 'past floor')
})

test('recede never jumps (the dip reset owns honesty)', () => {
  const v = rssJumpVerdict({ rssMb: 800, prevRssMb: 900, stepMs: 5000 })
  assert.strictEqual(v.jump, false)
  assert.strictEqual(v.reason, 'recede')
})

test('junk rss never jumps', () => {
  for (const r of [0, -5, NaN, Infinity, 'x']) {
    const v = rssJumpVerdict({ rssMb: r, prevRssMb: 386, stepMs: 5000 })
    assert.strictEqual(v.jump, false, `rss ${r}`)
    assert.strictEqual(v.reason, 'junk rss', `rss ${r}`)
  }
})

test('no prior sample never jumps (first read)', () => {
  for (const pr of [0, NaN, null, undefined]) {
    const v = rssJumpVerdict({ rssMb: 925, prevRssMb: pr, stepMs: 5000 })
    assert.strictEqual(v.jump, false, `prev ${pr}`)
    assert.strictEqual(v.reason, 'no prior', `prev ${pr}`)
  }
})

test('no step clock is a NAMED shape - the Number(null) masquerade lesson', () => {
  // null/undefined must read 'no step clock', never masquerade as a 0ms
  // step (Number(null) is 0 and 0 is finite)
  for (const s of [null, undefined]) {
    const v = rssJumpVerdict({ rssMb: 925, prevRssMb: 386, stepMs: s })
    assert.strictEqual(v.jump, false, `step ${s}`)
    assert.strictEqual(v.reason, 'no step clock', `step ${s}`)
  }
})

test('junk step (0/negative/NaN) never jumps', () => {
  for (const s of [0, -100, NaN]) {
    const v = rssJumpVerdict({ rssMb: 925, prevRssMb: 386, stepMs: s })
    assert.strictEqual(v.jump, false, `step ${s}`)
    assert.strictEqual(v.reason, 'junk step', `step ${s}`)
  }
})

test('a stale step (> 25s) is a dead clock, not a storm leg', () => {
  const v = rssJumpVerdict({ rssMb: 925, prevRssMb: 386, stepMs: 26000 })
  assert.strictEqual(v.jump, false)
  assert.strictEqual(v.reason, 'stale step')
  const ok = rssJumpVerdict({ rssMb: 925, prevRssMb: 386, stepMs: 25000 })
  assert.strictEqual(ok.jump, true, 'exactly 25s is still a leg')
})

test('the gain bar override is honored', () => {
  const v = rssJumpVerdict({ rssMb: 506, prevRssMb: 386, stepMs: 5000, gainMb: 100 })
  assert.strictEqual(v.jump, true)
  const strict = rssJumpVerdict({ rssMb: 506, prevRssMb: 386, stepMs: 5000, gainMb: 200 })
  assert.strictEqual(strict.jump, false)
  assert.strictEqual(strict.reason, 'sub jump')
})

test('the floor override is honored', () => {
  const v = rssJumpVerdict({ rssMb: 600, prevRssMb: 386, stepMs: 5000, floorMb: 500 })
  assert.strictEqual(v.jump, false)
  assert.strictEqual(v.reason, 'past floor')
})

test('worker mirror: the jump watch rides the eval worker (writeSync while frozen)', () => {
  assert.match(HEARTBEAT_WORKER_SRC, /var sgJumpWritten = false/, 'the once-per-streak flag')
  assert.match(HEARTBEAT_WORKER_SRC, /FLEET_STORM_JUMP_MB/, 'the gain knob reaches the field')
  assert.match(HEARTBEAT_WORKER_SRC, /\[stormguard\] RSS JUMP/, 'the named line')
  assert.match(HEARTBEAT_WORKER_SRC, /sgWin\.length = 0; sgJumpWritten = false/, 'the dip reset re-arms the watch')
  assert.match(HEARTBEAT_WORKER_SRC, /sgJumpWritten = true/, 'the flag writes before the line')
})

test('worker mirror: the watch runs BEFORE the freeze-storm kill and below the floor only', () => {
  const watchIdx = HEARTBEAT_WORKER_SRC.indexOf('[stormguard] RSS JUMP')
  const freezeIdx = HEARTBEAT_WORKER_SRC.indexOf('FREEZE-STORM EARLY KILL')
  assert.ok(watchIdx > 0, 'the watch line exists')
  assert.ok(freezeIdx > watchIdx, 'the jump line is judged before the kill path can return')
  const guard = HEARTBEAT_WORKER_SRC.indexOf("if (!sgJumpWritten && r < sgFloor && sgWin.length >= 2)")
  assert.ok(guard > 0, 'the sub-floor guard mirrors the verdict (r < sgFloor)')
})

test('worker mirror: the story rides the jump line (the allocator phase, while the ring is alive)', () => {
  const jumpIdx = HEARTBEAT_WORKER_SRC.indexOf('[stormguard] RSS JUMP')
  const tail = HEARTBEAT_WORKER_SRC.slice(jumpIdx, jumpIdx + 400)
  assert.match(tail, /sgStory\(8\)/, 'the jump line carries the same story the probe/FATAL ride')
})
