// Scout: the fleet's eyes. createScan records what the bot sees into the WorldMap,
// createPatrol walks (or flies) a lawnmower route and scans along the way.
// Both are driven here with a mock bot - no server needed, exactly the API the real
// mineflayer bot exposes (findBlocks / blockAt / entity.position / pathfinder.goto).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { WorldMap } from '../../src/fleet/worldmap.mjs'
import { createScan, createPatrol } from '../../src/bots/scout.mjs'

// A tiny mock world: target blocks the scout can "see", positioned around the origin.
function makeMockBot ({ blocks = [], start = new Vec3(0.5, 64, 0.5), movePerGoto = 12 } = {}) {
  const bot = {
    entity: { position: start.clone() },
    findBlocks: ({ matching, count = Infinity }) => {
      const hits = blocks.filter(b => matching({ name: b.name })).map(b => new Vec3(b.x, b.y, b.z))
      return hits.slice(0, count)
    },
    blockAt: p => {
      const b = blocks.find(b => b.x === p.x && b.y === p.y && b.z === p.z)
      return b ? { name: b.name } : null
    },
    gotoCalls: 0,
    pathfinder: {
      goto: async goal => {
        bot.gotoCalls++
        const pos = bot.entity.position
        const dx = goal.x - pos.x
        const dz = goal.z - pos.z
        const dist = Math.hypot(dx, dz)
        if (dist > movePerGoto) {
          bot.entity.position = new Vec3(pos.x + dx / dist * movePerGoto, pos.y, pos.z + dz / dist * movePerGoto)
        } else {
          bot.entity.position = new Vec3(goal.x, pos.y, goal.z)
        }
      }
    },
    flyTravelCalls: 0,
    flyTravel: null
  }
  return bot
}

test('createScan records found blocks into the map and marks the chunk scanned', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({
    blocks: [
      { name: 'sand', x: 2, y: 64, z: 2 },
      { name: 'sand', x: -3, y: 64, z: 1 },
      { name: 'coal_ore', x: 4, y: 60, z: 5 }
    ]
  })
  const stats = { scans: 0, found: 0 }
  const scan = createScan({ bot, map, stats })
  const seen = await scan()
  assert.equal(seen, 3)
  assert.equal(stats.scans, 1)
  assert.equal(stats.found, 3)
  assert.equal(map.size('sand'), 2)
  assert.equal(map.size('coal_ore'), 1)
  assert.ok(map.isScanned(0, 0), 'the chunk the bot stands in must be marked scanned')
})

test('createScan does not duplicate known positions (rescan is idempotent)', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({ blocks: [{ name: 'gravel', x: 1, y: 64, z: 1 }] })
  const stats = { scans: 0, found: 0 }
  const scan = createScan({ bot, map, stats })
  await scan()
  await scan()
  await scan()
  assert.equal(map.size('gravel'), 1)
  assert.equal(stats.found, 1, 'only the first scan adds new entries')
  assert.equal(stats.scans, 3)
})

test('createScan survives blocks that vanish between findBlocks and blockAt', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({ blocks: [{ name: 'clay', x: 0, y: 64, z: 0 }] })
  bot.blockAt = () => null // chunk unloaded mid-scan
  const scan = createScan({ bot, map })
  const seen = await scan()
  assert.equal(seen, 1)
  assert.equal(map.total(), 0)
})

test('createScan logs when new positions appear', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({ blocks: [{ name: 'iron_ore', x: 3, y: 64, z: 3 }] })
  const lines = []
  const scan = createScan({ bot, map, log: m => lines.push(m) })
  await scan()
  assert.ok(lines.some(l => l.includes('+1')), `log must announce the new entry, got: ${lines.join(' | ')}`)
})

test('ground patrol walks lanes, scans along the way and feeds the map', async () => {
  const map = new WorldMap()
  // a sand pit straight east along lane 0
  const bot = makeMockBot({
    blocks: [
      { name: 'sand', x: 20, y: 64, z: 0 },
      { name: 'sand', x: 24, y: 64, z: 0 }
    ]
  })
  const stats = { scans: 0, found: 0, travelled: 0 }
  const scan = createScan({ bot, map, stats })
  const patrol = createPatrol({ bot, map, scan, stats })
  const res = await patrol({ heading: 'east', distance: 48, lanes: 2, laneGap: 16, seconds: 5 })
  assert.ok(stats.travelled > 0, 'ground scout must actually walk')
  assert.ok(map.size('sand') >= 1, 'the sand pit must be on the map')
  assert.ok(res.map.positions >= 1)
  assert.ok(bot.gotoCalls >= 4, `patrol must drive the pathfinder, got ${bot.gotoCalls} goto calls`)
  assert.ok(stats.scans >= 2, 'must scan at every leg')
  // the mock bot never falls behind: after lane 0 (z=0) and the shift, lane 1 sits at z=16
  assert.ok(Math.abs(bot.entity.position.z - 16) < 8 || bot.entity.position.z > 8,
    `lane shift must move across lanes, z=${bot.entity.position.z}`)
})

