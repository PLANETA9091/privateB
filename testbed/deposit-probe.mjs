#!/usr/bin/env node
// THE DEPOSIT PROBE (v0.70.0) - the first live evidence about the 26.2 chest
// click machinery, ever. WHAT MEASURED (dispatch 35692049905, run68, the first
// 600s fleet): planned bank trips FIRED (the v0.68.0 dist-scaled budgets work),
// bots REACHED chests (hops at d=8-24 opened windows with free slots) and the
// click loop still delivered ZERO - 'nothing to deposit' 0x 'banked N items'
// in the whole run, full-chest ledger empty. The skip reasons are swallowed in
// the fleet loop, so nothing distinguishes a 5s deposit timeout from a resolved
// click that moved nothing - and banked>0 has NEVER happened in ~130 fleets.
// The probe answers the binary question in isolation: ONE bot, ZERO load, a
// console-placed chest (the diag-findchest rig pattern), a pocket of real
// hand-dug dirt. It then walks the click ladder and measures EVERY rung:
//   1. Chest.deposit(type, null, count) - the fleet's bulk pathway
//   2. shift-click quick-move (window.click slot,0,1) - the human pathway
//   3. pick/place mode-0 clicks - the rawest carried-item pathway
//   4. Chest.deposit count=1 - single-item clicks
//   5. bot.transfer with explicit slot ranges
// PURE EVIDENCE (drop-probe rules): no assertions, exit 0, everything logged.
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

// The console pipe (scripts/server.sh cmd) - the diag-findchest rig: setblock,
// time, mob rules. A throwaway path is fine: the server ignores everything it
// cannot parse and the probe polls the world view for the actual result.
const cmd = (...words) => {
  try { execFileSync('scripts/server.sh', ['cmd', words.join(' ')], { stdio: 'pipe', timeout: 15000 }) } catch (e) { log(`cmd ${words.join(' ')} failed: ${e.message}`) }
}

const invSummary = () => bot.inventory.items().map(i => `${i.name}x${i.count}`).join(' ') || '(empty)'
const chestSummary = w => {
  try { return w.items().map(i => `${i.name}x${i.count}`).join(' ') || '(empty chest)' } catch { return '(unreadable)' }
}

const bot = mineflayer.createBot({ host, port, username, version: VERSION, auth: 'offline' })
bot.on('error', e => log(`error: ${e.message}`))
bot.on('kicked', r => log(`kicked: ${typeof r === 'string' ? r : JSON.stringify(r)}`))
bot.on('end', r => log(`disconnected: ${r}`))

