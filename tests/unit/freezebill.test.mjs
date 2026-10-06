import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freezeBill } from '../../src/lib/freezebill.mjs'

// THE ERA BYTE-EXACT - the 45th (run 37516287610) rode the FULL LADDER:
// F17 froze #1..#4 consecutive while the sentry's gate widened 10s ->
// 20s -> 40s -> 60s and never saved the physics. The lines below carry
// the face's own bytes; the bill's debut read names the futility.

test('the full ladder rides by its own bytes - the 45th\'s F17 #1..#4 with the gate doubling', () => {
  const face = [
    'F17 [F17] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=20 health=20 window=legacy',
    'F17 [F17] water: frozen client relog (#2 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 20s (the frozen-return gate) - o2=20 health=20 window=legacy',
    'F17 [F17] water: frozen client relog (#3 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 40s (the frozen-return gate) - o2=13 health=20 window=legacy',
    'F17 [F17] water: frozen client relog (#4 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 60s (the frozen-return gate) - o2=19 health=20 window=legacy',
    'F12 [F12] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=20 health=20 window=legacy'
  ]
  const fb = freezeBill(face)
  assert.ok(fb, 'the ladder face opens the bill')
  assert.equal(fb.n, 5)
  // the streak distribution: the depths the clients rode
  assert.deepEqual(fb.streaks, { 1: 2, 2: 1, 3: 1, 4: 1 })
  // the gate distribution: the ladder's own doubling, byte-counted
  assert.deepEqual(fb.gates, { 10: 2, 20: 1, 40: 1, 60: 1 })
  // the freeze context: the vitals carried INTO the freeze (o2=13 at #3 -
  // the drowning clock won that race to the freeze)
  assert.deepEqual(fb.byBot.F17.freezes, [
    { streak: 1, gate: 10, o2: 20, health: 20, window: 'legacy' },
    { streak: 2, gate: 20, o2: 20, health: 20, window: 'legacy' },
    { streak: 3, gate: 40, o2: 13, health: 20, window: 'legacy' },
    { streak: 4, gate: 60, o2: 19, health: 20, window: 'legacy' }
  ])
  // THE LADDER VERDICT: the gate doubled twice and the client still froze
  assert.deepEqual(fb.ladder, { F17: { maxStreak: 4, maxGate: 60 } })
})

test('the low end - the 46th\'s four freezes never climb to the ladder', () => {
  const face = [
    'F19 [F19] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=10 health=14.000000953674316 window=legacy',
    'F3 [F3] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=20 health=19 window=legacy',
    'F16 [F16] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=20 health=20 window=legacy',
    'F19 [F19] water: frozen client relog (#2 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 20s (the frozen-return gate) - o2=20 health=19 window=legacy'
  ]
  const fb = freezeBill(face)
  assert.ok(fb, 'the low-end face opens the bill')
  assert.equal(fb.n, 4)
  assert.deepEqual(fb.streaks, { 1: 3, 2: 1 })
  assert.deepEqual(fb.gates, { 10: 3, 20: 1 })
  // F19's pair: the streak continued (#1 -> #2), the vitals read honestly
  assert.equal(fb.byBot.F19.n, 2)
  assert.equal(fb.byBot.F19.maxStreak, 2)
  assert.equal(fb.byBot.F19.maxGate, 20)
  assert.equal(fb.byBot.F19.freezes[0].health, 14)
  // the honest empty ladder: the gate's early rungs, no futility named
  assert.deepEqual(fb.ladder, {})
})

test('the ladder\'s own bar - the streak 2 stays out, the streak 3 rides in', () => {
  const face = [
    'F5 [F5] water: frozen client relog (#2 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 20s (the frozen-return gate) - o2=20 health=18 window=legacy',
    'F7 [F7] water: frozen client relog (#3 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 40s (the frozen-return gate) - o2=20 health=20 window=legacy'
  ]
  const fb = freezeBill(face)
  assert.ok(fb, 'the boundary face opens the bill')
  assert.equal(fb.byBot.F5.maxStreak, 2)
  // F5's #2: one rung below the bar - the ladder cell stays honest
  assert.equal(fb.ladder.F5, undefined)
  assert.deepEqual(fb.ladder, { F7: { maxStreak: 3, maxGate: 40 } })
})

test('the grammar\'s edges - the float noise, the current window, the neighbors out, the blob', () => {
  const face = [
    'F4 [F4] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=17 health=9.333333015441895 window=legacy',
    'F8 [F8] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=20 health=20 window=current',
    // the raw census line and the kick churn stay out (no water prefix, no freeze byte)
    'frozen client relogs: 4 (head-wet saver 4, legacy threshold 0)',
    'F17 [F17] duplicate-login kicks (the relog churn): 4',
    'F9 [F9] water: pass 3 head=dry shore=none land=oak_log d=2 y=47.2 o2=19 probes=0 at=[-129,47,401]'
  ]
  const fb = freezeBill(face)
  assert.ok(fb, 'the edge face opens the bill')
  assert.equal(fb.n, 2)
  // the client's own float noise rounds to one decimal
  assert.equal(fb.byBot.F4.freezes[0].health, 9.3)
  // the window skin reads honestly (the era's current vs legacy split)
  assert.equal(fb.byBot.F8.freezes[0].window, 'current')
  const blob = freezeBill(face.join('\n') + '\n')
  assert.deepEqual(blob, fb)
})

test('the honest silences - no face, junk, and a freeze-free water lane stay null', () => {
  assert.equal(freezeBill(), null)
  assert.equal(freezeBill(null), null)
  assert.equal(freezeBill(''), null)
  assert.equal(freezeBill(['junk line', 42, null]), null)
  // the water lane rode passes but no freeze - the bill's silence
  const dryLane = [
    'F17 [F17] water: pass 3 head=dry shore=none land=oak_log d=2 y=47.2 o2=19 probes=0 at=[-129,47,401]',
    'F5 [F5] water: shore transit stalled (r=2 after 5 passes - the walls own this swim; the release takes over)'
  ]
  assert.equal(freezeBill(dryLane), null)
})
