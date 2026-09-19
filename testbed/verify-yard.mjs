#!/usr/bin/env node
// Verifies the workshop yard: connects a bot (no op) and reads the placed blocks back.
//   node testbed/verify-yard.mjs [originX,originY,originZ]
import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'

const O = (process.argv[2] || '-149,80,114').split(',').map(Number)
const X = n => O[0] + n
const Y = n => O[1] + n
const Z = n => O[2] + n

const EXPECTED = [
  [0, 0, 0, 'smooth_stone', 'floor'],
  [-14, 1, -12, 'furnace', 'furnace (x8)'],
  [-8, 1, -11, 'blast_furnace', 'blast furnace (x4)'],
  [-6, 1, -11, 'smoker', 'smoker (x4)'],
  [-18, 1, -6, 'stonecutter', 'stonecutter (x6)'],
  [-18, 1, -4, 'crafting_table', 'crafting table (x6)'],
  [6, 1, -6, 'anvil', 'anvil'],
  [8, 1, -6, 'smithing_table', 'smithing table'],
  [10, 1, -6, 'grindstone', 'grindstone'],
  [12, 1, -6, 'cauldron', 'cauldron'],
  [14, 1, -6, 'loom', 'loom'],
  [19, 1, -11, 'water', 'concrete water basin'],
  [-20, 1, 4, 'chest', 'chest warehouse row 1'],
  [-20, 1, 12, 'chest', 'chest warehouse row 5'],
  [-20, 1, 14, 'barrel', 'output barrels'],
  [19, 2, -2, 'nether_portal', 'nether portal'],
  [-20, 1, -2, 'end_portal', 'end portal'],
  [0, 1, 0, 'red_bed', 'bed / spawn'],
  [0, 6, -8, 'sea_lantern', 'lighting']
]

const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'YardCheck', version: '26.2', auth: 'offline' })
bot.on('error', e => { console.error('FAIL error:', e.message); process.exit(1) })
bot.once('spawn', async () => {
  await new Promise(r => setTimeout(r, 4000))
  let ok = 0
  for (const [x, y, z, want, label] of EXPECTED) {
    const block = bot.blockAt(new Vec3(X(x), Y(y), Z(z)))
    const got = block ? block.name : 'UNLOADED'
    const pass = got === want
    if (pass) ok++
    console.log(`${pass ? 'OK  ' : 'FAIL'} ${label.padEnd(24)} (${X(x)},${Y(y)},${Z(z)}) ${got}${pass ? '' : ` (want ${want})`}`)
  }
  const count = (name, from, to) => {
    let n = 0
    for (let x = from[0]; x <= to[0]; x++) {
      for (let y = from[1]; y <= to[1]; y++) {
        for (let z = from[2]; z <= to[2]; z++) {
          const block = bot.blockAt(new Vec3(x, y, z))
          if (block && block.name === name) n++
        }
      }
    }
    return n
  }
  const box = [[X(-26), Y(0), Z(-14)], [X(26), Y(2), Z(14)]]
  console.log(`counts: chests=${count('chest', box[0], box[1])} furnaces=${count('furnace', box[0], box[1])} barrels=${count('barrel', box[0], box[1])} stonecutters=${count('stonecutter', box[0], box[1])}`)
  console.log(`RESULT: ${ok}/${EXPECTED.length} structures present`)
  bot.quit()
  process.exit(0)
})
