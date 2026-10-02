import { test } from 'node:test'
import assert from 'node:assert/strict'
import { o2Gap, DROWN_CONTEXT_RE, BREATH_MIRROR_RE } from '../../src/lib/o2gap.mjs'

// Face 43's live shapes verbatim (run 36970605824), compressed to the
// join-bearing lines: F13's pre-death passes + death at raw index 1399->
// 1586, F1's at 1877->2653, and F13's POST-respawn successful episode
// riding AFTER its death line (the trap the join law must refuse).
const face43Mini = [
  'F13 [F13] water: pass 0 head=wet shore=none land=n/a y=59.0 o2=13 probes=0 at=[-145,59,391]',
  'F13 [F13] water: pass 5 head=dry shore=hit r=5 land=none y=62.2 o2=19 probes=0 at=[-145,62,391]',
  'F13 [F13] water: pass 10 head=dry shore=hit r=1 land=none y=62.7 o2=20 probes=0 at=[-142,63,394]',
  'F13 [F13] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-142,61,391]) [the inference is blind to this kind])',
  // (v0.479.0) the mirror lines verbatim (raw 1584/2651) - the death
  // handler prints them 2 lines above their drown context
  'F13 [F13] water: breath mirror [controls-blind] - the wet-escape climb owned the controls but the sentry\'s sight died 25s before death - the o2 burned unwatched while the owner failed (the F14 36566021862 class: the snapshot was the blindness evidence) (o2 18, head dry/unknown, snapshot 25.3s old)',
  'F13 [F13] death: drown context (o2 reset(-1), feet water, head water, rescue 42s ago, leg fuel commons walk @-145,391, wet 3s@last)',
  'F1 [F1] water: pass 4 head=dry shore=hit r=4 land=none y=47.6 o2=20 probes=0 at=[-120,48,388]',
  'F1 [F1] water: pass 10 head=wet shore=none land=n/a y=46.6 o2=20 probes=0 at=[-120,47,388]',
  'F1 [F1] water: breath mirror [controls-blind] - the wet-escape climb owned the controls but the sentry\'s sight died 24s before death - the o2 burned unwatched while the owner failed (the F14 36566021862 class: the snapshot was the blindness evidence) (o2 16, head WET, snapshot 23.7s old)',
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
  // (v0.479.0) the re-entry price on the live pair: F13's mirror rode head
  // dry/unknown - the cue was there, the head-water half MISSES it
  assert.deepEqual(f13.cue, { why: 'controls-blind', o2: '18', head: 'dry/unknown', snapshot: '25.3s old', sightDiedSecs: 25 })
  assert.equal(f13.cueKind, 'cueOnly')
  const f1 = r.perBot.F1
  assert.equal(f1.rescueAgo, 166)
  assert.equal(f1.wetS, 26)
  assert.deepEqual(f1.lastPass, { pass: 10, head: 'wet', o2: { kind: 'value', value: 20 } })
  // F1's mirror rode head WET - the sight-loss + head-water trigger WOULD
  // have fired 24s before the death (the wiring's reaction window)
  assert.deepEqual(f1.cue, { why: 'controls-blind', o2: '16', head: 'WET', snapshot: '23.7s old', sightDiedSecs: 24 })
  assert.equal(f1.cueKind, 'wired')
  // the aggregate price: the wiring catches 1 of 2 as specified, the wider
  // sight-loss-only trigger catches both, the sensor gap is empty
  assert.deepEqual(r.cue, { wired: 1, cueOnly: 1, blind: 0 })
  assert.equal(r.mirrors, 2)
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
  // (v0.479.0) no mirror joined - the blind class, the cue stays null
  assert.equal(r.perBot.F8.cue, null)
  assert.equal(r.perBot.F8.cueKind, 'blind')
  assert.deepEqual(r.cue, { wired: 0, cueOnly: 0, blind: 1 })
  assert.equal(r.mirrors, 0)
})

test('o2Gap prices the mirror cue by the join law (a later life\'s mirror never joins an earlier death, the last mirror before the death wins)', () => {
  const r = o2Gap([
    'F4 [F4] water: breath mirror [no-page] - no hold and no fresh rescue - the sentry never paged (the last verdict \'shallow\', snapshot 2.0s old) (o2 12, head WET, snapshot 2.0s old)',
    'F4 [F4] death: drown context (o2 12, feet water, head water, rescue never, leg unknown, wet 8s)',
    'F4 [F4] water: breath mirror [controls-blind] - the wet-escape climb owned the controls but the sentry\'s sight died 30s before death - the o2 burned unwatched while the owner failed (the F14 36566021862 class: the snapshot was the blindness evidence) (o2 5, head WET, snapshot 29.4s old)',
    'F4 [F4] death: drown context (o2 5, feet water, head water, rescue 9s ago, leg fuel commons walk, wet 11s)'
  ])
  assert.equal(r.deaths, 2)
  // perBot is last-wins: the second death's cue (controls-blind, WET) rides
  assert.equal(r.perBot.F4.cueKind, 'wired')
  assert.equal(r.perBot.F4.cue.why, 'controls-blind')
  assert.equal(r.perBot.F4.cue.sightDiedSecs, 30)
  // the counts hold BOTH deaths: the first was wired too (no-page class,
  // head WET - the head-water half is what the wiring reads, not the class)
  assert.deepEqual(r.cue, { wired: 2, cueOnly: 0, blind: 0 })
  assert.equal(r.mirrors, 2)
})

