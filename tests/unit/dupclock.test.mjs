import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dupClock, unseenLosses, surplusKicks, burstDoor, DUP_BURST_MIN, DUP_BURST_WINDOW_S, DUP_METRO_MIN, DUP_METRO_SPREAD, ECHO_SHUTDOWN_MIN } from '../../src/lib/dupclock.mjs'

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

// The 54th face's own door (run 37557552795), byte-verbatim from the
// server log: F1 lost eleven sessions 01:55:27..01:56:48 - the FIRST gap
// (15s) is the lead-in, the tail's nine gaps (5..9s) lock a clock the
// metronome's whole-gap spread bar (15/5 = 3.0) never saw.
const F1_DOOR = [
  '[01:55:27] [Server thread/INFO]: F1 lost connection: You logged in from another location',
  '[01:55:42] [Server thread/INFO]: F1 lost connection: You logged in from another location',
  '[01:55:51] [Server thread/INFO]: F1 lost connection: You logged in from another location',
  '[01:55:57] [Server thread/INFO]: F1 lost connection: You logged in from another location',
  '[01:56:04] [Server thread/INFO]: F1 lost connection: You logged in from another location',
  '[01:56:09] [Server thread/INFO]: F1 lost connection: You logged in from another location',
  '[01:56:16] [Server thread/INFO]: F1 lost connection: You logged in from another location',
  '[01:56:23] [Server thread/INFO]: F1 lost connection: You logged in from another location',
  '[01:56:31] [Server thread/INFO]: F1 lost connection: You logged in from another location',
  '[01:56:40] [Server thread/INFO]: F1 lost connection: You logged in from another location',
  '[01:56:48] [Server thread/INFO]: F1 lost connection: You logged in from another location'
]

test("the burst's own door (v0.739.0): the 54th's F1 rode a 15s lead-in then locked a 7s clock", () => {
  const d = dupClock(F1_DOOR)
  assert.equal(d.bursts.n, 1)
  const b = d.bursts.list[0]
  assert.equal(b.bot, 'F1')
  assert.equal(b.n, 11)
  assert.equal(b.spanS, 81)
  assert.deepEqual(b.gaps, [15, 9, 6, 7, 5, 7, 7, 8, 9, 8])
  assert.equal(b.periodic, false, 'the whole-gap spread 15/5 = 3.0 fails the metro bar - the 54th is the near-miss, not the metronome')
  const door = burstDoor(d.bursts.list)
  assert.ok(door, 'the door opens - the timer past the lead-in is real')
  assert.deepEqual(door, {
    n: 1,
    list: [{ bot: 'F1', n: 11, spanS: 81, leadInS: 15, tailN: 9, tailMedianS: 7, tailMinS: 5, tailMaxS: 9 }]
  })
  // the door's own story, asserted: the lead-in is the burst's widest gap
  assert.equal(b.gaps[0], Math.max(...b.gaps), 'the widest ride precedes the lock - the door\'s own shape')
})

test("the burst's own door: the fences hold - the metronome, the noisy tail, the small burst", () => {
  // the metronome's own row owns the clock: the 50th's F5 burst is
  // periodic (spread 2.1 whole) - the door adds nothing, the silence.
  const metro = dupClock([
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
  ])
  assert.equal(metro.bursts.list[0].periodic, true)
  assert.equal(burstDoor(metro.bursts.list), null, 'the clock named whole - the door never re-opens it')
  // the noisy tail: the lead-in AND the tail both breathe past the bar -
  // no clock anywhere, the plain burst's own silence.
  const noisy = dupClock([
    '[10:00:00] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:00:05] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:00:07] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:00:17] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:00:19] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:00:29] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:00:31] [Server thread/INFO]: F6 lost connection: You logged in from another location',
    '[10:00:41] [Server thread/INFO]: F6 lost connection: You logged in from another location'
  ])
  assert.equal(noisy.bursts.list[0].periodic, false)
  assert.equal(burstDoor(noisy.bursts.list), null, 'tail spread 5 - the noise owns the whole burst')
  // the small burst: the 48th's F3 lost four in 36s - under the metro
  // volume bar, the door never opens for the ladder's own pace.
  const small = dupClock([
    '[21:24:36] [Server thread/INFO]: F3 lost connection: You logged in from another location',
    '[21:24:54] [Server thread/INFO]: F3 lost connection: You logged in from another location',
    '[21:25:00] [Server thread/INFO]: F3 lost connection: You logged in from another location',
    '[21:25:12] [Server thread/INFO]: F3 lost connection: You logged in from another location'
  ])
  assert.equal(burstDoor(small.bursts.list), null, 'four losses is the ladder\'s pace, not a timer - the volume bar holds')
})

