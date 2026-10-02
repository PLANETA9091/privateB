//
// assistledger.test.mjs - THE ASSIST LEDGER (v0.499.0) unit tests.
// The lines are byte-verbatim from the stored faces (face 42 = run
// 36967273918, face 43 = run 36970605824, fleet19.log), hand-traced
// line by line first, then pinned. The join law: every pounce
// handoff joins forward to the bot's next climb-lane boundary; the
// transparent prose never closes; a boundary closes every pending
// handoff of the bot (the F3 shared-boundary law).
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assistLedger, whyClass, WALKABLE_RISE_RE, FINAL_CLIMB_RE
} from '../../src/lib/assistledger.mjs'
import { POUNCE_GUARD_RE, POUNCE_STALL_RE, POUNCE_SIGNATURE_RE } from '../../src/lib/pouncebook.mjs'

// Face 42's pounce handoffs and their boundaries, verbatim and in
// the live order with the interleaved prose the join must skip: the
// chest-skip lane, the retry gate, the attempt opener.
const FACE42_MINI = [
  'F16 [F16] climb pounce probe: the guard declined (wet feet) - the ladder owns the level', // THE HANDOFF
  'F16 [F16] climb diag: level at y=62 did not rise (food=20, dug=1) feet=air support=stone step=air head=air', // the diag prose - never a boundary
  'F16 [F16] chest skip (vertical doom: the yard stands 31 levels up over 7b lateral - the walk ladder cannot climb)', // the other lane
  'F16 [F16] climb: walkable surface at y=63 (+1 levels, dug=0) - the walk takes over (blocked step)', // F16 ROSE +1
  'F16 climb out (pre-position): failed - stalled', // AFTER the rose - never read (the first boundary closed it)
  'F18 [F18] climb pounce probe: the signature declined (support=air, step=air, head=air) - the well census continues', // a probe - never a boundary
  'F18 final climb: the yard stands 30 levels up over 5b lateral - climbing toward the yard\'s level (the walk ladder cannot climb)', // the opener - transparent
  'F18 [F18] climb pounce: did not rise (back 4t + jump 24t toward -1,0) - the assist ladder owns it', // THE HANDOFF
  'F18 final climb: failed - low-o2' // F18 DIED low-o2
]

// Face 43's six handoffs: two rides to yard-scale roses, the wet
// fence deaths, and F3's PAIR sharing one attempt tail.
const FACE43_MINI = [
  'F18 [F18] climb pounce: did not rise (back 4t + jump 24t toward 1,0) - the assist ladder owns it', // HANDOFF 1
  'F18 [F18] climb: walkable surface at y=69 (+26 levels, dug=68) - the walk takes over (blocked step)', // ROSE +26
  'F18 climb out (wood trip): OK +26 levels (24 steps, 68 dug, undefineds)', // the later verdict - never read
  'F1 [F1] climb pounce probe: the guard declined (wet feet) - the ladder owns the level', // HANDOFF 2
  'F1 final climb: no retry (slice left 6s < min 20s)', // the retry gate - TRANSPARENT
  'F1 [F1] climb: walkable surface at y=79 (+27 levels, dug=29) - the walk takes over (blocked step)', // ROSE +27
  'F1 final climb: OK +27 levels (8 steps, 29 dug, 1 traversed, undefineds)',
  'F8 [F8] climb pounce probe: the guard declined (wet feet) - the ladder owns the level', // HANDOFF 3
  'F8 final climb: failed - wet wall', // DIED wet wall
  'F14 [F14] climb pounce probe: the guard declined (wet feet) - the ladder owns the level', // HANDOFF 4
  'F14 final climb: no retry (slice left 6s < min 20s)', // transparent
  'F14 final climb: failed - timeout (fenced at 90s - the chain keeps its reserve)', // DIED timeout
  'F3 [F3] climb pounce probe: the guard declined (wet feet) - the ladder owns the level', // HANDOFF 5
  'F3 final climb: no retry (slice left 15s < min 20s)', // transparent
  'F3 final climb: failed - timeout (fenced at 90s - the chain keeps its reserve)', // F3's guard DIES here
  'F3 [F3] climb pounce: did not rise (back 4t + jump 24t toward 1,0) - the assist ladder owns it', // HANDOFF 6 (the STALL)
  'F3 final climb: failed - timeout (fenced at 90s - the chain keeps its reserve)' // F3's stall DIES on the SAME tail
]

