// The login fence's behavior + wiring pins (v0.546.0).
//
// THE SEAM: the rebuild path's login leg sat BEFORE every dead-client probe the
// fleet owns (the scout's loop-top verdict 0.539.0, the miner's shift-loop
// verdict 0.541.0, the craft gate 0.542.0, the seal place fence 0.544.0) - and
// the `ready` promise both bots hand the runner settled on exactly two legs:
// 'spawn' -> resolve, 'error' -> reject. minecraft-protocol's endSocket emits
// 'end' - NOT 'error' - on every clean close path (socket close/end/timeout, a
// kick packet during LOGIN state, a server restart mid-login), and mineflayer's
// loader forwards it as bot 'end': a socket death during login settled NOTHING,
// `await miner.ready` / `await scout.ready` hung forever, the 12-attempt /
// 6-attempt rebuild loop froze above its own deadline check - the frozen book
// ONE level above the 0.539.0 defect. The silence class (TCP accepted, nothing
// ever fires) and the scout's orphaned waitForWorld throw (an async listener's
// rejection nobody awaits, ready pending forever) rode the same two-leg shape.
//
// THE WIRE: one machine (src/lib/loginfence.mjs), four settle legs, both bots
// ride it - spawn+boot resolves (a boot throw becomes a REJECTION, never an
// orphan), 'end' rejects with the reason named, 'error' rejects as before, and
// the LOGIN_READY_TIMEOUT_MS fence bounds the silent login. Settle-once: the
// first leg wins, the fence clears on every settle, a late 'end' after a
// resolved login is consumed quietly (zero unhandledRejections - the
// winnable-race law, v0.543.0).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { createLoginReady, LOGIN_READY_TIMEOUT_MS } from '../../src/lib/loginfence.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const scoutSrc = readFileSync(new URL('../../src/bots/scout.mjs', import.meta.url), 'utf8')
const fenceSrc = readFileSync(new URL('../../src/lib/loginfence.mjs', import.meta.url), 'utf8')

test('REGRESSION PIN: the fence constant stands (the silence class\'s only possible bound)', () => {
  assert.ok(fenceSrc.includes('export const LOGIN_READY_TIMEOUT_MS = 60000'), 'the 60s law stands in loginfence.mjs')
  assert.equal(Number.isInteger(LOGIN_READY_TIMEOUT_MS), true)
  assert.ok(LOGIN_READY_TIMEOUT_MS > 20000, 'the fence outlasts the 20s waitForWorld bootstrap with margin')
})

test('BEHAVIOR: spawn + boot resolves (the healthy login)', async () => {
  const bot = new EventEmitter()
  const ready = createLoginReady(bot, { timeoutMs: 30000, boot: async () => 'the-bot' })
  bot.emit('spawn')
  assert.equal(await ready, 'the-bot')
})

test('BEHAVIOR: \'end\' DURING boot rejects (the socket died mid-bootstrap - settle-once still owns the race)', async () => {
  const bot = new EventEmitter()
  const ready = createLoginReady(bot, {
    timeoutMs: 30000,
    boot: async () => {
      bot.emit('end', 'mid-bootstrap death')
      await new Promise(r => setTimeout(r, 5))
      return 'the-bot'
    }
  })
  bot.emit('spawn')
  await assert.rejects(ready, /mid-bootstrap death/)
})

test('BEHAVIOR: a boot throw REJECTS ready - the scout\'s orphan class is dead', async () => {
  const bot = new EventEmitter()
  const ready = createLoginReady(bot, {
    timeoutMs: 30000,
    boot: async () => { throw new Error('world never loaded') }
  })
  bot.emit('spawn')
  await assert.rejects(ready, /world never loaded/)
})

