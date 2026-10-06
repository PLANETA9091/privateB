//
// tripcensus.mjs - THE WALK'S DELIVERY (v0.690.0; SLOT COLLISION #16:
// 0.689.0 taken by fire-1639's THE DECIDE WEATHER mid-fire - the re-number
// rides the house convention) + THE WALK'S COST (v0.693.0; SLOT COLLISION
// #17: 0.692.0 taken by the lane's THE LOOP LEDGER mid-fire - the re-number
// rides the house convention: the pairing
// grows its own clock - the face-line span famine→gathered prices what
// the trip BURNED: a flat walk delivered nothing yet still spent its
// segment; the face-29 read: the flats took 485 and 518 lines, the one
// cure 697) - the famine/gathered regexes are exported for the one-parser
// law by import (the v0.694.0 climb's price rides the same trip voice)
// + THE DAWN'S DEBT (v0.696.0): the deferred night's own anatomy - the
// fourth canonical trip form finally priced: the defer line promises
// 'gathering at dawn', so the lens joins the promise to the SAME bot's
// next famine line (the dawn kept its word - the walk re-fired) and
// counts the promises the face never answered (the dawn's open debts)
//
// The gather drought's cure input. The famine anatomy (v0.687.0) priced
// WHICH SLOT starves; the repeat read (v0.688.0) priced the PERSISTENCE
// (the same bot famine-ing again - the walk between the famines delivered
// nothing). This lens prices the walk itself: the trip's strict byte shape
// pairs every famine line (the BEFORE pocket) with exactly one answer -
// the gathered line (the AFTER pocket, the conversion chain's tail) or
// the refused line (the walk never started):
//
//   'F10 wood trip: famine (sticks 5 planks 2 logs 0) - gathering'
//   'F10 wood trip: gathered (sticks 8 planks 14 logs 6)'
//   'F10 wood trip: 0 (climb refused)'
//   'F10 wood trip: deferred night (tod=18000, sticks 5 planks 2 logs 0) - gathering at dawn'
//
// The delivery = the wood mass (sticks + planks + logs) after minus
// before, per paired trip:
//   cured    -> the walk brought wood home (the famine's own cure worked)
//   flat     -> the walk ran, the pocket didn't move (THE DROUGHT'S SEAT
//               rides the walk - the face-26 read: F8's first walk came
//               home 'sticks 0 planks 1 logs 0', mass +0)
//   negative -> the trip ate its own cure (the pocket shrank)
//   unread   -> the after-pocket sentinel (-1: the inventory read threw,
//               the death's own byte) - the pair exists, the mass doesn't
// orphans = famines never answered (the face cut mid-walk). Pure: reads,
// never mutates. Zero fleet wiring (mining-surface only, the
// v0.379/.../v0.688.0 precedent) - the fleet's own trip byte is the
// filter-key, it already rides.
//

const medianOf = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

const spanOf = (xs) => xs.length
  ? { min: Math.min(...xs), median: medianOf(xs), max: Math.max(...xs) }
  : null

// the four canonical wood-trip forms (the trip voice's own skin - the bot
// id rides the line head, no [F#] tag on this family)
export const WOOD_FAMINE_RE = /^([A-Za-z]\d+) wood trip: famine \(sticks (\d+) planks (\d+) logs (\d+)\) - .+$/
export const WOOD_GATHERED_RE = /^([A-Za-z]\d+) wood trip: gathered \(sticks (-?\d+) planks (-?\d+) logs (-?\d+)\)$/
const WOOD_REFUSED_RE = /^([A-Za-z]\d+) wood trip: 0 \(climb refused\)$/
const WOOD_DEFERRED_RE = /^([A-Za-z]\d+) wood trip: deferred night \(tod=(-?\d+), sticks (\d+) planks (\d+) logs (\d+)\) - gathering at dawn$/

const bump = (m, k) => { m[k] = (m[k] || 0) + 1 }