test("the burst's own door: the junk fence and the honest silences", () => {
  assert.equal(burstDoor(null), null)
  assert.equal(burstDoor('junk'), null)
  assert.equal(burstDoor([]), null)
  assert.equal(burstDoor([null, 'junk', 42, { periodic: false, gaps: [] }]), null, 'gap-less and non-object cells read the silence')
  // the junk filter is the read's own normalization: a polluted gaps list
  // (zero/NaN/negative bytes) drops the junk and reads the SAME door byte
  // for byte - the shape never rides the noise.
  const d = dupClock(F1_DOOR)
  const [b] = d.bursts.list
  const filtered = burstDoor([{ ...b, gaps: [0, ...b.gaps, NaN, -3] }])
  assert.deepEqual(filtered, {
    n: 1,
    list: [{ bot: 'F1', n: 11, spanS: 81, leadInS: 15, tailN: 9, tailMedianS: 7, tailMinS: 5, tailMaxS: 9 }]
  }, 'junk in, the same door out - the filter is the lib\'s own normalization')
  // the lead-in-widest guard with junk present: a narrower byte prepended
  // moves the door off the lead-in - the widest ride no longer precedes
  // the lock, the door stays shut (the story holds or the silence does).
  assert.equal(burstDoor([{ ...b, gaps: [3, ...b.gaps] }]), null, 'a 3s byte before the 15s door - the lead-in is no longer the widest ride')
  // the volume bar's own edge: exactly 8 losses (7 gaps) with a 16s
  // lead-in and a 6s tail - whole spread 2.67 fails the metro bar, tail
  // spread 1.0 locks the clock - the door opens at the bar's edge.
  const edge = dupClock([
    '[10:00:00] [Server thread/INFO]: F8 lost connection: You logged in from another location',
    '[10:00:16] [Server thread/INFO]: F8 lost connection: You logged in from another location',
    '[10:00:22] [Server thread/INFO]: F8 lost connection: You logged in from another location',
    '[10:00:28] [Server thread/INFO]: F8 lost connection: You logged in from another location',
    '[10:00:34] [Server thread/INFO]: F8 lost connection: You logged in from another location',
    '[10:00:40] [Server thread/INFO]: F8 lost connection: You logged in from another location',
    '[10:00:46] [Server thread/INFO]: F8 lost connection: You logged in from another location',
    '[10:00:52] [Server thread/INFO]: F8 lost connection: You logged in from another location'
  ])
  assert.equal(edge.bursts.list[0].n, 8)
  assert.equal(edge.bursts.list[0].periodic, false, 'whole spread 2.67 - the near-miss at the bar\'s own edge')
  assert.deepEqual(burstDoor(edge.bursts.list), {
    n: 1,
    list: [{ bot: 'F8', n: 8, spanS: 52, leadInS: 16, tailN: 6, tailMedianS: 6, tailMinS: 6, tailMaxS: 6 }]
  }, 'eight losses is the metronome\'s own volume bar - the door opens there too')
})

