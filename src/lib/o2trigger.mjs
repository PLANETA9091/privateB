//
// o2trigger.mjs - THE O2-LOW TRIGGER'S OWN WINDOW (v0.884.0)
//
// The o2-low trigger front's own pricing byte (the front the page
// lead's own row named twice on face 145: the page arrives too late
// for the typical save - fits 0 / misses 2 - so the trigger must fire
// at o2 LOW, not at the reset). The arm book (v0.880.0) prices the
// rescue STARTS' own oxygen; the page lead prices the page-vs-save
// window; the census prices the passes - NOBODY prices the WINDOW the
// o2-low trigger would have owned: the span from the bot's last
// re-crossing into the rescue band to the death line itself.
//
// THE CROSSING LAW (the descent's own entry): a crossing is the first
// numeric pass read at-or-below the band edge that follows a read
// above it (or opens the bot's stream - the descent began before the
// stream's sight). Surfacing above the edge re-arms the crossing (the
// next descent re-crosses); the LAST crossing before the death wins
// whole (the line-order law, the latest-start-wins idiom). The blind
// skins (reset(-1) / ?) judge nothing and clear nothing - the sensor's
// own death never unpins the crossing (the o2 kind 'reset' is the
// parser's own word, the reuse law).
//
// THE BAND EDGE: the sentry census's own rescueBand cell
// (rescueBand(<=10) - the decompose row's own byte; o2arm's headroom
// seat rides o2 >= 10, the census's own complement). The threshold is
// the census's own word, never invented here.
//
// THE CLOCK: the log's own adjacency (HB_RE, the one-parser law by
// reuse - the same clock sealdeath's thirds and drainthird's drops
// ride). A death before the first heartbeat stays untimed: the
// crossing's existence still prices, the window reads the honest null.
// The death resets the bot's own state (the v0.880.0 death-reset law's
// own idiom: an arm never survives the death it joined).
//
// Pure: reads, never mutates. Junk-safe: non-string rows judge
// nothing; non-array/string input reads the empty book.

import { HB_RE } from './sealdeath.mjs'
import { SENTRY_PASS_RE, parseSentryPass } from './sentry.mjs'
import { ARM_HEADROOM_MIN } from './o2arm.mjs'
import { parseDeathKind } from './deathkinds.mjs'

// The death announce's own anchored token (deathkinds.mjs's family
// shape - the bot rides the line's own prefix; the cause stays the
// server's verdict, never re-adjudicated here).
const DEATH_RE = /^(F\d+) \[F\d+\] died - respawning/

// The census's own rescueBand edge: the trigger's own threshold
// (o2 <= 10 rides the band; the census's own cell, never forked).
export const TRIGGER_O2_MAX = ARM_HEADROOM_MIN

const emptyBook = () => ({
  deaths: 0,
  crossed: 0,
  noCrossing: 0,
  untimed: 0,
  window: { count: 0, min: null, max: null, sum: 0 },
  perDeath: []
})

/**
 * Fold the pass streams into the o2-low trigger's own per-death
 * windows. Returns the totals book (perDeath riding the bot, the ts,
 * the window in seconds or null) - never null, never invented.
 */
export function o2TriggerBook (lines) {
  const book = emptyBook()
  if (!Array.isArray(lines)) return book
  const state = {} // per bot: { crossingTs, hasCrossing, inBand }
  let lastTs = null
  const seatFor = (bot) => {
    if (!state[bot]) state[bot] = { crossingTs: null, hasCrossing: false, inBand: false }
    return state[bot]
  }
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const hm = line.match(HB_RE)
    if (hm) { lastTs = Number(hm[1]); continue }
    if (SENTRY_PASS_RE.test(line)) {
      const p = parseSentryPass(line)
      if (!p) continue
      const seat = seatFor(p.bot)
      if (p.o2.kind === 'value') {
        if (p.o2.value <= TRIGGER_O2_MAX) {
          if (!seat.inBand) { seat.crossingTs = lastTs; seat.hasCrossing = true; seat.inBand = true }
        } else {
          seat.inBand = false
        }
      }
      continue
    }
    const dm = line.match(DEATH_RE)
    if (dm) {
      const bot = dm[1]
      const seat = seatFor(bot)
      book.deaths++
      const crossed = seat.hasCrossing
      const window = crossed && seat.crossingTs !== null && lastTs !== null ? Math.max(0, lastTs - seat.crossingTs) : null
      if (!crossed) book.noCrossing++
      else if (window === null) book.untimed++
      else {
        book.crossed++
        book.window.count++
        book.window.sum += window
        if (book.window.min === null || window < book.window.min) book.window.min = window
        if (book.window.max === null || window > book.window.max) book.window.max = window
      }
      book.perDeath.push({ bot, ts: lastTs, crossed, window })
      // the death reset's own law: the state never survives the death
      seat.crossingTs = null
      seat.hasCrossing = false
      seat.inBand = false
      continue
    }
  }
  return book
}