test('fly patrol uses flyTravel when the bot can fly (kept for no-allow-flight=false worlds)', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({ blocks: [] })
  bot.flyTravel = async step => {
    bot.flyTravelCalls++
    bot.entity.position = new Vec3(step.x, step.y, step.z) // teleport like the real flyer
  }
  const scan = createScan({ bot, map })
  const stats = { scans: 0, found: 0, travelled: 0 }
  const patrol = createPatrol({ bot, map, scan, stats })
  await patrol({ heading: 'east', distance: 64, lanes: 1, laneGap: 8, seconds: 3 })
  assert.ok(bot.flyTravelCalls >= 2, 'fly mode must ride flyTravel')
  assert.equal(bot.gotoCalls, 0, 'fly mode must not touch the pathfinder')
  assert.equal(bot.entity.position.y, 110, 'fly lanes ride the configured altitude')
})

test('patrol respects the deadline even when the bot cannot move', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({ blocks: [] })
  bot.pathfinder.goto = async () => { throw new Error('stuck') } // wedged against a cliff
  // NOTE: the SAME stats object must go into createScan AND createPatrol - createScan
  // otherwise builds its own internal stats and every scans assertion would see a
  // frozen 0 forever (this was a test bug, not a patrol bug)
  const stats = { scans: 0, found: 0, travelled: 0 }
  const scan = createScan({ bot, map, stats })
  const patrol = createPatrol({ bot, map, scan, stats })
  const t0 = Date.now()
  await patrol({ heading: 'north', distance: 96, lanes: 8, laneGap: 24, seconds: 1 })
  const secs = (Date.now() - t0) / 1000
  assert.ok(secs < 5, `a stuck scout must give up at the deadline, took ${secs.toFixed(1)}s`)
  assert.ok(stats.scans >= 1, 'even a stuck scout scans where it stands')
})

// ---- (v0.531.0) THE GET-UP - the scout's death leg ----
// A dead scout never got up: no 'death' handler, no respawn byte (mineflayer
// does NOT auto-respawn), no cause line, no drop accounting - the map's only
// writer died silently and the patrol burned the run's remainder on a corpse.
// The watch is driven here with a mock bot, exactly the createScan contract.
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createDeathWatch } from '../../src/bots/scout.mjs'

const sleep = ms => new Promise(r => setTimeout(r, ms))

function makeDeathBot ({ username = 'FleetScout', items = null, pos = new Vec3(-12.5, 64, 300.5), respawnThrows = false } = {}) {
  const bot = new EventEmitter()
  bot.username = username
  bot.entity = pos ? { position: pos } : null
  bot.inventory = items === null ? null : { items: () => items }
  bot.respawnCalls = 0
  bot.respawn = () => {
    bot.respawnCalls++
    if (respawnThrows) throw new Error('client this dead never throws back')
  }
  return bot
}

