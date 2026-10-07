//
// entrywindow.mjs - THE EFFECTIVE WINDOW (v0.480.0)
//
// The re-entry price's (v0.479.0) honest second leg. THE CORRECTION IT
// PRICES: the v0.479.0 row printed the mirror's lead ('sight died 24-25s
// before death') as THE wiring's reaction window - that read was the
// blindness DURATION, not the window. A live trigger arms when the
// snapshot age CROSSES the stale floor (drowning.mjs's BREATH_OWNER_STALE_MS
// = 15000ms - the mirror's own blindness evidence), not when the sight
// dies. The REAL window is lead - floor: face 43's 25s/24s blindnesses
// leave 10s/9s - a quarter of the raw lead. The floor is IMPORTED (one
// truth - the constant the mirror itself judges blindness by; never
// forked), and the lane's cost side rides rescue-ledger.mjs's OWN
// classifier (rescueEndClass/rescueEndSeconds - the split-of-labor law,
// the rescueclock precedent: same emitter, a different slice).
//
// THE COST SIDE: the lane's SAVED episodes only (the 'complete' +
// 'completeStandingWet' classes - the pocket actually filled; the
// releases, standdowns, timeouts and aborts are the lane's other stories,
// each with its own row elsewhere). Their 'in Ns' durations price what
// the trigger's arm costs at the moment it fires.
//
// THE VERDICT per death: fits (the effective window covers the lane's
// WORST observed save - the wiring closes with headroom), tight (it
// covers the MEDIAN save but not the worst - the typical rescue fits,
// the tail risks), misses (below the median - the wiring does not close
// on this evidence), unpriced (no cue, a cue without the sight-loss
// prose, or no saves in the face - the honest blind spots).
//
// Junk-safe: non-object o2g, non-array lines, zero deaths -> null (the
// row stays silent - the v0.379.0 precedent). Pure: reads, never mutates.
//
import { BREATH_OWNER_STALE_MS } from './drowning.mjs'
import { rescueEndClass, rescueEndSeconds } from './rescue-ledger.mjs'

/**
 * entryWindow(o2g, lines) - price the live sight-loss trigger's REAL
 * reaction window against the rescue lane's own save costs.
 *
 * @param {object|null} o2g o2Gap's result (the deaths + their cue joins)
 * @param {string[]} lines the face's log lines (the lane's end lines ride
 *   rescue-ledger's classifier - no second parser)
 * @returns {{floorSec, laneCost: {saves, min, median, max},
 *   perDeath: {F13: {lead, effective, verdict}}, verdicts:
 *   {fits, tight, misses, unpriced}}|null}
 *   floorSec   the stale floor in seconds (the design constant, imported)
 *   laneCost   the saved episodes' duration stats (min/median/max; nulls
 *              on an empty face - the verdicts then read unpriced)
 *   perDeath   per bot: lead (the blindness 'sight died Ns before death'),
 *              effective (lead - floorSec; null when unpriced), verdict
 *   verdicts   the fleet-wide verdict histogram
 */
export function entryWindow (o2g, lines) {
  if (!o2g || typeof o2g !== 'object' || !Array.isArray(lines)) return null
  if (!o2g.deaths) return null
  const floorSec = BREATH_OWNER_STALE_MS / 1000
  // the lane's cost side: the SAVED episodes' durations (the one
  // classifier - the complete classes only, the scope named in the header)
  const costs = []
  for (const line of lines) {
    const cls = rescueEndClass(line)
    if (cls === 'complete' || cls === 'completeStandingWet') {
      const s = rescueEndSeconds(line)
      if (s !== null) costs.push(s)
    }
  }
  costs.sort((a, b) => a - b)
  const mid = Math.floor((costs.length - 1) / 2)
  const median = costs.length
    ? (costs.length % 2 ? costs[mid] : (costs[mid] + costs[mid + 1]) / 2)
    : null
  const min = costs.length ? costs[0] : null
  const max = costs.length ? costs[costs.length - 1] : null
  // the trigger's window side: per death, the blindness minus the floor
  const perDeath = {}
  const verdicts = { fits: 0, tight: 0, misses: 0, unpriced: 0 }
  for (const [bot, v] of Object.entries(o2g.perBot || {})) {
    const lead = v && v.cue ? v.cue.sightDiedSecs : null
    if (!Number.isFinite(lead)) {
      perDeath[bot] = { lead: null, effective: null, verdict: 'unpriced' }
      verdicts.unpriced++
      continue
    }
    const effective = lead - floorSec
    let verdict
    if (max === null) verdict = 'unpriced' // no saves in the face to price against
    else if (effective >= max) verdict = 'fits'
    else if (median !== null && effective >= median) verdict = 'tight'
    else verdict = 'misses'
    perDeath[bot] = { lead, effective, verdict }
    verdicts[verdict]++
  }
  return { floorSec, laneCost: { saves: costs.length, min, median, max }, perDeath, verdicts }
}

//
// (v0.743.0) THE SAVEABLE DEATH - the window's own verdict joined with the
// lane's own relation (the skywalk law: two lenses, one read, no
// re-parsing). A death whose effective window FITS (covers the lane's
// worst observed save - the wiring closes with headroom) AND whose rescue
// relation is 'never' (o2Gap's own grammar - the trigger itself never
// fired) reads the saveable class: the window was there, the trigger was
// not - the trigger's own gap owned the death. THE FENCES: live = the lane
// flew blind (the sensor's class - v0.379.0's row), stale = the re-entry
// class (v0.477.0's row), tight/misses = the timing's price (v0.480.0's
// own rows), unpriced = the honest blind spot - and a face with no lane
// saves cannot name the class (the fits bar needs the lane's own cost
// ground; the verdict already reads unpriced there). Junk-safe: non-object
// ew/o2g -> []. Pure: reads, never mutates.
//
export function saveableDeaths (ew, o2g) {
  if (!ew || typeof ew !== 'object' || !o2g || typeof o2g !== 'object') return []
  const laneWorst = ew.laneCost ? ew.laneCost.max : null
  const rows = []
  for (const [bot, v] of Object.entries(ew.perDeath || {})) {
    if (!v || v.verdict !== 'fits') continue
    const rel = o2g.perBot && o2g.perBot[bot]
    if (!rel || rel.rescueKind !== 'never') continue
    rows.push({ bot, effective: v.effective, laneWorst })
  }
  return rows
}
