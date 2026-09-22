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
import fs from 'node:fs'

const host = process.argv[2] || '127.0.0.1'
const port = Number(process.argv[3] || 25565)
const username = process.argv[4] || 'DepositProbe'
const VERSION = '26.2'

const t0 = Date.now()
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] [probe] ${m}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const timeout = setTimeout(() => { log('FAIL: overall timeout (150s)'); process.exit(1) }, 150000)

// The server console file: scripts/server.sh start pipes the JVM's stdout
// here (console command echo + feedback included). The probe reads it to
// CONFIRM the fill executed - v2 skipped that and its '(empty)' result was
// ambiguous (broken parse vs a fill that never ran).
const CONSOLE = 'testbed/server/console.log'
let consoleSize = 0
try { consoleSize = fs.statSync(CONSOLE).size } catch { /* fresh boot */ }
const consoleTail = (bytes = 3000) => {
  try {
    const st = fs.statSync(CONSOLE)
    const start = Math.max(0, st.size - bytes)
    const fd = fs.openSync(CONSOLE, 'r')
    const buf = Buffer.alloc(st.size - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    fs.closeSync(fd)
    return buf.toString('utf8')
  } catch { return '' }
}

const cmd = (...words) => {
  try { execFileSync('scripts/server.sh', ['cmd', words.join(' ')], { stdio: 'pipe', timeout: 15000 }) } catch (e) { log(`cmd ${words.join(' ')} failed: ${e.message}`) }
}
// run a command and return the console lines it produced (the response tail)
const cmdRead = (...words) => {
  const before = (() => { try { return fs.statSync(CONSOLE).size } catch { return consoleSize } })()
  cmd(...words)
  return () => {
    try {
      const st = fs.statSync(CONSOLE)
      const fd = fs.openSync(CONSOLE, 'r')
      const buf = Buffer.alloc(st.size - before)
      fs.readSync(fd, buf, 0, buf.length, before)
      fs.closeSync(fd)
      return buf.toString('utf8').split('\n').filter(l => l.trim())
    } catch { return [] }
  }
}

const bot = mineflayer.createBot({ host, port, username, version: VERSION, auth: 'offline' })
bot.on('error', e => log(`error: ${e.message}`))
bot.on('kicked', r => log(`kicked: ${typeof r === 'string' ? r : JSON.stringify(r)}`))
bot.on('end', r => log(`disconnected: ${r}`))

// THE RAW TAP (v4): the window packets BEFORE mineflayer's window handling
// touches them - this separates TRANSPORT (did the server send the items?)
// from WINDOW MAPPING (did mineflayer put them into the right slots?).
// v3 measured the mapped view only: all 63 slots empty while the console
// echoed the fill command - one layer below still unnamed.
try {
  bot._client.on('window_items', data => {
    const items = Array.isArray(data.items) ? data.items : []
    const nonEmpty = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it && (it.itemId > 0 || it.itemCount > 0)) nonEmpty.push(`[${i}]=id${it.itemId}x${it.itemCount}`)
    }
    log(`RAW window_items: windowId=${data.windowId} stateId=${data.stateId} count=${items.length} nonEmpty=${nonEmpty.join(' ') || 'NONE'}`)
  })
  bot._client.on('open_screen', data => log(`RAW open_screen: windowId=${data.windowId} type=${data.inventoryType} title=${JSON.stringify(data.windowTitle || '').slice(0, 80)}`))
} catch (e) { log(`raw tap setup failed: ${e.message}`) }

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
    const readFill0 = cmdRead('item', 'replace', 'block', cx, cy, cz, 'container.0', 'minecraft:dirt', '32')
    await sleep(400)
    const fill0Lines = readFill0()
    log(`fill container.0 response: ${fill0Lines.slice(-2).join(' | ') || '(silent - success has no echo on some versions)'}`)
    // THE UNAMBIGUOUS MARKER: a conditional say that fires ONLY if the server
    // really holds 32 dirt in container.0 - the console line [Server] PROBE_FILL_OK
    // is the ground truth no client view can fake. Poll up to 4s for it.
    const beforeMarker = (() => { try { return fs.statSync(CONSOLE).size } catch { return 0 } })()
    cmd('execute', 'if', 'items', 'block', cx, cy, cz, 'container.0', 'minecraft:dirt', 'run', 'say', 'PROBE_FILL_OK')
    let markerSeen = false
    for (let i = 0; i < 8 && !markerSeen; i++) {
      await sleep(500)
      try {
        const st = fs.statSync(CONSOLE)
        const fd = fs.openSync(CONSOLE, 'r')
        const buf = Buffer.alloc(Math.max(0, st.size - beforeMarker))
        fs.readSync(fd, buf, 0, buf.length, beforeMarker)
        fs.closeSync(fd)
        if (buf.toString('utf8').includes('PROBE_FILL_OK')) markerSeen = true
      } catch { /* console not there */ }
    }
    log(`SERVER MARKER: ${markerSeen ? 'PROBE_FILL_OK seen - the server chest REALLY holds dirt x32' : 'NOT seen in 4s - the fill DID NOT take (command rejected or unsupported)'}`)
    const readData = cmdRead('data', 'get', 'block', cx, cy, cz, 'Items')
    await sleep(600)
    const dataLines = readData().filter(l => /dirt|cobble|Items|count/i.test(l))
    log(`SERVER TRUTH (data get block): ${dataLines.slice(0, 4).join(' | ') || '(no response captured)'}`)
    await sleep(400)

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
    // registry Items carry .id (numeric protocol id); .type exists only on
    // prismarine-item instances - v2 passed undefined ('Invalid itemType')
    const dirtId = dirt ? (dirt.id ?? dirt.type) : null
    const cobbleId = cobble ? (cobble.id ?? cobble.type) : null
    log(`registry ids: dirt=${dirtId} cobble=${cobbleId}`)
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

    // --- 5. THE LADDER v3: the CLOSED LOOP - withdraw first (server-confirmed
    // stock), then deposit the withdrawn items BACK. No pickup phantom involved.
    await rung('withdraw dirt 8', async () => { await window.withdraw(dirtId, null, 8) })
    await rung('deposit withdrawn dirt 8', async () => {
      const have = invCountOf('dirt')
      if (!have) throw new Error('nothing withdrawn - the loop cannot close')
      await window.deposit(dirtId, null, Math.min(have, 8))
    })
    await rung('withdraw cobble 8', async () => { await window.withdraw(cobbleId, null, 8) })
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