test('death watch: a dead scout gets up - the death line, the count, the respawn byte', async () => {
  const bot = makeDeathBot()
  const lines = []
  const stats = { deaths: 0 }
  createDeathWatch({ bot, tag: '[FleetScout]', stats, log: m => lines.push(m) })
  bot.emit('death')
  assert.equal(stats.deaths, 1, 'the death must be counted')
  assert.equal(lines.length, 1, 'no server line, an empty-null pocket - exactly one line')
  assert.match(lines[0], /\[FleetScout\] died - respawning \(cause: no readable server line/)
  await sleep(1100)
  assert.equal(bot.respawnCalls, 1, 'the miner\u0027s exact byte: 1s delayed respawn')
})

test('death watch: the server line is the authority (the v0.117.0 doctrine, priced to this bot)', async () => {
  const bot = makeDeathBot()
  const lines = []
  const stats = { deaths: 0 }
  createDeathWatch({ bot, tag: '[FleetScout]', stats, log: m => lines.push(m) })
  bot.emit('message', 'FleetScout was slain by Zombie')
  bot.emit('death')
  assert.match(lines[0], /cause: server: was slain by Zombie \[kind=mob by Zombie\]/, 'the server kind rides the miner\u0027s shape')
})

test('death watch: a join line and another bot\u0027s death never claim this bot', async () => {
  const bot = makeDeathBot()
  const lines = []
  const stats = { deaths: 0 }
  createDeathWatch({ bot, tag: '[FleetScout]', stats, log: m => lines.push(m) })
  bot.emit('message', 'FleetScout joined the game') // the NOT_DEATH guard: not a death
  bot.emit('message', 'F2 was slain by Zombie') // the fleet shares one chat: another bot's line
  bot.emit('death')
  assert.match(lines[0], /cause: no readable server line/, 'junk claims degrade to the honest no-line verdict, never a fake cause')
})

test('death watch: the pocket dies accounted in the SHARED format', async () => {
  const bot = makeDeathBot({ items: [{ name: 'sweet_berries', count: 6 }, { name: 'dirt', count: 2 }] })
  const lines = []
  const stats = { deaths: 0 }
  createDeathWatch({ bot, tag: '[FleetScout]', stats, log: m => lines.push(m) })
  bot.emit('death')
  assert.equal(lines.length, 2)
  assert.match(lines[1], /death drop: ~8u lost at \[-13,64,300\] \(sweet_berries 6, dirt 2\)/, 'the fleet\u0027s death ledger reads one format - the berry pocket like the miner\u0027s ore')
})

test('death watch: an empty pocket prints the shared zero line, a dead inventory prints none', async () => {
  const bot = makeDeathBot({ items: [] })
  const lines = []
  createDeathWatch({ bot, tag: '[FleetScout]', stats: { deaths: 0 }, log: m => lines.push(m) })
  bot.emit('death')
  assert.match(lines[1], /death drop: pocket read empty at death \(0u\)/, 'the zero is a readable zero')
  const bot2 = makeDeathBot() // inventory null - the read itself is gone
  const lines2 = []
  createDeathWatch({ bot: bot2, tag: '[FleetScout]', stats: { deaths: 0 }, log: m => lines2.push(m) })
  bot2.emit('death')
  assert.equal(lines2.length, 1, 'no readable pocket, no fake drop line')
})

test('death watch: the handler never throws - a junk world and a throwing respawn still get up', async () => {
  const bot = makeDeathBot({ pos: null, respawnThrows: true })
  bot.inventory = { items: () => { throw new Error('the read is gone') } }
  const lines = []
  const stats = { deaths: 0 }
  createDeathWatch({ bot, tag: '[FleetScout]', stats, log: m => lines.push(m) })
  bot.emit('death') // must not throw
  assert.equal(stats.deaths, 1, 'the count rides the guarded read\u0027s head')
  await sleep(1100)
  assert.equal(bot.respawnCalls, 1, 'the respawn byte sits OUTSIDE the guard\u0027s try - a client this dead never blocks it')
  // the same byte for a chat listener whose renderer throws
  const bot3 = makeDeathBot()
  const lines3 = []
  createDeathWatch({ bot: bot3, tag: '[FleetScout]', stats: { deaths: 0 }, log: m => lines3.push(m) })
  bot3.emit('message', { toString: () => { throw new Error('the renderer is gone') } })
  bot3.emit('death')
  assert.match(lines3[0], /cause: no readable server line/, 'a dead chat renderer reads as no line, never as a crash')
  await sleep(1100)
})

test('death watch: two deaths count two - the respawned scout can die again', async () => {
  const bot = makeDeathBot()
  const lines = []
  const stats = { deaths: 0 }
  createDeathWatch({ bot, tag: '[FleetScout]', stats, log: m => lines.push(m) })
  bot.emit('death')
  await sleep(1100)
  bot.emit('death')
  await sleep(1100)
  assert.equal(stats.deaths, 2)
  assert.equal(bot.respawnCalls, 2, 'every death gets its own byte')
})

test('death watch: the wire and the doctrine are pinned in the source', () => {
  const root = new URL('../../', import.meta.url).pathname
  const src = readFileSync(path.join(root, 'src', 'bots', 'scout.mjs'), 'utf8')
  assert.ok(src.includes("import { deathDropLine } from '../lib/statcarry.mjs'"), 'the SHARED drop format import')
  assert.ok(src.includes("import { parseDeathMessage } from '../lib/deathcause.mjs'"), 'the server-line parser import')
  assert.ok(src.includes('a death handler must never walk'), 'the doctrine line lives in the source')
  assert.ok(src.includes('Date.now() - serverDeath.at < 6000'), 'the same 6s freshness window the miner\u0027s authority rides')
  assert.ok(/setTimeout\(\(\) => \{ try \{ bot\.respawn\?\.\(\) \} catch \{ \/\* server respawns us anyway \*\/ \} \}, 1000\)/.test(src), 'the miner\u0027s exact respawn byte')
  assert.ok(src.includes('createDeathWatch({ bot, tag, stats, log })'), 'the wire in createScout (the raw log - the line carries its own tag)')
  assert.ok(src.includes('const stats = { scans: 0, found: 0, travelled: 0, deaths: 0 }'), 'deaths joins the report stats')
})

// ---- (v0.532.0) THE NIGHT HOLD-AND-SCAN: the ground patrol's walk legs ride the
// fleet's own walk-forbidden window - the held shape is stand-and-scan, the entry
// line names the hold once per patrol call, the fly scout skips (the pantry's law).
test('night hold: the ground patrol stands and scans instead of walking new ground', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({ blocks: [] })
  bot.time = { timeOfDay: 13000 } // deep inside the walk-forbidden window (12400..23600)
  const stats = { scans: 0, found: 0, travelled: 0 }
  let scans = 0
  const scan = async () => { scans++ }
  const lines = []
  const patrol = createPatrol({ bot, map, scan, stats, log: m => lines.push(m) })
  await patrol({ heading: 'east', distance: 48, lanes: 2, laneGap: 16, seconds: 2, holdBeatMs: 50 })
  assert.equal(bot.gotoCalls, 0, 'a held patrol must not drive the pathfinder at all')
  assert.equal(stats.travelled, 0, 'a held patrol must not bank walked distance')
  assert.ok(scans >= 1, 'a held patrol keeps its lane knowledge current - it scans')
  const holds = lines.filter(l => l.includes('patrol held: night'))
  assert.equal(holds.length, 1, `the hold names itself ONCE per patrol call, got ${holds.length}`)
  assert.ok(holds[0].includes('tod=13000'), 'the hold line carries the clock face')
})

