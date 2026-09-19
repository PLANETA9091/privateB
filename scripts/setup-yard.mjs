#!/usr/bin/env node
// Builds the crafting/smelting yard at the world spawn on the test server:
// floor, furnaces, blast furnaces, smokers, stonecutters, crafting tables, anvils,
// water pool for concrete, nether + end portals, a bed, lighting and a labelled chest
// warehouse. Everything is placed through the server console pipe (no client needed).
//
//   node scripts/setup-yard.mjs [--origin 0,72,0] [--dry]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mineflayer from 'mineflayer'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIFO = process.env.MC_FIFO || path.join(root, 'testbed/server/cmd.fifo')
const DRY = process.argv.includes('--dry')
const originArg = process.argv.includes('--origin') ? process.argv[process.argv.indexOf('--origin') + 1] : null

const log = (...a) => console.log('[yard]', ...a)
const commands = []

function cmd (text) { commands.push(text) }
function fill (x1, y1, z1, x2, y2, z2, block) { cmd(`fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${block}`) }
function set (x, y, z, blockAndData = 'air') { cmd(`setblock ${x} ${y} ${z} ${blockAndData}`) }
function label (x, y, z, text) {
  const msg = `'{"text":"${text}"}'`
  set(x, y, z, `minecraft:oak_sign[rotation=0]{front_text:{messages:[${msg},'{"text":""}','{"text":""}','{"text":""}']}}`)
}

function buildYard (ox, oy, oz) {
  const X = n => ox + n
  const Y = n => oy + n
  const Z = n => oz + n

  log('floor + clearance')
  fill(X(-26), Y(0), Z(-14), X(26), Y(0), Z(14), 'minecraft:smooth_stone')
  fill(X(-26), Y(1), Z(-14), X(26), Y(7), Z(14), 'minecraft:air')
  // rim so bots do not fall off the platform edge
  fill(X(-26), Y(1), Z(-14), X(26), Y(1), Z(-14), 'minecraft:stone_bricks')
  fill(X(-26), Y(1), Z(14), X(26), Y(1), Z(14), 'minecraft:stone_bricks')
  fill(X(-26), Y(1), Z(-14), X(-26), Y(1), Z(14), 'minecraft:stone_bricks')
  fill(X(26), Y(1), Z(-14), X(26), Y(1), Z(14), 'minecraft:stone_bricks')

  log('furnaces / blast furnaces / smokers (smelting bay)')
  for (let i = 0; i < 8; i++) set(X(-14 + i * 2), Y(1), Z(-12), 'minecraft:furnace[facing=south]')
  for (let i = 0; i < 4; i++) set(X(-14 + i * 2), Y(1), Z(-11), 'minecraft:blast_furnace[facing=south]')
  for (let i = 0; i < 4; i++) set(X(-6 + i * 2), Y(1), Z(-11), 'minecraft:smoker[facing=south]')
  // fuel chest right behind every machine row
  for (let i = -1; i < 1; i++) set(X(-16 + i * 2), Y(1), Z(-12), 'minecraft:chest[facing=south]')
  fill(X(-1), Y(1), Z(-12), X(1), Y(1), Z(-12), 'minecraft:chest[facing=south]')
  label(X(-2), Y(2), Z(-12), 'FUEL + ORES')

  log('stonecutters / crafting tables / utility')
  for (let i = 0; i < 6; i++) set(X(-18 + i * 2), Y(1), Z(-6), 'minecraft:stonecutter[facing=south]')
  for (let i = 0; i < 6; i++) set(X(-18 + i * 2), Y(1), Z(-4), 'minecraft:crafting_table')
  set(X(6), Y(1), Z(-6), 'minecraft:anvil[facing=south]')
  set(X(8), Y(1), Z(-6), 'minecraft:smithing_table')
  set(X(10), Y(1), Z(-6), 'minecraft:grindstone[face=floor,facing=south]')
  set(X(12), Y(1), Z(-6), 'minecraft:cauldron')
  set(X(14), Y(1), Z(-6), 'minecraft:loom')
  label(X(5), Y(2), Z(-6), 'ANVIL / SMITH')

  log('water basin for concrete')
  fill(X(16), Y(1), Z(-14), X(22), Y(1), Z(-8), 'minecraft:smooth_stone')
  fill(X(17), Y(1), Z(-13), X(21), Y(1), Z(-9), 'minecraft:water')
  for (let x = 16; x <= 22; x++) { set(X(x), Y(2), Z(-14), 'minecraft:stone_bricks'); set(X(x), Y(2), Z(-8), 'minecraft:stone_bricks') }
  for (let z = -14; z <= -8; z++) { set(X(16), Y(2), Z(z), 'minecraft:stone_bricks'); set(X(22), Y(2), Z(z), 'minecraft:stone_bricks') }
  label(X(18), Y(3), Z(-14), 'CONCRETE WATER')

  log('chest warehouse (input rows)')
  const rows = [
    { z: 4, name: 'SAND / GRAVEL / CLAY' },
    { z: 6, name: 'DYES + BONE + INK' },
    { z: 8, name: 'DEEPSLATE / TUFF / STONE' },
    { z: 10, name: 'COAL / IRON / NETHERITE' },
    { z: 12, name: 'NETER / END / MOB DROPS' }
  ]
  for (const row of rows) {
    for (let i = 0; i < 9; i++) set(X(-20 + i * 5), Y(1), Z(row.z), 'minecraft:chest[facing=south]')
    label(X(-22), Y(2), Z(row.z), row.name)
  }
  log('output barrels')
  for (let i = 0; i < 9; i++) set(X(-20 + i * 5), Y(1), Z(14), 'minecraft:barrel')
  label(X(-22), Y(2), Z(14), 'OUTPUT')

  log('nether + end portals')
  // nether portal: obsidian frame 4x5 at x 18..21, z -2
  fill(X(18), Y(1), Z(-2), X(21), Y(5), Z(-2), 'minecraft:obsidian')
  fill(X(19), Y(2), Z(-2), X(20), Y(4), Z(-2), 'minecraft:nether_portal')
  label(X(18), Y(6), Z(-2), 'NETHER')
  // end portal: 3x3 frame of end portal frames with eyes, then portal inside
  for (let x = -21; x <= -19; x++) {
    for (let z = -3; z <= -1; z++) {
      const edge = x === -21 || x === -19 || z === -3 || z === -1
      if (edge) set(X(x), Y(1), Z(z), 'minecraft:end_portal_frame[eye=true]')
    }
  }
  fill(X(-20), Y(1), Z(-2), X(-20), Y(1), Z(-2), 'minecraft:end_portal')
  label(X(-21), Y(3), Z(-4), 'END')

  log('spawn point / bed / lighting')
  set(X(0), Y(1), Z(0), 'minecraft:red_bed[facing=south,part=foot]')
  set(X(0), Y(1), Z(1), 'minecraft:red_bed[facing=south,part=head]')
  for (let x = -24; x <= 24; x += 6) {
    set(X(x), Y(6), Z(-8), 'minecraft:sea_lantern')
    set(X(x), Y(6), Z(8), 'minecraft:sea_lantern')
  }
  cmd(`setworldspawn ${X(0)} ${Y(1)} ${Z(0)}`)
}

