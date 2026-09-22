#!/usr/bin/env node
// THE DEPOSIT PROBE v2 (v0.71.0) - the slot-map comparison rig.
//
// v1's ladder (job 106648926397) delivered THE answer shape: a console-placed,
// NEVER-FILLED chest read dirtx1 the moment it opened (a GHOST - the server
// chest was empty by construction), and Chest.deposit count=1 refused with
// "Can't find dirt in slots [27 - 63]" while bot.inventory.items() held the
// dirt. Two windows disagreeing about the same inventory = the 26.2 window
// PARSING is broken, clicks aim at wrong slots, the server silently drops
// every one - banked=0 across ~130 fleets with zero 'banked N items' ever.
//
// v2 measures the mapping DIRECTLY against SERVER TRUTH: the console fills
// the chest (item replace block container.N - infrastructure, same class as
// the yard build), the probe dumps the client's full 63-slot view, then walks
// withdraw and deposit ladders with a dump after EVERY step:
//   - chest view EMPTY while the server holds 48 items -> the READING is
//     broken (the window_items parse maps wrong slots) - no click can work
//   - chest view correct + withdraw moves -> clicks WORK, deposit's slot
//     targeting is the bug - the cure is a mapping fix
//   - chest view correct + withdraw dead -> clicks dropped (stateId/protocol)
// Pure evidence (drop-probe rules): no assertions, exit 0, everything logged.
// Usage: node testbed/deposit-probe.mjs [host] [port] [username]
import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
import { execFileSync } from 'node:child_process'

const host = process.argv[2] || '127.0.0.1'
const port = Number(process.argv[3] || 25565)
const username = process.argv[4] || 'DepositProbe'
const VERSION = '26.2'

const t0 = Date.now()
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] [probe] ${m}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const timeout = setTimeout(() => { log('FAIL: overall timeout (150s)'); process.exit(1) }, 150000)

const cmd = (...words) => {
  try { execFileSync('scripts/server.sh', ['cmd', words.join(' ')], { stdio: 'pipe', timeout: 15000 }) } catch (e) { log(`cmd ${words.join(' ')} failed: ${e.message}`) }
}

const bot = mineflayer.createBot({ host, port, username, version: VERSION, auth: 'offline' })
bot.on('error', e => log(`error: ${e.message}`))
bot.on('kicked', r => log(`kicked: ${typeof r === 'string' ? r : JSON.stringify(r)}`))
bot.on('end', r => log(`disconnected: ${r}`))

const invSummary = () => bot.inventory.items().map(i => `${i.name}x${i.count}`).join(' ') || '(empty)'
const chestSummary = w => {
  try { return w.items().map(i => `${i.name}x${i.count}`).join(' ') || '(empty chest)' } catch { return '(unreadable)' }
}