test('o2Gap never joins a mirror that prints AFTER the death (the leakClock law holds for the cue too)', () => {
  const r = o2Gap([
    'F6 [F6] death: drown context (o2 reset(-1), feet water, head water, rescue 12s ago, leg approach segment, wet 14s)',
    'F6 [F6] water: breath mirror [controls-blind] - the wet-escape climb owned the controls but the sentry\'s sight died 20s before death - the o2 burned unwatched while the owner failed (the F14 36566021862 class: the snapshot was the blindness evidence) (o2 9, head WET, snapshot 19.1s old)'
  ])
  assert.equal(r.deaths, 1)
  assert.equal(r.mirrors, 1)
  // the mirror belongs to a later page - this death reads blind
  assert.equal(r.perBot.F6.cue, null)
  assert.equal(r.perBot.F6.cueKind, 'blind')
  assert.deepEqual(r.cue, { wired: 0, cueOnly: 0, blind: 1 })
})

test('o2Gap never matches the sibling lanes (the anchor law: rescue lines, the suffocate sibling, the unmirrored tag)', () => {
  assert.ok(!DROWN_CONTEXT_RE.test('F13 [F13] water: drowning rescue start (drowning, oxygen 0)'))
  assert.ok(!DROWN_CONTEXT_RE.test('F13 [F13] water: rescue complete in 1.2s'))
  assert.ok(!DROWN_CONTEXT_RE.test('F13 [F13] death: suffocate context (head gravel, o2 12, leg unknown)'))
  assert.ok(!DROWN_CONTEXT_RE.test('F3 death: drown context (o2 0, feet water, head water, rescue active, leg unknown, wet 12s)'))
  assert.ok(!DROWN_CONTEXT_RE.test('F13 [F13] death: drown context (o2 reset(-1), feet water, head water, rescue sometime, leg x, wet 3s)'))
})

test('BREATH_MIRROR_RE anchors the emitter\'s own words (the two head skins, the class tag, the tail census)', () => {
  // the live pair verbatim
  assert.ok(BREATH_MIRROR_RE.test('F13 [F13] water: breath mirror [controls-blind] - the wet-escape climb owned the controls but the sentry\'s sight died 25s before death - the o2 burned unwatched while the owner failed (the F14 36566021862 class: the snapshot was the blindness evidence) (o2 18, head dry/unknown, snapshot 25.3s old)'))
  assert.ok(BREATH_MIRROR_RE.test('F1 [F1] water: breath mirror [rescue-ran] - the rescue lane owned the death window (paged 1.9s before death) - its own timeline lines own the failure (o2 3, head WET, snapshot 0.4s old)'))
  // the note-less skin still matches (the emitter renders the note conditionally)
  assert.ok(BREATH_MIRROR_RE.test('F2 [F2] water: breath mirror [no-page] (o2 12, head WET, snapshot none)'))
  // the emitter prints EXACTLY two head skins - anything else refuses
  assert.ok(!BREATH_MIRROR_RE.test('F2 [F2] water: breath mirror [no-page] (o2 12, head sideways, snapshot none)'))
  assert.ok(!BREATH_MIRROR_RE.test('F2 [F2] water: breath mirror [no-page] (o2 12, snapshot none)'))
  // the mirror tag anchors (a non-mirror water line never masquerades)
  assert.ok(!BREATH_MIRROR_RE.test('F13 [F13] water: drowning rescue start (drowning, oxygen 0)'))
  assert.ok(!BREATH_MIRROR_RE.test('F13 [F13] water: breath mirror controls-blind (o2 18, head WET, snapshot 5s old)'))
  // the bot token anchors twice (the unmirrored tag refuses)
  assert.ok(!BREATH_MIRROR_RE.test('F13 [F1] water: breath mirror [no-page] (o2 12, head WET, snapshot none)'))
  // the snapshot tail anchors
  assert.ok(!BREATH_MIRROR_RE.test('F2 [F2] water: breath mirror [no-page] (o2 12, head WET, snapshot sometime)'))
})

test('o2Gap is junk-safe and nulls on non-array (the laws)', () => {
  assert.equal(o2Gap(null), null)
  assert.equal(o2Gap('x'), null)
  assert.deepEqual(o2Gap([null, 7, 'garbage', 'F13 [F13] water: rescue complete in 1.2s']), { deaths: 0, rescue: { live: 0, stale: 0, never: 0 }, wet: { live: 0, atLast: 0, unknown: 0 }, lastPass: { seen: 0, none: 0 }, cue: { wired: 0, cueOnly: 0, blind: 0 }, mirrors: 0, perBot: {} })
})
