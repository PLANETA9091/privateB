#!/usr/bin/env node
// Builds the crafting/smelting yard at the world spawn on the test server:
// floor, furnaces, blast furnaces, smokers, stonecutters, crafting tables, anvils,
// water pool for concrete, nether + end portals, a bed, lighting and a labelled chest
// warehouse. Everything is placed through the server console pipe (no client needed).
//
// (v0.18.17) FIRE-AND-FORGET IS FORBIDDEN: run 35521952724 lost ~159 of 169
// commands in the fifo transport (only the last 11 executed - zero feedback,
// zero errors) and the whole fleet banked into an empty yard, banked=0 forever.
// The survey bot now STAYS ONLINE as chunk-keeper and verification witness:
// after the batch the yard is probed client-side (findBlocks) and RE-SENT
// (idempotent) until the structures are real, or the script dies LOUD (exit 1)
// instead of poisoning a whole fleet run.
//
//   node scripts/setup-yard.mjs [--origin 0,72,0] [--dry]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mineflayer from 'mineflayer'
import { tallyYardBlocks, yardVerdict } from '../src/lib/yardcheck.mjs'

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
  if (best == null) { bot.quit(); throw new Error('could not find a buildable surface near the spawn') }
  // (v0.18.17) the bot STAYS ONLINE: it is both the chunk-keeper for the console
  // build AND the verification witness. The old flow quit here - run #130 then
  // lost ~159 of 169 commands to the fifo transport with zero feedback, and the
  // fleet banked into an empty yard for the whole run.
  return { bot, origin: [here.x, best, here.z] }
}

// Client-side truth: count the yard structures in the SURVEY BOT's own world
// view. Match on name ONLY then convert through blockAt - the palette trap from
// smelting.mjs applies verbatim (a position guard inside the matcher makes
// findBlocks return NOTHING).
const YARD_BLOCK_NAMES = ['chest', 'trapped_chest', 'barrel', 'furnace', 'blast_furnace', 'smoker']
async function verifyYard (bot, origin) {
  const { Vec3 } = await import('vec3')
  const center = new Vec3(origin[0], origin[1], origin[2])
  let last = { ok: false, detail: 'never probed' }
  // block updates stream in right after the commands execute; a short settle
  // ladder absorbs the stragglers without a fixed long sleep
  for (const settleMs of [2500, 1500, 1500, 3000]) {
    await new Promise(r => setTimeout(r, settleMs))
    try {
      const found = bot.findBlocks({ matching: b => YARD_BLOCK_NAMES.includes(b.name), maxDistance: 48, count: 200 })
      const tally = tallyYardBlocks(found.map(p => bot.blockAt(p)?.name).filter(Boolean))
      last = yardVerdict(tally)
      if (last.ok) return last
    } catch (e) {
      last = { ok: false, detail: `probe error (${e.message})` }
    }
  }
  return last
}

let origin
let surveyBot = null
if (originArg) {
  origin = originArg.split(',').map(Number)
  log(`origin from CLI: ${origin.join(',')}`)
} else {
  const spot = await surfaceY()
  surveyBot = spot.bot
  origin = spot.origin
  log(`buildable surface near spawn: y=${origin[1] - 1}, yard floor at ${origin[0]},${origin[1]},${origin[2]}`)
}

buildYard(origin[0], origin[1], origin[2])
log(`${commands.length} commands prepared`)

if (DRY) {
  for (const c of commands.slice(0, 20)) console.log('  ' + c)
  surveyBot?.quit?.()
  process.exit(0)
}

// (v0.18.17) ONE atomic write for the whole batch. The old loop did 169 separate
// open/write/close cycles - each close is an EOF boundary on the fifo, and run
// #130 measured exactly that kind of burst losing everything but the last ~11
// commands. 9.3KB fits the 64KB kernel fifo buffer with room to spare.
fs.appendFileSync(FIFO, commands.join('\n') + '\n')
log('commands sent to the server console')

// VERIFY-AND-RESEND: the batch is idempotent (same commands, same coordinates),
// so a swallowed transport costs a resend, not the fleet's bank chain.
let verdict = { ok: false, detail: 'not verified' }
const ATTEMPTS = 3
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  if (attempt > 1) {
    log(`resending all ${commands.length} commands (attempt ${attempt}/${ATTEMPTS})`)
    fs.appendFileSync(FIFO, commands.join('\n') + '\n')
  }
  verdict = await verifyYard(surveyBot, origin)
  log(`attempt ${attempt}: ${verdict.detail}`)
  if (verdict.ok) break
}
surveyBot?.quit?.()
if (!verdict.ok) {
  log(`YARD BUILD FAILED after ${ATTEMPTS} attempts: ${verdict.detail}`)
  log('the fleet would bank into an empty yard - fix the cmd.fifo transport and re-run')
  process.exit(1)
}
log('yard verified - chests and machines are real blocks in the world')