/**
 * The fence law: the sums must agree. The totals must be exactly the
 * perDeath fold's own image; the windows' sum must be the per-death
 * windows' own sum. An inconsistent book prices nothing.
 */
export function o2TriggerConsistent (book) {
  if (!book || typeof book !== 'object' || !Array.isArray(book.perDeath)) return false
  const nonNeg = (v) => Number.isInteger(v) && v >= 0
  if (![book.deaths, book.crossed, book.noCrossing, book.untimed].every(nonNeg)) return false
  if (!nonNeg(book.window.count) || !nonNeg(book.window.sum)) return false
  if (book.window.count > 0 && (book.window.min === null || book.window.max === null)) return false
  if (book.window.count === 0 && (book.window.min !== null || book.window.max !== null || book.window.sum !== 0)) return false
  let deaths = 0, crossed = 0, noCrossing = 0, untimed = 0, sum = 0, count = 0
  let min = null, max = null
  for (const d of book.perDeath) {
    if (!d || typeof d !== 'object' || typeof d.bot !== 'string') return false
    deaths++
    if (!d.crossed) noCrossing++
    else if (d.window === null) untimed++
    else {
      if (!Number.isInteger(d.window) || d.window < 0) return false
      crossed++; count++; sum += d.window
      if (min === null || d.window < min) min = d.window
      if (max === null || d.window > max) max = d.window
    }
  }
  return deaths === book.deaths && crossed === book.crossed && noCrossing === book.noCrossing &&
    untimed === book.untimed && count === book.window.count && sum === book.window.sum &&
    min === book.window.min && max === book.window.max
}

/**
 * The single-seat row (the v0.881.0 idiom): the windows' own spread,
 * the honest classes ride their own counts. An inconsistent book
 * prices nothing; a book with no deaths reads the honest silence.
 */
export function o2TriggerRow (book) {
  if (!o2TriggerConsistent(book)) return null
  if (book.deaths === 0) return null
  const parts = [`deaths ${book.deaths}`]
  if (book.window.count > 0) {
    const avg = Math.round(book.window.sum / book.window.count)
    parts.push(`crossed ${book.window.count}, window ${book.window.min}..${book.window.max}s (avg ${avg}s)`)
  }
  if (book.noCrossing > 0) parts.push(`no-crossing ${book.noCrossing}`)
  if (book.untimed > 0) parts.push(`untimed ${book.untimed}`)
  return `the o2-low trigger's own window (v0.884.0): ${parts.join(', ')} - the span the trigger would have owned from the census's own band edge (<=${TRIGGER_O2_MAX})`
}

