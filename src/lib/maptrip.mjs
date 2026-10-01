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

// (v0.445.0) THE MAP TRIP GAP - the KNOWLEDGE side arrives. The v0.415.0
// lens priced the launch economics (what launched, what was refused, which
// resources the skips starve) but never read what the map KNOWS: the
// worldmap tail is the run's own knowledge snapshot -
//
//   `worldmap: 1130 positions, 17 chunks scanned, top: coal_ore=291 oak_log=244 sand=226 copper_ore=189 birch_log=78`
//
// Face 31 (run114) made the gap unignorable: the NAMED STUCK SIGNATURE
// (the v0.440.0 named board's field proof) is SAND - required 157926,
// have 0..12 all face - while the map HOLDS sand=226 (top-3 knowledge) and
// the trip lane named sand or gravel 10 times with 9 unreachable + 7
// shaft-locked and ONE launch (interrupted). The knowledge leg is fat; the
// delivery leg starves. The tiling law (plantop's own): the top-list's
// entries must tile the tail (one space between, no garbage) or the whole
// tail reads null - never a half-read map.
export function parseWorldmapTail (s) {
  if (typeof s !== 'string') return null
  const m = s.match(/^worldmap: (\d+) positions, (\d+) chunks scanned, top: (.+)$/)
  if (!m) return null
  const tail = m[3]
  const top = {}
  let last = 0
  for (const e of tail.matchAll(/([a-z_][a-z_0-9]*)=(\d+)/g)) {
    if (e.index !== last && e.index !== last + 1) return null
    top[e[1]] = Number(e[2])
    last = e.index + e[0].length
  }
  if (last !== tail.length) return null
  return { positions: Number(m[1]), chunks: Number(m[2]), top }
}

/**
 * The gap composer: the launch economics (mapTripCensus's own output), the
 * map's knowledge (parseWorldmapTail's), and the plan's stuck resource name
 * (the plantop census's seat.lastName) - composed into one honest read.
 * Any missing leg reads null (never a fabricated number):
 * - stuck null/missing -> the gap has no subject (the board churned)
 * - map null (a pre-worldmap-tail face) -> the knowledge side unknown
 * The counts ride the census's OWN numbers (no re-parse drift); demanded =
 * the stuck resource's skip-embedded + launch mentions, the demand the
 * lane itself voiced.
 */
export function mapTripGap (mt, map, stuck) {
  if (!mt || !stuck) return null
  const demanded = (mt.skips?.unreachableTargets?.[stuck] || 0) + (mt.byTarget?.[stuck] || 0)
  return {
    stuck,
    mapPositions: map ? (map.top[stuck] ?? 0) : null,
    mapKnown: !!map,
    demanded,
    unreachable: mt.skips?.byWhy?.unreachable || 0,
    shaftLocked: mt.skips.byWhy?.['shaft-locked'] || 0,
    launches: mt.launches || 0,
    stuckLaunches: mt.byTarget?.[stuck] || 0
  }
}

// (v0.447.0) THE TRIP RECEIPT - the delivery leg's YIELD arrives. The
// v0.415.0 lens priced the launch economics, the v0.445.0 gap priced the
// knowledge side - but neither read whether the launches that DID leave
// ever moved the pocket. The periodic pulse line carries the fleet-wide
// resource counter in its tail:
//
//   `t-537s alive=19/19 mined=77 map=358p/10ch banked=0 smelted=0 pocket=63u/20s | sand=0 gravel=0 dirt=0 stone=0`
//
// Face 32 (fleet 36935489850) made the yield question unignorable: SIX
// launches (4 sand + 2 gravel - face 31 had ONE, interrupted) yet the
// plan's worst seat never left sand - the counter shows the fleet's sand
// POCKET moving 0 -> 14u while have stayed 0..93, and the first nonzero
// landed BEFORE the first sand launch (F17's shore digging): the
// incidental leg feeds the pocket too, the trips' yield is the delta in
// their windows, unattributable by construction (the counter is
// fleet-wide). The tiling law inherited from the worldmap tail: the
// counter pairs must TILE the tail or the whole sample reads null.

const RES_SAMPLE_RE = /^t-(\d+)s .*\| (.+)$/

/**
 * Parse one periodic pulse line's resource counter tail. Returns null on
 * every non-match (no `| ` tail, a broken tile, junk, prose) - never a
 * half-read counter.
 */
export function parseResSample (line) {
  if (typeof line !== 'string') return null
  const m = line.match(RES_SAMPLE_RE)
  if (!m) return null
  const tail = m[2]
  const res = {}
  let last = 0
  for (const e of tail.matchAll(/([a-z_][a-z_0-9]*)=(\d+)/g)) {
    if (e.index !== last && e.index !== last + 1) return null
    res[e[1]] = Number(e[2])
    last = e.index + e[0].length
  }
  if (last !== tail.length || Object.keys(res).length === 0) return null
  return { t: Number(m[1]), res }
}

/**
 * The receipt composer: one pass over the face's lines (samples + the
 * trip lane's launches), then the yield read for ONE resource (default
 * sand - the plan's stuck name). Per-res-launch: the pocket's delta
 * across the next `window` samples (2 samples ~ 30s, fleet-wide,
 * unattributed by construction). The incidental verdict:
 * - 'before' - the first nonzero predates the first launch of the
 *   resource (or no launch of it at all): the incidental leg feeds first
 * - 'after' - the first nonzero rides at-or-after the first launch
 * - null - the pocket never moved all face
 * Honest nulls: no samples (a pre-pulse face) or no launches (the gap
 * row's own subject) -> null, never a fabricated yield. A missing
 * resource key in a sample reads 0 (the tail's tile is self-consistent);
 * a launch without a following sample reads delta null (late-face, the
 * yield unknown).
 */
export function tripReceipt (lines, res = 'sand', window = 2) {
  if (!Array.isArray(lines) || typeof res !== 'string' || !res) return null
  const samples = []
  const launches = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (typeof line !== 'string') continue
    const s = parseResSample(line)
    if (s) { samples.push({ i, t: s.t, res: s.res }); continue }
    const p = parseMapTrip(line)
    if (p && p.kind === 'launch') launches.push({ i, bot: p.bot, targets: p.targets })
  }
  if (!samples.length || !launches.length) return null
  const v = s => s.res[res] ?? 0
  let peak = null
  let firstNonzero = null
  for (const s of samples) {
    const val = v(s)
    if (peak === null || val > peak) peak = val
    if (!firstNonzero && val > 0) firstNonzero = s
  }
  const resLaunches = launches.filter(l => l.targets.includes(res))
  const windows = resLaunches.map(l => {
    let before = null
    for (const s of samples) { if (s.i <= l.i) before = s; else break }
    const afterList = samples.filter(s => s.i > l.i).slice(0, window)
    const after = afterList[afterList.length - 1] || null
    return {
      bot: l.bot,
      before: before ? v(before) : null,
      after: after ? v(after) : null,
      delta: (before && after) ? v(after) - v(before) : null
    }
  })
  const firstResLaunch = resLaunches[0] || null
  const firstNonzeroVsLaunch = !firstNonzero
    ? null
    : (!firstResLaunch || firstNonzero.i < firstResLaunch.i) ? 'before' : 'after'
  return {
    res,
    samples: samples.length,
    launches: launches.length,
    resLaunches: resLaunches.length,
    start: v(samples[0]),
    end: v(samples[samples.length - 1]),
    peak,
    firstNonzero: firstNonzero ? { t: firstNonzero.t } : null,
    firstNonzeroVsLaunch,
    windows
  }
}
