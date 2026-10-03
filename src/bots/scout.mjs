// Prospector bot: patrols a pattern across the world and records whatever it can see.
// This is how the fleet learns where resources are - nothing is pre-placed.
// Ground mode (default): walks surface lanes with the pathfinder - exactly the mode the
// production fleet runs in (allow-flight=false would kick a flying bot).
// Fly mode (fly: true): the original airborne lawnmower, kept for worlds where flying is allowed.
import mineflayer from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import { loader as autoeat } from 'mineflayer-auto-eat'
import { Vec3 } from 'vec3'
import { installFly } from '../lib/fly.mjs'
import { gotoSafe, withTimeout } from '../lib/jobqueue.mjs'
import { attachChatSync } from '../fleet/chatsync.mjs'
import { RATION_OPTS, rationVerdict } from '../lib/ration.mjs' // (v0.528.0) THE HEDGE PANTRY's eating leg - the SAME policy object the miner's ration wires (one doctrine)
import { BERRY_BUSH, BERRY_ITEM, SCOUT_HUNGER_BAND, BERRY_POCKET_CAP, BERRY_REACH, BERRY_COUNT, BERRY_PICKUP_MS, BERRY_WALK_CAP, BERRY_WALK_TIMEOUT_MS, berryHarvestDue, pocketBerries, pickBush, recordBush, famineWalkPlan } from '../lib/berry.mjs'
import { deathDropLine } from '../lib/statcarry.mjs' // (v0.531.0) THE GET-UP - the SHARED death-drop format (the fleet's death ledger reads one shape)
import { parseDeathMessage } from '../lib/deathcause.mjs' // (v0.531.0) the server's death line - the only authority this bot has
import { sealSnapshot, sealRespawnLine } from '../lib/sealwatch.mjs' // (v0.533.0) the seal watch's respawn accounting reaches the second bot - the declare leg stays the miner's (no combat sentry here)
import { walkForbidden } from '../lib/nightsafety.mjs' // (v0.532.0) THE NIGHT HOLD-AND-SCAN - the patrol's walk legs ride the fleet's own walk-forbidden window

const { pathfinder, Movements, goals } = pathfinderPkg

// Blocks worth remembering while scanning (natural resources the build needs).
export const SCAN_TARGETS = [
  'sand', 'gravel', 'clay', 'oak_log', 'birch_log', 'spruce_log', 'dark_oak_log', 'jungle_log',
  'stone', 'deepslate', 'andesite', 'diorite', 'tuff', 'basalt', 'blackstone', 'coal_ore',
  'iron_ore', 'copper_ore', 'dirt', 'grass_block', 'soul_soil', 'obsidian', 'terracotta',
  'mangrove_roots', 'mud'
]

// One scan of everything currently loaded around the bot, recorded into the shared map.
// Kept small and yielding: a long synchronous scan starves the event loop, which got
// flying scouts kicked for floating (ground scouts just stutter, but still - yield).
// Exported separately so unit tests can drive it with a mock bot.
export function createScan ({ bot, map, targets = SCAN_TARGETS, stats = { scans: 0, found: 0 }, log = () => {}, bushMemory = null } = {}) {
  return async function scan () {
    const found = bot.findBlocks({
      matching: block => targets.includes(block.name),
      maxDistance: 48,
      count: 192
    })
    stats.scans++
    const here = bot.entity?.position?.floored() ?? { x: 0, z: 0 }
    map?.markScanned(here.x >> 4, here.z >> 4)
    let added = 0
    for (let i = 0; i < found.length; i++) {
      const block = bot.blockAt(found[i])
      if (!block) continue
      const before = map ? map.size(block.name) : 0
      map?.add(block.name, found[i])
      if (map && map.size(block.name) > before) added++
      if (i % 32 === 31) await new Promise(resolve => setImmediate(resolve))
    }
    stats.found += added
    // (v0.534.0) THE FAMINE WALK's memory shoulder: the scan ALSO reads the bushes
    // it sees (one finder pass, the same 48-block eye, sparse - hedges are rare)
    // into the scout's PRIVATE bush memory. The shared map stays the MINERS'
    // resource book - bushes are the pantry's knowledge, never a mining target.
    // The record is position-only (a young bush ripens - the knowledge is the
    // cell, the maturity is priced at the pick by the live read). Guarded like
    // the whole scan: the memory shoulder must never break the scan's verdict.
    if (bushMemory) {
      try {
        const bushes = bot.findBlocks({ matching: b => b?.name === BERRY_BUSH, maxDistance: BERRY_WALK_CAP, count: 16 }) ?? []
        for (const b of bushes) recordBush(bushMemory, b)
      } catch { /* the memory shoulder must never break the scan */ }
    }
    if (added > 0 && log) log(`scan: +${added} new positions (total ${map?.total() ?? 0})`)
    return found.length
  }
}

