// THE WET CHURN GOVERNOR (v0.222.0): wetRescueLoad + wetChurnPlan - the
// after-storm evacuation plan, pure. The measured base: the storm's two
// field samples 2-straight - run32 (36255794232) F9+F19 44 rescue starts,
// run33 (36257829576) rescues=88, airGlitches=1413 with THE SENTRY
// ANATOMY: F9 g653/r19 + F19 g598/r17 = 1251 of 1413 glitches (the same
// two bots 2-straight), F11 g0/r12 (12 rescues, zero glitches). The
// clients degrade mid-storm (F9 'frozen while head-wet'). THE LAW: the
// rescue machinery is untouchable (0 losses) - the governor prices the
// bot's NEXT voluntary goal on dry ground, never the save itself.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wetRescueLoad, wetChurnPlan, WET_CHURN_WINDOW_MS, WET_CHURN_RESCUE_CAP, WET_CHURN_COOLDOWN_MS } from '../../src/lib/wetchurn.mjs'

const NOW = 1000000

// THE FIELD PROFILES - the sentry's per-bot shapes (run33), synthesized:
// F9: 19 rescues in 600s as storm series - a tight cluster of 6 inside
// the last 180s window, 13 sparse before it.
const F9 = [
  ...Array.from({ length: 6 }, (_, i) => NOW - i * 10000), // the storm cluster: 0..50s ago
  ...Array.from({ length: 13 }, (_, i) => NOW - (200 + i * 30) * 1000) // 200..560s ago
]
// F11: 12 rescues spread thin across 600s - none clusters past the cap.
const F11 = Array.from({ length: 12 }, (_, i) => NOW - (600 - i * 50) * 1000)

test('wetRescueLoad: counts the bot OWN window, skips the outside and the junk', () => {
  const load = wetRescueLoad(F9, NOW)
  assert.equal(load.windowMs, WET_CHURN_WINDOW_MS)
  assert.equal(load.count, 6, 'the storm cluster reads inside the window, the sparse past does not')
  assert.equal(F9.length, 19, 'the full history stays intact - only the window reads')
  const junked = wetRescueLoad([NOW - 1000, null, 'x', { at: NOW - 2000 }, { at: NaN }, NOW - 400000, NOW + 5000], NOW)
  assert.equal(junked.count, 2, 'junk skipped, the future event is not evidence, the stale one is out')
  assert.equal(wetRescueLoad(null, NOW).count, 0)
  assert.equal(wetRescueLoad([], NOW).count, 0)
  assert.equal(wetRescueLoad(F9, NaN).count, 0, 'a junk clock reads zero - vacuous, honest')
})

test('wetRescueLoad: the window edge is inclusive', () => {
  assert.equal(wetRescueLoad([NOW - WET_CHURN_WINDOW_MS], NOW).count, 1, 'exactly at the edge counts')
  assert.equal(wetRescueLoad([NOW - WET_CHURN_WINDOW_MS - 1], NOW).count, 0, 'one past the edge does not')
})

test('wetChurnPlan: the F9 shape evacuates, the F11 shape keeps working', () => {
  const f9 = wetChurnPlan({ rescueEvents: F9, now: NOW })
  assert.equal(f9.go, true, 'F9 r19 with a clustered series reads churn')
  assert.equal(f9.why, 'churn')
  assert.equal(f9.untilMs, NOW + WET_CHURN_COOLDOWN_MS)
  assert.equal(f9.count, 6)
  const f11 = wetChurnPlan({ rescueEvents: F11, now: NOW })
  assert.equal(f11.go, false, 'F11 r12 spread thin stays under the cap - the bot works on')
  assert.equal(f11.why, 'under-cap')
  assert.equal(f11.count, 3, 'only the last 180s read: 3 rescues inside, still under the cap')
})

test('wetChurnPlan: the cap boundary is inclusive - avoidance errs toward resting', () => {
  const atCap = Array.from({ length: WET_CHURN_RESCUE_CAP }, (_, i) => NOW - i * 1000)
  const p = wetChurnPlan({ rescueEvents: atCap, now: NOW })
  assert.equal(p.go, true, 'exactly the cap evacuates')
  const under = Array.from({ length: WET_CHURN_RESCUE_CAP - 1 }, (_, i) => NOW - i * 1000)
  assert.equal(wetChurnPlan({ rescueEvents: under, now: NOW }).why, 'under-cap')
})