test("the surplus kick's own side (v0.735.0): the 52nd face's mirror names its bot", () => {
  // run 37549177806, byte-verbatim from the mine: the server's clock owns
  // 5 duplicate losses (F5/F4/F3/F19/F7, one each - the 60s storm); the
  // fleet's dup-kick census printed SIX - F2 kicked once and relogged
  // twice, the pair rider's own byte, and the server's log never owned
  // the loss. The unseen column's own join, mirrored.
  const sk = surplusKicks(
    { F2: 1, F5: 1, F4: 1, F3: 1, F19: 1, F7: 1 },
    { F5: 1, F4: 1, F3: 1, F19: 1, F7: 1 }
  )
  assert.deepEqual(sk, { n: 1, byBot: { F2: 1 } },
    'the 52nd: 1 surplus kick - the pair rider owns the mirror column')
  // the full-coverage face: every kick the server owned - no surplus.
  assert.equal(surplusKicks({ F10: 1 }, { F10: 1 }), null, 'every kick owned - the honest silence')
  // the bound holds mirrored: a server count above the fleet's clamps.
  assert.equal(surplusKicks({ F5: 2 }, { F5: 3 }), null, 'server 3 vs fleet 2 clamps at zero')
  assert.equal(surplusKicks(null, null), null, 'empty maps - the silence')
})

// ---------------------------------------------------------------------------
// (v0.741.0) THE RELOG'S OWN ECHO - the 55th face (run 37561465650), the
// server log's non-dup loss class split by the shutdown's own fence.
// Byte-verbatim from the mine: the fleet's freeze relogs were F1=3 F2=3
// F15=2, and the server's mid-run Disconnected bytes echo them (F1 3, F2 3,
// F15 1 - the session the kick already killed needs no second byte); the
// deadline's own stop dropped 18 bots in one second and F13's drain byte a
// second later - a mass the churn never touched. F13 (the metronome's own
// bot, 11 dup losses at a fixed 12s period) rode NONE of the mid-run echo:
// the kick lane fed that timer.

const ECHO_55 = [
  '[02:33:36] [Server thread/INFO]: YardSurvey lost connection: Disconnected',
  '[02:36:41] [Server thread/INFO]: F1 lost connection: Disconnected',
  '[02:36:44] [Server thread/INFO]: F13 lost connection: You logged in from another location',
  '[02:37:40] [Server thread/INFO]: F2 lost connection: Disconnected',
  '[02:38:01] [Server thread/INFO]: F1 lost connection: Disconnected',
  '[02:38:34] [Server thread/INFO]: F1 lost connection: Disconnected',
  '[02:39:26] [Server thread/INFO]: F2 lost connection: Disconnected',
  '[02:41:10] [Server thread/INFO]: F15 lost connection: Disconnected',
  '[02:42:37] [Server thread/INFO]: F2 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F3 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F4 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F5 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F6 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F8 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F9 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F10 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F11 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F12 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F14 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F16 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F17 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F19 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F1 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F18 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F7 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F2 lost connection: Disconnected',
  '[02:50:01] [Server thread/INFO]: F15 lost connection: Disconnected',
  '[02:50:02] [Server thread/INFO]: F13 lost connection: Disconnected'
]

test("the relog's own echo (v0.741.0): the 55th's mid-run echo, the mass fenced", () => {
  assert.equal(ECHO_SHUTDOWN_MIN, 5, 'the fence arms at five distinct bots in one second')
  const d = dupClock(ECHO_55)
  assert.ok(d, 'the clock opens (one dup byte rides the fixture)')
  assert.equal(d.otherLosses, 27, 'the other class counted as before - the byte-stable field')
  assert.equal(d.echo.n, 27)
  assert.equal(d.echo.midrunN, 8, 'the bytes before the mass are the relog lane echo')
  assert.deepEqual(d.echo.midrunByBot, { YardSurvey: 1, F1: 3, F2: 3, F15: 1 },
    'F1 3/3 and F2 3/3 exact against the fleet relogs; F15 1/2 - the kick already killed that session')
  assert.equal(d.echo.shutdownN, 19, '18 bots in the mass second + the drain byte the next second')
  assert.deepEqual(d.echo.shutdownByBot, {
    F1: 1, F2: 1, F3: 1, F4: 1, F5: 1, F6: 1, F7: 1, F8: 1, F9: 1, F10: 1,
    F11: 1, F12: 1, F13: 1, F14: 1, F15: 1, F16: 1, F17: 1, F18: 1, F19: 1
  }, 'the mass names every bot once - the stop is the stop')
  assert.equal(d.echo.byBot.F1, 4, 'the whole-class fold keeps both lanes (3 echo + 1 stop)')
})