test('v0.499.0 face-42 mini: the guard\'s level rose +1, the stall\'s attempt died low-o2, the prose never closes', () => {
  const g = assistLedger(FACE42_MINI)
  assert.equal(g.totals.handoffs, 2)
  assert.equal(g.totals.guardWet, 1)
  assert.equal(g.totals.stalls, 1)
  assert.equal(g.totals.rose, 1)
  assert.equal(g.totals.roseLevels, 1)
  assert.equal(g.totals.died, 1)
  assert.deepEqual(g.totals.diedWhys, { 'low-o2': 1 })
  assert.equal(g.totals.open, 0)
  // The book law.
  assert.equal(g.totals.handoffs, g.totals.rose + g.totals.attemptOk + g.totals.died + g.totals.open)
  // The rows read in order: F16's ownership TRUE (+1), F18's FALSE (low-o2).
  assert.deepEqual(g.rows.map(r => `${r.bot}/${r.kind}->${r.cls}`), ['F16/guard->rose', 'F18/stall->died'])
  assert.equal(g.rows[0].levels, 1)
  assert.equal(g.rows[1].why, 'low-o2')
  // F16's LATER 'climb out: failed - stalled' never re-read (the
  // first boundary closed the handoff - the ringafter law).
  assert.ok(!g.rows.some(r => r.why === 'stalled'))
})

test('v0.499.0 face-43 mini: two yard-scale roses, the wet fence deaths, F3\'s pair shares one attempt tail', () => {
  const g = assistLedger(FACE43_MINI)
  assert.equal(g.totals.handoffs, 6)
  assert.equal(g.totals.rose, 2)
  assert.equal(g.totals.roseLevels, 53) // +26 +27 - THE YARD SCALE
  assert.equal(g.totals.died, 4)
  assert.deepEqual(g.totals.diedWhys, { 'wet wall': 1, timeout: 3 })
  assert.equal(g.totals.open, 0)
  // THE SHARED BOUNDARY LAW: F3's guard AND stall both read the same
  // final-climb death (the attempt-tail collapse).
  const f3 = g.rows.filter(r => r.bot === 'F3')
  assert.equal(f3.length, 2)
  assert.deepEqual(f3.map(r => r.cls), ['died', 'died'])
  assert.deepEqual(f3.map(r => r.kind), ['guard', 'stall'])
  // The retry gates closed nothing: F1's 'no retry' is transparent -
  // the walkable surface after it is the boundary that rose.
  const f1 = g.rows.find(r => r.bot === 'F1')
  assert.equal(f1.cls, 'rose')
  assert.equal(f1.levels, 27)
})

test('v0.499.0 both faces aggregate: 8 handoffs, book 8/8 - rose 3 (+54) / died 5 (timeout 3, wet wall 1, low-o2 1)', () => {
  const g = assistLedger([...FACE42_MINI, ...FACE43_MINI])
  const t = g.totals
  assert.equal(t.handoffs, 8)
  assert.equal(t.guardWet, 5)
  assert.equal(t.guardCap, 0) // the cap never spent - kept honest
  assert.equal(t.stalls, 3)
  assert.equal(t.rose, 3)
  assert.equal(t.roseLevels, 54)
  assert.equal(t.attemptOk, 0)
  assert.equal(t.died, 5)
  assert.equal(t.open, 0)
  assert.deepEqual(t.diedWhys, { 'low-o2': 1, 'wet wall': 1, timeout: 3 })
  // THE BOOK LAW: handoffs = rose + attemptOk + died + open.
  assert.equal(t.handoffs, t.rose + t.attemptOk + t.died + t.open)
  // THE HANDOFF'S PRICE: the ladder's ownership died 5/8.
  assert.ok(t.died > t.rose)
  // Per-bot: F3 the only bot with two handoffs.
  assert.equal(g.bots.F3.handoffs, 2)
  assert.equal(g.bots.F16.rose, 1)
  assert.equal(g.bots.F8.died, 1)
})

test('v0.499.0 the attemptOk class and the open class: the verdict-first join and the honest tail', () => {
  // The attempt verdict OK as the FIRST boundary (no walkable line):
  // the rise landed inside the machinery.
  const g = assistLedger([
    'F5 [F5] climb pounce: did not rise (back 4t + jump 24t toward 1,0) - the assist ladder owns it',
    'F5 climb out (trip): OK +9 levels (9 steps, 26 dug, 22s)'
  ])
  assert.equal(g.totals.attemptOk, 1)
  assert.equal(g.rows[0].cls, 'attemptOk')
  assert.equal(g.totals.handoffs, g.totals.rose + g.totals.attemptOk + g.totals.died + g.totals.open)
  // The final-climb OK as the first boundary.
  const g2 = assistLedger([
    'F7 [F7] climb pounce probe: the guard declined (wet feet) - the ladder owns the level',
    'F7 final climb: OK +12 levels (11 steps, 30 dug, undefineds)'
  ])
  assert.equal(g2.totals.attemptOk, 1)
  // The tail: no boundary - the honest open.
  const g3 = assistLedger([
    'F9 [F9] climb pounce: did not rise (back 4t + jump 24t toward -1,0) - the assist ladder owns it',
    'F9 [F9] climb diag: level at y=70 did not rise (food=20, dug=3) feet=air support=stone step=air head=air'
  ])
  assert.equal(g3.totals.open, 1)
  assert.equal(g3.rows[0].cls, 'open')
  assert.equal(g3.totals.handoffs, 1)
})

