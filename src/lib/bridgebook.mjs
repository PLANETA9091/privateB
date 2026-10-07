//
// bridgebook.mjs - THE BRIDGE BOOK (v0.496.0)
//
// The vertical walk's fill lane, priced at last. The climb machinery
// bridges its way up: when a step has no floor, the bot tries to fill
// the gap - and the lane's own three verdict skins rode unread (the
// maptrip lens joined the PLACED skin to the death drops only; the
// refusal skins had no owner at all):
//
//   '<bot> climb bridge: unavailable (<why>)'
//       the plan refused before any placement - the why text is the
//       emitter's own two-word taxonomy:
//         'no placeable block in the pocket' -> pocket (the supply
//             lane's own signature - the bot owns no fill material)
//         'no solid floor underfoot'         -> floor (the terrain
//             refused - the world has no ground to bridge from)
//   '<bot> climb bridge: placed <block> at [<x>,<y>,<z>] (<kind>) - the
//    step re-judges'
//       the fill LANDED - the block name is the bridge's own material
//       read (what the fleet burns on vertical progress)
//   '<bot> climb bridge: the server refused the <kind> fill at
//    [<x>,<y>,<z>] - the rotate ladder owns it (<detail>)'
//       the server's own veto - the detail anatomy is the emitter's
//       interpolation order (held=<block>, <d>b, ref=<block>,
//       post=<state>): what the bot held, how far the cell sat, what
//       the plan thought was there, and the post-veto re-read
//
// THE FIELD READ (faces 42+43 stored artifacts, zero runner minutes,
// hand-traced then verified live): 394 bridge events - unavailable 192
// (pocket 110 / floor 82) / placed 162 / server-refused 40 - book
// 394/394. THE COBBLE SIGNATURE: the fleet bridges on cobblestone
// (146/162 = 90%; dirt 15, granite 1) - the surplus lane's biggest
// vertical consumer priced. THE WHY-FLIP: f42's refusals are pocket-led
// (86/118 = 73% - the empty pocket starved the bridge), f43's are
// floor-led (50/74 = 68% - the terrain refused instead) - n=2 the
// refusal's reason is NOT stable, the cure cannot be one-legged (stock
// AND terrain). THE SERVER'S OWN VETO: 40 refusals, kinds support 32 /
// pit 8; the ref anatomy says the plan's world-read was stale - 16x
// ref=grass_block (the fill cell was never empty), 3x ref=crafting_table
// (the bot tried to fill the cell its own table occupies - THE TABLE
// VETO); and the post-veto re-read failed 40/40 - the blind leg: what
// the cell became after the veto is NEVER known at this n (the emitter's
// own honest gap, priced).
//
// THE HONEST CAP: the emitter only speaks below diagLevels<3 (the shared
// cap) - the census reads the capped prose; the counts speak in the
// fleet result regardless (the emitter's own comment). Pure census: no
// opener exists, no cross-line join - every line classifies
// independently (the armory census's honest scope, v0.494.0).
//
// Junk-safe: non-array / non-string-blob reads null (the smeltledger
// convention); a face with no bridge lines reads the honest zero shape.
// Pure: reads, never mutates. One parser per shape: this lib owns the
// bridge census's captures (the placed skin's own deeper capture - the
// kind the maptrip join never needed - rides the smelthold v0.491.0
// twin precedent: two capture depths, one shape family, the parse never
// forks; maptrip's CLIMB_PLACED_RE stays the death-drop join's tool).
//

const BRIDGE_UNAVAILABLE_RE = /^(\S+) \[\1\] climb bridge: unavailable \((.*)\)$/
// the census's own placed capture: bot + block + the fill kind (the maptrip
// join stops at the coords; the bridge book wants the kind anatomy too)
const BRIDGE_PLACED_RE = /^(\S+) \[\1\] climb bridge: placed ([a-z_]+) at \[[^\]]*\] \(([a-z_]+)\) - the step re-judges$/
const BRIDGE_REFUSED_RE = /^(\S+) \[\1\] climb bridge: the server refused the ([a-z_]+) fill at \[[^\]]*\] - the rotate ladder owns it \((.*)\)$/
// the server-refusal detail's own interpolation order (held, dist, ref, post)
const REFUSED_DETAIL_RE = /^held=([a-z_]+), ([0-9.]+)b, ref=([a-z_]+), post=(.*)$/