// (v0.293.0) THE DRIP SHAPE - face 36476752446's flooded-quarry anatomy.
// The old storm shape (F9) burst 6+ inside one window and the boundary
// consult caught it; the drip strikes 3-4 times inside ONE long dig and
// the goal turns over before the window fills. At cap 4 the fourth
// in-window strike arms (the intra-goal read rides the dig's own
// shouldStop); the calm shape (the fleet's F15 r7 / F17 r9 spread over
// the whole 600s) still reads 1-3 per window and keeps working.
test('wetChurnPlan: the drip shape arms at the fourth strike, the calm shape works on', () => {
  const drip = [NOW - 90000, NOW - 70000, NOW - 40000, NOW - 12000] // 4 strikes inside one dig
  const p = wetChurnPlan({ rescueEvents: drip, now: NOW })
  assert.equal(p.go, true, 'the fourth in-window strike arms (the face 36476752446 shape)')
  assert.equal(p.why, 'churn')
  const threeStrikes = drip.slice(1)
  assert.equal(wetChurnPlan({ rescueEvents: threeStrikes, now: NOW }).why, 'under-cap', 'three strikes stay under - the arm waits for the fourth')
  const calm = [NOW - 170000, NOW - 120000, NOW - 60000] // the calm fleet shape: spread over the window
  assert.equal(wetChurnPlan({ rescueEvents: calm, now: NOW }).why, 'under-cap', 'the calm bots (r1-r9 over 600s) read 1-3 per window and stay working')
})

test('wetChurnPlan: the gates - no history reads vacuous, honest', () => {
  assert.equal(wetChurnPlan({ rescueEvents: null, now: NOW }).why, 'no-history')
  assert.equal(wetChurnPlan({ rescueEvents: [], now: NOW }).why, 'no-history')
  const stale = [NOW - WET_CHURN_WINDOW_MS - 5000]
  assert.equal(wetChurnPlan({ rescueEvents: stale, now: NOW }).why, 'no-history', 'an out-of-window history is no history')
})

test('wetChurnPlan: holding re-reads the active evacuation, never double-books or extends', () => {
  const evacUntil = NOW + 40000
  const h = wetChurnPlan({ rescueEvents: F9, now: NOW, evacUntil })
  assert.equal(h.go, false, 'an active evacuation is not re-priced')
  assert.equal(h.why, 'holding')
  assert.equal(h.remainingMs, 40000)
  assert.equal(h.count, 6, 'the churn still reads under the hold - the wiring sees the truth')
  const expired = wetChurnPlan({ rescueEvents: F9, now: NOW, evacUntil: NOW - 1 })
  assert.equal(expired.go, true, 'an expired hold re-reads the churn fresh - the cooldown owns the exit')
})

test('wetChurnPlan: a fresh evacuation is a fixed cooldown, not a running sum', () => {
  const p1 = wetChurnPlan({ rescueEvents: F9, now: NOW })
  const p2 = wetChurnPlan({ rescueEvents: F9, now: NOW + 1000 })
  assert.equal(p2.untilMs, NOW + 1000 + WET_CHURN_COOLDOWN_MS, 'each firing prices its own cooldown from its own clock')
  assert.equal(p2.untilMs - p1.untilMs, 1000)
})

test('the constants hold the plan shape for the wiring lane', () => {
  assert.equal(WET_CHURN_WINDOW_MS, 180000)
  assert.equal(WET_CHURN_RESCUE_CAP, 4, '(v0.293.0) recalibrated 6 -> 4 from face 36476752446: the drip strikes 3-4 times inside ONE long digShaft, the boundary consult never read a full 6-window (zero armed lines against F3/F11/F13 r12-r17)')
  assert.equal(WET_CHURN_COOLDOWN_MS, 90000)
  assert.ok(WET_CHURN_COOLDOWN_MS < WET_CHURN_WINDOW_MS, 'the cooldown is shorter than the window - the bot returns to a fresh honest read')
})
