// (v0.576.0) THE DROP CENSUS - the unaccounted leak's first MEASURED sink.
//
// WHY: the leak's arc reads 0 -> 0 -> 606u (24.0%) -> 726u (36.0%) -> 563u
// (30.8%) across the last fleets and the watch shelf (v0.569.0) speaks the
// band - but the sinks named since v0.54.0 ('the shaft drops, the tool spend
// and the consolidation own the leak') were never measured BY NAME. The
// shaft-drop sink is the first suspect and this census is its live counter
// seat: the item-entity lifecycle counted at the events themselves (spawn /
// collect / gone), per bot, summed fleet-wide at the deadline.
//
// THE MASS LAW (the merge self-correction): item entities merge when they
// touch - one entity vanishes and its mass joins the twin. A count read at
// spawn time would book the merged mass NOWHERE (the twin's own metadata
// count updates on the merge packets, but the spawn-time book already spent
// the vanishing twin's units). So units are NEVER read at spawn: the spawn
// counts the DROP (the event), the mass is read at the RESOLVE points - the
// collect (the twin's metadata now carries the merged stack) and the gone.
// A vanish within the merge window of its own spawn is the merge class -
// forgotten, never lost (the mass rides the twin the window exists to
// protect); a vanish past the window left the pool without a player's hand
// (despawn at 300s, lava, cactus, void, hopper) - that is the LOST class,
// the leak's first priced suspect.
//
// THE ROW: share = lost / resolved (resolved = collected + lost - the mass
// that left the pool one way or the other). At or above the floor the sink
// speaks as measured; below it the other suspects keep the cover. Under the
// grain floor the sample names itself too small (never a verdict the data
// cannot carry - the shelf's own law). ALWAYS printed - the none-form is a
// verdict too (the 05:00 ledger-skip lesson: an absent line class is
// indistinguishable from a filter blind spot).
//
// Junk never enters: a torn entity, a NaN id, a negative or unreadable
// count - the lifecycle proceeds, the books stay clean (the body-guard law).

// The sink's trip point - the family's own boundary shape (the unaccounted
// watch speaks at 0.25 of mined; the drop pool speaks at 0.25 of resolved).
// A different denominator from the shelf's, so a different constant - but
// the same family boundary, documented here so the two cannot drift apart
// silently.
export const DESPAWN_FLOOR_SHARE = 0.25

// The merge window: an uncollected item that vanishes this soon after its
// own spawn is a merge, not a leak (items merge within ticks of touching;
// the window's far edge is generous, the leak class lives at 300s).
export const DROP_MERGE_WINDOW_MS = 10000

// The grain floor (one stack - the write-off family's own floor): under it
// the sample is too small to judge.
export const DROP_RESOLVE_MIN_UNITS = 64

/**
 * The mass of an item entity, read from its live metadata (the merge
 * self-correction: the read happens at resolve time, never at spawn).
 * @param {{metadata?: Array}|null} entity
 * @returns {number|null} the stack count, or null when unreadable
 */
export function itemCountOf (entity) {
  const md = entity?.metadata
  if (!Array.isArray(md)) return null
  for (const m of md) {
    if (m && typeof m === 'object' && Number.isFinite(m.count) && m.count > 0) return Math.floor(m.count)
  }
  return null
}

/**
 * One bot's census book: the live drop pool plus the resolved totals.
 * @returns {{live: Map<number, {ts: number, collected: boolean, entity: object}>, spawned: number, collectedUnits: number, collectedDrops: number, lostUnits: number, lostDrops: number}}
 */
export function dropCensusRecord () {
  return { live: new Map(), spawned: 0, collectedUnits: 0, collectedDrops: 0, lostUnits: 0, lostDrops: 0 }
}

/**
 * The spawn event: count the DROP, never the mass (the merge law).
 * @param {ReturnType<typeof dropCensusRecord>} rec
 * @param {{name?: string, id?: number}|null} entity
 * @param {number} now
 * @returns {boolean} true when a new item drop was booked
 */
export function observeItemSpawn (rec, entity, now = Date.now()) {
  if (!rec || !(rec.live instanceof Map)) return false
  if (!entity || entity.name !== 'item' || !Number.isFinite(entity.id)) return false
  if (!Number.isFinite(now) || now < 0) now = Date.now()
  if (rec.live.has(entity.id)) return false
  rec.live.set(entity.id, { ts: Math.floor(now), collected: false, entity })
  rec.spawned++
  return true
}