function tallyAdd (t, key) {
  t[key] = (t[key] || 0) + 1
}

/**
 * bridgeBook(lines) - the vertical walk's fill lane, priced.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{events: number, unavailable: number, placed: number,
 *   serverRefused: number, whyClasses: object, placedBlocks: object,
 *   placedKinds: object, refusedKinds: object, refusedRefs: object,
 *   heldBlocks: object, postReadFailed: number, rows: object[]}}
 */
export function bridgeBook (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const rows = []
  const byBot = new Map()
  const whyClasses = {}
  const placedBlocks = {}
  const placedKinds = {}
  const refusedKinds = {}
  const refusedRefs = {}
  const heldBlocks = {}
  let unavailable = 0
  let placed = 0
  let serverRefused = 0
  let postReadFailed = 0
  for (let i = 0; i < src.length; i++) {
    const line = src[i]
    if (typeof line !== 'string') continue
    let m = line.match(BRIDGE_UNAVAILABLE_RE)
    if (m) {
      unavailable++
      const why = m[2]
      const cls = why.includes('no placeable block in the pocket')
        ? 'pocket'
        : why.includes('no solid floor underfoot') ? 'floor' : 'other'
      tallyAdd(whyClasses, cls)
      if (!byBot.has(m[1])) byBot.set(m[1], { bot: m[1], unavailable: 0, pocket: 0, floor: 0, placed: 0, serverRefused: 0 })
      const r = byBot.get(m[1])
      r.unavailable++
      // the class skin rides its own counter; the honest 'other' stays
      // in the totals only (the skin's own words were unreadable)
      if (cls !== 'other') r[cls]++
      continue
    }
    m = line.match(BRIDGE_PLACED_RE)
    if (m) {
      placed++
      tallyAdd(placedBlocks, m[2])
      tallyAdd(placedKinds, m[3])
      if (!byBot.has(m[1])) byBot.set(m[1], { bot: m[1], unavailable: 0, pocket: 0, floor: 0, placed: 0, serverRefused: 0 })
      byBot.get(m[1]).placed++
      continue
    }
    m = line.match(BRIDGE_REFUSED_RE)
    if (m) {
      serverRefused++
      tallyAdd(refusedKinds, m[2])
      const d = m[3].match(REFUSED_DETAIL_RE)
      if (d) {
        tallyAdd(heldBlocks, d[1])
        tallyAdd(refusedRefs, d[3])
        if (d[4].includes('re-read failed')) postReadFailed++
      }
      if (!byBot.has(m[1])) byBot.set(m[1], { bot: m[1], unavailable: 0, pocket: 0, floor: 0, placed: 0, serverRefused: 0 })
      byBot.get(m[1]).serverRefused++
    }
  }
  for (const r of byBot.values()) rows.push(r)
  rows.sort((a, b) => (b.unavailable + b.placed + b.serverRefused) - (a.unavailable + a.placed + a.serverRefused))
  return {
    events: unavailable + placed + serverRefused,
    unavailable,
    placed,
    serverRefused,
    whyClasses,
    placedBlocks,
    placedKinds,
    refusedKinds,
    refusedRefs,
    heldBlocks,
    postReadFailed,
    rows
  }
}