test('v0.499.0 the transparent prose battery: the openers, the retry gates, the other lanes, the cap-spent guard', () => {
  const g = assistLedger([
    'F4 [F4] climb pounce probe: the guard declined (the cap spent) - the ladder owns the level', // the cap class
    'F4 final climb: the yard stands 25 levels up over 9b lateral - climbing toward the yard\'s level (the walk ladder cannot climb)', // opener
    'F4 final climb: no retry (slice left 3s < min 20s)', // gate
    'F4 [F4] chest skip (vertical doom: the yard stands 25 levels up over 9b lateral - the walk ladder cannot climb)', // other lane
    'F4 chest ascent: refused (the clock 68s cannot fund the 45s climb + the 30s walk floor) - the skip stands', // other lane
    'F4 final climb: failed - stalled' // THE boundary
  ])
  assert.equal(g.totals.handoffs, 1)
  assert.equal(g.totals.guardCap, 1)
  assert.equal(g.totals.died, 1)
  assert.equal(g.rows[0].why, 'stalled')
})

test('v0.499.0 the one-parser pin: the boundary grammar is this lib\'s own, the pounce skins are pouncebook\'s own', () => {
  // The pounce REs are imported, not re-created: the handoff lines
  // match THEIR REs and never mine; the boundary lines match MINE
  // and never theirs.
  const guard = 'F16 [F16] climb pounce probe: the guard declined (wet feet) - the ladder owns the level'
  const stall = 'F18 [F18] climb pounce: did not rise (back 4t + jump 24t toward -1,0) - the assist ladder owns it'
  const walk = 'F16 [F16] climb: walkable surface at y=63 (+1 levels, dug=0) - the walk takes over (blocked step)'
  const fin = 'F18 final climb: failed - low-o2'
  assert.ok(POUNCE_GUARD_RE.exec(guard))
  assert.ok(POUNCE_STALL_RE.exec(stall))
  assert.ok(!WALKABLE_RISE_RE.exec(guard) && !FINAL_CLIMB_RE.exec(guard))
  assert.ok(!WALKABLE_RISE_RE.exec(stall) && !FINAL_CLIMB_RE.exec(stall))
  assert.ok(WALKABLE_RISE_RE.exec(walk))
  assert.ok(!POUNCE_GUARD_RE.exec(walk) && !POUNCE_STALL_RE.exec(walk))
  assert.ok(FINAL_CLIMB_RE.exec(fin))
  assert.ok(!FINAL_CLIMB_RE.exec('F14 final climb: no retry (slice left 6s < min 20s)'))
  assert.ok(!FINAL_CLIMB_RE.exec('F1 final climb: the yard stands 27 levels up over 20b lateral - climbing toward the yard\'s level (the walk ladder cannot climb)'))
  // A signature-decline probe never opens a handoff (it names the
  // gate's census, not the ladder's ownership).
  const g = assistLedger([POUNCE_SIGNATURE_RE.source && 'F9 [F9] climb pounce probe: the signature declined (support=air, step=air, head=air) - the well census continues'])
  assert.equal(g.totals.handoffs, 0)
})

test('v0.499.0 the why-class head and the junk battery: raw whys trimmed, non-strings skipped, the honest zero', () => {
  assert.equal(whyClass('timeout (fenced at 90s - the chain keeps its reserve)'), 'timeout')
  assert.equal(whyClass('wet wall'), 'wet wall')
  assert.equal(whyClass('low-o2'), 'low-o2')
  assert.equal(whyClass('stalled [stage 2]'), 'stalled')
  assert.equal(whyClass(''), '')
  assert.equal(whyClass(null), '')
  assert.equal(assistLedger(null), null)
  assert.equal(assistLedger(undefined), null)
  assert.equal(assistLedger('F16 [F16] climb pounce probe'), null)
  const zero = assistLedger([])
  assert.equal(zero.totals.handoffs, 0)
  assert.deepEqual(zero.rows, [])
  const mixed = ['F16 [F16] climb pounce probe: the guard declined (wet feet) - the ladder owns the level', 42, null, {}, true]
  assert.equal(assistLedger(mixed).totals.handoffs, 1)
  assert.equal(assistLedger(mixed).totals.open, 1) // the boundary never came
  // The failed detail rides INSIDE the capture group (the RE is
  // tail-greedy by design - the why-class head trims it back off).
  const m = FINAL_CLIMB_RE.exec('F18 final climb: failed - low-o2 (the fences keep)')
  assert.ok(m)
  assert.equal(whyClass(m[3]), 'low-o2')
})
