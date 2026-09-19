#!/usr/bin/env node
// Furnace transfer probe: walk to the leftover furnace in the churned world, dig 2 dirt
// by hand at spawn first (drops with bare hands), then dump the furnace window slots and
// try putInput + raw clickWindow transfers with full slot diagnostics.
import mineflayer from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'

const { goals, Movements } = pathfinderPkg
const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'FurnProbe', version: '26.2' })
bot.loadPlugin(pathfinderPkg.pathfinder)

const log = m => console.log(`[fprobe] ${m}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const inv = () => bot.inventory.items().map(i => `${i.name}x${i.count}`).join(' ') || '(empty)'

bot.once('spawn', async () => {
  await sleep(3000)
  const movements = new Movements(bot)
  movements.canDig = true
  bot.pathfinder.setMovements(movements)

  // 1. hand-dig 4 dirt at spawn (fastDig-style: raw dig with pacing)
  for (let i = 0; i < 4; i++) {
    const b = bot.findBlock({ matching: x => x.name === 'dirt', maxDistance: 6 })
    if (!b) break
    try { await bot.dig(b) } catch (e) { log(`dig failed: ${e.message}`) }
    await sleep(300)
  }
  log(`dirt in inventory: ${inv()}`)

  // 2. walk to the leftover furnace from the last test run
  const found = bot.findBlock({ matching: x => x.name === 'furnace', maxDistance: 200 })
  log(`furnace in loaded chunks: ${found ? found.position.floored() : 'null'}`)
  if (!found) { log('no furnace loaded - abort'); bot.quit(); process.exit(1) }
  try {
    await bot.pathfinder.goto(new goals.GoalNear(found.position.x, found.position.y, found.position.z, 2))
    log(`at furnace: ${bot.entity.position.floored()}`)
  } catch (e) { log(`path failed: ${e.message}`) }

  // 3. open + dump window slots
  const furnace = await bot.openFurnace(found)
  log(`window type=${furnace.type} id=${furnace.id} slots=${furnace.slots.length}`)
  furnace.slots.forEach((it, idx) => { if (it) log(`  slot ${idx}: ${it.name}x${it.count}`) })
  log(`inventoryStart=${furnace.inventoryStart} inventoryEnd=${furnace.inventoryEnd}`)

  // 4. putInput 2 dirt, verified per-click
  const dirt = bot.inventory.items().find(i => i.name === 'dirt')
  const before = bot.inventory.items().filter(i => i.name === 'dirt').reduce((a, i) => a + i.count, 0)
  log(`before putInput: dirt=${before}`)
  try {
    await furnace.putInput(dirt.type, null, Math.min(2, before))
    log('putInput resolved')
  } catch (e) { log(`putInput THREW: ${e.message}`) }
  await sleep(800)
  const after = bot.inventory.items().filter(i => i.name === 'dirt').reduce((a, i) => a + i.count, 0)
  log(`after putInput: dirt=${after} (moved ${before - after})`)
  furnace.slots.forEach((it, idx) => { if (it) log(`  slot ${idx}: ${it.name}x${it.count}`) })

  // 5. raw clickWindow fallback: find dirt slot in the window view, click it, click input
  if (after === before) {
    const sandSlot = furnace.slots.findIndex((it, idx) => it && it.name === 'dirt' && idx >= 3)
    log(`raw retry: dirt in window slot ${sandSlot}`)
    if (sandSlot >= 0) {
      await bot.clickWindow(sandSlot, 0, 0)
      await sleep(400)
      log(`cursor after pick: ${furnace.selectedItem?.name ?? 'null'}`)
      await bot.clickWindow(0, 0, 0)
      await sleep(400)
      log(`input slot now: ${furnace.slots[0]?.name ?? 'empty'}`)
      const after2 = bot.inventory.items().filter(i => i.name === 'dirt').reduce((a, i) => a + i.count, 0)
      log(`after raw click: dirt=${after2} (moved ${before - after2})`)
    }
  }
  bot.closeWindow(furnace)
  bot.quit()
  process.exit(0)
})
bot.on('error', e => { log(`error: ${e.message}`) })
bot.on('kicked', r => { log(`kicked: ${r}`); process.exit(1) })
setTimeout(() => { log('probe timeout'); process.exit(1) }, 180000)