// (v0.786.0) THE POCKET TAX'S OWN BURNER - the unavailable book's own bot
// seat. The BRIDGE BOOK's refusal row named the pocket class the climb tax
// ('the climb arrives empty-handed - the carried fill is the front') while
// the WHO rode raw: the burners row sorts by the whole book's mass
// (placed first), the pocket class's own burner sat unnamed (face 78's own
// read: 'pocket 12 (86%)' across 6 bots, zero rows naming the bot). THE
// SEAT LAW (the census's own rows cells only, zero re-parsing - the
// v0.783.0 launches.byBot precedent): the strict-majority law, a solo
// burner owns the pocket tax only above half (a tie owns nothing - the
// v0.784.0 seat law); the pocket class is the seat's own subject (the
// floor class rides its own terrain story, the other class keeps the
// totals' honest bucket). Junk never invents a burner: a missing or
// non-array rows cell, a non-finite or non-positive pocket count reads
// the honest silence (null).
function pocketTally (bb) {
  if (!bb || typeof bb !== 'object' || Array.isArray(bb) || !Array.isArray(bb.rows)) return null
  const tallies = {}
  let total = 0
  for (const r of bb.rows) {
    if (!r || typeof r !== 'object' || typeof r.bot !== 'string' || !r.bot) continue
    const n = r.pocket
    if (!Number.isFinite(n) || n <= 0) continue
    total += n
    tallies[r.bot] = (tallies[r.bot] || 0) + n
  }
  return total > 0 ? { tallies, total } : null
}

export function bridgePocketBill (bb) {
  const t = pocketTally(bb)
  if (!t) return null
  let topUnits = 0
  let topBot = null
  for (const [bot, n] of Object.entries(t.tallies)) {
    if (n > topUnits) { topUnits = n; topBot = bot }
  }
  if (topBot === null || topUnits <= t.total - topUnits) return null
  return { bot: topBot, owns: topUnits, ofPockets: t.total, shareOfPockets: +(topUnits / t.total).toFixed(3) }
}

// (v0.786.0) the pocket seat's own row - THE POCKET TAX'S OWN BURNER: the
// seat names WHICH bot owns the climb's empty-pocket tax; the bot's own
// supply front prices the cure (the carried fill is the front - the bot
// that arrives empty-handed owns the walk's own tax). Junk never prints a
// seat (the honest silence's own row law).
export function bridgePocketBillRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const { bot, owns, ofPockets, shareOfPockets } = bill
  if (typeof bot !== 'string' || !bot ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofPockets) || ofPockets <= 0 || owns > ofPockets ||
      !Number.isFinite(shareOfPockets)) return null
  return `the pocket tax's own burner (v0.786.0): ${bot} owns ${owns} of ${ofPockets} pocket refusal(s) (${(shareOfPockets * 100).toFixed(1)}%) - THE POCKET TAX'S OWN BURNER: one bot's own empty pocket owns the climb tax - the bot's own supply front prices the tax the raw split rode unnamed`
}

// (v0.786.0) THE POCKET TAX'S OWN RIDERS - the pocket seat's own silence's
// companion. The seat names the solo burner under the strict-majority law;
// a no-majority pocket mix rode raw with no row naming the shape. THE RIDER
// LAW (the census's own rows cells only, zero re-parsing - the seat's own
// precedent): a MEASURE, never a verdict-owner - the top two burners'
// concentration prices the shape the solo law refused to name (the seat's
// owner case leaves the companion unprinted - the decompose's own branch
// law). Junk never invents a shape: a missing or non-array rows cell, a
// non-finite or non-positive pocket cell, or fewer than two burners reads
// the honest silence (null). The order is deterministic (count desc, then
// the bot's own byte asc).
export function bridgePocketRiders (bb) {
  const t = pocketTally(bb)
  if (!t) return null
  const ranked = Object.entries(t.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofPockets: t.total, pairOwns, shareOfPockets: +(pairOwns / t.total).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.786.0) the pocket riders' own row - THE POCKET TAX'S OWN CROWD: a
// measure of the shape, never a named owner (the seat's tie law holds);
// the pair prices the concentration the solo law refused to seat. Junk
// never prints a shape (the honest silence's own row law).
export function bridgePocketRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofPockets, pairOwns, shareOfPockets } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofPockets) || ofPockets <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofPockets ||
      !Number.isFinite(shareOfPockets)) return null
  return `the pocket tax's own riders (v0.786.0): no solo burner owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofPockets} pocket refusal(s) (${(shareOfPockets * 100).toFixed(1)}%) - THE POCKET TAX'S OWN CROWD: the seat's tie law held, the crowd is the shape - the tax's own spread prices the supply the solo law refused to name`
}
