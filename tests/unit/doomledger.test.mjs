// THE DOOMED-GOAL'S OWN CENSUS - the consult side's own tests (v0.871.0).
// The faces that price the shape: fleet 37908240844 (face 139, the
// grace's honest silence) whose four drop-walk refusals rode ages 27..36s
// - EVERY one beyond the machine 15s window, the long-window classes'
// first live shadow - and fleet 37914900444 (face 140, the ledger's big
// second face) whose single yard refusal rode age 0s (the machine class).
// The write side never prints (the v0.868.0 book's out-of-scope note) -
// this census reads the only byte the doomed-goal ledger owns: the
// consult refusal the callers log.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { doomGoalCensus, doomGoalRow, DOOM_REFUSAL_RE, DOOM_MACHINE_TTL_S, DOOM_TIMEOUT_TTL_S } from '../../src/lib/doomledger.mjs'

test('THE DOOMED-GOAL CONSTS: the two windows the age shadow reads against', () => {
  assert.equal(DOOM_MACHINE_TTL_S, 15, 'the machine ttl (CHEST_DOOM_TTL_MS) in seconds')
  assert.equal(DOOM_TIMEOUT_TTL_S, 45, 'the timeout ttl (NOPATH_TIMEOUT_TTL_MS) in seconds')
  assert.ok(DOOM_TIMEOUT_TTL_S > DOOM_MACHINE_TTL_S, 'the timeout window outlives the machine window')
})

test('THE FACE-139 VERBATIM: four drop-walk refusals, every age beyond the machine 15s - the long-window shadow is total', () => {
  // fleet 37914900444's sibling face 139 (37908240844), the four lines verbatim
  const lines = [
    'F2 [F2] vein sweep: the drop walk to [-103,43,393] failed - doomed goal (ledgered 27s ago at [-104,43,393]) - sweep drops refused (dy 0.0, range 1, walked 0.0)',
    'F2 [F2] vein sweep: the drop walk to [-103,42,393] failed - doomed goal (ledgered 27s ago at [-103,42,393]) - sweep drops refused (dy -1.0, range 2, walked 0.0)',
    'F2 [F2] vein sweep: the drop walk to [-96,41,394] failed - doomed goal (ledgered 36s ago at [-97,41,393]) - sweep drops refused (dy -1.0, range 2, walked 0.0)',
    'F2 [F2] vein sweep: the drop walk to [-96,40,394] failed - doomed goal (ledgered 36s ago at [-97,40,393]) - sweep drops refused (dy -2.0, range 2, walked 0.0)'
  ]
  const c = doomGoalCensus(lines)
  assert.equal(c.refusals, 4, 'four refusals folded')
  assert.deepEqual(c.byBot, { F2: 4 }, 'all four rode F2 (the sweep lane)')
  assert.deepEqual(c.byLabel, { 'sweep drops': 4 }, 'the label reads non-greedy - the dy rider never joins')
  assert.equal(c.ages.min, 27)
  assert.equal(c.ages.max, 36)
  assert.equal(c.ages.avg, 31.5)
  assert.equal(c.shadow15, 4, 'EVERY age > 15s - the 45s/90s classes rode all four (the write byte never named them)')
  assert.equal(c.shadow45, 0, 'no age > 45s - the 90s class not proven on this face')
  assert.equal(c.cells, 4, 'four distinct goal cells')
  assert.equal(c.repeats, 0, 'no re-records (each cell refused once)')
})

test('THE FACE-140 VERBATIM: the bank yard refusal at age 0 - the machine class, no shadow', () => {
  // fleet 37914900444, line 2491 verbatim (the caller-prefix + the Error: skin)
  const lines = [
    'F1 bank: yard walk attempt 1 failed: Error: doomed goal (ledgered 0s ago at [-119,80,412]) - walk to yard refused'
  ]
  const c = doomGoalCensus(lines)
  assert.equal(c.refusals, 1)
  assert.deepEqual(c.byBot, { F1: 1 })
  assert.deepEqual(c.byLabel, { 'walk to yard': 1 })
  assert.equal(c.ages.min, 0)
  assert.equal(c.ages.max, 0)
  assert.equal(c.ages.avg, 0)
  assert.equal(c.shadow15, 0, 'age 0 rides the machine 15s window - no long-window shadow')
  assert.equal(c.shadow45, 0)
  assert.equal(c.cells, 1)
  assert.equal(c.repeats, 0)
})

test('THE AGE SHADOW LAW: 15 is the machine ceiling, 45 is the 90s class proof line', () => {
  const c = doomGoalCensus([
    'F1 [F1] a: doomed goal (ledgered 15s ago at [0,64,0]) - walk refused',
    'F2 [F2] b: doomed goal (ledgered 16s ago at [0,64,1]) - walk refused',
    'F3 [F3] c: doomed goal (ledgered 45s ago at [0,64,2]) - walk refused',
    'F4 [F4] d: doomed goal (ledgered 46s ago at [0,64,3]) - walk refused'
  ])
  assert.equal(c.shadow15, 3, 'age 15 rides the machine window (the ceiling is INCLUSIVE on the machine side); 16, 45 and 46 all ride past it')
  assert.equal(c.shadow45, 1, 'age 45 rides the timeout window (inclusive), 46 proves the 90s class')
})