test('night hold: a junk clock reads go (the lib\u0027s own legacy byte), dawn reads go', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({ blocks: [] })
  // no bot.time at all - the scout cannot read the clock, the verdict is 'go'
  const stats = { scans: 0, found: 0, travelled: 0 }
  let lines = []
  const patrol = createPatrol({ bot, map, scan: async () => {}, stats, log: m => lines.push(m) })
  await patrol({ heading: 'east', distance: 24, lanes: 1, laneGap: 8, seconds: 1, holdBeatMs: 20 })
  assert.ok(stats.travelled > 0, 'a bot that cannot read the clock walks (junk never widens a refusal)')
  assert.equal(lines.filter(l => l.includes('patrol held')).length, 0, 'a walking patrol names no hold')

  const bot2 = makeMockBot({ blocks: [] })
  bot2.time = { timeOfDay: 1000 } // dawn: the window is far away
  const stats2 = { scans: 0, found: 0, travelled: 0 }
  const patrol2 = createPatrol({ bot: bot2, map, scan: async () => {}, stats: stats2, log: m => lines.push(m) })
  await patrol2({ heading: 'east', distance: 24, lanes: 1, laneGap: 8, seconds: 1, holdBeatMs: 20 })
  assert.ok(stats2.travelled > 0, 'dawn walks')
})

test('night hold: the fly scout skips the hold (altitude-110 lanes own no ground spawn pressure)', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({ blocks: [] })
  bot.time = { timeOfDay: 13000 }
  bot.flyTravel = async step => { bot.flyTravelCalls++; bot.entity.position = new Vec3(step.x, step.y, step.z) }
  const stats = { scans: 0, found: 0, travelled: 0 }
  const lines = []
  const patrol = createPatrol({ bot, map, scan: async () => {}, stats, log: m => lines.push(m) })
  await patrol({ heading: 'east', distance: 64, lanes: 1, laneGap: 8, seconds: 1, holdBeatMs: 20 })
  assert.ok(bot.flyTravelCalls >= 1, 'the fly scout keeps flying through the night window')
  assert.equal(lines.filter(l => l.includes('patrol held')).length, 0, 'the fly scout names no hold')
})

