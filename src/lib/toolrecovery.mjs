//
// toolrecovery.mjs - THE RECOVERY BOOK (v0.492.0)
// The pick-less bootstrap's own report card. The emitter side is
// testbed/fleet19.mjs's in-loop tool recovery (v0.261.0 gave the wood
// leg its climb front) - but the FIELD fate of the recovery attempt
// itself was never read: the book opens ('F6 tool recovery: no pickaxe
// - spare-pick craft first', 19 verbatim across faces 42+43) and the
// terminals ('tool recovery: OK (wooden_pickaxe,stone_pickaxe)' /
// 'tool recovery: failed (no crafting table)') had zero readers. The
// ascent wiring test (recoveryascent, v0.261.0) pins the ORDER of the
// legs, not the outcome; stormrefusal (v0.4xx) explicitly hands the
// spare-pick lane's voices away ('those voices belong to their own
// emitters'). This lens is that owner.
//
// THE WIRE: each open starts an episode for the bot; the bot's lane
// then closes it with the emitter's own shapes (one parser per shape):
//   - the CHEAP lane lands first: 'OK (spare craft <tier>, holds N)'
//     closes the episode SPARE-OK (no bootstrap needed - never seen on
//     the stored faces, the skin exists and is pinned);
//   - the BOOTSTRAP terminal: 'OK (<kit list>)' closes OK with the kit
//     anatomy (the emitter reports what the rebuild actually bought -
//     wooden-only is the HALF KIT, wooden+stone the FULL KIT); 'failed
//     (<why>)' closes FAILED (empty why = 'none', the kit came out
//     empty; 'no crafting table' = the table leg died);
//   - the mid-fail: 'spare craft failed (<reason>) - re-running the
//     bootstrap' NEVER closes (the house law - it is the emitter's own
//     progress note between the open and the terminal); the reason
//     chain attaches to the open episode. The WIDE read: the reason
//     nests its parens ('no pickaxe materials (need 3 ingots / 3
//     cobble / 3 planks of ONE type)') - the greedy capture anchored
//     to the last ')', the smelthold lesson (v0.491.0), so the WHY
//     arrives whole;
//   - the prose legs ('surfaced - the wood leg gathers where trees
//     grow' / 'climb refused - the underground attempt stands') are
//     notes, tallied, never close;
//   - an open with nothing before the bot's next open or the window
//     end stays UNRESOLVED (the honest edge); a fresh open overwrites
//     the stale one honestly.
//
// THE REBOOT CHAIN: an open that follows the bot's FAILED terminal is
// a loop leg - the bootstrap re-asked a question it just failed. The
// chain (a bot's consecutive episodes) prices whether the loop ever
// recovered: the stored faces say it always did.
//
// THE STICK DROUGHT: the mid-fail reasons read the pocket economy -
// 'no sticks and no planks for sticks' is the wood leg starving the
// stick economy, the same sticks THE STICK TAX priced at 19x coal in
// the smelt verdict (v0.490.0). One commodity, two lanes, one bill.
//
// Pure parser, unit-pinned (the smelthold v0.491.0 shape); decompose
// is its field read. Mining-surface only: zero fleet wiring, zero new
// log lines. Junk-safe end to end: non-string rows skipped, a face
// with no recoveries reads the honest zero (the calm fleet never
// opens the book).

// The open: 'F6 tool recovery: no pickaxe - spare-pick craft first'.
export const RECOVERY_OPEN_RE = /^(F\d+) tool recovery: no pickaxe - spare-pick craft first$/

// The cheap lane's own OK: 'F6 tool recovery: OK (spare craft stone, holds 1)'
// - MUST be read before the terminal RE (the terminal's kit capture
// would otherwise swallow the spare-craft anatomy whole).
export const RECOVERY_SPARE_OK_RE = /^(F\d+) tool recovery: OK \(spare craft ([a-z_]+), holds (\d+)\)$/

// The mid-fail, the WIDE capture: 'F5 tool recovery: spare craft failed
// (no sticks and no planks for sticks) - re-running the bootstrap'. The
// reason nests its parens (the materials class) - greedy to the last ')'.
export const RECOVERY_MID_FAIL_RE = /^(F\d+) tool recovery: spare craft failed \((.+)\) - re-running the bootstrap$/

// The bootstrap terminal: 'F6 tool recovery: OK (wooden_pickaxe)' /
// 'F5 tool recovery: failed (none)' - the kit list or the failure why,
// greedy (the why may nest). 'none' = the emitter's own empty-kit skin.
export const RECOVERY_TERMINAL_RE = /^(F\d+) tool recovery: (OK|failed) \((.*)\)$/

// The prose legs - notes, never close (the house law).
export const RECOVERY_SURFACED_RE = /^(F\d+) tool recovery: surfaced - the wood leg gathers where trees grow$/
export const RECOVERY_CLIMB_REFUSED_RE = /^(F\d+) tool recovery: climb refused - the underground attempt stands$/

function midClass (why) {
  const w = String(why)
  if (/sticks/.test(w)) return 'stick-drought'
  if (/table/.test(w)) return 'table'
  if (/materials/.test(w)) return 'materials'
  if (w === 'undefined') return 'undefined'
  return 'other'
}

function failedClass (why) {
  const w = String(why).trim()
  if (w === '' || w === 'none') return 'none'
  if (/table/.test(w)) return 'table'
  return 'other'
}