// (v0.885.0) THE TRIGGER'S OWN KIND JOIN - the false-positive split the
// fire-0000 fold's own row named (the trigger's own NEXT BYTE): the
// windows priced WHOSE deaths owned a crossing - the kind join prices
// WHAT the trigger would have paid for. A crossing whose death rode a
// non-o2 kind is THE FALSE-POSITIVE PRICE (the trigger would have fired
// the rescue for a death the oxygen never owned - face 145's suffocate
// rode a real band crossing, the cost seat the window book left
// unnamed); a no-crossing death's kind names THE MISSES' OWN FAMILIES
// (the trigger's own kind here = the blind spot's loudest read). The
// trigger's own death word is the server's own kind= vocabulary
// (deathcause.mjs parseDeathMessage: the oxygen death = drown) - never
// re-adjudicated here, the server verdict stays the authority (the
// v0.117.0 doctrine). THE JOIN LAW: the kind ride comes from
// deathkinds.mjs's own parseDeathKind (the one-parser law - the census's
// own RE re-used by export, never re-spelled); the rows that carry no
// server verdict (the inferred-only family) stay UNKINDED - the honest
// null counts in its own class, never judged. The alignment law: the
// kind walk tests the SAME anchored death token in the SAME line order
// the window fold walked - the seats join index for index (both walks
// count exactly the DEATH_RE matches; the junk between rides nothing).
// The fence law: the kind seats must be exactly the perDeath fold's own
// image - every crossed death lands in o2 / falsePositive /
// crossedUnknown, every no-crossing kind rides its own named map cell,
// the unkinded ones count unkinded. An inconsistent book prices nothing
// (the row stays silent).
//
// (v0.887.0) THE FALSE-POSITIVE'S OWN ANATOMY - the cost seat's own
// split (the kind join's own NEXT BYTE the four faces' mass named:
// crossed non-o2 rode 3 of 11 crossings across faces 145/146/147/148
// and the class was not one animal). The attacker's own word -
// parseDeathKind's own attacker field (the one-parser law: the same
// parse's group, never re-spelled) - splits the price:
//   drowned-melee = the attacker IS a Drowned (face 148: F9's 'mob by
//     Drowned' rode a real crossing) - the band's own predator
//     finishing the job; the rescue raced a genuine water emergency
//     and lost the race - the near-miss seat, not a wrong door.
//   wrong-door = everything else (face 145's suffocate, face 147's F8
//     'mob by Zombie' at window 240s) - the rescue would have fired
//     for a death the water never owned - the true false positive.
// Both seats live in the mass; the row names only the live ones (the
// zero-class silence idiom). THE ANATOMY'S OWN FENCE: melee +
// wrong-door must equal the falsePositive seat exactly, and a seat's
// fpClass never leaks onto a death the price did not own. The server
// verdict stays the authority - the attacker's word is READ, never
// re-adjudicated (the v0.117.0 doctrine).
//
// (v0.889.0) THE MELEE SEAT'S OWN WINDOW JOIN - the anatomy's own
// next byte (the face-148 read named it: F9's melee seat rode window
// 20s while the o2 seats rode 40/60s - THE PREDATOR'S RACE IS
// FASTER). The melee seats join their own window (the perDeath fold's
// own seconds - never re-computed, the same reuse law): the rescue
// racing the Drowned's melee must arrive inside the melee seat's own
// span - HALF the drowning race's own clock. The aggregate rides the
// window row's own idiom (count/min/max/sum, the same cells); the
// untimed melee seat (a crossing before the first heartbeat) counts
// in the seat and rides the honest silence on the clock (the
// v0.884.0 blind-skin idiom). THE WRONG-DOOR WINDOWS STAY UNJOINED -
// their pricing question is the wasted rent, not the winnable race;
// the second split waits for the mass (the honest defer).
// THE WINDOW JOIN'S OWN FENCE: meleeWindow must be exactly the melee
// seats' own timed fold - count + the untimed melee seats = the
// melee seat itself, the cells agree with the perDeath image; a lying
// cell prices nothing.
//
// (v0.890.0) THE MISS SEAT'S OWN PREDATOR - the misses' own anatomy
// (the face-148 read named it: F17's 'mob by Drowned' OUTSIDE the band
// = the no-crossing miss - THE PREDATOR WAS PRESENT, THE TRIGGER NEVER
// SAW THE CROSSING). The no-crossing mob seats join the attacker's own
// word (parseDeathKind's own attacker field - the one-parser law: the
// same parse's group, never re-spelled): miss.drowned = the band's own
// predator killed a bot whose o2 never read at-or-below the band edge -
// the trigger's own blind spot named by the predator's own word (the
// band edge's own blindness: the race can be lost BEFORE the band
// opens, or the reads were too sparse to see the descent). The other
// attackers (the Zombie's own family) stay unnamed - the second split
// waits for the mass (the honest defer). The row names only the live
// seats (the zero-class silence idiom). THE PREDATOR'S OWN FENCE:
// miss.drowned must be exactly the no-crossing mob seats' own Drowned
// fold - every such seat carries the marker, no marker ever leaks onto
// a fall/o2/crossed seat, and the omission lies like the leak; a lying
// seat prices nothing. The server verdict stays the authority - the
// attacker's word is READ, never re-adjudicated (the v0.117.0
// doctrine).

// The trigger's own death word - the server's own kind= vocabulary's
// oxygen death (deathcause.mjs's own bucket, never invented here).
export const O2_DEATH_KIND = 'drown'

const emptyKindJoin = () => ({
  o2: 0,
  falsePositive: 0,
  crossedUnknown: 0,
  fp: { melee: 0, wrongDoor: 0, meleeWindow: { count: 0, min: null, max: null, sum: 0 } },
  miss: { drowned: 0 },
  noCrossing: {},
  noCrossingUnknown: 0
})

// The drowned-melee seat's own word - the attacker's own name that
// makes the crossed non-o2 death the band's own predator's kill (the
// server's own verdict names the killer; the anatomy only reads it).
const DROWNED_ATTACKER = 'Drowned'

/**
 * The window book's own kind join: the same fold's deaths, each seat
 * named by the server's own kind word. Returns the enriched book (the
 * window cells byte-stable, the kinds riding their own cells) - never
 * null, never invented.
 */
