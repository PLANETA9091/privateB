//
// armorycensus.mjs - THE ARMORY CENSUS (v0.494.0)
// The weapon supply chain's own book. The melee arms lane (v0.67.0)
// answered the fists-era deaths: pickWeapon ranks the sword above every
// tool and the fight cost ledger (v0.486.0) priced the PICKAXE TAX when
// the sword was missing - but the ARMS LANE's own field fate was never
// read: the craft verdicts ('F2 sword: OK (wooden_sword)' 31 verbatim
// across faces 42+43, 'F2 spare pick: OK (wooden_pickaxe, holds N)' 25)
// and their failure anatomy (~100 lines) have zero readers. The lane's
// voices were explicitly handed away twice: stormrefusal (the spare-pick
// and sword lanes' shapes 'belong to their own emitters') and the
// recovery book (v0.492.0 reads the 'tool recovery:' skins only - the
// spare-pick lane's own voice is a DIFFERENT emitter, toolupgrade.mjs's
// proactive spare-pick flow, not the recovery flow's wrapper).
//
// THE WIRE: a pure census - every armory line classifies independently
// (no cross-line join, the honest scope for skins with no opener):
//   sword lane (arms.mjs + the fleet wrapper's outer verdict):
//     - the OUTER lane verdict 'OK (<tier>)' / 'failed (<why>)' closes
//       nothing (no opener exists) but tallies: ok by tier; failed by
//       why-class (a TIER NAME = the craft landed nothing - the inner
//       craft-miss's own echo; 'no table' = the table leg; 'none' =
//       the emitter's empty-skin);
//     - the INNER craft verdict '(OK|craft did not land) (<tier>,
//       holds <n>)' prices the craft itself (the holds field is the
//       pocket count AFTER the craft);
//     - the legs: stick-miss ('stick craft did not land' - THE STICK
//       DROUGHT's third lane, after the recovery mid-fails and the
//       smelt stick tax), the table refusal, the pre-gate skips
//       (classified: storm / ingredients / sticks / table / other -
//       the skip paren nests, the greedy capture), the storm-refusal
//       skin ('storm cooldown Nms left (N consecutive timeouts)'),
//       the ingredients-missing skin, and the two prose legs (planks
//       converted / table crafted - tallied, the house law: prose
//       never closes anything because nothing closes).
//   spare-pick lane (toolupgrade.mjs's proactive flow): the craft
//     verdict IS the terminal ('OK (<tier>, holds <n>)' / 'craft did
//     not land (...)'), the skips carry the stick floor's own read
//     ('sticks N < 2, one-type planks N cannot unlock the craft'),
//     the stick-miss and the table refusal ride as legs.
//
// THE CRAFT-HOLDS SEAT (v0.662.0): the spare lane's craft-miss grows
// the holds sum - the pocket's own material read at the miss (the
// sword lane's craftHolds law mirrored verbatim: summed on the MISSES
// only, the OK verdict's holds never count - the holds field prices
// what the pocket HELD when the craft failed, the retry's own material
// read; the mining-surface law gives the seat its own print segment,
// non-zero only).
//
// Pure parser, unit-pinned (the smelthold v0.491.0 shape); decompose
// is its field read. Mining-surface only: zero fleet wiring, zero new
// log lines. Junk-safe end to end: non-string rows skipped, a face
// with no armory lines reads the honest zero (an unarmed fleet is
// itself the read - the v0.66.0 fists era's own signature).
//

// ---- sword lane ----
// The outer lane verdict: 'F2 sword: OK (wooden_sword)' / 'F5 sword:
// failed (no table)' / 'F1 sword: failed (wooden_sword)' - the why may
// be a tier name (the craft-miss echo) or a phrase; greedy capture.
export const SWORD_OUTER_RE = /^(F\d+) sword: (OK|failed) \((.+)\)$/
// The inner craft verdict: 'F2 sword: OK (wooden_sword, holds 1)' /
// 'F1 sword: craft did not land (wooden_sword, holds 0)' - the holds
// field is the pocket count after the craft.
export const SWORD_CRAFT_RE = /^(F\d+) sword: (OK|craft did not land) \(([a-z_]+), holds (\d+)\)$/
// The pre-gate skip, the WIDE capture (the reason nests: 'sword: skip
// (storm cooldown 3999ms left (3 consecutive timeouts))').
export const SWORD_SKIP_RE = /^(F\d+) sword: skip \((.+)\)$/
// The storm-refusal skin (the craft-until guard's own line).
export const SWORD_STORM_RE = /^(F\d+) sword: storm cooldown (\d+)ms left \((\d+) consecutive timeouts?\) - refusing$/
// The ingredients skin.
export const SWORD_INGREDIENTS_RE = /^(F\d+) sword: no craftable recipe variant \(ingredients missing\?\)$/
// The legs.
export const SWORD_STICK_MISS_RE = /^(F\d+) sword: stick craft did not land$/
export const SWORD_NO_TABLE_RE = /^(F\d+) sword: no table reachable or placeable$/
// The prose legs (never close - the house law).
export const SWORD_PROSE_RE = /^(F\d+) sword: (planks converted for the table rung|table crafted from planks) \((.+)\)$/