/**
 * Read the tool recovery lane's episodes and their fates.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {null|{episodes: number, fates: Object<string,number>, kitFull: number, kitWoodenOnly: number, kitSizes: Object<string,number>, failedWhy: Object<string,number>, midFails: number, midFailClasses: Object<string,number>, midFailOrphans: number, prose: {surfaced: number, climbRefused: number}, loops: number, loopRecovered: number, loopStillFailed: number, chains: number, chainsRecovered: number, rows: Array}}
 */
export function toolRecovery (lines) {
  if (!Array.isArray(lines)) return null
  const lanes = new Map()
  let orphanMidFails = 0

  const lane = bot => {
    if (!lanes.has(bot)) lanes.set(bot, { open: null, rows: [], lastFate: null })
    return lanes.get(bot)
  }

  const closeEpisode = (l, fate, extra = {}) => {
    if (!l.open) return false
    l.rows.push({
      bot: l.open.bot, fate,
      kit: extra.kit != null ? extra.kit : [],
      kitSize: extra.kitSize != null ? extra.kitSize : 0,
      fullKit: extra.fullKit === true,
      reason: extra.reason != null ? extra.reason : null,
      midReasons: l.open.midReasons.slice(),
      loop: l.lastFate === 'failed',
      prose: l.open.prose
    })
    l.lastFate = fate
    l.open = null
    return true
  }

  for (const line of lines) {
    if (typeof line !== 'string') continue
    let m = RECOVERY_OPEN_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      closeEpisode(l, 'unresolved')
      l.open = { bot: m[1], midReasons: [], prose: { surfaced: 0, climbRefused: 0 } }
      continue
    }
    m = RECOVERY_SPARE_OK_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      closeEpisode(l, 'spare-ok')
      continue
    }
    m = RECOVERY_MID_FAIL_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      if (l.open) l.open.midReasons.push(midClass(m[2]))
      else orphanMidFails++
      continue
    }
    m = RECOVERY_TERMINAL_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      if (m[2] === 'OK') {
        const kit = m[3].split(',').map(s => s.trim()).filter(Boolean)
        closeEpisode(l, 'ok', {
          kit, kitSize: kit.length,
          fullKit: kit.includes('stone_pickaxe')
        })
      } else {
        closeEpisode(l, 'failed', { reason: failedClass(m[3]) })
      }
      continue
    }
    m = RECOVERY_SURFACED_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      if (l.open) l.open.prose.surfaced++
      continue
    }
    m = RECOVERY_CLIMB_REFUSED_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      if (l.open) l.open.prose.climbRefused++
    }
  }
  for (const l of lanes.values()) closeEpisode(l, 'unresolved')

  const fates = { ok: 0, failed: 0, 'spare-ok': 0, unresolved: 0 }
  const kitSizes = {}
  const failedWhy = { none: 0, table: 0, other: 0 }
  const midFailClasses = { 'stick-drought': 0, table: 0, materials: 0, undefined: 0, other: 0 }
  const rows = []
  let kitFull = 0
  let kitWoodenOnly = 0
  let midFails = 0
  let loops = 0
  let loopRecovered = 0
  let loopStillFailed = 0
  const prose = { surfaced: 0, climbRefused: 0 }

  for (const l of lanes.values()) rows.push(...l.rows)
  for (const r of rows) {
    fates[r.fate] = (fates[r.fate] || 0) + 1
    prose.surfaced += r.prose.surfaced
    prose.climbRefused += r.prose.climbRefused
    if (r.loop) {
      loops++
      if (r.fate === 'ok' || r.fate === 'spare-ok') loopRecovered++
      if (r.fate === 'failed') loopStillFailed++
    }
    for (const c of r.midReasons) midFailClasses[c] = (midFailClasses[c] || 0) + 1
    if (r.fate === 'ok') {
      kitSizes[String(r.kitSize)] = (kitSizes[String(r.kitSize)] || 0) + 1
      if (r.fullKit) kitFull++
      else if (r.kitSize === 1 && r.kit[0] === 'wooden_pickaxe') kitWoodenOnly++
    }
    if (r.fate === 'failed' && r.reason) failedWhy[r.reason] = (failedWhy[r.reason] || 0) + 1
    midFails += r.midReasons.length
  }
  // Orphan mid-fails: 'spare craft failed' lines with no open episode
  // (the emitter prints them only after an open - a non-zero here is
  // an honest audit row, never seen yet).
  const midFailOrphans = orphanMidFails

  // The reboot chain: a bot whose episodes number > 1, recovered when
  // the chain's LAST episode closed ok/spare-ok.
  let chains = 0
  let chainsRecovered = 0
  const byBot = new Map()
  for (const r of rows) {
    if (!byBot.has(r.bot)) byBot.set(r.bot, [])
    byBot.get(r.bot).push(r)
  }
  for (const list of byBot.values()) {
    if (list.length > 1) {
      chains++
      const last = list[list.length - 1]
      if (last.fate === 'ok' || last.fate === 'spare-ok') chainsRecovered++
    }
  }

  return {
    episodes: rows.length, fates, kitFull, kitWoodenOnly, kitSizes,
    failedWhy, midFails, midFailClasses, midFailOrphans, prose,
    loops, loopRecovered, loopStillFailed, chains, chainsRecovered, rows
  }
}