// (v0.528.0) THE HEDGE PANTRY's gather leg - the berry stop. Rides the scan
// cadence (the wire composes it after every scan, zero patrol-loop changes):
// the due gate (the band + the cap, junk-safe reads, refusals quiet), one
// bush, one walk, one right-click activate (NOT a dig - the bush survives),
// the drops' landing wait, the pocket delta names the harvest. The fly
// scout skips the pantry (a mid-air activate is an unpriced interaction -
// the production shape is ground). Exported so unit tests drive it with a
// mock bot, exactly the createScan/createPatrol contract.
// (v0.537.0) THE PANTRY'S BOOK - the counters ride the scout's stats through an
// injected `stats` (null stays the tests' junk-safe shape: no book, no counts, no
// throw). Two monotone integers, the carry's own class: berryPicked (the pocket
// delta the pantry bought, zeros included - a bare bush's zero is a readable
// zero, the sum just doesn't move) and berryWalks (famine walks SPENT - a walk
// is spent once attempted, before the goto, the failed and gone walks count
// exactly like the paid ones: the spend is the walk, the pay is the delta).
// Without the book the run's report could not say whether the pantry ever fired
// - the v0.535.0 lesson's exact shape (the verdict discarded by its only
// composer), and the fields ride SCOUT_CARRY_FIELDS so the attempt rebuild
// cannot zero the pantry's half of the book (the v0.536.0 lie, two fields wide).
export function createBerryStop ({ bot, log = () => {}, bushMemory = null, stats = null } = {}) {
  return async function berryStop () {
    try {
      if (bot?.flyTravel) return { due: false, why: 'the fly scout skips the pantry' }
      const hunger = bot?.food ?? null
      const pocket = pocketBerries(bot)
      const due = berryHarvestDue({ hunger, pocket })
      if (!due.due) return due // quiet: the healthy lean is silent, the cap holds, the dead reads wait
      // (v0.534.0) the pick flow, shared by both shapes: one activate (NOT a dig
      // - the bush survives), the drops' landing wait, the pocket delta names
      // the harvest. The walked shape's line names the walk (the field splits
      // the reach pick from the famine walk by the line's own key).
      const harvestAt = async (live, { walked = false } = {}) => {
        const f0 = pocketBerries(bot)
        await withTimeout(bot.activateBlock(live), 5000, 'berry harvest')
        await new Promise(resolve => setTimeout(resolve, BERRY_PICKUP_MS))
        const f1 = pocketBerries(bot)
        const picked = Math.max(0, (f1 ?? 0) - (f0 ?? 0))
        log(`berry: ${walked ? 'famine walk picked' : 'picked'} ${picked} x ${BERRY_ITEM} (hunger ${hunger} -> ${bot?.food ?? '?'}, pocket ${f0 ?? '?'} -> ${f1 ?? '?'})`)
        if (stats) stats.berryPicked = (stats.berryPicked ?? 0) + picked // (v0.537.0) the pay lands even when it is zero - the readable zero
        return { due: true, picked, walked }
      }
      const found = bot.findBlocks({ matching: b => b?.name === BERRY_BUSH, maxDistance: BERRY_REACH, count: BERRY_COUNT }) ?? []
      const bush = pickBush(found, bot.entity?.position)
      if (bush) {
        await gotoSafe(bot, new goals.GoalNear(bush.position.x, bush.position.y, bush.position.z, 2), { timeoutMs: 10000, label: 'berry stop' })
        const live = bot.blockAt(bush.position)
        if (!live) return { due: false, why: 'the bush is gone' } // quiet: the world moved on
        return await harvestAt(live)
      }
      // (v0.534.0) THE FAMINE WALK: the reach is bare but the band is still below
      // the regen floor - the memory's knowledge is spent before the scout keeps
      // walking hungry. ONE bounded goto (BERRY_WALK_CAP, the scan's own eye),
      // the same honest delta, the gone record forgotten (dead knowledge must
      // not steer twice). The walk serves the regen floor itself: below the band
      // the bot cannot heal, starvation is the other death - the food walk stays
      // armed even inside the night hold (the reach hop's own law, one envelope
      // longer). No memory, an empty book, or nothing inside the envelope reads
      // the LEGACY byte - the quiet refusal the lane has always run.
      if (bushMemory && bushMemory.size > 0) {
        const plan = famineWalkPlan({ memory: bushMemory, here: bot.entity?.position })
        if (plan) {
          log(`berry: famine walk - the reach is bare, the memory knows a bush at [${plan.pos.x},${plan.pos.y},${plan.pos.z}] (${Math.round(plan.dist)} blocks)`)
          if (stats) stats.berryWalks = (stats.berryWalks ?? 0) + 1 // (v0.537.0) a walk is spent once attempted - the goto's outcome prices the pay, never the spend
          const at = new Vec3(plan.pos.x, plan.pos.y, plan.pos.z)
          try {
            await gotoSafe(bot, new goals.GoalNear(at.x, at.y, at.z, 2), { timeoutMs: BERRY_WALK_TIMEOUT_MS, label: 'berry famine walk' })
          } catch (e) {
            log(`berry: famine walk failed (${e.message})`) // a walk was spent - the field reads it
            return { due: false, why: `the famine walk failed (${e.message})` }
          }
          const live = bot.blockAt(at)
          if (!live) {
            bushMemory.delete(plan.key) // the world moved on - the record is dead knowledge, forget it
            return { due: false, why: 'the remembered bush is gone' } // quiet: the walk names itself above
          }
          return await harvestAt(live, { walked: true })
        }
      }
      return { due: false, why: 'no mature bush in reach' } // quiet: the lane keeps walking (the legacy byte)
    } catch (e) {
      log(`berry: failed (${e.message})`) // a walk was spent - the field reads the failure class
      return { due: false, why: `failed (${e.message})` }
    }
  }
}

