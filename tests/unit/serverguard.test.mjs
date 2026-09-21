import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createServerGuard,
  isSocketLossLine,
  isTimeoutKickLine,
  serverDeathThreshold,
  probeServerPort,
  SOCKET_LOSS_RE,
  TIMEOUT_KICK_RE,
  SERVER_DEATH_WINDOW_MS
} from '../../src/lib/serverguard.mjs'

test('socket-loss lines: the run49 evidence classes are recognized', () => {
  assert.equal(isSocketLossLine('[F9] error: write EPIPE'), true)
  assert.equal(isSocketLossLine('[F5] socket error: write ECONNRESET'), true)
  assert.equal(isSocketLossLine('error: write ECONNREFUSED'), true)
  assert.equal(isSocketLossLine('error: read ETIMEDOUT'), true)
})

test('non-transport errors never count as socket loss', () => {
  assert.equal(isSocketLossLine('error: no path to goal'), false)
  assert.equal(isSocketLossLine('combat: fight started'), false)
  assert.equal(isSocketLossLine('water: drowning rescue start'), false)
  assert.equal(isSocketLossLine(undefined), false)
})

test('timeout kicks count, other kick reasons do not', () => {
  assert.equal(isTimeoutKickLine('KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"disconnect.timeout"}}}'), true)
  assert.equal(isTimeoutKickLine('KICKED: {"value":{"translate":"disconnect.generic"}}'), false)
  assert.equal(isTimeoutKickLine('disconnected (nothing)'), false)
})

test('threshold: half the fleet, floored at 3, never above the fleet size', () => {
  assert.equal(serverDeathThreshold(19), 10) // ceil(19 * 0.5) = 10
  assert.equal(serverDeathThreshold(2), 2) // floor would exceed the fleet - capped
  assert.equal(serverDeathThreshold(1), 1)
  assert.equal(serverDeathThreshold(4), 3)
  assert.equal(serverDeathThreshold(0), Infinity)
})

test('the run49 burst makes the fleet SUSPECT, not dead - the probe decides', () => {
  let t = 0
  const guard = createServerGuard({ total: 19, now: () => t })
  for (let i = 0; i < 9; i++) { t += 1000; guard.recordLoss() }
  assert.equal(guard.suspect, false, '9 of 19 is a bad day, not a burst')
  t += 1000
  guard.recordLoss()
  assert.equal(guard.suspect, true, 'the 10th loss is a fleet-wide burst - SUSPECT')
  assert.equal(guard.dead, false, 'a burst alone never executes the verdict')
})

test('run51 recovery: a re-login after the burst clears the suspect', () => {
  let t = 0
  const guard = createServerGuard({ total: 19, now: () => t })
  for (let i = 0; i < 12; i++) { t += 1000; guard.recordLoss() }
  assert.equal(guard.suspect, true)
  t += 30000
  guard.recordRelogin()
  assert.equal(guard.suspect, false, 'eight bots re-logged in run51 - the server lives')
  assert.equal(guard.dead, false)
  assert.equal(guard.relogins, 1, 'the relogin is recorded even when not suspect')
})

test('run49 funeral: a REFUSED probe during suspect declares death', () => {
  let t = 0
  const guard = createServerGuard({ total: 19, now: () => t })
  for (let i = 0; i < 12; i++) { t += 1000; guard.recordLoss() }
  t += 5000
  const v = guard.recordProbe('refused')
  assert.equal(v.dead, true, 'nothing listens on the port - dead')
  assert.equal(guard.dead, true)
  assert.equal(guard.deadAt, t)
})

test('a probe that CONNECTS during suspect clears it (tick-drowned server is alive)', () => {
  let t = 0
  const guard = createServerGuard({ total: 19, now: () => t })
  for (let i = 0; i < 12; i++) { t += 1000; guard.recordLoss() }
  t += 5000
  guard.recordProbe('ok')
  assert.equal(guard.suspect, false)
  assert.equal(guard.dead, false)
})

test('grace fallback: suspect with no probe and no relogin expires to death', () => {
  let t = 0
  const guard = createServerGuard({ total: 19, now: () => t })
  for (let i = 0; i < 12; i++) { t += 1000; guard.recordLoss() }
  assert.equal(guard.suspect, true)
  assert.equal(guard.suspectAt, 10000, 'suspect entered at the 10th loss')
  t = 10000 + 119000
  guard.pollExpiry()
  assert.equal(guard.dead, false, 'one second inside the grace')
  t += 2000
  guard.pollExpiry()
  assert.equal(guard.dead, true, '120s of silence from a suspect fleet is a funeral')
})

test('a lone bot reconnecting never suspects the server', () => {
  let t = 0
  const guard = createServerGuard({ total: 19, now: () => t })
  guard.recordLoss()
  t += SERVER_DEATH_WINDOW_MS + 1
  guard.recordLoss()
  assert.equal(guard.suspect, false, 'losses outside the window do not accumulate')
})

test('the window slides: old losses expire, a slow trickle stays harmless', () => {
  let t = 0
  const guard = createServerGuard({ total: 19, now: () => t })
  for (let i = 0; i < 9; i++) { t += 1000; guard.recordLoss() }
  t += SERVER_DEATH_WINDOW_MS + 1
  assert.equal(guard.lossesInWindow, 0, 'the read prunes: expired losses never show')
  guard.recordLoss()
  assert.equal(guard.suspect, false, 'the first 9 expired - the burst was never completed')
  assert.equal(guard.lossesInWindow, 1)
})

test('a 2-bot integration fleet trips when BOTH sockets break', () => {
  let t = 0
  const guard = createServerGuard({ total: 2, now: () => t })
  guard.recordLoss()
  assert.equal(guard.suspect, false, 'one of two is a reconnect, not a burst')
  t += 1000
  guard.recordLoss()
  assert.equal(guard.suspect, true, 'both bots at once = SUSPECT')
})

test('after the verdict the guard keeps counting for the report', () => {
  let t = 0
  const guard = createServerGuard({ total: 19, now: () => t })
  for (let i = 0; i < 12; i++) { t += 1000; guard.recordLoss() }
  t += 1000
  guard.recordProbe('refused')
  const before = guard.totalLosses
  t += 1000
  guard.recordLoss()
  assert.equal(guard.totalLosses, before + 1, 'every loss is recorded even past the verdict')
  assert.equal(guard.dead, true, 'the verdict stands')
})

test('the regexes catch the exact miner log-hook line shapes', () => {
  assert.match('[F10] socket error: write ECONNRESET', SOCKET_LOSS_RE)
  assert.match('[F6] KICKED: {"type":"compound","value":{"translate":{"type":"string","value":"disconnect.timeout"}}}', TIMEOUT_KICK_RE)
  assert.doesNotMatch('[F3] final climb: failed - stalled', SOCKET_LOSS_RE)
  assert.doesNotMatch('[F3] error: climb refused (budget)', SOCKET_LOSS_RE)
})

test('probeServerPort resolves refused on a dead port (no server in unit CI)', async () => {
  const answer = await probeServerPort({ host: '127.0.0.1', port: 1, timeoutMs: 500 })
  assert.equal(answer, 'refused')
})