test('BEHAVIOR: \'end\' before spawn rejects with the reason named (the clean-close class)', async () => {
  const bot = new EventEmitter()
  const ready = createLoginReady(bot, { timeoutMs: 30000, boot: async () => 'never' })
  bot.emit('end', 'disconnect.timeout')
  await assert.rejects(ready, /the session ended before spawn \(disconnect\.timeout\) - the attempt rebuilds/)
})

test('BEHAVIOR: a silent login rides the fence (the wall-clock bound)', async () => {
  const bot = new EventEmitter()
  const ready = createLoginReady(bot, { timeoutMs: 30, boot: async () => 'never' })
  await assert.rejects(ready, /the login never completed within 30ms - the attempt rebuilds/)
})

test('BEHAVIOR: settle-once - a late \'end\' after a resolved login is consumed QUIETLY', async () => {
  const bot = new EventEmitter()
  const rejections = []
  process.on('unhandledRejection', onRej)
  function onRej (e) { rejections.push(e) }
  try {
    const ready = createLoginReady(bot, { timeoutMs: 30000, boot: async () => 'the-bot' })
    bot.emit('spawn')
    assert.equal(await ready, 'the-bot')
    bot.emit('end', 'too late') // would orphan a rejection if settle-once leaked
    await new Promise(r => setTimeout(r, 20))
    assert.equal(rejections.length, 0, 'zero unhandledRejections (the winnable-race law)')
  } finally {
    process.removeListener('unhandledRejection', onRej)
  }
})

test('BEHAVIOR: \'error\' before spawn rejects (the pre-existing leg, kept)', async () => {
  const bot = new EventEmitter()
  const ready = createLoginReady(bot, { timeoutMs: 30000, boot: async () => 'never' })
  bot.emit('error', new Error('ECONNREFUSED'))
  await assert.rejects(ready, /ECONNREFUSED/)
})

test('WIRING PIN: the miner rides the fence, byte-exact (boot body, no hand-rolled executor)', () => {
  const wire = minerSrc.match(/const ready = createLoginReady\(bot, \{\n    boot: async \(\) => \{\n/)
  assert.ok(wire, 'the miner\'s ready rides createLoginReady')
  assert.ok(!/const ready = new Promise\(\(resolve, reject\) => \{\n    bot\.once\('spawn'/.test(minerSrc), 'the old two-leg executor is gone from the miner')
  assert.ok(minerSrc.includes("import { createLoginReady } from '../lib/loginfence.mjs'"), 'the import stands')
})

test('WIRING PIN: the scout rides the same machine, byte-exact (one law, two seats)', () => {
  const wire = scoutSrc.match(/const ready = createLoginReady\(bot, \{\n    boot: async \(\) => \{\n/)
  assert.ok(wire, 'the scout\'s ready rides createLoginReady')
  assert.ok(!/const ready = new Promise\(\(resolve, reject\) => \{\n    bot\.once\('spawn'/.test(scoutSrc), 'the old two-leg executor is gone from the scout')
  assert.ok(scoutSrc.includes("import { createLoginReady } from '../lib/loginfence.mjs'"), 'the import stands')
})

test('WIRING PIN: the boot bodies keep their own shape (the miner resolves into a worldless bot, the scout rejects)', () => {
  // the miner's deliberate v0.6.5-era shape: 'world never loaded' is logged and
  // the login RESOLVES - the shift's own probes + deadline bound the session
  const minerBoot = minerSrc.match(/await waitForWorld\(\)\n      \} catch \(e\) \{\n        log\(`\$\{tag\} world never loaded: \$\{e\.message\}`\)\n      \}\n      return bot\n/)
  assert.ok(minerBoot, 'the miner\'s boot keeps the catch-and-resolve shape, now returning bot')
  // the scout's waitForWorld throw rides the fence's boot-throw leg -> rejection
  const scoutBoot = scoutSrc.match(/await waitForWorld\(\)\n      return bot\n/)
  assert.ok(scoutBoot, 'the scout\'s boot returns bot past the wait; its throw rejects ready')
})
