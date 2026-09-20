// waitForWaterRescueClear (v0.18.2) - the bounded clear-wait for the drowning
// rescue walk interlock. Pure scheduling maths over a mock bot, fake clock -
// no server, no real timers.
//
// Measured background (CI run 35511474490): the smelt bot's furnace walk was
// refused x3 at 500 ms apart, ALL inside the rescue's 25 s window, and the
// visit aborted 'machine unreachable' while the rescue would have cleared.
// The gate itself (gotoSafe) must stay fail-fast; retrying callers wait.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { waitForWaterRescueClear } from '../../src/lib/jobqueue.mjs'
import { RESCUE_MAX_MS } from '../../src/lib/drowning.mjs'

// mock bot factory: every test injects its own fake clock (or forbids sleeping)
function mockBot () {
  return { bot: { _waterRescue: true }, slices: [] }
}

test('rescue already clear: returns true without sleeping', async () => {
  const { bot, slices } = mockBot()
  bot._waterRescue = false
  const ok = await waitForWaterRescueClear(bot, { sleep: () => { throw new Error('must not sleep') } })
  assert.equal(ok, true)
  assert.equal(slices.length, 0)
})

test('rescue clears mid-wait: true with poll-sized slices', async () => {
  const { bot, slices } = mockBot()
  const ok = await waitForWaterRescueClear(bot, { maxMs: 30000, pollMs: 1000, sleep: (async ms => { slices.push(ms); if (slices.length >= 4) bot._waterRescue = false }) })
  assert.equal(ok, true)
  assert.deepEqual(slices, [1000, 1000, 1000, 1000])
})

test('rescue never clears: false at exactly maxMs, last slice clipped to the budget', async () => {
  const { bot, slices } = mockBot()
  const ok = await waitForWaterRescueClear(bot, { maxMs: 2500, pollMs: 1000, sleep: (async ms => { slices.push(ms) }) })
  assert.equal(ok, false)
  assert.equal(bot._waterRescue, true)
  assert.deepEqual(slices, [1000, 1000, 500]) // 1000 + 1000 + clipped remainder
  const total = slices.reduce((a, b) => a + b, 0)
  assert.equal(total, 2500)
})

test('default budget is the rescue window + margin', async () => {
  const { bot, slices } = mockBot()
  await waitForWaterRescueClear(bot, { pollMs: 5000, sleep: (async ms => { slices.push(ms) }) })
  const total = slices.reduce((a, b) => a + b, 0)
  assert.equal(total, RESCUE_MAX_MS + 5000)
})

test('junk options fall back to safe defaults; absent bot returns false', async () => {
  assert.equal(await waitForWaterRescueClear(null), false)
  assert.equal(await waitForWaterRescueClear(undefined), false)
  const { bot } = mockBot()
  const ok = await waitForWaterRescueClear(bot, { maxMs: NaN, pollMs: -5, sleep: (async () => { bot._waterRescue = false }) })
  assert.equal(ok, true) // junk options degrade to defaults, not a hang
})

