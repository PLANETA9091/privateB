// (v0.421.0) THE SEAL WATCH - the seal death cure's minimal measurable legs:
// the pre-risk declaration and the respawn accounting, one module, all pure.
//
// THE DRAIN, PRICED (the seal death ledger's own field read, the 1830 fire):
// death is the seal economy's dominant term - ~824u seal-class lost across
// faces 15/22/23 (~103 full seals) while bots arrived 0/8 at the ring; face 24
// re-priced it (F18 ~198u seal, 2 empty-pocket re-deaths) and face 26 sealed
// the anatomy: F14 drowned sentry-blind at [-125,53,372] carrying cobblestone
// 64 + cobblestone 25 + dirt 6 + oak_planks 5 - a 100u seal stake (12.5 full
// floors) that death dropped on the ground while the death-spot memory steered
// every bot AWAY from the corpse. THE SILENT HALF is the respawn: the death
// handler prints the drop line (statcarry.mjs deathDropLine, v0.199.0), the
// bot respawns into an empty vanilla pocket, and NOTHING ever reads again -
// the 'respawn-empty reset' the ledger named is invisible in the log, and the
// dig-earn promise ('the dig supplies the seal') restarts from zero unnamed.
//
// THE TWO LEGS, both riding the SAME SEAL_PRIORITY list the ring spends, the
// reserve keeps and the death ledger counts (the v0.396.0 co-derivation law -
// one list, four arithmetics, none drift):
//
// 1. THE PRE-RISK DECLARE - sealDeclareLine. The guaranteed announcement of
//    the seal inventory BEFORE the risk spends or buries it: the line exists
//    ONLY inside the shelter gate's own risk semantics (shelterDue - the same
//    losing-fight boundaries combat.mjs owns), so a caller cannot fire it
//    outside a real risk, and the stake is named while the bot still holds it.
//    Faces 26/27 read the need: F14 drowned with 100u of seal nobody had
//    named as a stake, F5 drowned with 46u, F10 with 49u - the pocket's seal
//    mass was invisible until the drop line carved it out of the obituary.
//
// 2. THE RESPAWN ACCOUNTING - sealRespawnLine. The honest loss read after the
//    respawn: the death stake (the sealSnapshot at death) against the respawn
//    pocket. The loss is the FLOOR (stake - carried, clamped at 0 - carried
//    units may be re-gathered, never invented recoveries); an unread death
//    stake prices honestly unpriced, an empty stake says so, an unread pocket
//    says so - the stamp never invents (the v0.403.0 honest-truncation law).
//
// BOUND: the ring's own constant RING_BLOCKS_NEEDED (shelter.mjs) = 8 - the
// same premium the deposit's SEAL_RESERVE_BOUND pays; imported, never
// re-literalised (the seal-reserve test already pins the deposit side).
//
// PURE: no bot, no server, no imports beyond shelter.mjs (itself import-free).
// Junk-safe end to end: a non-array pocket never reads (null / the honest
// unread line), junk entries just do not count, a missing tag prints nothing.

import { SEAL_PRIORITY, RING_BLOCKS_NEEDED, shelterDue } from './shelter.mjs'

const SEAL_SET = new Set(SEAL_PRIORITY)

/**
 * The seal stock read over one inventory item list - the pre-risk snapshot
 * arithmetic the declare and the respawn accounting both spend. Sums per
 * name (a bot can carry cobblestone TWICE - face 26's F14 read 64 + 25),
 * accepts only SEAL_PRIORITY names, floors fractions, filters junk entries.
 * Junk-safe: a non-array items read is null (the caller renders the honest
 * unread); an empty array is a VALID zero (the honest empty pocket).
 * @param {Array<{name?:string, count?:number}>|null|undefined} [items] the inventory read
 * @returns {null|{total: number, bound: number, met: boolean, shortfall: number, byItem: Object<string,number>, top: null|{name: string, count: number}}}
 */
export function sealSnapshot (items) {
  if (!Array.isArray(items)) return null
  const byItem = {}
  let total = 0
  for (const it of items) {
    if (!it || typeof it.name !== 'string' || !SEAL_SET.has(it.name)) continue
    const n = Number.isFinite(it.count) && it.count > 0 ? Math.floor(it.count) : 0
    if (n <= 0) continue
    byItem[it.name] = (byItem[it.name] ?? 0) + n
    total += n
  }
  // top: the largest stack, byte-stable ties (count desc, name asc) - the
  // death-drop line's own sort, so the declare names what the drop will.
  let top = null
  for (const [name, count] of Object.entries(byItem)) {
    if (!top || count > top.count || (count === top.count && name < top.name)) top = { name, count }
  }
  return {
    total,
    bound: RING_BLOCKS_NEEDED,
    met: total >= RING_BLOCKS_NEEDED,
    shortfall: Math.max(0, RING_BLOCKS_NEEDED - total),
    byItem,
    top
  }
}