/**
 * woodTripCensus(lines) - the gather walk's own cure rate.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{gathered: {n: number, byBot: object,
 *   logsAfter: {min, median, max}|null},
 *   delivery: {n: number, cured: number, flat: number, negative: number,
 *   unread: number, gain: {min, median, max}|null,
 *   span: {cured: {min, median, max}|null, flat: {min, median, max}|null,
 *   negative: {min, median, max}|null}},
 *   refused: {n: number, byBot: object},
 *   deferred: {n: number, byBot: object, tods: {min, median, max}|null,
 *   debts: {kept: number, open: number}}, orphans: {n: number}}}
 */
export function woodTripCensus (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const gathered = { n: 0, byBot: {}, logsAfter: null }
  const delivery = { n: 0, cured: 0, flat: 0, negative: 0, unread: 0, gain: null, span: { cured: null, flat: null, negative: null } }
  const refused = { n: 0, byBot: {} }
  const deferred = { n: 0, byBot: {}, tods: null, debts: { kept: 0, open: 0 } }
  const orphans = { n: 0 }
  const logsAfters = []
  const gains = []
  const tods = []
  // the dawn's debts: defer lines waiting for the same bot's next famine
  // (the promise 'gathering at dawn' is kept when the walk re-fires)
  const pendingDefer = new Set()
  // the walk's cost: the face-line span per paired trip, split by class
  // (a flat walk delivered nothing yet still burned its segment)
  const spans = { cured: [], flat: [], negative: [] }
  // the pending pairs: famine (the before mass + its line index) waiting
  // for the same bot's gathered/refused answer (the trip's strict byte shape)
  const pending = new Map()
  for (let i = 0; i < src.length; i++) {
    const line = src[i]
    if (typeof line !== 'string') continue
    const fm = line.match(WOOD_FAMINE_RE)
    if (fm) {
      if (pendingDefer.has(fm[1])) {
        deferred.debts.kept++ // the dawn came: the bot re-fired the walk
        pendingDefer.delete(fm[1])
      }
      pending.set(fm[1], { before: Number(fm[2]) + Number(fm[3]) + Number(fm[4]), idx: i })
      continue
    }
    const gm = line.match(WOOD_GATHERED_RE)
    if (gm) {
      gathered.n++
      bump(gathered.byBot, gm[1])
      const s = Number(gm[2]); const p = Number(gm[3]); const l = Number(gm[4])
      if (pending.has(gm[1])) {
        delivery.n++
        const { before, idx } = pending.get(gm[1])
        pending.delete(gm[1])
        if (s < 0 || p < 0 || l < 0) {
          delivery.unread++ // the after-pocket sentinel: the pair exists, the mass doesn't
        } else {
          const gain = (s + p + l) - before
          gains.push(gain)
          if (gain > 0) { delivery.cured++; spans.cured.push(i - idx) }
          else if (gain === 0) { delivery.flat++; spans.flat.push(i - idx) }
          else { delivery.negative++; spans.negative.push(i - idx) }
        }
      }
      if (l >= 0) logsAfters.push(l)
      continue
    }
    const rm = line.match(WOOD_REFUSED_RE)
    if (rm) {
      refused.n++
      bump(refused.byBot, rm[1])
      pending.delete(rm[1]) // the famine answered by refusal: the walk never started
      continue
    }
    const dm = line.match(WOOD_DEFERRED_RE)
    if (dm) {
      deferred.n++
      bump(deferred.byBot, dm[1])
      tods.push(Number(dm[2]))
      pendingDefer.add(dm[1]) // the promise rides until the same bot re-fires
    }
  }
  orphans.n = pending.size // famines the face never answered (the log cut mid-walk)
  deferred.debts.open = pendingDefer.size // promises the face never answered (the dawn never came, or the log cut first)
  deferred.tods = tods.length
    ? { min: Math.min(...tods), median: medianOf(tods), max: Math.max(...tods) }
    : null
  gathered.logsAfter = logsAfters.length
    ? { min: Math.min(...logsAfters), median: medianOf(logsAfters), max: Math.max(...logsAfters) }
    : null
  delivery.gain = gains.length
    ? { min: Math.min(...gains), median: medianOf(gains), max: Math.max(...gains) }
    : null
  delivery.span = { cured: spanOf(spans.cured), flat: spanOf(spans.flat), negative: spanOf(spans.negative) }
  return { gathered, delivery, refused, deferred, orphans }
}