test('THE RE-RECORD SHAPE: a cell refusing twice is a repeat, never an escalation', () => {
  const c = doomGoalCensus([
    'F1 [F1] a: doomed goal (ledgered 3s ago at [-119,80,412]) - walk to yard refused',
    'F2 [F2] b: doomed goal (ledgered 31s ago at [-119,80,412]) - walk to yard refused',
    'F3 [F3] c: doomed goal (ledgered 5s ago at [-120,80,412]) - walk to yard refused'
  ])
  assert.equal(c.refusals, 3)
  assert.equal(c.cells, 2, 'two distinct cells')
  assert.equal(c.repeats, 1, 'one refusal beyond the cells\' firsts')
  assert.deepEqual(c.byLabel, { 'walk to yard': 3 }, 'the same label folded across bots')
})

test('THE CROSS-CALLER FOLD: the kernel matches mid-line, caller suffixes tolerated', () => {
  const c = doomGoalCensus([
    'F5 [F5] smelt chain: the iron walk to the machine failed: doomed goal (ledgered 9s ago at [-130,70,400]) - walk to camp furnace refused (the machine stayed cold)',
    'no tag line: doomed goal (ledgered 2s ago at [1,64,1]) - some walk refused'
  ])
  assert.equal(c.refusals, 2, 'both skins folded')
  assert.deepEqual(c.byBot, { F5: 1, '?': 1 }, 'a botless line rides ? (the honest unknown)')
  assert.deepEqual(c.byLabel, { 'walk to camp furnace': 1, 'some walk': 1 }, 'the label ends at its own refused')
})

test('THE HONEST SILENCES: a clean face prices nothing', () => {
  const c = doomGoalCensus([
    'F1 [F1] bank: deposit ok (5u)',
    'F2 [F2] vein sweep: the drop walk failed - timeout after 6973ms (the budget class is not the doomed class)',
    'F3 [F3] hop: no path ledger: chest at [-1,64,-1] cached for the fleet (1 live, ttl 15s, timeout verdict)'
  ])
  assert.equal(c.refusals, 0, 'the chest-ledger byte and the budget class are NOT the doomed kernel')
  assert.equal(c.ages, null)
  assert.equal(c.cells, 0)
  assert.equal(c.repeats, 0)
})

test('THE JUNK BATTERY: the census never invents a refusal', () => {
  for (const junk of [undefined, null, 42, {}, [], ['not a line', 5, null]]) {
    const c = doomGoalCensus(junk)
    assert.equal(c.refusals, 0, `${JSON.stringify(junk)} reads the zero shape`)
    assert.equal(c.ages, null)
  }
  // a raw blob rides too (the split law)
  const blob = doomGoalCensus('F1 [F1] a: doomed goal (ledgered 4s ago at [3,64,3]) - walk refused')
  assert.equal(blob.refusals, 1, 'a raw string splits on the newlines')
})

test('THE ROW: the fold\'s own byte, the honest nulls', () => {
  const c = doomGoalCensus([
    'F2 [F2] vein sweep: the drop walk failed - doomed goal (ledgered 27s ago at [-104,43,393]) - sweep drops refused',
    'F2 [F2] vein sweep: the drop walk failed - doomed goal (ledgered 36s ago at [-97,41,393]) - sweep drops refused',
    'F1 bank: yard walk attempt 1 failed: Error: doomed goal (ledgered 0s ago at [-119,80,412]) - walk to yard refused'
  ])
  const row = doomGoalRow(c)
  assert.equal(row, 'the doomed-goal consult: 3 refusal(s) by 2 bot(s) on 3 cell(s) (ages 0..36s avg 21.0 - beyond the machine 15s: 2, beyond the 45s window: 0) - labels: sweep drops x2, walk to yard x1', 'the row\'s byte pinned (labels ride count-desc then name-asc)')
  assert.equal(doomGoalRow(doomGoalCensus(['clean'])), null, 'a clean face renders nothing')
  assert.equal(doomGoalRow(null), null, 'junk renders nothing')
  assert.equal(doomGoalRow({}), null, 'the empty object renders nothing')
  assert.equal(doomGoalRow({ refusals: -1 }), null, 'a negative fold renders nothing (the never-invents law)')
})

test('THE REGEX BAND: the kernel is exported and mid-line anchored', () => {
  const m = DOOM_REFUSAL_RE.exec('prefix doomed goal (ledgered 12s ago at [-3,64,-4]) - the walk refused suffix')
  assert.ok(m, 'the kernel matches mid-line')
  assert.equal(m[1], '12')
  assert.equal(m[2], '-3')
  assert.equal(m[4], '-4')
  assert.equal(m[5], 'the walk', 'the label reads non-greedy up to the first refused')
})
