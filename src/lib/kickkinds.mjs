//
// kickkinds.mjs - THE KICK'S OWN KINDS (v0.730.0)
//
// The frozen census (v0.426.0) sweeps exactly one kick class - the
// duplicate-login churn's own byte (DUP_KICK_RE matches
// 'disconnect.duplicate_login') - and the kick bill (v0.717.0) joins it
// to the relogs. Every OTHER reason the server hands a client is
// nobody's cell: the 49th face (run 37535680746) carried
// 'F10 [F10] KICKED: {..."value":"disconnect.timeout"}}}' - a client
// the server itself dropped for silence - and no row in any decompose
// owned it. The dupKicks census correctly REFUSED it (the churn is not
// the timeout's class), but the refusal is also a blind spot: a face
// could lose ten clients to timeouts and every lens would read silence.
//
// kickKindCensus(lines) reads ALL the fleet log's KICKED lines and
// folds them per KIND (the translate value byte, as the server wrote
// it - 'multiplayer.disconnect.duplicate_login' and
// 'disconnect.timeout' are different strings and the census reports
// them as different kinds): the count, byKind, byBot, and dupN (the
// duplicate_login share - the reconcile cell against the frozen
// census's dupKicks; the two folds must agree, a miss is the blind
// spot's own alarm). A kick line without the translate byte is not a
// kind - the census reads the byte's own word or nothing. A kick-free
// face reads the honest silence (null).
//

const KICK_KIND_RE = /^(F\d+) \[\1\] KICKED: .*"translate":\{"type":"string","value":"([^"]+)"\}\}\}$/

/**
 * kickKindCensus(lines) - the kicked clients' own reason census.
 * @param {string[]|null} [lines] the fleet19.log lines
 * @returns {null|{n: number, byKind: Object<string, number>,
 *   byBot: Object<string, number>, kinds: string[], dupN: number}}
 *   the census (null on a kick-free face)
 */
export function kickKindCensus (lines) {
  if (!Array.isArray(lines)) return null
  const byKind = {}
  const byBot = {}
  let n = 0
  for (const l of lines) {
    const m = KICK_KIND_RE.exec(typeof l === 'string' ? l : '')
    if (!m) continue
    n++
    byKind[m[2]] = (byKind[m[2]] || 0) + 1
    byBot[m[1]] = (byBot[m[1]] || 0) + 1
  }
  if (!n) return null
  let dupN = 0
  for (const [k, v] of Object.entries(byKind)) {
    if (k.includes('duplicate_login')) dupN += v
  }
  return { n, byKind, byBot, kinds: Object.keys(byKind).sort(), dupN, verdict: kickKindVerdict(byKind) } // (v0.762.0) the verdict rides additively - the kick kinds' own front
}

// (v0.762.0) THE KICK KINDS' OWN VERDICT - the census's verdict leg (the
// raw kinds rode since v0.730.0; face 67's own read delivered the first
// monopoly: disconnect.timeout owned 13 of 13 kicks and the row spoke raw,
// no front named). THE KIND LAW (the byKind cells only, zero re-parsing -
// the v0.758.0 seat precedent): the top kind rides under the
// strict-majority law (a tie owns nothing - the storm-has-no-seat
// precedent) with the lever table's own front; the duplicate_login kind
// defers to the v0.729.0 dup clock's own lane (the cadence is priced
// there - the verdict names the front without re-pricing it). Junk never
// invents a verdict: an empty mix reads null; non-finite/negative counts
// are skipped and counted (the count's own junk law - never priced, never
// silently dropped).
export const KICK_KIND_LEVERS = {
  'disconnect.timeout': 'the client\'s own stall is the front',
  'multiplayer.disconnect.duplicate_login': 'the duplicate\'s own clock is the front (the v0.729.0 lane prices the cadence)',
}

export function kickKindVerdict (byKind) {
  const mix = (byKind && typeof byKind === 'object' && !Array.isArray(byKind)) ? byKind : {}
  let total = 0
  let bad = 0
  let topUnits = 0
  let topCls = null
  for (const [k, v] of Object.entries(mix)) {
    if (!Number.isFinite(v) || v < 0) { bad++; continue }
    total += v
    if (v > topUnits) { topUnits = v; topCls = k }
  }
  if (total === 0) return null
  const leverFor = (k) => KICK_KIND_LEVERS[k]
    || (k.includes('duplicate_login') ? 'the duplicate\'s own clock is the front (the v0.729.0 lane prices the cadence)' : 'the kind\'s own detail is the front')
  const topKind = topCls !== null && topUnits > total - topUnits
    ? { cls: topCls, units: topUnits, shareOfKicks: +(topUnits / total).toFixed(3), lever: leverFor(topCls) }
    : null
  return { total, topKind, bad }
}
