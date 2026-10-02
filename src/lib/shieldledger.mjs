//
// shieldledger.mjs - THE SHIELD LADDER (v0.489.0)
//
// The shelter attempt's own book. The takeover class's engine priced:
// every 'combat: shelter try vs <mob>' opens a ladder episode for the
// bot, the ladder's machinery walks inside it (wall miss / ring try /
// skip - prose, never closes), and the bot's next boundary line closes
// the episode with the lane's own one-boundary law:
//
//   'sheltering from <mob>'  -> ringed   (the shield LANDED - the ring
//                                         door is the door that opens)
//   fighting / fleeing / fight-ended -> laneLost (the fight or the
//                                         flight lane took over - the
//                                         scan lost the argument)
//   died                     -> died     (the scan outlived by the death)
//   the face's tail          -> open     (the honest truncation)
//
// (a second try over an open episode closes it 'open' - the tail law's
// mid-walk twin, the verdictflip precedent; the fresh try wins.)
//
// THE SKIP CLASSES (the refusal's own grammar, first skip per episode):
//   gateskip     'shelter skip (night=true armed=true hp=...)' - the
//                gate state refused before the scan walked
//   notbuildable 'open field: ring not buildable [...]'
//   nostock      'open field: ring stock N/8, ground earns nothing'
//   incomplete   'open field: ring incomplete N/8'  (after a ring try)
//   stepin       '(N,M: step-in incomplete)'
//   other        the honest catch-all
//
// THE FIELD READ (faces 42+43 stored artifacts, zero runner minutes,
// hand-traced then verified live): 18 tries, the WALL DOOR NEVER OPENED
// - 18 wall misses, 0 walls landed, every 'sheltering' line rides a
// ring ('ring 8/8' / 'arrow wall') - THE OPEN-FIELD SIGNATURE. The ring
// is the only door: 7 ring tries, 4 landed / 3 refused. The landed: 5
// ringed episodes; the re-scan tax: 6 same-threat re-scan pairs (face
// 42's F11 re-scanned the same drowned FIVE times - the ring stock
// draining 2/8 -> 2/7 -> 2/6 while the scan re-refused - before the
// fifth try's arrow wall landed). The pregate class: the scan refusing
// before any try (the gate-state skin). n=2: the shield's wall leg is
// dead weight in the open field; the ring leg works when the stock
// exists; the re-scan re-asks a question the world answered already.
// The design input prices the gate, not a fleet change (zero fleet
// changes in this wire).
//
// Junk-safe: non-array / non-string-blob reads null (the smeltledger
// convention); a face with no shelter verbs reads the honest zero
// shape. Pure: reads, never mutates. One parser per shape: the verbs
// route via parseCombatLine (shootercensus - the shelter verbs already
// live there), the death via DIED_KIND_RE (maptrip); this lib owns only
// the skip-class grammar and the episode book.
//

import { DIED_KIND_RE } from './maptrip.mjs'
import { parseCombatLine } from './shootercensus.mjs'

const medianOf = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