bot.once('spawn', async () => {
  try {
    log(`spawned at ${bot.entity.position.floored()}`)
    cmd('time', 'set', 'day')
    cmd('kill', '@e[type=zombie]')
    cmd('kill', '@e[type=skeleton]')
    cmd('gamerule', 'doMobSpawning', 'false')
    await bot.waitForTicks(40)

    // --- 1. a REAL chest 3 blocks away, then SERVER TRUTH into its slots
    const p0 = bot.entity.position.floored()
    const chestPos = new Vec3(p0.x + 3, p0.y, p0.z)
    cmd('setblock', Math.round(chestPos.x), Math.round(chestPos.y), Math.round(chestPos.z), 'minecraft:chest')
    let chestBlock = null
    for (let i = 0; i < 30 && !chestBlock; i++) {
      await bot.waitForTicks(10)
      try { const b = bot.blockAt(chestPos); if (b && b.name === 'chest') chestBlock = b } catch { /* chunks land */ }
    }
    if (!chestBlock) throw new Error('the console-placed chest never landed in the world view')
    log(`chest confirmed at ${chestPos.floored()}`)
    const cx = Math.round(chestPos.x); const cy = Math.round(chestPos.y); const cz = Math.round(chestPos.z)
    cmd('item', 'replace', 'block', cx, cy, cz, 'container.0', 'minecraft:dirt', '32')
    cmd('item', 'replace', 'block', cx, cy, cz, 'container.1', 'minecraft:cobblestone', '16')
    await sleep(800) // the item commands execute; the chest now holds 48 items SERVER-SIDE
    log('server truth commanded: container.0 = dirt x32, container.1 = cobblestone x16')

    // --- 2. a light dig for the deposit rung (the chest itself needs no pocket)
    const DIGGABLE = ['grass_block', 'dirt', 'coarse_dirt', 'sand', 'gravel']
    for (let n = 0; n < 3; n++) {
      const target = bot.findBlock({ matching: b => DIGGABLE.includes(b.name), maxDistance: 6 })
      if (!target) break
      try { await bot.dig(target); await bot.waitForTicks(15) } catch (e) { log(`dig ${n} failed: ${e.message}`); break }
      if (bot.inventory.items().length > 0) break
    }
    log(`pocket after dig: ${invSummary()}`)

    // --- 3. walk to the chest
    for (let k = 0; k < 20; k++) {
      const d = bot.entity.position.distanceTo(chestPos.offset(0.5, 0.5, 0.5))
      if (d <= 2.2) break
      await bot.lookAt(chestPos.offset(0.5, 0.5, 0.5), true).catch(() => {})
      bot.setControlState('forward', true)
      await bot.waitForTicks(6)
      bot.setControlState('forward', false)
      await bot.waitForTicks(2)
    }
    log(`at the chest, d=${bot.entity.position.distanceTo(chestPos).toFixed(1)}`)

    // --- 4. open + THE SLOT MAP DUMP (the decisive instrument)
    let window = null
    for (let a = 1; a <= 2 && !window; a++) {
      try { window = await bot.openChest(chestBlock); await sleep(700) } catch (e) { log(`open attempt ${a} failed: ${e.message}`); await sleep(800) }
    }
    if (!window) throw new Error('cannot open the chest')
    const slotList = () => (Array.isArray(window.slots) ? window.slots : (typeof window.slots === 'function' ? window.slots() : []))
    const dumpSlots = tag => {
      const s = slotList()
      const nonEmpty = []
      for (let i = 0; i < s.length; i++) if (s[i] && s[i].name) nonEmpty.push(`[${i}]=${s[i].name}x${s[i].count}`)
      log(`SLOTMAP ${tag}: ${s.length} slots, non-empty: ${nonEmpty.join(' ') || 'NONE'}`)
    }
    log(`window open: type=${window.type} slots=${slotList().length}`)
    dumpSlots('at-open')
    log(`chest view at open: ${chestSummary(window)}`)
    log(`inventory view at open: ${invSummary()}`)

    const dirt = bot.registry.itemsByName.dirt
    const cobble = bot.registry.itemsByName.cobblestone
    const invCountOf = name => bot.inventory.items().filter(i => i.name === name).reduce((a, i) => a + i.count, 0)
    const chestCountOf = name => { try { return window.items().filter(i => i.name === name).reduce((a, i) => a + i.count, 0) } catch { return -1 } }

    const rung = async (name, fn) => {
      const t = Date.now()
      let outcome = 'ok'
      try { await fn() } catch (e) { outcome = `ERR ${e.message}` }
      const ms = Date.now() - t
      await sleep(500)
      log(`RUNG ${name}: ${outcome} ${ms}ms | inv dirt=${invCountOf('dirt')} cobble=${invCountOf('cobblestone')} | chest dirt=${chestCountOf('dirt')} cobble=${chestCountOf('cobblestone')}`)
      dumpSlots(`after-${name.replace(/\s+/g, '-').toLowerCase()}`)
    }

    // --- 5. THE LADDER v2
    await rung('withdraw dirt 8', async () => { await window.withdraw(dirt.type, null, 8) })
    await rung('withdraw cobble 8', async () => { await window.withdraw(cobble.type, null, 8) })
    await rung('deposit pocket item', async () => {
      const it = bot.inventory.items()[0]
      if (!it) throw new Error('pocket empty - the dig pickup never landed in the client view')
      await window.deposit(it.type, null, it.count)
    })
    await rung('shift-click slot0 quick-move', async () => { await window.click(0, 0, 1) })
    await rung('pick-place mode0 slot0->slot2', async () => { await window.click(0, 0, 0); await sleep(250); await window.click(2, 0, 0) })

    log(`FINAL: chest view=${chestSummary(window)}`)
    log(`FINAL: inventory view=${invSummary()}`)
    const sawTruth = chestCountOf('dirt') >= 32 || chestCountOf('cobblestone') >= 16
    log(sawTruth
      ? 'VERDICT: the chest view MATCHES server truth - the window READING works; click targeting/protocol is the broken layer'
      : 'VERDICT: the chest view MISSES the server-filled items - the 26.2 window_items parse is broken; no click can ever aim right')
    clearTimeout(timeout)
    process.exit(0)
  } catch (e) {
    log(`probe failed: ${e.stack || e.message}`)
    clearTimeout(timeout)
    process.exit(0) // evidence probe: a failed probe is EVIDENCE, not a red CI
  }
})