// ---- (v0.531.0) THE GET-UP - the scout's death leg ----
// The miner's death economy never reached the scout: mineflayer does NOT
// auto-respawn, and the scout wires no 'death' handler at all - a dead scout
// stays on the death screen for the run's remainder (the fleet19 while keeps
// re-checking scout.bot.entity, which stays truthy on the death screen, so
// the patrol burns every remaining second walking a corpse - each leg eats
// its full goto timeout on a bot that cannot move), zero cause line, zero
// drop accounting - the map's only writer dies silently. THE WIRE is the
// miner's death leg priced down to what this bot owns:
// - the server's death line (the chat parse, deathcause.mjs) is the ONLY
//   authority the scout has - no combat sentry, no lastHarm, no inference
//   half; the v0.117.0 doctrine holds (the server kind outranks everything,
//   a fresh line rides the same 6s window), and no line reads honestly as
//   'no readable server line' - never a fake cause;
// - the pocket snapshot rides the SHARED deathDropLine format (statcarry.mjs)
//   - the fleet's death ledger reads one format, the scout's berry pocket
//   dies accounted like the miner's ore;
// - the respawn byte is the miner's exact shape (1s delayed bot.respawn,
//   guarded - a client this dead never throws).
// THE DOCTRINE holds: a death handler must never walk - record and respawn
// only. The respawned scout re-enters the patrol (the fleet19 while
// re-checks the deadline), the pantry re-gathers the lost berries (the
// 0.528.0 band reads the empty pocket), the legs self-heal.
// Exported so unit tests drive it with a mock bot, exactly the
// createScan/createBerryStop contract.
export function createDeathWatch ({ bot, tag = '[scout]', stats = { deaths: 0 }, log = () => {} } = {}) {
  let serverDeath = null
  // (v0.533.0) THE SEAL WATCH'S SECOND SEAT - the respawn accounting. The GET-UP
  // taught this handler to account the WHOLE pocket (the shared drop line), but
  // the seal economy never read its share: the scout walks surface lanes, picks
  // up spillage by proximity (a crossing of a mining site's dropped stacks rides
  // the pocket home), and its death scattered the seal-class stake with no line
  // ever pricing it - the miner's ledger reads 'seal after respawn' lines, the
  // scout's deaths were silent in that book. The stake rides the SAME guarded
  // read the drop line spends (one inventory touch at death - the miner's exact
  // law); the spawn listener pays the accounting once, at the first spawn after
  // the death flag, with the miner's exact 3000ms delayed read (the inventory
  // syncs after the respawn packet - an early read would print a pocket the
  // server had not filled yet). The DECLARE leg stays the miner's: the scout has
  // no combat sentry (the GET-UP's own honest pricing) - no risk semantics to
  // read, the declare's gate would never arm honestly here. Junk-safe end to
  // end: the snapshot reads a null pocket as the honest unread, the accounting
  // is guarded like every death-path read - it must never break a respawn.
  let sealDeathStake = null
  let sealRespawnOwed = false
  bot.on('message', (msg) => {
    try {
      const text = typeof msg === 'string' ? msg : (msg?.toString?.() ?? null)
      const p = parseDeathMessage(text, bot.username ?? null)
      if (p) serverDeath = { ...p, at: Date.now() }
    } catch { /* a chat listener must never throw */ }
  })
  bot.on('death', () => {
    try {
      stats.deaths = (stats.deaths ?? 0) + 1
      const fresh = serverDeath && Date.now() - serverDeath.at < 6000
      const cause = fresh
        ? `server: ${serverDeath.verb} [kind=${serverDeath.kind}${serverDeath.attacker ? ` by ${serverDeath.attacker}` : ''}]`
        : 'no readable server line (the scout has no inference sentry)'
      log(`${tag} died - respawning (cause: ${cause})`)
      const dropItems = bot.inventory?.items?.() ?? null
      const drop = deathDropLine({ tag, pos: bot.entity?.position, items: dropItems })
      if (drop) log(drop)
      sealDeathStake = sealSnapshot(dropItems) // (v0.533.0) the seal stake rides the SAME guarded read - null when the pocket never read, the honest unread
      sealRespawnOwed = true // (v0.533.0) a respawn read is now owed - the spawn listener pays it
    } catch { /* a death handler must never throw */ }
    setTimeout(() => { try { bot.respawn?.() } catch { /* server respawns us anyway */ } }, 1000)
  })
  // (v0.533.0) the accounting: ONE line per death, at the first 'spawn' after the
  // death flag (mineflayer fires 'spawn' on login and dimension changes too - the
  // flag gates those out; no death, no accounting). The miner's exact byte.
  bot.on('spawn', () => {
    try {
      if (!sealRespawnOwed) return
      sealRespawnOwed = false
      const stake = sealDeathStake
      sealDeathStake = null
      setTimeout(() => {
        try {
          const line = sealRespawnLine({ tag, death: stake, items: bot.inventory?.items?.() ?? null })
          if (line) log(line)
        } catch { /* a respawn read must never throw */ }
      }, 3000)
    } catch { /* the accounting must never break a respawn */ }
  })
}

