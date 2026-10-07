import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dupClock, unseenLosses, DUP_BURST_MIN, DUP_BURST_WINDOW_S, DUP_METRO_MIN, DUP_METRO_SPREAD } from '../../src/lib/dupclock.mjs'

// The 48th face's server log (run 37530997515) - the duplicate churn's
// own clock, byte-verbatim. The fleet lens printed 9 kicked lines; the
// server's clock owns 12 duplicate losses - F3 lost four sessions in
// 36s and kept walking water between them, F19 lost three in 35s and
// the fleet saw one of the three. Two real other-loss bytes ride along
// (the frozen-relog lane's graceful Disconnected) - not the churn's.

const ERA = [
  '[21:15:16] [Server thread/INFO]: YardSurvey[/127.0.0.1:43464] logged in with entity id 9 at (-126.5, 63.0, 395.5)',
  '[21:15:28] [Server thread/INFO]: YardSurvey lost connection: Disconnected',
  '[21:15:29] [Server thread/INFO]: F1[/127.0.0.1:37486] logged in with entity id 272 at (-128.5, 73.0, 391.5)',
  '[21:22:29] [Server thread/INFO]: F9 lost connection: Disconnected',
  '[21:22:37] [Server thread/INFO]: F9[/127.0.0.1:57762] logged in with entity id 2761 at (-132.7, 51.2, 407.81058119630114)',
  '[21:22:46] [Server thread/INFO]: F9 lost connection: You logged in from another location',
  '[21:22:46] [Server thread/INFO]: F9[/127.0.0.1:40562] logged in with entity id 2816 at (-132.7, 51.2, 407.81058119630114)',
  '[21:23:50] [Server thread/INFO]: F19 lost connection: You logged in from another location',
  '[21:23:50] [Server thread/INFO]: F19[/127.0.0.1:57496] logged in with entity id 3213 at (-75.7, 60.994247170924304, 375.7)',
  '[21:24:19] [Server thread/INFO]: F19 lost connection: You logged in from another location',
  '[21:24:20] [Server thread/INFO]: F19[/127.0.0.1:42116] logged in with entity id 3291 at (-63.65346519756697, 60.02903801764638, 370.57280731030136)',
  '[21:24:25] [Server thread/INFO]: F19 lost connection: You logged in from another location',
  '[21:24:25] [Server thread/INFO]: F19[/127.0.0.1:55948] logged in with entity id 3309 at (-65.67350495913382, 62.13932439085544, 371.5274968269627)',
  '[21:24:36] [Server thread/INFO]: F3 lost connection: You logged in from another location',
  '[21:24:36] [Server thread/INFO]: F3[/127.0.0.1:41894] logged in with entity id 3340 at (-71.80789189776115, 61.0, 386.50010464222817)',
  '[21:24:54] [Server thread/INFO]: F14 lost connection: You logged in from another location',
  '[21:24:54] [Server thread/INFO]: F3 lost connection: You logged in from another location',
  '[21:25:00] [Server thread/INFO]: F3 lost connection: You logged in from another location',
  '[21:25:02] [Server thread/INFO]: F1 lost connection: You logged in from another location',
  '[21:25:12] [Server thread/INFO]: F3 lost connection: You logged in from another location',
  '[21:25:13] [Server thread/INFO]: F8 lost connection: You logged in from another location',
  '[21:25:21] [Server thread/INFO]: F12 lost connection: You logged in from another location'
]

test('the 48th era: 12 duplicate losses, the cadence and the two bursts', () => {
  const d = dupClock(ERA)
  assert.ok(d, 'the clock opens on a duplicate-churn face')
  assert.equal(d.losses.n, 12)
  assert.deepEqual(d.losses.byBot, { F9: 1, F19: 3, F3: 4, F14: 1, F1: 1, F8: 1, F12: 1 })
  assert.equal(d.losses.first, '21:22:46')
  assert.equal(d.losses.last, '21:25:21')
  assert.deepEqual(d.losses.cadence.F3, [18, 6, 12])
  assert.deepEqual(d.losses.cadence.F19, [29, 6])
  assert.ok(!d.losses.cadence.F9, 'a single loss has no cadence')
  assert.equal(d.bursts.n, 2)
  assert.deepEqual(d.bursts.list[0], { bot: 'F3', n: 4, spanS: 36, first: '21:24:36', last: '21:25:12', gaps: [18, 6, 12], medianGapS: 12, periodic: false })
  assert.deepEqual(d.bursts.list[1], { bot: 'F19', n: 3, spanS: 35, first: '21:23:50', last: '21:24:25', gaps: [29, 6], medianGapS: 17.5, periodic: false })
  assert.deepEqual(d.storm, { n: 9, bots: 5, first: '21:24:19', last: '21:25:13' })
  assert.equal(d.otherLosses, 2, 'the graceful disconnects are counted, not priced')
})

test('the burst bars: two in the window out, three on the boundary in, a broken run out', () => {
  assert.equal(DUP_BURST_MIN, 3)
  assert.equal(DUP_BURST_WINDOW_S, 60)
  assert.equal(DUP_METRO_MIN, 8)
  assert.equal(DUP_METRO_SPREAD, 2.5)
  const two = dupClock([
    '[10:00:00] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[10:00:10] [Server thread/INFO]: F5 lost connection: You logged in from another location'
  ])
  assert.equal(two.bursts.n, 0, 'two losses is the churn doing its job, not the loop')
  const boundary = dupClock([
    '[10:00:00] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[10:01:00] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[10:02:00] [Server thread/INFO]: F5 lost connection: You logged in from another location'
  ])
  assert.equal(boundary.bursts.n, 1, 'a 60s gap is still inside the window (<=)')
  assert.deepEqual(boundary.bursts.list[0].gaps, [60, 60])
  const broken = dupClock([
    '[10:00:00] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[10:00:30] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[10:01:31] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[10:01:45] [Server thread/INFO]: F5 lost connection: You logged in from another location'
  ])
  assert.equal(broken.bursts.n, 0, 'the 61s gap splits the run - the patience held once')
})

