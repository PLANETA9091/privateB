// v0.415.0 THE MAP-TRIP LENS - the materials plan's own launch economics.
//
// The plan's deficit order feeds mapTrip (materialplan.mjs), the fleet
// result row prices the progress ('plan progress: 1/31 resources complete')
// and bankcensus reads the banking side - but the TRIP LAUNCH LINES, the
// moment a bot either left for a map target or refused to, stayed unread:
//
//   F8 map trip: gravel
//   F1 map trip skipped: sand,gravel unreachable
//   F7 map trip skipped: cannot leave the shaft
//
// Two emitters, three field shapes (pinned across face 26 / face 27 /
// run68): the launch names its comma-separated target list, the unreachable
// skip embeds the SAME target-list shape before 'unreachable', and the
// shaft skip is the climb-owner gate's own verdict (the bot is underground
// and the walk ladder would strand it). The lens answers the questions the
// plan progress row cannot: WHAT fraction of the plan's walks even LAUNCHED
// (face 26 launched 9 and skipped 19), WHICH resource the skips starve
// (sand and gravel - the plan's top deficits), and WHERE the fleet's feet
// were (the shaft-locked share is the underground economy's tax on the
// plan). Junk-safe, honest zeros, one parser per emitter.

// The launch: bot tag + the target list (at least one [a-z_]+ item).
export const MAP_TRIP_RE = /^(F\d+) map trip: ([a-z_]+(?:,[a-z_]+)*)$/

// The skip: the reason is free text after ': '.
export const MAP_TRIP_SKIP_RE = /^(F\d+) map trip skipped: (.+)$/

const UNREACHABLE_RE = /^([a-z_]+(?:,[a-z_]+)*) unreachable$/
const SHAFT_RE = /^cannot leave the shaft$/

/**
 * Classify a skip reason. The unreachable form embeds its own target list
 * (the SAME shape the launch names) - captured, so the census can price
 * WHICH resource the skips starve. 'other' keeps the line counted.
 */
export function classifyTripSkip (reason) {
  if (typeof reason !== 'string') return { why: 'other' }
  const u = reason.match(UNREACHABLE_RE)
  if (u) return { why: 'unreachable', targets: u[1].split(',') }
  if (SHAFT_RE.test(reason)) return { why: 'shaft-locked' }
  return { why: 'other' }
}

/**
 * Parse one map-trip line (launch or skip). Returns null on every non-match
 * (junk, prose, the other lanes' shapes).
 */
export function parseMapTrip (line) {
  if (typeof line !== 'string') return null
  const t = line.match(MAP_TRIP_RE)
  if (t) return { bot: t[1], kind: 'launch', targets: t[2].split(',') }
  const s = line.match(MAP_TRIP_SKIP_RE)
  if (s) return { bot: s[1], kind: 'skip', ...classifyTripSkip(s[2]) }
  return null
}

const fl = v => (Number.isFinite(v) && v > 0) ? Math.floor(v) : 0

/**
 * The census: every map-trip line into one junk-safe read.
 * - launches: n + byTarget (a multi-target launch counts EVERY target) +
 *   byBot.
 * - skips: n + byWhy (unreachable / shaft-locked / other) + byBot +
 *   unreachableTargets (the starved resources, summed across the embedded
 *   target lists).
 * - launchRate is NOT computed here (n/n arithmetic the decompose can
 *   price); the census keeps the two sides honest and separate.
 */
export function mapTripCensus (lines) {
  const c = {
    launches: 0,
    byTarget: {},
    byBot: {},
    skips: { n: 0, byWhy: {}, byBot: {}, unreachableTargets: {} },
    unparsed: 0
  }
  for (const line of (Array.isArray(lines) ? lines : [])) {
    const p = parseMapTrip(line)
    if (!p) {
      if (typeof line === 'string' && /^F\d+ map trip/.test(line)) c.unparsed++
      continue
    }
    if (p.kind === 'launch') {
      c.launches++
      c.byBot[p.bot] = (c.byBot[p.bot] || 0) + 1
      for (const t of p.targets) c.byTarget[t] = (c.byTarget[t] || 0) + 1
    } else {
      c.skips.n++
      c.skips.byWhy[p.why] = (c.skips.byWhy[p.why] || 0) + 1
      c.skips.byBot[p.bot] = (c.skips.byBot[p.bot] || 0) + 1
      if (p.why === 'unreachable') {
        for (const t of (p.targets || [])) c.skips.unreachableTargets[t] = (c.skips.unreachableTargets[t] || 0) + 1
      }
    }
  }
  c.launches = fl(c.launches)
  c.skips.n = fl(c.skips.n)
  return c
}