/**
 * (v0.421.0) THE PRE-RISK DECLARE LINE - the seal inventory announced while
 * the bot still holds it. The gate is the shelter gate's OWN semantics
 * (shelterDue): the line exists only where the policy already reads a real
 * risk (a lost fight, a night threat, a daylight engagement) - the declare
 * cannot fire on a healthy bot in the open. Three shapes, all honest:
 *   met      'F14 seal declare: 100u seal held (cobblestone 89) - the floor is met, the stake rides the risk'
 *   partial  'F14 seal declare: 5u seal held (dirt 5), floor short 3 - a death here erases the floor'
 *   empty    'F14 seal declare: 0u seal held - the floor is empty, a death here is a total seal loss'
 * Junk-safe: no tag, a non-array pocket, or a no-risk input prints NOTHING
 * (null) - the declare never invents a stake or a risk.
 * @param {object} [p]
 * @param {string} [p.tag] the bot tag ('F14')
 * @param {Array<{name?:string, count?:number}>|null|undefined} [p.items] the inventory read
 * @param {number} [p.hp] bot health 0..20 (junk -> the armed risk path stays shut, the shelter gate's own law)
 * @param {number} [p.threatDist] metres to the nearest hostile (junk -> far)
 * @param {boolean} [p.night] night by the vanilla clock
 * @param {boolean} [p.armed] does the bot hold a REAL melee weapon
 * @param {number} [p.attackers] hostiles within DETECT_RANGE (junk -> 1)
 * @returns {string|null}
 */
export function sealDeclareLine ({ tag = '', items = null, hp = null, threatDist = Infinity, night = false, armed = true, attackers = 1 } = {}) {
  if (!tag) return null
  // THE RISK GATE - the shelter gate's own boundaries re-read here so the
  // declare and the shelter policy cannot disagree about what a risk is
  // (the v0.106.0 co-derivation, one more rider on the same function).
  if (!shelterDue({ night, armed, threatDist, hp, attackers })) return null
  const snap = sealSnapshot(items)
  if (!snap) return null // the pocket never read - no line invents a stake
  const top = snap.top ? ` (${snap.top.name} ${snap.top.count})` : ''
  if (snap.total <= 0) return `${tag} seal declare: 0u seal held - the floor is empty, a death here is a total seal loss`
  if (snap.met) return `${tag} seal declare: ${snap.total}u seal held${top} - the floor is met, the stake rides the risk`
  return `${tag} seal declare: ${snap.total}u seal held${top}, floor short ${snap.shortfall} - a death here erases the floor`
}

/**
 * (v0.421.0) THE RESPAWN ACCOUNTING LINE - the seal loss priced once, at the
 * first post-death spawn, with the honest floor arithmetic: the death stake
 * against the respawn pocket, lost = max(0, stake - carried). The floor law:
 * carried units may be re-gathered stock rather than recovered drops, so the
 * number is 'at least this much is gone' - never a recovery credit (the
 * v0.403.0 sealLost precedent, now on the live side of the respawn). Shapes:
 *   lost     'F14 seal after respawn: pocket 0u seal, 100u of the 100u stake is gone - the floor must re-earn'
 *   holds    'F14 seal after respawn: pocket 12u seal (cobblestone 12) - the floor holds against the 100u stake'
 *   empty    'F14 seal after respawn: pocket 3u seal (cobblestone 3) - the death stake was empty, the floor starts from zero'
 *   unread   'F14 seal after respawn: pocket 3u seal (cobblestone 3) - the death stake unread, the loss unpriced'
 *   nopocket 'F14 seal after respawn: pocket unread - the death stake is unaccounted'
 * Junk-safe: no tag prints nothing; a non-array respawn read renders the
 * honest unread pocket (the accounting never vanishes silently - that silence
 * is the disease this line cures); a junk death stake prices unpriced.
 * @param {object} [p]
 * @param {string} [p.tag] the bot tag ('F14')
 * @param {{total?:number}|null} [p.death] the sealSnapshot read at death (null = the death pocket never read)
 * @param {Array<{name?:string, count?:number}>|null|undefined} [p.items] the respawn pocket read
 * @returns {string|null}
 */
export function sealRespawnLine ({ tag = '', death = null, items = null } = {}) {
  if (!tag) return null
  const now = sealSnapshot(items)
  if (!now) return `${tag} seal after respawn: pocket unread - the death stake is unaccounted`
  const top = now.top ? ` (${now.top.name} ${now.top.count})` : ''
  const stake = death && Number.isFinite(death.total) ? Math.max(0, Math.floor(death.total)) : null
  if (stake === null) return `${tag} seal after respawn: pocket ${now.total}u seal${top} - the death stake unread, the loss unpriced`
  if (stake <= 0) return `${tag} seal after respawn: pocket ${now.total}u seal${top} - the death stake was empty, the floor starts from zero`
  if (now.met) return `${tag} seal after respawn: pocket ${now.total}u seal${top} - the floor holds against the ${stake}u stake`
  const lost = Math.max(0, stake - now.total)
  if (lost <= 0) return `${tag} seal after respawn: pocket ${now.total}u seal${top} - the ${stake}u stake survived the death, floor short ${now.shortfall}`
  return `${tag} seal after respawn: pocket ${now.total}u seal${top}, ${lost}u of the ${stake}u stake is gone - the floor must re-earn`
}
