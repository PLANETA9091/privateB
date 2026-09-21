import { createStormGuard, STORM_RATE_MB_S_DEFAULT, STORM_FLOOR_MB_DEFAULT } from '../../src/lib/stormguard.mjs'
import { test } from 'node:test'
import assert from 'node:assert'

// a deterministic clock: each sample advances by stepMs
function clock (stepMs, start = 0) {
  let t = start
  return () => { const v = t; t += stepMs; return v }
}

test('defaults: 40MB/s rate, 1200M floor (run53 numbers)', () => {
  assert.strictEqual(STORM_RATE_MB_S_DEFAULT, 40)
  assert.strictEqual(STORM_FLOOR_MB_DEFAULT, 1200)
})

test('run53 trajectory storms: 367 -> 900 -> 1500 at 5s steps (158MB/s class)', () => {
  const g = createStormGuard({ now: clock(5000) })
  let v = g.sample(367)
  assert.strictEqual(v.storm, false) // one sample is never a verdict
  v = g.sample(900)
  assert.strictEqual(v.storm, false) // 533M/5s = 107MB/s but window needs 10s of evidence
  v = g.sample(1500)
  assert.strictEqual(v.storm, true) // 1133M/10s = 113MB/s, rss 1500 >= 1200 floor
  assert.ok(v.rate > 100)
})

test('healthy flat rss never storms even with jitter', () => {
  const g = createStormGuard({ now: clock(5000) })
  for (const r of [367, 377, 357, 367, 380, 360, 371, 366, 372, 368]) {
    assert.strictEqual(g.sample(r).storm, false, `rss ${r} must not storm`)
  }
})

test('sub-floor storm warns but does not kill', () => {
  const g = createStormGuard({ now: clock(5000) })
  g.sample(200)
  const v = g.sample(700) // 500M/5s = 100MB/s but rss 700 < 1200 floor
  assert.strictEqual(v.storm, false)
  assert.strictEqual(v.warn, true)
  // the warn is rate-limited: an immediate second warn is suppressed
  const v2 = g.sample(900)
  assert.strictEqual(v2.storm, false)
  assert.strictEqual(v2.warn, false)
})

test('slow growth past the floor never storms (rate gate)', () => {
  const g = createStormGuard({ now: clock(5000) })
  let rss = 300
  for (let i = 0; i < 400; i++) { // +1M per 5s for 2000s -> past 1200M slowly
    rss += 1
    const v = g.sample(rss)
    assert.strictEqual(v.storm, false, `slow growth to ${rss}M must not storm`)
  }
})

test('an RSS drop breaks the growth streak (recovery resets the window)', () => {
  const g = createStormGuard({ now: clock(5000) })
  g.sample(367)
  g.sample(900)
  g.sample(400) // gc nudge or a dropped buffer: back down
  const v = g.sample(500)
  assert.strictEqual(v.storm, false) // fresh window, nothing accumulated
})

test('junk samples never enter the window', () => {
  const g = createStormGuard({ now: clock(5000) })
  g.sample(NaN)
  g.sample(-5)
  g.sample(Infinity)
  assert.strictEqual(g.window(), 0)
  g.sample(367)
  assert.strictEqual(g.window(), 1)
})

test('a one-sample spike cannot storm alone (sustained-gain gate)', () => {
  // 10s window with 5s steps: two samples only; the spike IS the second sample.
  // gain 1000 over 10s = 100MB/s >= rate AND 1000 >= 40*10*0.5=200 sustained -> storm
  // but a shorter window with one huge jump over tiny dt still needs the gain
  const g = createStormGuard({ now: clock(1000), windowMs: 10000 })
  g.sample(367)
  const v = g.sample(400) // +33M in 1s = 33MB/s < 40 -> no storm
  assert.strictEqual(v.storm, false)
  const v2 = g.sample(1400) // +1000M in 1s = 1000MB/s, sustained gate: gain 1033 >= 40*1*0.5 -> storm
  assert.strictEqual(v2.storm, true)
})

test('clock going backwards resets the window (no false storm)', () => {
  let t = 100000
  const now = () => { t -= 5000; return t } // time flows backwards
  const g = createStormGuard({ now })
  g.sample(367)
  g.sample(900)
  g.sample(1500)
  assert.strictEqual(g.window(), 1) // every sample restarts a fresh window
})

test('reset clears the window', () => {
  const g = createStormGuard({ now: clock(5000) })
  g.sample(367)
  g.sample(900)
  g.reset()
  assert.strictEqual(g.window(), 0)
  assert.strictEqual(g.sample(1500).storm, false)
})