test("the shutdown fence's own edges: four bots stay mid-run, five arm, the drain follows, the mass is monotone", () => {
  // four distinct bots in one second - the churn's own crowd, no fence
  const four = dupClock([
    '[05:00:00] [Server thread/INFO]: F1 lost connection: You logged in from another location',
    '[05:09:59] [Server thread/INFO]: F1 lost connection: Disconnected',
    '[05:09:59] [Server thread/INFO]: F2 lost connection: Disconnected',
    '[05:09:59] [Server thread/INFO]: F3 lost connection: Disconnected',
    '[05:09:59] [Server thread/INFO]: F4 lost connection: Disconnected'
  ])
  assert.equal(four.echo.shutdownN, 0, 'four distinct bots never arm the fence')
  assert.equal(four.echo.midrunN, 4)
  // five arms; the drain byte the next second follows; a byte 10s after
  // the mass fences too (the mass is monotone - nothing meaningful follows)
  const armed = dupClock([
    '[05:00:00] [Server thread/INFO]: F1 lost connection: You logged in from another location',
    '[05:09:59] [Server thread/INFO]: F1 lost connection: Disconnected',
    '[05:09:59] [Server thread/INFO]: F2 lost connection: Disconnected',
    '[05:09:59] [Server thread/INFO]: F3 lost connection: Disconnected',
    '[05:09:59] [Server thread/INFO]: F4 lost connection: Disconnected',
    '[05:09:59] [Server thread/INFO]: F5 lost connection: Disconnected',
    '[05:10:00] [Server thread/INFO]: F6 lost connection: Disconnected',
    '[05:10:09] [Server thread/INFO]: F7 lost connection: Disconnected'
  ])
  assert.equal(armed.echo.shutdownN, 7, 'the mass second, its drain tail and the after-byte all fence')
  assert.equal(armed.echo.midrunN, 0)
  // same bot five times in one second is NOT a mass - distinct is the bar
  const sameBot = dupClock([
    '[05:00:00] [Server thread/INFO]: F1 lost connection: You logged in from another location',
    '[05:09:59] [Server thread/INFO]: F1 lost connection: Disconnected',
    '[05:09:59] [Server thread/INFO]: F1 lost connection: Disconnected',
    '[05:09:59] [Server thread/INFO]: F1 lost connection: Disconnected',
    '[05:09:59] [Server thread/INFO]: F1 lost connection: Disconnected',
    '[05:09:59] [Server thread/INFO]: F1 lost connection: Disconnected'
  ])
  assert.equal(sameBot.echo.shutdownN, 0, 'five bytes from one bot is the churn, never the stop')
  assert.equal(sameBot.echo.midrunN, 5)
})

test("the echo's honest silences: a dup-only log rides zero-shaped, a loss-free log stays null, junk never counts", () => {
  const dupOnly = dupClock([
    '[10:00:00] [Server thread/INFO]: F5 lost connection: You logged in from another location',
    '[10:00:10] [Server thread/INFO]: F5 lost connection: You logged in from another location'
  ])
  assert.deepEqual(dupOnly.echo, { n: 0, byBot: {}, midrunN: 0, midrunByBot: {}, shutdownN: 0, shutdownByBot: {} },
    'no other bytes - the echo rides zero-shaped, the clock\'s older fields untouched')
  assert.equal(dupClock([]), null, 'the loss-free log keeps the null contract')
  assert.equal(dupClock(null), null)
  assert.equal(dupClock(['not a loss line', '[10:00:00] KICKED: F5 something']), null,
    'junk lines never open the clock')
  // the byte-stability fence on the 48th's own fixture: the two graceful
  // Disconnected bytes ride the echo mid-run, the older fields unchanged
  const era = dupClock(ERA)
  assert.equal(era.echo.n, 2, 'the 48th carried two other bytes (YardSurvey + F9)')
  assert.deepEqual(era.echo.midrunByBot, { YardSurvey: 1, F9: 1 })
  assert.equal(era.echo.shutdownN, 0, 'no mass second - the churn stayed honest to the fence')
  assert.equal(era.otherLosses, 2, 'the v0.729.0 field keeps its own count')
  assert.equal(era.losses.n, 12, 'the clock\'s own loss fold untouched')
})