bot.once('spawn', async () => {
  try {
    log(`spawned at ${bot.entity.position.floored()}`)
    cmd('time', 'set', 'day')
    cmd('kill', '@e[type=zombie]')
    cmd('kill', '@e[type=skeleton]')
    cmd('gamerule', 'doMobSpawning', 'false') // a repro rig, not survival (diag e2e lesson)
    await bot.waitForTicks(40)

    // --- 1. a REAL chest 3 blocks away (console-placed, chunk-keeper online)
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

    // --- 2. real pocket items: hand-dig 4 dirt/grass blocks nearby (no gifts)
    const DIGGABLE = ['grass_block', 'dirt', 'coarse_dirt', 'sand', 'gravel']
    let pocketItem = null
    for (let n = 0; n < 8 && !pocketItem; n++) {
      let target = null
      for (const [dx, dy, dz] of [[1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1], [1, -1, 1], [0, -1, 0]]) {
        const b = bot.blockAt(bot.entity.position.floored().offset(dx, dy, dz))
        if (b && DIGGABLE.includes(b.name)) { target = b; break }
      }
      if (!target) {
        target = bot.findBlock({ matching: b => DIGGABLE.includes(b.name), maxDistance: 6 })
        if (!target) break
      }
      try {
        log(`dig ${n}: ${target.name} at ${target.position.floored()}`)
        await bot.dig(target)
        await bot.waitForTicks(15)
      } catch (e) { log(`dig ${n} failed: ${e.message}`); await sleep(500); continue }
      if (bot.inventory.items().length > 0) { pocketItem = bot.inventory.items()[0]; break }
    }
    const pocket = bot.inventory.items()
    if (!pocket.length) throw new Error(`no pocket items after digging (inv=${invSummary()}) - cannot probe`)
    log(`pocket: ${invSummary()}`)

    // --- 3. walk to the chest (raw controls, 3 blocks - no pathfinder here)
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

    // --- 4. open + the diagnostic ladder
    let window = null
    for (let a = 1; a <= 2 && !window; a++) {
      try { window = await bot.openChest(chestBlock); await sleep(600) } catch (e) { log(`open attempt ${a} failed: ${e.message}`); await sleep(800) }
    }
    if (!window) throw new Error('cannot open the chest')
    // mineflayer's Window stores slots as an ARRAY PROPERTY (not a method) -
    // the first probe run died 'window.slots is not a function' at exactly this
    // line (job 106643098859). Read it either way, defensively.
    const slotList = () => (Array.isArray(window.slots) ? window.slots : (typeof window.slots === 'function' ? window.slots() : []))
    log(`window open: type=${window.type} slots=${slotList().length} chestItems=${chestSummary(window)}`)
    log(`inventory BEFORE ladder: ${invSummary()}`)

    const item = pocket.find(i => DIGGABLE.includes(i.name)) ?? pocket[0]
    const invCount = () => bot.inventory.items().filter(i => i.name === item.name).reduce((a, i) => a + i.count, 0)
    const chestCount = () => { try { return window.items().filter(i => i.name === item.name).reduce((a, i) => a + i.count, 0) } catch { return -1 } }
    const beforeInv = invCount()
    const beforeChest = chestCount()
    log(`probe item: ${item.name}x${item.count} type=${item.type} | inv=${beforeInv} chest=${beforeChest}`)

    const rung = async (name, fn) => {
      const t = Date.now()
      let outcome = 'ok'
      try { await fn() } catch (e) { outcome = `ERR ${e.message}` }
      const ms = Date.now() - t
      await sleep(400) // let the server state settle, then measure BOTH sides
      const inv = invCount(); const ch = chestCount()
      log(`RUNG ${name}: ${outcome} ${ms}ms | inv ${beforeInv}->${inv} chest ${beforeChest}->${ch} => moved ${Math.max(0, beforeInv - inv)}/${Math.max(0, ch - beforeChest)}`)
      return beforeInv - inv
    }

    let moved1 = 0
    moved1 += await rung('1 Chest.deposit bulk', async () => { await window.deposit(item.type, null, item.count) })
    if (moved1 === 0) {
      // 2. shift-click quick move: find the source slot index in the window map
      const srcIdx = slotList().findIndex(s => s && s.name === item.name && s.count > 0)
      const destIdx = slotList().findIndex((s, i) => i < 27 && !s)
      log(`shift-click plan: srcIdx=${srcIdx} destIdx=${destIdx} (of ${slotList().length})`)
      if (srcIdx >= 0 && destIdx >= 0) {
        moved1 += await rung('2 shift-click quick-move', async () => { await window.click(srcIdx, 0, 1) })
      }
    }
    if (moved1 === 0) {
      const srcIdx = slotList().findIndex(s => s && s.name === item.name && s.count > 0)
      const destIdx = slotList().findIndex((s, i) => i < 27 && !s)
      if (srcIdx >= 0 && destIdx >= 0) {
        moved1 += await rung('3 pick/place mode0', async () => { await window.click(srcIdx, 0, 0); await sleep(250); await window.click(destIdx, 0, 0) })
      }
    }
    if (moved1 === 0) {
      moved1 += await rung('4 Chest.deposit count=1', async () => { await window.deposit(item.type, null, 1) })
    }
    if (moved1 === 0) {
      moved1 += await rung('5 bot.transfer explicit', async () => {
        const srcIdx = slotList().findIndex(s => s && s.name === item.name && s.count > 0)
        if (srcIdx < 0) throw new Error('no source slot')
        const destIdx = slotList().findIndex((s, i) => i < 27 && !s)
        if (destIdx < 0) throw new Error('no dest slot')
        await bot.transfer({ window, itemType: item.type, sourceStart: srcIdx, sourceEnd: srcIdx + 1, destStart: destIdx, destEnd: destIdx + 1, count: 1 })
      })
    }

    log(`FINAL: chest=${chestSummary(window)}`)
    log(`FINAL: inventory=${invSummary()}`)
    log(moved1 > 0 ? 'VERDICT: the 26.2 chest click WORKS in isolation - the fleet failure is load/context shaped' : 'VERDICT: every pathway moved ZERO - the 26.2 click protocol itself is broken')
    clearTimeout(timeout)
    process.exit(0)
  } catch (e) {
    log(`probe failed: ${e.stack || e.message}`)
    clearTimeout(timeout)
    process.exit(0) // evidence probe: a failed probe is EVIDENCE, not a red CI
  }
})
