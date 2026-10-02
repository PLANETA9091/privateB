import { test } from 'node:test'
import assert from 'node:assert/strict'
import { o2Gap, DROWN_CONTEXT_RE } from '../../src/lib/o2gap.mjs'

// Face 43's live shapes verbatim (run 36970605824), compressed to the
// join-bearing lines: F13's pre-death passes + death at raw index 1399->
// 1586, F1's at 1877->2653, and F13's POST-respawn successful episode
// riding AFTER its death line (the trap the join law must refuse).
const face43Mini = [
  'F13 [F13] water: pass 0 head=wet shore=none land=n/a y=59.0 o2=13 probes=0 at=[-145,59,391]',
  'F13 [F13] water: pass 5 head=dry shore=hit r=5 land=none y=62.2 o2=19 probes=0 at=[-145,62,391]',
  'F13 [F13] water: pass 10 head=dry shore=hit r=1 land=none y=62.7 o2=20 probes=0 at=[-142,63,394]',
  'F13 [F13] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-142,61,391]) [the inference is blind to this kind])',
  'F13 [F13] death: drown context (o2 reset(-1), feet water, head water, rescue 42s ago, leg fuel commons walk @-145,391, wet 3s@last)',
  'F1 [F1] water: pass 4 head=dry shore=hit r=4 land=none y=47.6 o2=20 probes=0 at=[-120,48,388]',
  'F1 [F1] water: pass 10 head=wet shore=none land=n/a y=46.6 o2=20 probes=0 at=[-120,47,388]',
  'F1 [F1] death: drown context (o2 reset(-1), feet water, head water, rescue 166s ago, leg approach segment, wet 26s)',
  'F13 [F13] water: pass 0 head=dry shore=hit r=1 land=none y=64.3 o2=0 probes=0 at=[-149,64,409]',
  'F13 [F13] water: drowning rescue start (drowning, oxygen 0)',
  'F13 [F13] water: rescue complete in 1.2s'
]

test('o2Gap reads the live face-43 deaths: both rescues STALE, the sentry joined (F13 wet @last, F1 wet live)', () => {
  const r = o2Gap(face43Mini)
  assert.equal(r.deaths, 2)
  assert.deepEqual(r.rescue, { live: 0, stale: 2, never: 0 })
  assert.deepEqual(r.wet, { live: 1, atLast: 1, unknown: 0 })
  assert.deepEqual(r.lastPass, { seen: 2, none: 0 })
  const f13 = r.perBot.F13
  assert.equal(f13.o2, 'reset(-1)')
  assert.equal(f13.rescueKind, 'stale')
  assert.equal(f13.rescueAgo, 42)
  assert.equal(f13.wetKind, 'atLast')
  assert.equal(f13.wetS, 3)
  assert.equal(f13.leg, 'fuel commons walk @-145,391')
  assert.deepEqual(f13.lastPass, { pass: 10, head: 'dry', o2: { kind: 'value', value: 20 } })
  const f1 = r.perBot.F1
  assert.equal(f1.rescueAgo, 166)
  assert.equal(f1.wetS, 26)
  assert.deepEqual(f1.lastPass, { pass: 10, head: 'wet', o2: { kind: 'value', value: 20 } })
})

test('o2Gap splits the rescue relation (active is live, Ns ago is the re-entry class)', () => {
  const r = o2Gap([
    'F5 [F5] death: drown context (o2 3, feet water wl, head water, rescue active, leg unknown, wet 12s)',
    'F9 [F9] death: drown context (o2 0, feet water, head air, rescue never, leg wood trip, wet 0s)',
    'F2 [F2] death: drown context (o2 12, feet water, head water, rescue 7s ago, leg approach segment, wet 9s)'
  ])
  assert.equal(r.deaths, 3)
  assert.deepEqual(r.rescue, { live: 1, stale: 1, never: 1 })
  assert.equal(r.perBot.F5.rescueKind, 'live')
  assert.equal(r.perBot.F5.rescueAgo, null)
  assert.equal(r.perBot.F9.rescueKind, 'never')
  assert.equal(r.perBot.F2.rescueAgo, 7)
  // the waterlogged flag rides the feet slot verbatim
  assert.equal(r.perBot.F5.feet, 'water wl')
  assert.equal(r.perBot.F5.o2, '3')
})

test('o2Gap joins the last pass AT OR BEFORE the death (a post-respawn pass never joins, a mid-stream pass does)', () => {
  const r = o2Gap([
    'F4 [F4] water: pass 2 head=wet shore=none land=n/a y=50.1 o2=8 probes=0 at=[-130,50,400]',
    'F4 [F4] death: drown context (o2 0, feet water, head water, rescue never, leg unknown, wet 18s)',
    'F4 [F4] water: pass 0 head=dry shore=none land=none y=64.0 o2=20 probes=0 at=[-131,64,401]',
    'F4 [F4] water: pass 3 head=wet shore=none land=n/a y=52.2 o2=14 probes=0 at=[-131,52,401]',
    'F4 [F4] death: drown context (o2 14, feet water, head water, rescue 5s ago, leg fuel commons walk, wet 4s)'
  ])
  assert.equal(r.deaths, 2)
  assert.equal(r.perBot.F4.rescueKind, 'stale') // the perBot row is LAST-WINS (the second death overwrites; the counts hold both)
  assert.equal(r.perBot.F4.rescueAgo, 5)
  assert.deepEqual(r.wet, { live: 2, atLast: 0, unknown: 0 })
  assert.deepEqual(r.rescue, { live: 0, stale: 1, never: 1 })
})

test('o2Gap counts the sentry-join coverage honestly (a death with no prior pass reads none)', () => {
  const r = o2Gap(['F8 [F8] death: drown context (o2 ?, feet unknown, head water, rescue never, leg unknown, wet unknown)'])
  assert.deepEqual(r.lastPass, { seen: 0, none: 1 })
  assert.equal(r.perBot.F8.lastPass, null)
  assert.equal(r.perBot.F8.o2, '?')
  assert.equal(r.perBot.F8.wetKind, 'unknown')
  assert.equal(r.perBot.F8.wetS, null)
})

test('o2Gap never matches the sibling lanes (the anchor law: rescue lines, the suffocate sibling, the unmirrored tag)', () => {
  assert.ok(!DROWN_CONTEXT_RE.test('F13 [F13] water: drowning rescue start (drowning, oxygen 0)'))
  assert.ok(!DROWN_CONTEXT_RE.test('F13 [F13] water: rescue complete in 1.2s'))
  assert.ok(!DROWN_CONTEXT_RE.test('F13 [F13] death: suffocate context (head gravel, o2 12, leg unknown)'))
  assert.ok(!DROWN_CONTEXT_RE.test('F3 death: drown context (o2 0, feet water, head water, rescue active, leg unknown, wet 12s)'))
  assert.ok(!DROWN_CONTEXT_RE.test('F13 [F13] death: drown context (o2 reset(-1), feet water, head water, rescue sometime, leg x, wet 3s)'))
})

test('o2Gap is junk-safe and nulls on non-array (the laws)', () => {
  assert.equal(o2Gap(null), null)
  assert.equal(o2Gap('x'), null)
  assert.deepEqual(o2Gap([null, 7, 'garbage', 'F13 [F13] water: rescue complete in 1.2s']), { deaths: 0, rescue: { live: 0, stale: 0, never: 0 }, wet: { live: 0, atLast: 0, unknown: 0 }, lastPass: { seen: 0, none: 0 }, perBot: {} })
})