test('the storm window: the busiest 60s across bots, ties keep the first window', () => {
  const d = dupClock([
    '[10:00:00] [Server thread/INFO]: F1 lost connection: You logged in from another location',
    '[10:00:05] [Server thread/INFO]: F2 lost connection: You logged in from another location',
    '[10:00:10] [Server thread/INFO]: F1 lost connection: You logged in from another location',
    '[10:00:15] [Server thread/INFO]: F3 lost connection: You logged in from another location',
    '[10:00:20] [Server thread/INFO]: F2 lost connection: You logged in from another location',
    '[10:03:00] [Server thread/INFO]: F4 lost connection: You logged in from another location'
  ])
  assert.deepEqual(d.storm, { n: 5, bots: 3, first: '10:00:00', last: '10:00:20' })
  assert.equal(d.bursts.n, 0, 'interleaved bots never burst per-bot - the storm is the fleet row')
})

test('the metronome skin: the 50th\'s F5 lost eleven sessions at a fixed period', () => {
  const F5 = [
    '[22:38:30] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[22:38:47] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[22:38:57] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[22:39:05] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[22:39:13] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[22:39:26] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[22:39:36] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[22:39:48] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[22:39:56] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[22:40:06] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[22:40:19] [Server thread/INFO]: F5 lost connection: You logged in from another location'
  ]
  const d = dupClock(F5)
  assert.equal(d.bursts.n, 1)
  assert.equal(d.bursts.list[0].n, 11)
  assert.equal(d.bursts.list[0].spanS, 109)
  assert.deepEqual(d.bursts.list[0].gaps, [17, 10, 8, 8, 13, 10, 12, 8, 10, 13])
  assert.equal(d.bursts.list[0].medianGapS, 10)
  assert.equal(d.bursts.list[0].periodic, true, 'median 10s, spread 2.1 - the re-spawn timer\'s own rhythm')
  const seven = dupClock(F5.slice(0, 7))
  assert.equal(seven.bursts.list[0].periodic, false, '8 losses is the metro bar - seven stays the plain burst')
  const wide = dupClock([
    '[10:00:00] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:00:05] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:00:25] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:00:30] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:00:50] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:00:55] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:01:15] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:01:20] [Server thread/INFO]: F6 lost connection: You logged in from another location'
  ])
  assert.equal(wide.bursts.list[0].periodic, false, 'spread 4 - the gaps breathe, no fixed clock')
})

test('the honest silences: null shapes and the midnight carry', () => {
  assert.equal(dupClock(null), null)
  assert.equal(dupClock('junk'), null)
  assert.equal(dupClock([]), null)
  assert.equal(dupClock([
    '[10:00:00] [Server thread/INFO]: F1[/1.2.3.4:1] logged in with entity id 1 at (0, 0, 0)',
    '[10:00:05] [Server thread/INFO]: F1 lost connection: Disconnected'
  ]), null, 'joins and graceful losses are not the churn - the clock stays silent')
  const wrap = dupClock([
    '[23:59:50] [Server thread/INFO]: F7 lost connection: You logged in from another location',
    '[00:00:10] [Server thread/INFO]: F7 lost connection: You logged in from another location',
    '[00:00:30] [Server thread/INFO]: F7 lost connection: You logged in from another location'
  ])
  assert.deepEqual(wrap.bursts.list[0], { bot: 'F7', n: 3, spanS: 40, first: '23:59:50', last: '00:00:30', gaps: [20, 20], medianGapS: 20, periodic: false }, 'the midnight wrap never prices a negative gap')
})

test("the unseen loss's own column (v0.734.0): the 51st face's delta names its bots", () => {
  // run 37543519356, byte-verbatim from the mine: the server's clock owns
  // 18 duplicate losses (F16=6 F18=4 F9=3 F2=2 F13=1 F17=1 F8=1); the
  // fleet's dup-kick census printed 14 (F16=5 F18=4 F9=2 F2=2 F8=1) -
  // FOUR losses the fleet never saw, one per blind bot.
  const un = unseenLosses(
    { F16: 6, F18: 4, F9: 3, F2: 2, F13: 1, F17: 1, F8: 1 },
    { F16: 5, F18: 4, F9: 2, F2: 2, F8: 1 }
  )
  assert.deepEqual(un, { n: 4, byBot: { F16: 1, F9: 1, F13: 1, F17: 1 } },
    'the 51st: 4 unseen across 4 bots - the dead clients and the mid-relog deaths own the column')
  // the full-coverage face (the 49th's reconcile holds: 1 kick, 1 loss) -
  // the column never invents rows.
  assert.equal(unseenLosses({ F10: 1 }, { F10: 1 }), null, 'every loss seen - the honest silence')
  // the physics' own bound: a fleet count above the server's clamps at
  // zero (a kick implies a loss - never negative).
  assert.deepEqual(
    unseenLosses({ F5: 2 }, { F5: 3 }),
    null,
    'fleet 3 vs server 2 clamps at zero - the bound holds')
  assert.equal(unseenLosses(null, null), null, 'empty maps - the silence')
})
