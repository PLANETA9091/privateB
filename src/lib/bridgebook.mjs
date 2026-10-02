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
