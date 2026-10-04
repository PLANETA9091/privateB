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
//
// (v0.578.0) THE MASS LENS - the first flight's own verdict, honored. Fleet
// 37154867210 (v0.576.0) read 'none (27872 drops seen, no mass resolved)'
// on a face where the bots physically pocketed ~2400u - the census was
// blind BY CONSTRUCTION, and the none-form said so. The ground truth:
// prismarine-entity carries the metadata as a RAW values array and hands
// the item-stack entry to Item.fromNotch, whose own read for 1.20.5+
// (itemsWithComponents) is networkItem.itemCount - the census's 'count'
// read matched a shape the live tree never produces (the unit tests had
// synthesized it). The lens reads the LIVE slot field first (itemCount,
// prismarine-item's own field name) with the legacy count kept - one
// chain, both shapes, the junk law unchanged (finite, > 0, floored).
// THE DEAF-ARM INSURANCE: the resolve arms now count their own liveness
// (collectEvents / goneEvents = handler entries, torn payloads included -
// the counter sizes the EVENT, not the payload), the merge-class
// vanishes (mergeVanishes) and the resolves whose mass still reads
// unreadable (nullMassResolves) - the none-form names them, so a still
// blind face NAMES its deaf arm in one read (the event never fired vs
// the id never matched vs the mass never read) instead of burning
// another face on 'none'.
//
// (v0.581.0) THE OPEN POOL ANATOMY - the census's own open class, read one
// rung deeper. The lens's first flight read the mass AND left the row's
// tail speaking blind: '12412u still live' - but WHO holds it and HOW OLD
// it is never surfaced. The age is the lever's aim: vanilla despawns item
// entities at 6000 ticks (300s), so mass still live at deadline splits
// three ways - the FRESH tail (dropped inside the last minute: the
// deadline's own edge, no cure exists), the AGING middle (a run's normal
// churn), and the OVERDUE class (>= 300s old: it survived its own despawn
// clock uncollected - the sweep's grid walked past it; the mass nobody
// banked, the collection reach's own evidence). THE VERDICT: overdue >=
// the family's half boundary reads 'the sweep's reach is the front';
// overdue > 0 under it reads mixed; overdue == 0 reads the tail, no cure
// named. THE LAWS: the census's always-print law (the none-forms are
// verdicts too), the write-off family's grain (64u - one number, the
// drift impossible by construction), the mass lens's read at resolve time
// (the deadline read IS a resolve read - the lens's own chain), unreadable
// mass never enters the units (the openDropUnits convention), the tie law
// count desc / name asc (the census family's own law), the sum law (the
// buckets can never split from openDropUnits - one arithmetic, the sibling
// law). The name rides the record (the wiring adds it at the push seat) -
// an unnamed record reads '-', an unnamed holder is still a holder.

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

// (v0.581.0) the open pool's age buckets. The overdue edge is the vanilla
// item despawn age (6000 ticks = 300s): mass older than this at the
// deadline survived its own despawn clock uncollected. The fresh edge is
// one think-window wide (the deadline's own tail, no cure exists there).
export const OPEN_FRESH_MS = 60000
export const OPEN_OVERDUE_MS = 300000
// the family's half boundary (the owner maps' own shape, one number)
export const OPEN_OVERDUE_SHARE = 0.5

/**
 * The mass of an item entity, read from its live metadata (the merge
 * self-correction: the read happens at resolve time, never at spawn).
 * (v0.578.0) THE MASS LENS: the live slot entry carries itemCount
 * (prismarine-item's fromNotch read for 1.20.5+, the field the real
 * protocol parser produces); the legacy count stays second - one chain,
 * both shapes, first readable entry wins, the junk law unchanged.
 * @param {{metadata?: Array}|null} entity
 * @returns {number|null} the stack count, or null when unreadable
 */
export function itemCountOf (entity) {
  const md = entity?.metadata
  if (!Array.isArray(md)) return null
  for (const m of md) {
    if (m && typeof m === 'object') {
      const c = [m.itemCount, m.count].find(v => Number.isFinite(v) && v > 0)
      if (c !== undefined) return Math.floor(c)
    }
  }
  return null
}

/**
 * One bot's census book: the live drop pool plus the resolved totals.
 * @returns {{live: Map<number, {ts: number, collected: boolean, entity: object}>, spawned: number, collectedUnits: number, collectedDrops: number, lostUnits: number, lostDrops: number}}
 */