// ---- spare-pick lane (the proactive flow's own voice) ----
// The craft verdict IS the terminal here: 'F2 spare pick: OK
// (wooden_pickaxe, holds 1)' / 'F1 spare pick: craft did not land
// (wooden_pickaxe, holds 0)'.
export const SPARE_CRAFT_RE = /^(F\d+) spare pick: (OK|craft did not land) \(([a-z_]+), holds (\d+)\)$/
// The pre-gate skip, the WIDE capture (the stick floor's read nests:
// 'skip (sticks 1 < 2, one-type planks 4 cannot unlock the craft)' and
// the materials class 'skip (no pickaxe materials (need 3 ingots / 3
// cobble / 3 planks of ONE type))').
export const SPARE_SKIP_RE = /^(F\d+) spare pick: skip \((.+)\)$/
export const SPARE_STICK_MISS_RE = /^(F\d+) spare pick: stick craft did not land$/
export const SPARE_NO_TABLE_RE = /^(F\d+) spare pick: no table reachable or placeable$/

function skipClass (why) {
  const w = String(why)
  if (/storm cooldown/.test(w)) return 'storm'
  if (/ingredients/.test(w)) return 'ingredients'
  if (/sticks/.test(w)) return 'stick-drought'
  if (/table/.test(w)) return 'table'
  if (/materials/.test(w)) return 'materials'
  return 'other'
}

function failedClass (why) {
  const w = String(why).trim()
  if (w === 'none') return 'none'
  if (/table/.test(w)) return 'table'
  if (/^[a-z_]+_(sword|pickaxe)$/.test(w)) return 'craft-miss'
  return 'other'
}

/**
 * Read the armory lanes' craft verdicts and their failure anatomy.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {null|{sword: {ok: number, okTiers: Object<string,number>, failed: number, failedWhy: Object<string,number>, craftVerdicts: number, craftMisses: number, craftHolds: number, stickMisses: number, tableRefusals: number, skips: number, skipClasses: Object<string,number>, stormRefusals: number, ingredientsRefusals: number, prose: number}, spare: {ok: number, okTiers: Object<string,number>, craftMisses: number, craftHolds: number, craftVerdicts: number, stickMisses: number, tableRefusals: number, skips: number, skipClasses: Object<string,number>}, total: number}}
 */
export function armoryCensus (lines) {
  if (!Array.isArray(lines)) return null
  const sword = {
    ok: 0, okTiers: {}, failed: 0, failedWhy: { 'craft-miss': 0, table: 0, none: 0, other: 0 },
    craftVerdicts: 0, craftMisses: 0, craftHolds: 0,
    stickMisses: 0, tableRefusals: 0, skips: 0, skipClasses: {},
    stormRefusals: 0, ingredientsRefusals: 0, prose: 0
  }
  const spare = {
    ok: 0, okTiers: {}, craftMisses: 0, craftHolds: 0, craftVerdicts: 0,
    stickMisses: 0, tableRefusals: 0, skips: 0, skipClasses: {}
  }
  for (const line of lines) {
    if (typeof line !== 'string') continue
    let m = SWORD_CRAFT_RE.exec(line)
    if (m) {
      // The INNER craft verdict is the more specific skin - it MUST be
      // read before the outer verdict RE (the outer's greedy capture
      // would otherwise swallow the ', holds N' anatomy whole and
      // mis-classify the craft OK as a failed 'other' - the spare-OK
      // read-order lesson, v0.492.0).
      sword.craftVerdicts++
      if (m[2] !== 'OK') { sword.craftMisses++; sword.craftHolds += Number(m[4]) }
      continue
    }
    m = SWORD_OUTER_RE.exec(line)
    if (m) {
      if (m[2] === 'OK') {
        sword.ok++
        sword.okTiers[m[3]] = (sword.okTiers[m[3]] || 0) + 1
      } else {
        sword.failed++
        sword.failedWhy[failedClass(m[3])] = (sword.failedWhy[failedClass(m[3])] || 0) + 1
      }
      continue
    }
    m = SWORD_SKIP_RE.exec(line)
    if (m) {
      sword.skips++
      const c = skipClass(m[2])
      sword.skipClasses[c] = (sword.skipClasses[c] || 0) + 1
      continue
    }
    m = SWORD_STORM_RE.exec(line)
    if (m) { sword.stormRefusals++; continue }
    m = SWORD_INGREDIENTS_RE.exec(line)
    if (m) { sword.ingredientsRefusals++; continue }
    m = SWORD_STICK_MISS_RE.exec(line)
    if (m) { sword.stickMisses++; continue }
    m = SWORD_NO_TABLE_RE.exec(line)
    if (m) { sword.tableRefusals++; continue }
    m = SWORD_PROSE_RE.exec(line)
    if (m) { sword.prose++; continue }
    m = SPARE_CRAFT_RE.exec(line)
    if (m) {
      spare.craftVerdicts++
      if (m[2] === 'OK') {
        spare.ok++
        spare.okTiers[m[3]] = (spare.okTiers[m[3]] || 0) + 1
      } else {
        // The sword lane's law mirrored (v0.662.0): the miss's holds is
        // the pocket's own material read - the OK's holds never count.
        spare.craftMisses++
        spare.craftHolds += Number(m[4])
      }
      continue
    }
    m = SPARE_SKIP_RE.exec(line)
    if (m) {
      spare.skips++
      const c = skipClass(m[2])
      spare.skipClasses[c] = (spare.skipClasses[c] || 0) + 1
      continue
    }
    m = SPARE_STICK_MISS_RE.exec(line)
    if (m) { spare.stickMisses++; continue }
    m = SPARE_NO_TABLE_RE.exec(line)
    if (m) { spare.tableRefusals++ }
  }
  return { sword, spare, total: sword.ok + sword.failed + sword.craftVerdicts + sword.skips + sword.stormRefusals + sword.ingredientsRefusals + sword.stickMisses + sword.tableRefusals + sword.prose + spare.craftVerdicts + spare.skips + spare.stickMisses + spare.tableRefusals }
}