export function createScout ({
  host = '127.0.0.1',
  port = 25565,
  username = 'Scout',
  targets = SCAN_TARGETS,
  map,
  fly = false, // ground patrol by default: allow-flight=false kicks hovering bots
  syncChat = false, // broadcast every NEW find over chat (PVB1) so bots in OTHER processes hear it
  bushMemory = null, // (v0.538.0) an injected bush book survives the attempt rebuild; null keeps the closure book
  log = () => {}
} = {}) {
  const bot = mineflayer.createBot({ host, port, username, version: '26.2', auth: 'offline' })
  bot.loadPlugin(pathfinder)
  const tag = `[${username}]`
  // ---- (v0.528.0) THE HEDGE PANTRY's eating leg - the 0.511.0 ration bytes on the second bot ----
  // The scout starves legless: no combat lane (no zombie drops), no yard visits (the
  // patrol walks away from the commons), an EMPTY spawn pocket. The eater arms byte
  // for byte like the miner's: the SAME RATION_OPTS policy object (one doctrine -
  // the regen-floor threshold 18, the four real bans, the honest flags; sweet_berries
  // are NOT banned - they are the pantry's own crop), enableAuto on EVERY spawn
  // (idempotent), and the attempts made readable with the honest before/after read
  // (the plugin's eatFinish fires in finally even for failed eats - the hunger delta
  // decides the verdict, never the hope).
  bot.loadPlugin(autoeat)
  bot.autoEat.setOpts(RATION_OPTS)
  bot.on('spawn', () => { try { bot.autoEat.enableAuto() } catch { /* gone */ } })
  let rationAttempt = null
  bot.autoEat.on('eatStart', opts => {
    try {
      rationAttempt = { item: opts?.food?.name ?? 'unknown', f0: Number.isFinite(bot.food) ? bot.food : null, h0: Number.isFinite(bot.health) ? bot.health : null }
      log(`${tag} ration: eating ${rationAttempt.item} (hunger ${rationAttempt.f0 ?? '?'}, hp ${rationAttempt.h0 ?? '?'}, ${rationVerdict({ food: bot.food, health: bot.health }).reason})`)
    } catch { rationAttempt = null }
  })
  bot.autoEat.on('eatFinish', async () => {
    const a = rationAttempt
    rationAttempt = null
    if (!a) return
    try { await bot.waitForTicks(3) } catch { return } // the client's own stats packet lands a tick or two late - the read waits for it
    try {
      const f1 = Number.isFinite(bot.food) ? bot.food : null
      const h1 = Number.isFinite(bot.health) ? bot.health : null
      const ok = (f1 !== null && a.f0 !== null && f1 > a.f0) || (h1 !== null && a.h0 !== null && h1 > a.h0)
      log(`${tag} ration: ${ok ? 'ate' : 'failed'} ${a.item} (hunger ${a.f0 ?? '?'} -> ${f1 ?? '?'}, hp ${a.h0 ?? '?'} -> ${h1 ?? '?'})`)
    } catch { /* gone */ }
  })
  // (v0.537.0) the pantry's counters join the book - two monotone integers of
  // the carry's own class (SCOUT_CARRY_FIELDS grew to six: the attempt rebuild
  // must not zero the pantry's half of the walk).
  const stats = { scans: 0, found: 0, travelled: 0, deaths: 0, berryPicked: 0, berryWalks: 0 }
  // (v0.534.0) THE FAMINE WALK's book - the scan's eye writes, the pantry's
  // walk reads. Private to this scout (the shared map stays the miners').
  // (v0.538.0) THE BUSH BOOK's rebuild seat: an injected memory rides the
  // attempt boundary - the world's knowledge does not die with a login (the
  // WorldMap's own law, one book private to the scout); a rebuilt attempt
  // that opens a fresh Map goes famine-blind until the eye re-fills it, and
  // the gone-record forget (delete) stays honest in a surviving book too.
  const bushBook = bushMemory ?? new Map()
  // (v0.531.0) THE GET-UP's wire - the death leg rides the same stats object
  // (deaths joins scans/found/travelled in the run's report), the chat
  // listener registers at build time (before any patrol - the v0.117.0
  // window opens with the bot's own chat), the tag rides the SAME raw log
  // the ration lines use (the line carries its own tag, never wrapped).
  createDeathWatch({ bot, tag, stats, log })
  const sync = syncChat ? attachChatSync(bot, map, { flushEveryMs: 4000, maxPerFlush: 40, log: m => log(`${tag} ${m}`) }) : null

  bot.on('error', e => log(`${tag} error: ${e.message}`))
  bot.on('kicked', r => log(`${tag} KICKED: ${typeof r === 'string' ? r : JSON.stringify(r)}`))
  bot.on('end', r => log(`${tag} disconnected (${r})`))

  const ready = new Promise((resolve, reject) => {
    bot.once('spawn', async () => {
      // same A* bound as the miner (v0.6.5 OOM fix): unlimited detour search on a
      // far patrol goal must not grow an unbounded node graph
      if (bot.pathfinder) {
        bot.pathfinder.searchRadius = 32
        bot.pathfinder.thinkTimeout = 2000
      }
      if (fly === true) installFly(bot, { speed: 2.0, antiKick: true, log: m => log(`${tag} ${m}`) })
      else {
        bot.physicsEnabled = true
        // scout movements: WALK ONLY - a scout that digs is a miner with extra steps
        const moves = new Movements(bot, bot.registry)
        moves.canDig = false
        moves.allow1by1towers = false
        moves.allowParkour = false
        moves.allowFreeMotion = false
        moves.maxDropDown = 3
        moves.dontCreateFlow = true
        moves.scafoldingBlocks = []
        bot.pathfinder.setMovements(moves)
        log(`${tag} ground scout - walking patrol (no fly, no digging)`)
      }
      await waitForWorld()
      resolve(bot)
    })
    bot.once('error', reject)
  })

  async function waitForWorld (timeoutMs = 20000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (bot.entity?.position && bot.blockAt(bot.entity.position)) return true
      await new Promise(r => setTimeout(r, 250))
    }
    throw new Error('world never loaded')
  }

  const scan = createScan({ bot, map, targets, stats, log: m => log(`${tag} ${m}`), bushMemory: bushBook })
  // when chat sync is on, every NEW position goes on the air right after it is recorded
  const scanWithSync = sync
    ? async () => {
      const before = map ? map.total() : 0
      const r = await scan()
      if (map && map.total() > before) {
        // enqueue only what this scan just added: walk the newest bucket entries
        for (const [name, bucket] of map.found) {
          for (const entry of bucket.values()) {
            if (entry.seenAt > Date.now() - 6000) sync.enqueue(name, entry.pos)
          }
        }
      }
      return r
    }
    : scan
  // (v0.528.0) the pantry rides the scan cadence: every scan is followed by one
  // berry stop (best-effort by law - the scan's verdict stays whole, the patrol's
  // cadence is untouched; the refusals are quiet inside the stop itself). The
  // patrol AND the external caller both drive the composed scan.
  // (v0.537.0) the composition hands the book to the pantry - the ONE production
  // call site, the counters ride the same stats object the watch and patrol mutate.
  const berryStop = createBerryStop({ bot, log: m => log(`${tag} ${m}`), bushMemory: bushBook, stats })
  const scanWithBerry = async () => {
    const r = await scanWithSync()
    try { await berryStop() } catch { /* the pantry is best-effort - the scan above stays whole */ }
    return r
  }
  const patrol = createPatrol({ bot, map, scan: scanWithBerry, stats, log: m => log(`${tag} ${m}`) })

  return { bot, ready, scan: scanWithBerry, patrol, stats, username, sync: sync ?? null }
}