// the refusal's own grammar (the skip line's raw text, first class wins;
// the gate skin is checked FIRST - its body starts inside the gate state)
function skipClass (line) {
  if (/shelter skip \(night=true /.test(line)) return 'gateskip'
  if (/ring not buildable/.test(line)) return 'notbuildable'
  if (/ring stock \d+\/\d+/.test(line)) return 'nostock'
  if (/ring incomplete \d+\/\d+/.test(line)) return 'incomplete'
  if (/step-in incomplete/.test(line)) return 'stepin'
  return 'other'
}

/**
 * shelterLadder(lines) - the shield attempt's own book.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{tries: number, ringed: number, laneLost: number,
 *   died: number, open: number, pregate: number, wallMisses: number,
 *   ringTries: number, ringLanded: number, ringRefused: number,
 *   sameThreatRescans: number, threatChangedRescans: number,
 *   skipClasses: object, pregateClasses: object,
 *   prose: {min, median, max}|null, rows: object[]}}
 */
export function shelterLadder (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const state = new Map()
  const rows = []
  let tries = 0
  let pregate = 0
  const pregateClasses = {}
  const skipClasses = {}
  const close = (st, outcome, closerIdx) => {
    const row = {
      bot: st.bot, mob: st.mob, dist: st.dist, outcome,
      openIdx: st.idx, closerIdx: closerIdx ?? null,
      wallMisses: st.wallMisses, ringTries: st.ringTries, skips: st.skips,
      firstSkipClass: st.firstSkipClass
    }
    rows.push(row)
    st.open = false
  }
  for (let i = 0; i < src.length; i++) {
    const line = src[i]
    if (typeof line !== 'string') continue
    const km = line.match(DIED_KIND_RE)
    if (km) {
      const st = state.get(km[1])
      if (st && st.open) close(st, 'died', i)
      continue
    }
    const cm = parseCombatLine(line)
    if (!cm || !cm.bot) continue
    const st = state.get(cm.bot)
    if (cm.verb === 'shelter-try') {
      if (st && st.open) close(st, 'open', i) // the tail law, mid-walk twin
      state.set(cm.bot, {
        bot: cm.bot, mob: cm.attacker, dist: cm.dist, idx: i, open: true,
        wallMisses: 0, ringTries: 0, skips: 0, firstSkipClass: null
      })
      tries++
      continue
    }
    if (!st || !st.open) {
      // a skip with no open episode - the scan refused before any try
      if (cm.verb === 'shelter-skip') {
        pregate++
        const cls = skipClass(line)
        pregateClasses[cls] = (pregateClasses[cls] || 0) + 1
      }
      continue
    }
    if (cm.verb === 'shelter-wall-miss') {
      st.wallMisses++
    } else if (cm.verb === 'ring-try') {
      // (the ring try's verb key is 'ring-try' in parseCombatLine's own
      // verb table - 'shelter ring try' routes there, most-specific-first)
      st.ringTries++
    } else if (cm.verb === 'shelter-skip') {
      st.skips++
      const cls = skipClass(line)
      if (st.firstSkipClass === null) {
        st.firstSkipClass = cls
        skipClasses[cls] = (skipClasses[cls] || 0) + 1
      }
    } else if (cm.verb === 'sheltering') {
      close(st, 'ringed', i)
    } else if (cm.verb === 'fighting' || cm.verb === 'fleeing' || cm.verb === 'fight-ended') {
      close(st, 'laneLost', i)
    }
    // every other combat verb: the ladder's own machinery or unrelated
    // prose - never closes, never opens
  }
  for (const st of state.values()) {
    if (st.open) close(st, 'open', null)
  }
  const tally = { ringed: 0, laneLost: 0, died: 0, open: 0 }
  for (const r of rows) tally[r.outcome]++
  // the ring door: a ring try inside the episode x the episode's own fate
  let ringLanded = 0
  let ringRefused = 0
  for (const r of rows) {
    if (r.ringTries === 0) continue
    if (r.outcome === 'ringed') ringLanded++
    else ringRefused++
  }
  // the re-scan tax: the bot's consecutive episode pairs (by open order)
  let sameThreatRescans = 0
  let threatChangedRescans = 0
  const byBot = new Map()
  for (const r of rows) {
    if (!byBot.has(r.bot)) byBot.set(r.bot, [])
    byBot.get(r.bot).push(r)
  }
  for (const list of byBot.values()) {
    for (let k = 1; k < list.length; k++) {
      if (list[k].mob === list[k - 1].mob) sameThreatRescans++
      else threatChangedRescans++
    }
  }
  const spans = rows
    .filter(r => r.closerIdx !== null)
    .map(r => r.closerIdx - r.openIdx)
  return {
    tries,
    ringed: tally.ringed,
    laneLost: tally.laneLost,
    died: tally.died,
    open: tally.open,
    pregate,
    wallMisses: rows.reduce((a, r) => a + r.wallMisses, 0),
    ringTries: rows.reduce((a, r) => a + r.ringTries, 0),
    ringLanded,
    ringRefused,
    sameThreatRescans,
    threatChangedRescans,
    skipClasses,
    pregateClasses,
    prose: spans.length
      ? { min: Math.min(...spans), median: medianOf(spans), max: Math.max(...spans) }
      : null,
    rows
  }
}