export function dropCensusRecord () {
  return {
    live: new Map(), spawned: 0, collectedUnits: 0, collectedDrops: 0, lostUnits: 0, lostDrops: 0,
    // (v0.578.0) the deaf-arm insurance: the arms' own liveness counts (the
    // row's none-form names them - a still blind face names its deaf arm)
    collectEvents: 0, goneEvents: 0, mergeVanishes: 0, nullMassResolves: 0
  }
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
  rec.collectEvents++ // (v0.578.0) the arm's liveness: the EVENT fired, torn payload or not
  if (!entity || !Number.isFinite(entity.id)) return false
  const t = rec.live.get(entity.id)
  if (!t || t.collected) return false
  rec.live.delete(entity.id)
  const c = itemCountOf(entity)
  if (c != null) { rec.collectedUnits += c; rec.collectedDrops++ } else rec.nullMassResolves++ // (v0.578.0) the lens still missed this one
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
  rec.goneEvents++ // (v0.578.0) the arm's liveness: the EVENT fired, torn payload or not
  if (!entity || !Number.isFinite(entity.id)) return false
  const t = rec.live.get(entity.id)
  if (!t || t.collected) return false
  rec.live.delete(entity.id)
  const age = (Number.isFinite(now) && now >= 0 ? now : Date.now()) - t.ts
  if (!Number.isFinite(age) || age < 0) return false // an impossible clock is nobody's leak
  if (age <= DROP_MERGE_WINDOW_MS) { rec.mergeVanishes++; return false } // (v0.578.0) the merge class: the mass moved to a twin - now the class is SIZED, not just silent
  const c = itemCountOf(entity)
  if (c != null) { rec.lostUnits += c; rec.lostDrops++ } else rec.nullMassResolves++ // (v0.578.0) the lens still missed this one
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
  let collectEvents = 0
  let goneEvents = 0
  let mergeVanishes = 0
  let nullMassResolves = 0
  for (const r of list) {
    if (!r || typeof r !== 'object') continue
    spawned += floorU(r.spawned)
    collected += floorU(r.collectedUnits)
    lost += floorU(r.lostUnits)
    open += openDropUnits(r).units
    collectEvents += floorU(r.collectEvents)
    goneEvents += floorU(r.goneEvents)
    mergeVanishes += floorU(r.mergeVanishes)
    nullMassResolves += floorU(r.nullMassResolves)
  }
  const resolved = collected + lost
  if (spawned === 0 && resolved === 0) return 'drop census: none (no item drops observed this run)'
  if (resolved === 0) return `drop census: none (${spawned} drops seen, no mass resolved; collect events ${collectEvents}, gone events ${goneEvents}, merge-window vanishes ${mergeVanishes}, unreadable mass ${nullMassResolves})`
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

/**
 * (v0.581.0) THE OPEN POOL ANATOMY: the census's live-at-deadline class,
 * split by age and held by name. The overdue class (>= OPEN_OVERDUE_MS)
 * is the mass that survived its own despawn clock uncollected - the
 * sweep's reach evidence; the fresh class is the deadline's own tail.
 * ALWAYS printed (the census's own law); the buckets never split from
 * openDropUnits (the sum law - one arithmetic).
 * @param {Array<ReturnType<typeof dropCensusRecord>>|null} records
 * @param {number} nowMs the deadline clock (a parameter - the tests hold it)
 * @returns {string}
 */
export function dropOpenAnatomyRow (records, nowMs = Date.now()) {
  const list = Array.isArray(records) ? records : []
  let fresh = 0
  let aging = 0
  let overdue = 0
  let entries = 0
  const holders = []
  for (const r of list) {
    if (!r || typeof r !== 'object' || !(r.live instanceof Map)) continue
    let own = 0
    for (const t of r.live.values()) {
      if (!t || t.collected) continue
      entries++ // every live entry is a live drop, readable mass or not
      const c = itemCountOf(t?.entity)
      if (c == null) continue // unreadable mass never enters the units (the lens's convention)
      own += c
      const age = (Number.isFinite(nowMs) && nowMs >= 0 ? nowMs : Date.now()) - t.ts
      if (!Number.isFinite(age) || age < 0) { aging += c; continue } // an impossible clock reads the honest middle
      if (age < OPEN_FRESH_MS) fresh += c
      else if (age < OPEN_OVERDUE_MS) aging += c
      else overdue += c
    }
    if (own > 0) holders.push({ name: (typeof r.name === 'string' && r.name.trim() !== '') ? r.name.trim() : '-', units: own })
  }
  const units = fresh + aging + overdue
  if (entries === 0) return 'drop open pool: none (the pool ended clean)'
  if (units === 0) return `drop open pool: none (${entries} drops live, no readable mass)`
  if (units < DROP_RESOLVE_MIN_UNITS) {
    return `drop open pool: ${units}u of live mass under the ${DROP_RESOLVE_MIN_UNITS}u grain, the sample stays too small to judge`
  }
  holders.sort((a, b) => (b.units - a.units) || (a.name < b.name ? -1 : 1))
  const top = holders[0]
  const shape = `(${fresh}u fresh, ${aging}u aging, ${overdue}u overdue, top ${top.name}=${top.units}u)`
  if (overdue / units >= OPEN_OVERDUE_SHARE) {
    return `drop open pool: ${units}u live at the deadline ${shape} - the old ground mass rode the deadline - the sweep's reach is the front`
  }
  if (overdue > 0) {
    return `drop open pool: ${units}u live at the deadline ${shape} - the pool reads mixed, the tail and the residue both ride`
  }
  return `drop open pool: ${units}u live at the deadline ${shape} - the deadline's own tail, no cure named`
}

/**
 * (v0.592.0) THE OVERDUE OWNER GRAIN: the anatomy's overdue class read by
 * holder. The verdict 'the sweep's reach is the front' spoke twice
 * (fleet 37166593085's 10747u, fleet 37169265512's 5883u) and priced the
 * front but not the SEAT: a pool held by ONE bot is that seat's own walk
 * (the owner never came back - the rescue's class), a pool SPREAD across
 * many bots is the fleet's reach (every walker leaves a tail - the
 * reach-wide cure). The two cures are different work; one row names
 * which. The tally rides the anatomy's own arithmetic (the sum law - one
 * age ladder, one readable-mass convention: age impossible reads the
 * honest middle, null mass never enters the units), so this row's
 * overdue total can never disagree with dropOpenAnatomyRow's.
 * ALWAYS speaks (the census's own law); the none-forms are verdicts too.
 * @param {Array<ReturnType<typeof dropCensusRecord>>|null} records
 * @param {number} nowMs the deadline clock (a parameter - the tests hold it)
 * @returns {string}
 */
export function overdueOwnerRow (records, nowMs = Date.now()) {
  const list = Array.isArray(records) ? records : []
  let overdue = 0
  let entries = 0
  const owners = []
  for (const r of list) {
    if (!r || typeof r !== 'object' || !(r.live instanceof Map)) continue
    let own = 0
    for (const t of r.live.values()) {
      if (!t || t.collected) continue
      entries++ // every live entry is a live drop, readable mass or not
      const c = itemCountOf(t?.entity)
      if (c == null) continue // unreadable mass never enters the units (the lens's convention)
      const age = (Number.isFinite(nowMs) && nowMs >= 0 ? nowMs : Date.now()) - t.ts
      if (!Number.isFinite(age) || age < 0) continue // the impossible clock rides the middle, never the old class
      if (age < OPEN_OVERDUE_MS) continue
      own += c
    }
    if (own > 0) owners.push({ name: (typeof r.name === 'string' && r.name.trim() !== '') ? r.name.trim() : '-', units: own })
  }
  overdue = owners.reduce((s, o) => s + o.units, 0)
  if (entries === 0) return 'overdue owners: none (the pool ended clean)'
  if (overdue === 0) return `overdue owners: none (${entries} drops live, no overdue mass)`
  if (overdue < DROP_RESOLVE_MIN_UNITS) {
    return `overdue owners: ${overdue}u of overdue mass under the ${DROP_RESOLVE_MIN_UNITS}u grain, the sample stays too small to judge`
  }
  owners.sort((a, b) => (b.units - a.units) || (a.name < b.name ? -1 : 1))
  const top = owners[0]
  const pct = ((top.units / overdue) * 100).toFixed(1)
  const head = `overdue owners: ${owners.length} bot(s) hold ${overdue}u overdue`
  if (top.units / overdue >= OPEN_OVERDUE_SHARE) {
    return `${head} - ${top.name} holds ${pct}% (${top.units}u) - one seat owns the old ground (that seat's own walk is the cure)`
  }
  return `${head} - top ${top.name}=${top.units}u (${pct}%) - the old ground is spread (the reach is the fleet's front)`
}