async function surfaceY () {
  const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'YardSurvey', version: '26.2', auth: 'offline' })
  await new Promise((resolve, reject) => {
    bot.once('spawn', resolve)
    bot.once('error', reject)
  })
  const { Vec3 } = await import('vec3')
  // long flights can outrun chunk sending in a brand new world, so build the yard at the
  // spot the server spawned us on (that IS the spawn area) instead of flying to 0,0
  const started = Date.now()
  while (Date.now() - started < 30000) {
    if (bot.blockAt(bot.entity.position)) break
    await new Promise(r => setTimeout(r, 300))
  }
  const here = bot.entity.position.floored()
  let best = null
  for (const [dx, dz] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) {
    for (let probe = here.y + 40; probe > 1; probe--) {
      const block = bot.blockAt(new Vec3(here.x + dx, probe, here.z + dz))
      if (block && block.type !== 0 && block.name !== 'water' && block.name !== 'flowing_water' && block.name !== 'lava') {
        if (best == null || probe + 1 > best) best = probe + 1
        break
      }
    }
  }
  bot.quit()
  if (best == null) throw new Error('could not find a buildable surface near the spawn')
  return { x: here.x, y: best, z: here.z }
}

let origin
if (originArg) {
  origin = originArg.split(',').map(Number)
  log(`origin from CLI: ${origin.join(',')}`)
} else {
  const spot = await surfaceY()
  origin = [spot.x, spot.y, spot.z]
  log(`buildable surface near spawn: y=${spot.y - 1}, yard floor at ${spot.x},${spot.y},${spot.z}`)
}

buildYard(origin[0], origin[1], origin[2])
log(`${commands.length} commands prepared`)

if (DRY) {
  for (const c of commands.slice(0, 20)) console.log('  ' + c)
  process.exit(0)
}

for (const c of commands) fs.appendFileSync(FIFO, `${c}\n`)
log('commands sent to the server console')