// The lawnmower: fly mode rides altitude-110 lanes with flyTravel, ground mode walks
// surface lanes with the pathfinder (short legs - a single goto over 96 blocks of forest
// stalls on trees). Both scan at every leg and never overlap lane history.
// Exported separately so unit tests can drive it with a mock bot.

// (v0.532.0) the held patrol's scan beat: the night hold stands and re-scans on this
// rhythm instead of walking - slow enough to not spin the finder, fast enough that the
// lane knowledge stays current through the dark (dawn resumes the walk mid-leg).
export const PATROL_HOLD_BEAT_MS = 2000

export function createPatrol ({ bot, map, scan, stats = { travelled: 0 }, log = () => {} }) {
  return async function patrol ({ origin = null, heading = 'east', distance = 96, lanes = 4, laneGap = 24, altitude = 110, seconds = 300, holdBeatMs = PATROL_HOLD_BEAT_MS } = {}) {
    const start = origin ? new Vec3(origin.x, origin.y, origin.z) : bot.entity.position.clone()
    const deadline = Date.now() + seconds * 1000
    const dirs = {
      east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1]
    }
    const [dx, dz] = dirs[heading] ?? dirs.east
    const flying = typeof bot.flyTravel === 'function'
    // (v0.532.0) the hold's once-per-night voice: the entry line names the hold ONE
    // time per patrol call (a hold that lasts the whole dark must not spam the log
    // at the beat's cadence); a walk after a hold resets it - a second night names
    // itself again. The fly scout holds nothing (altitude-110 lanes own no ground
    // spawn pressure - the pantry's own skip law).
    let nightHeld = false
    const nightHold = () => {
      if (flying) return false
      if (!walkForbidden(bot.time?.timeOfDay)) return false
      if (!nightHeld) {
        nightHeld = true
        log(`patrol held: night (tod=${Math.floor(bot.time?.timeOfDay ?? 0)}) - standing and scanning until dawn`)
      }
      return true
    }
    let lane = 0
    for (; lane < lanes; lane++) {
      if (Date.now() > deadline) break
      const offX = dz === 0 ? 0 : lane * laneGap
      const offZ = dx === 0 ? 0 : lane * laneGap
      const back = lane % 2 === 1
      const a = new Vec3(start.x + offX + (back ? dx * distance : 0), flying ? altitude : start.y, start.z + offZ + (back ? dz * distance : 0))
      const b = new Vec3(start.x + offX + (back ? 0 : dx * distance), flying ? altitude : start.y, start.z + offZ + (back ? 0 : dz * distance))
      for (const leg of [a, b]) {
        while (Date.now() < deadline) {
          const here = bot.entity.position
          const remaining = here.distanceTo(leg)
          if (remaining < (flying ? 24 : 6)) break
          // (v0.532.0) THE NIGHT HOLD-AND-SCAN: the ground patrol's walk legs were
          // the last ungated night surface lane. The fleet's own doctrine defers
          // surface walks inside the walk-forbidden window (the lib header's
          // measured kill sites: the dusk tail owned 11 of 17 deaths, x12 mob
          // kills at y 64-66), the miner's four hold purposes all gate THEIR
          // walks ('a deferred walk turns into more shaft'), and the scout kept
          // crossing NEW ground in the dark. The scout owns no shaft - the held
          // shape is stand-and-scan: the bot keeps its lane knowledge current
          // without widening its exposure, the deadline still governs, dawn
          // resumes the walk mid-leg. Junk-safe: a junk clock reads 'go' (the
          // lib's own legacy byte) - a bot that cannot read the clock walks.
          if (nightHold()) {
            await scan()
            await new Promise(r => setTimeout(r, holdBeatMs))
            continue
          }
          nightHeld = false
          const stepLen = Math.min(flying ? 64 : 24, remaining)
          const step = new Vec3(
            here.x + (leg.x - here.x) / remaining * stepLen,
            flying ? altitude : leg.y,
            here.z + (leg.z - here.z) / remaining * stepLen
          )
          try {
            if (flying) {
              await bot.flyTravel(step, { speed: 2.0, cruiseAbove: 24, timeoutMs: 20000 })
              stats.travelled += 64
            } else {
              await gotoSafe(bot, new goals.GoalNear(step.x, step.y, step.z, 2), { timeoutMs: 15000, label: 'scout leg' })
              stats.travelled += stepLen
            }
          } catch { /* stuck (water, cliff): scan here, then try the next leg anyway */ }
          await scan()
          await new Promise(r => setTimeout(r, 200))
        }
      }
      // move one lane across
      const shift = new Vec3(bot.entity.position.x + (dz === 0 ? 0 : laneGap), bot.entity.position.y, bot.entity.position.z + (dx === 0 ? 0 : laneGap))
      // (v0.532.0) the shift rides the same hold - a lane crossing is new ground
      // too, and the deadline does not make the dark safe (the held shift costs a
      // scan beat, never a 24-block walk through the kill window).
      if (nightHold()) {
        await scan()
        await new Promise(r => setTimeout(r, holdBeatMs))
        continue
      }
      nightHeld = false
      try {
        if (flying) await bot.flyTravel(shift, { speed: 2.0, cruiseAbove: 20, timeoutMs: 20000 })
        else await gotoSafe(bot, new goals.GoalNear(shift.x, shift.y, shift.z, 2), { timeoutMs: 15000, label: 'scout lane shift' })
      } catch { /* ignore */ }
      await scan()
    }
    return { ...stats, map: map?.report() }
  }
}