/**
 * The collect event: the pool's exit THROUGH a player's hand. The mass is
 * read here (the twin's metadata carries the merged stack by now). The
 * entity leaves the live pool either way - a duplicate collect can never
 * double-count (the id is gone), a later gone event reads it as unknown.
 * @returns {boolean} true when the pickup was booked
 */
export function observeItemCollect (rec, entity, now = Date.now()) {
  if (!rec || !(rec.live instanceof Map)) return false
  if (!entity || !Number.isFinite(entity.id)) return false
  const t = rec.live.get(entity.id)
  if (!t || t.collected) return false
  rec.live.delete(entity.id)
  const c = itemCountOf(entity)
  if (c != null) { rec.collectedUnits += c; rec.collectedDrops++ }
  t.collected = true
  return true
}

/**
 * The gone event: the pool's exit WITHOUT a hand. Inside the merge window
 * the vanish is the merge class - forgotten (the mass rides the twin).
 * Past the window it is the LOST class - the mass read and booked.
 * @returns {boolean} true when a loss was booked
 */
export function observeItemGone (rec, entity, now = Date.now()) {
  if (!rec || !(rec.live instanceof Map)) return false
  if (!entity || !Number.isFinite(entity.id)) return false
  const t = rec.live.get(entity.id)
  if (!t || t.collected) return false
  rec.live.delete(entity.id)
  const age = (Number.isFinite(now) && now >= 0 ? now : Date.now()) - t.ts
  if (!Number.isFinite(age) || age < 0) return false // an impossible clock is nobody's leak
  if (age <= DROP_MERGE_WINDOW_MS) return false // the merge class: the mass moved to a twin
  const c = itemCountOf(entity)
  if (c != null) { rec.lostUnits += c; rec.lostDrops++ }
  return true
}

/**
 * The deadline read: the still-live pool's mass (drops that never resolved).
 * @param {ReturnType<typeof dropCensusRecord>} rec
 * @returns {{units: number, drops: number}}
 */
export function openDropUnits (rec) {
  if (!rec || !(rec.live instanceof Map)) return { units: 0, drops: 0 }
  let units = 0
  let drops = 0
  for (const t of rec.live.values()) {
    if (!t || t.collected) continue
    const c = itemCountOf(t?.entity)
    if (c != null) { units += c; drops++ }
  }
  return { units, drops }
}

const floorU = x => (Number.isFinite(x) && x > 0) ? Math.floor(x) : 0

/**
 * The deadline row: does the shaft-drop sink own the leak? Sums every
 * record handed in (one per bot instance - reconnects append, nothing is
 * erased). ALWAYS speaks; the none-forms are verdicts too.
 * @param {Array<ReturnType<typeof dropCensusRecord>>|null} records
 * @returns {string}
 */
export function dropCensusRow (records) {
  const list = Array.isArray(records) ? records : []
  let spawned = 0
  let collected = 0
  let lost = 0
  let open = 0
  for (const r of list) {
    if (!r || typeof r !== 'object') continue
    spawned += floorU(r.spawned)
    collected += floorU(r.collectedUnits)
    lost += floorU(r.lostUnits)
    open += openDropUnits(r).units
  }
  const resolved = collected + lost
  if (spawned === 0 && resolved === 0) return 'drop census: none (no item drops observed this run)'
  if (resolved === 0) return `drop census: none (${spawned} drops seen, no mass resolved)`
  const share = lost / resolved
  const pct = (share * 100).toFixed(1)
  const live = `${open}u still live`
  if (resolved < DROP_RESOLVE_MIN_UNITS) {
    return `drop census: ${lost}u lost of ${resolved}u resolved, ${live} (${pct}%) - under the ${DROP_RESOLVE_MIN_UNITS}u grain, the sample stays too small to judge`
  }
  if (share >= DESPAWN_FLOOR_SHARE) {
    return `drop census: ${lost}u of ${resolved}u resolved lost uncollected, ${live} (${pct}% - ${spawned} drops seen) - the shaft-drop sink is measured, the leak's first suspect priced`
  }
  return `drop census: ${lost}u of ${resolved}u resolved lost uncollected, ${live} (${pct}% - under the ${(DESPAWN_FLOOR_SHARE * 100).toFixed(1)}% floor) - the shaft drops stay minor, the leak's other suspects keep the cover`
}