export function o2TriggerKindBook (lines) {
  const book = o2TriggerBook(lines)
  book.kinds = emptyKindJoin()
  if (!Array.isArray(lines)) return book
  let di = 0
  for (const line of lines) {
    if (typeof line !== 'string') continue
    if (!DEATH_RE.test(line)) continue
    const seat = book.perDeath[di]
    di++
    if (!seat) break // the fence catches the misalignment - never invent
    const parsed = parseDeathKind(line)
    seat.kind = parsed ? parsed.kind : null
    seat.attacker = parsed ? parsed.attacker : null // the parse's own group - the one-parser law
    seat.fpClass = null // the price's own seat - only the falsePositive owns a class (never leaks)
    seat.missClass = null // the miss's own seat - only the predator miss owns a class (never leaks)
    if (!seat.crossed) {
      if (seat.kind === null) book.kinds.noCrossingUnknown++
      else book.kinds.noCrossing[seat.kind] = (book.kinds.noCrossing[seat.kind] || 0) + 1
      if (seat.kind === 'mob' && seat.attacker === DROWNED_ATTACKER) {
        // the miss seat's own predator (the v0.890.0 anatomy): the
        // Drowned's own word on the no-crossing seat - the trigger's
        // own blind spot, the predator's own read
        seat.missClass = 'drowned'
        book.kinds.miss.drowned++
      }
    } else if (seat.kind === null) book.kinds.crossedUnknown++
    else if (seat.kind === O2_DEATH_KIND) book.kinds.o2++
    else {
      book.kinds.falsePositive++
      // the anatomy: the attacker's own word splits the price (the
      // Drowned's own melee = the near-miss; everything else = the
      // true wrong door)
      seat.fpClass = parsed && parsed.attacker === DROWNED_ATTACKER ? 'melee' : 'wrongDoor'
      book.kinds.fp[seat.fpClass]++
      if (seat.fpClass === 'melee' && typeof seat.window === 'number') {
        // the melee seat's own clock (the perDeath fold's own
        // seconds, never re-computed) - the race's own price
        const mw = book.kinds.fp.meleeWindow
        mw.count++
        mw.sum += seat.window
        if (mw.min === null || seat.window < mw.min) mw.min = seat.window
        if (mw.max === null || seat.window > mw.max) mw.max = seat.window
      }
    }
  }
  return book
}

/**
 * The kind join's own fence: the window fence rides whole (the same
 * sums), the kind seats must be exactly the perDeath fold's own image.
 */
