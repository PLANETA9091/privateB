#!/usr/bin/env node
// Mining test on Minecraft 26.2.
// Fills a deterministic block region via commands, then makes the bot mine it with
// mineflayer-collectblock (pathfinder + tool selection + dig + item pickup) and
// verifies the drops actually land in the inventory.
import mineflayer from 'mineflayer'
import { pathfinder } from 'mineflayer-pathfinder'
import { plugin as collectblock } from 'mineflayer-collectblock'
import { plugin as tool } from 'mineflayer-tool'
import { loader as autoeat } from 'mineflayer-auto-eat'
import fs from 'node:fs'

import { Vec3 } from 'vec3'

const HOST = process.argv[2] || '127.0.0.1'
const PORT = Number(process.argv[3] || 25565)
const USER = process.argv[4] || 'BotMiner'
const WANT = Number(process.argv[5] || 24)
const FIFO = process.env.MC_FIFO || '/home/btw/mcbot-fleet/testbed/server/cmd.fifo'

// The vanilla console `op <name>` resolves a non-existent premium name to a *lowercased*
// offline profile, so a bot named "BotMiner" never matches that entry. Issuing the op from
// the console *while the bot is connected* uses the live profile instead - that works.
function consoleCmd (cmd) { fs.appendFileSync(FIFO, `${cmd}\n`) }

const t0 = Date.now()
const step = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

const bot = mineflayer.createBot({ host: HOST, port: PORT, username: USER, version: '26.2', auth: 'offline' })
bot.loadPlugin(pathfinder)
bot.loadPlugin(collectblock)
bot.loadPlugin(tool)
bot.loadPlugin(autoeat)

bot.on('error', e => { console.error('FAIL error:', e.message); process.exit(1) })
bot.on('kicked', r => { console.error('FAIL kicked:', JSON.stringify(r)); process.exit(1) })

const overall = setTimeout(() => { console.error('FAIL: timeout 120s'); process.exit(1) }, 120000)

bot.once('spawn', async () => {
  try {
    step(`spawn at ${bot.entity.position.floored()}`)
    const p = bot.entity.position.floored()

    consoleCmd(`op ${bot.username}`)
    await bot.waitForTicks(30)
    step(`requested op for ${bot.username}`)

    // give tools, else stone takes forever bare-handed; retry until the server agrees
    const tools = ['minecraft:netherite_pickaxe', 'minecraft:netherite_shovel', 'minecraft:netherite_axe']
    for (const item of tools) {
      for (let attempt = 0; attempt < 5; attempt++) {
        bot.chat(`/give @s ${item} 1`)
        await bot.waitForTicks(20)
        if (bot.inventory.items().some(i => i.name.includes(item.replace('minecraft:', '')))) break
      }
    }
    const pick = bot.inventory.items().find(i => i.name.includes('pickaxe'))
    if (!pick) throw new Error(`no pickaxe in inventory after /give - op not applied? items=${bot.inventory.items().map(i => i.name).join(',')}`)
    await bot.equip(pick, 'hand')
    step(`equipped ${pick.name}`)

    // deterministic ore body, 8 blocks east of the bot, floating in air so no pathfinding drama
    const ox = p.x + 4
    const oy = p.y
    const oz = p.z - 2
    const SIZE = 6
    const x2 = ox + SIZE - 1
    const y2 = oy + SIZE - 1
    const z2 = oz + SIZE - 1
    step(`filling test ore body ${ox},${oy},${oz} -> ${x2},${y2},${z2}`)
    consoleCmd(`fill ${ox} ${oy} ${oz} ${x2} ${y2} ${z2} minecraft:stone`)
    await bot.waitForTicks(30)
    // stand next to the ore body so pathfinding starts clean
    consoleCmd(`tp ${bot.username} ${ox - 2} ${oy + 2} ${oz + 2}`)
    await bot.waitForTicks(30)

    const before = countCobble()
    step(`cobblestone before: ${before}`)

    // also allow the bot to use its own tool selection for later targets
    const mcData = bot.registry
    const stoneId = mcData.blocksByName.stone.id
    const targets = []
    for (let x = ox; x <= x2; x++) for (let y = oy; y <= y2; y++) for (let z = oz; z <= z2; z++) {
      const b = bot.blockAt(new Vec3(x, y, z))
      if (b && b.type === stoneId) targets.push(b)
    }
    step(`targets found in world: ${targets.length}`)
    if (targets.length < 10) throw new Error('server did not apply the /fill - nothing to mine')

    let mined = 0
    const started = Date.now()
    for (const block of targets) {
      if (mined >= WANT) break
      const cur = bot.blockAt(block.position)
      if (!cur || cur.name !== 'stone') continue
      await bot.collectBlock.collect(cur, { ignoreNoPath: true })
      mined++
      if (mined % 8 === 0) step(`mined ${mined} (${(mined / ((Date.now() - started) / 1000)).toFixed(2)} blocks/s), cobble=${countCobble()}`)
    }
    const secs = (Date.now() - started) / 1000
    const after = countCobble()
    step(`mined ${mined} blocks in ${secs.toFixed(1)}s (${(mined / secs).toFixed(2)} blocks/s)`)
    step(`cobblestone after: ${after} (+${after - before})`)
    step(`inventory: ${bot.inventory.items().map(i => `${i.name}x${i.count}`).join(', ')}`)

    if (after - before < Math.floor(mined * 0.5)) throw new Error(`drops missing: mined ${mined} but only +${after - before} cobblestone`)
    clearTimeout(overall)
    step('MINING TEST PASSED - bot mines and collects on 26.2')
    bot.quit()
    process.exit(0)
  } catch (e) {
    clearTimeout(overall)
    console.error('FAIL:', e.stack || e.message)
    process.exit(1)
  }
})

function countCobble () {
  return bot.inventory.items().filter(i => i.name === 'cobblestone').reduce((a, i) => a + i.count, 0)
}