test('night hold: the wire is pinned in the source (the verdict, the two gates, the tagged log)', () => {
  const root = new URL('../../', import.meta.url).pathname
  const src = readFileSync(path.join(root, 'src', 'bots', 'scout.mjs'), 'utf8')
  assert.ok(src.includes("import { walkForbidden } from '../lib/nightsafety.mjs'"), 'the fleet\u0027s own walk-forbidden verdict (one doctrine)')
  assert.ok(src.includes("if (!walkForbidden(bot.time?.timeOfDay)) return false"), 'junk-safe: an unreadable clock reads go')
  assert.ok(src.includes('log(`patrol held: night (tod=${Math.floor(bot.time?.timeOfDay ?? 0)}) - standing and scanning until dawn`)'), 'the defer line, one form')
  const gates = src.match(/if \(nightHold\(\)\) \{/g) || []
  assert.equal(gates.length, 2, 'the hold gates BOTH the step loop and the lane shift - a crossing is new ground too')
  assert.ok(src.includes('createPatrol({ bot, map, scan: scanWithBerry, stats, log: m => log(`${tag} ${m}`) })'), 'the tagged log reaches the patrol (the raw [scout] channel)')
})

// ---- (v0.533.0) THE SEAL WATCH'S SECOND SEAT: the respawn accounting reaches
// the scout - the stake rides the SAME guarded read as the drop line, the spawn
// listener pays ONCE with the miner's exact 3000ms delayed read; the declare leg
// stays the miner's (no combat sentry here - the honest pricing pinned).
test('seal respawn accounting: a seal stake dying on the scout is priced once at the respawn', async () => {
  const bot = makeDeathBot({ items: [{ name: 'cobblestone', count: 64 }, { name: 'sweet_berries', count: 5 }] })
  const lines = []
  const stats = { deaths: 0 }
  createDeathWatch({ bot, tag: '[FleetScout]', stats, log: m => lines.push(m) })
  bot.emit('death')
  bot.inventory = { items: () => [{ name: 'sweet_berries', count: 5 }] } // the respawn pocket: the seal stake is gone
  bot.emit('spawn') // mineflayer fires spawn on login/dimension changes too - the flag gates those; this one follows a death
  await sleep(3100) // the miner's exact 3000ms delayed read (the inventory syncs after the respawn packet)
  const seal = lines.filter(l => l.includes('seal after respawn'))
  assert.equal(seal.length, 1, `ONE accounting per death, got ${seal.length}`)
  assert.match(seal[0], /pocket 0u seal, 64u of the 64u stake is gone - the floor must re-earn/, 'the honest floor arithmetic')
})

test('seal respawn accounting: no death, no accounting (the flag gates the login/dimension spawns)', async () => {
  const bot = makeDeathBot({ items: [{ name: 'cobblestone', count: 64 }] })
  const lines = []
  const stats = { deaths: 0 }
  createDeathWatch({ bot, tag: '[FleetScout]', stats, log: m => lines.push(m) })
  bot.emit('spawn') // the initial login spawn - no death ever happened
  await sleep(3100)
  assert.equal(lines.filter(l => l.includes('seal after respawn')).length, 0, 'no death, no line')
})

test('seal respawn accounting: an empty seal stake says so (the honest zero, never invented)', async () => {
  const bot = makeDeathBot({ items: [{ name: 'sweet_berries', count: 5 }] })
  const lines = []
  const stats = { deaths: 0 }
  createDeathWatch({ bot, tag: '[FleetScout]', stats, log: m => lines.push(m) })
  bot.emit('death')
  bot.emit('spawn')
  await sleep(3100)
  const seal = lines.filter(l => l.includes('seal after respawn'))
  assert.equal(seal.length, 1, 'the accounting never vanishes silently')
  assert.match(seal[0], /pocket 0u seal - the death stake was empty, the floor starts from zero/)
})

test('seal respawn accounting: the wire is pinned in the source (the same-read law, the miner\u0027s byte, the declare leg stays out)', () => {
  const root = new URL('../../', import.meta.url).pathname
  const src = readFileSync(path.join(root, 'src', 'bots', 'scout.mjs'), 'utf8')
  assert.ok(src.includes("import { sealSnapshot, sealRespawnLine } from '../lib/sealwatch.mjs'"), 'the accounting leg\u0027s import')
  assert.ok(!src.includes('sealDeclareLine'), 'the declare leg stays the miner\u0027s - the scout has no combat sentry, no risk semantics to arm it honestly')
  assert.ok(src.includes('const dropItems = bot.inventory?.items?.() ?? null'), 'ONE guarded pocket read at death')
  assert.ok(src.includes('sealDeathStake = sealSnapshot(dropItems)'), 'the seal stake rides the SAME guarded read (the miner\u0027s exact law)')
  assert.ok(src.includes('if (!sealRespawnOwed) return'), 'the flag gates the login/dimension spawns out')
  assert.ok(/}, 3000\)/.test(src), 'the miner\u0027s exact 3000ms delayed read')
})