export function o2TriggerKindConsistent (book) {
  if (!o2TriggerConsistent(book)) return false
  const k = book && book.kinds
  if (!k || typeof k !== 'object' || Array.isArray(k)) return false
  if (![k.o2, k.falsePositive, k.crossedUnknown, k.noCrossingUnknown]
    .every((v) => Number.isInteger(v) && v >= 0)) return false
  // the anatomy's own cells: the price's own split must be integers
  // and sum to the price itself (the sub-seats' own agreement)
  if (!k.fp || typeof k.fp !== 'object' || Array.isArray(k.fp)) return false
  if (![k.fp.melee, k.fp.wrongDoor].every((v) => Number.isInteger(v) && v >= 0)) return false
  if (k.fp.melee + k.fp.wrongDoor !== k.falsePositive) return false
  // the melee window join's own cells: the melee seats' own timed
  // fold (count 0 rides the empty cell, the blind-skin idiom)
  const mw = k.fp.meleeWindow
  if (!mw || typeof mw !== 'object' || Array.isArray(mw)) return false
  if (!Number.isInteger(mw.count) || mw.count < 0 || !Number.isInteger(mw.sum) || mw.sum < 0) return false
  if (mw.count > 0 && (mw.min === null || mw.max === null)) return false
  if (mw.count === 0 && (mw.min !== null || mw.max !== null || mw.sum !== 0)) return false
  // the miss predator's own cells: the no-crossing mob seats' own
  // Drowned fold (the v0.890.0 anatomy's own shape)
  if (!k.miss || typeof k.miss !== 'object' || Array.isArray(k.miss)) return false
  if (!Number.isInteger(k.miss.drowned) || k.miss.drowned < 0) return false
  if (!k.noCrossing || typeof k.noCrossing !== 'object' || Array.isArray(k.noCrossing)) return false
  let ncSum = 0
  for (const key of Object.keys(k.noCrossing)) {
    const v = k.noCrossing[key]
    if (typeof key !== 'string' || !key.length || !Number.isInteger(v) || v <= 0) return false
    ncSum += v
  }
  if (ncSum + k.noCrossingUnknown !== book.noCrossing) return false
  let o2 = 0, fp = 0, cu = 0, ncu = 0, melee = 0, wrongDoor = 0, missedDrowned = 0
  let mwc = 0, mws = 0, mwm = null, mwM = null
  for (const d of book.perDeath) {
    if (!d || typeof d !== 'object') return false
    if (d.kind !== null && typeof d.kind !== 'string') return false
    if (d.attacker !== null && d.attacker !== undefined && typeof d.attacker !== 'string') return false
    const fc = d.fpClass === undefined ? null : d.fpClass
    if (fc !== null && fc !== 'melee' && fc !== 'wrongDoor') return false
    const mc = d.missClass === undefined ? null : d.missClass
    if (mc !== null && mc !== 'drowned') return false
    const predatorMiss = !d.crossed && d.kind === 'mob' && d.attacker === DROWNED_ATTACKER
    if (mc === 'drowned' && !predatorMiss) return false // the marker never leaks off the predator's own seat
    if (predatorMiss && mc !== 'drowned') return false // the omission lies like the leak
    if (predatorMiss) missedDrowned++
    if (!d.crossed) {
      if (fc !== null) return false // the price's class never leaks off the price
      if (d.kind === null) { ncu++; continue }
      if (!(Object.prototype.hasOwnProperty.call(k.noCrossing, d.kind))) return false
      continue
    }
    if (d.kind === null) {
      if (fc !== null) return false
      cu++
    } else if (d.kind === O2_DEATH_KIND) {
      if (fc !== null) return false
      o2++
    } else {
      if (fc === 'melee') {
        melee++
        if (d.window !== null && d.window !== undefined) {
          if (!Number.isInteger(d.window) || d.window < 0) return false
          mwc++; mws += d.window
          if (mwm === null || d.window < mwm) mwm = d.window
          if (mwM === null || d.window > mwM) mwM = d.window
        }
      } else if (fc === 'wrongDoor') wrongDoor++
      else return false // every falsePositive owns exactly one anatomy seat
      fp++
    }
  }
  return o2 === k.o2 && fp === k.falsePositive && cu === k.crossedUnknown && ncu === k.noCrossingUnknown &&
    melee === k.fp.melee && wrongDoor === k.fp.wrongDoor && missedDrowned === k.miss.drowned &&
    mwc === mw.count && mws === mw.sum && mwm === mw.min && mwM === mw.max
}

/**
 * The kind join's own row: the false-positive split named by its own
 * seats. An inconsistent book prices nothing; a book with no deaths
 * reads the honest silence; a join with no kind cells (all unkinded)
 * names the honest unkinded seat.
 */
export function o2TriggerKindRow (book) {
  if (!o2TriggerKindConsistent(book)) return null
  if (!book || book.deaths === 0) return null
  const parts = []
  if (book.kinds.o2 > 0) parts.push(`crossed ${O2_DEATH_KIND} ${book.kinds.o2} (the trigger's own)`)
  if (book.kinds.falsePositive > 0) {
    // the anatomy's own clause: only the live seats ride (the
    // zero-class silence idiom); the melee seat's own clock joins the
    // race's own price (the v0.889.0 window join)
    const anatomy = []
    if (book.kinds.fp.melee > 0) {
      const mw = book.kinds.fp.meleeWindow
      let seat = `drowned-melee ${book.kinds.fp.melee}`
      if (mw.count > 0) seat += ` (window ${mw.min}..${mw.max}s avg ${Math.round(mw.sum / mw.count)}s)`
      anatomy.push(seat)
    }
    if (book.kinds.fp.wrongDoor > 0) anatomy.push(`wrong-door ${book.kinds.fp.wrongDoor}`)
    parts.push(`crossed non-o2 ${book.kinds.falsePositive} (the false-positive price: ${anatomy.join(' / ')})`)
  }
  if (book.kinds.crossedUnknown > 0) parts.push(`crossed unkinded ${book.kinds.crossedUnknown}`)
  const nc = Object.keys(book.kinds.noCrossing)
  if (nc.length) parts.push(`no-crossing ${nc.map((key) => `${key} ${book.kinds.noCrossing[key]}`).join('/')}`)
  // the miss's own anatomy: only the live predator seat rides (the
  // zero-class silence idiom)
  if (book.kinds.miss.drowned > 0) parts.push(`the miss's own predator: drowned ${book.kinds.miss.drowned}`)
  if (book.kinds.noCrossingUnknown > 0) parts.push(`no-crossing unkinded ${book.kinds.noCrossingUnknown}`)
  if (!parts.length) return null
  return `the o2-low trigger's own kind join (v0.890.0): ${parts.join(', ')} - the kind join prices the trigger's own cost`
}
