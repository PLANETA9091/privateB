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
    skips: { n: 0, byWhy: {}, byBot: {}, byBotWhy: {}, unreachableTargets: {} },
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
      // (v0.450.0) the per-bot-per-why split - the shaft-lock roster's own
      // substrate (the aggregate byWhy cannot name WHO the shaft gate held)
      if (!c.skips.byBotWhy[p.bot]) c.skips.byBotWhy[p.bot] = {}
      c.skips.byBotWhy[p.bot][p.why] = (c.skips.byBotWhy[p.bot][p.why] || 0) + 1
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

// (v0.450.0) THE TRIP VOICE ROSTER - the refusal side learns to name WHO.
// The v0.415.0 census priced the launch economics as aggregates (launches,
// skips byWhy, skips byBot) but the stable anomaly across faces 31 -> 33 -
// the shaft-locked 8, the SAME count every face - never said whether it is
// the SAME BOTS every face (a structural underground economy: the trip lane
// should assign to surface bots only - the plan-side cure prices WELL) or a
// rotating cast (transient depth, no cure's fuel). The composer rides the
// census's OWN numbers (the byBotWhy field above; no re-parse drift) and
// sorts F-numeric, not lexical (F2 before F10). Voice classes per bot:
// 'launcher' (left, never refused), 'mixed' (both), 'skip-only' (refused,
// never left). The shaftRoster lists every bot the shaft gate held at
// least once - THE CURE'S FUEL. Honest nulls: no census / no trip voices
// -> null (nothing composed from nothing).
const botNum = s => { const m = /^F(\d+)$/.exec(s); return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER }

export function tripVoice (mt) {
  if (!mt || typeof mt !== 'object') return null
  const names = new Set([
    ...Object.keys(mt.byBot || {}),
    ...Object.keys(mt.skips?.byBot || {})
  ])
  if (!names.size) return null
  const roster = [...names].sort((a, b) => botNum(a) - botNum(b) || (a < b ? -1 : 1)).map(b => {
    const launches = mt.byBot[b] || 0
    const byWhy = mt.skips?.byBotWhy?.[b] || {}
    const skips = Object.values(byWhy).reduce((acc, x) => acc + x, 0)
    const voice = launches > 0 && skips === 0 ? 'launcher'
      : launches > 0 && skips > 0 ? 'mixed'
        : 'skip-only'
    return { bot: b, launches, skips, byWhy, voice }
  })
  const shaftRoster = roster.filter(r => (r.byWhy['shaft-locked'] || 0) > 0).map(r => r.bot)
  return { roster, shaftRoster }
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

// (v0.449.0) THE WINDOW CALIBRATION - the field's own number. The v0.447.0
// default (2 samples ~ 30s) priced the trip's yield against a walk that
// costs 45s EACH WAY: face 33's real yield lag was ~127s (launch between
// t-367s/t-352s, the pocket moved by t-240s). Six samples (~90-120s at the
// ~15s pulse cadence) covers the round trip plus the dig; the span/holeMax
// fields keep the widened read honest about what it cannot time.
export const RECEIPT_WINDOW_SAMPLES = 6

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
 * across the next `window` samples (fleet-wide, unattributed by
 * construction).
 * (v0.449.0) THE WINDOW CALIBRATION - the field widened the lens. Face 33
 * (fleet 36938459619) priced the v0.447.0 default against reality: F15's
 * sand launch (line between the t-367s and t-352s samples) read +0u on the
 * 2-sample ~30s window, but the pocket moved 0 -> 7 by t-240s - a yield
 * lag of ~127s, the trip's own round-trip (the walk budget is 45s each
 * way) plus the dig. The default window is now RECEIPT_WINDOW_SAMPLES = 6
 * (~90-120s at the ~15s pulse cadence); window=2 stays available for the
 * legacy read. Each window carries its own honesty hardware:
 *   span    - the window's t-span in run seconds (before.t - after.t; the
 *             delta accrued across AT LEAST this long - the fleet-wide
 *             counter cannot time the yield inside the span);
 *   holeMax - the largest gap between consecutive samples inside the
 *             window; the pulse cadence is ~15s, so a holeMax above the
 *             trip walk budget (45s) means a SAMPLING HOLE sat inside -
 *             the delta is then a BOUND (the pocket moved within the
 *             span), never a timing read (the face-33 hole was 82s).
 * The incidental verdict:
 * - 'before' - the first nonzero predates the first launch of the
 *   resource (or no launch of it at all): the incidental leg feeds first
 * - 'after' - the first nonzero rides at-or-after the first launch
 * - null - the pocket never moved all face
 * Honest nulls: no samples (a pre-pulse face) or no launches (the gap
 * row's own subject) -> null, never a fabricated yield. A missing
 * resource key in a sample reads 0 (the tail's tile is self-consistent);
 * a launch without a following sample reads delta/span/holeMax null
 * (late-face, the yield unknown).
 */
export function tripReceipt (lines, res = 'sand', window = RECEIPT_WINDOW_SAMPLES) {
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
    // (v0.449.0) the window's own honesty hardware: the span (how long the
    // delta took to accrue) and the hole (the largest sampling gap inside).
    let span = null
    let holeMax = null
    if (before && after) {
      span = before.t - after.t
      if (span < 0) span = 0 // the t-0 EOF cluster repeats; time never runs backwards
      const seq = [before, ...afterList]
      for (let k = 1; k < seq.length; k++) {
        const gap = seq[k - 1].t - seq[k].t
        if (gap > (holeMax ?? -1)) holeMax = gap
      }
    }
    return {
      bot: l.bot,
      before: before ? v(before) : null,
      after: after ? v(after) : null,
      delta: (before && after) ? v(after) - v(before) : null,
      span,
      holeMax
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

// (v0.451.0) THE POCKET DRAIN LEDGER - where the pocket's peak goes. The
// receipt priced the trips' YIELD (the pocket's rise) but the faces kept
// ending with the pocket DRAINED back to a fraction of its peak (face 34:
// peak then end 404u, the parallel lane's read guessed 'banked' from the
// bank row - a guess, never the counter). The pulse line's pre-pipe header
// carries the fleet-wide cumulative counters the whole time:
//
//   t-536s alive=19/19 mined=81 map=275p/7ch banked=0 smelted=0 pocket=64u/18s | sand=0 gravel=0 dirt=0 stone=0
//
// banked = what reached the bank chest, smelted = what left the furnace.
// The drain ledger composes the pocket's peak-to-end drop against the
// counters' own rise over the SAME samples: the bank absorbed the drop
// (the delivery chain closed end-to-end), the furnace did, both together,
// or - honestly - UNACCOUNTED (placement/loss/crafting: the counters
// cannot explain the drain, the next read's subject). The whole header is
// one anchored shape (the one-parser-per-emitter law, the tiling law's
// full-line form): any deviation reads null, never a half-read counter.
// The EOF t-0 cluster's repeats are harmless here: start = the first
// sample, end = the last line in the file, the counters are cumulative.
export const PULSE_HEADER_RE = /^t-(\d+)s alive=(\d+)\/(\d+) mined=(\d+) map=(\d+)p\/(\d+)ch banked=(\d+) smelted=(\d+) pocket=(\d+)u\/(\d+)s \| /

export function parsePulseHeader (line) {
  if (typeof line !== 'string') return null
  const m = line.match(PULSE_HEADER_RE)
  if (!m) return null
  return {
    t: Number(m[1]),
    alive: Number(m[2]),
    fleet: Number(m[3]),
    mined: Number(m[4]),
    mapPositions: Number(m[5]),
    mapChunks: Number(m[6]),
    banked: Number(m[7]),
    smelted: Number(m[8]),
    pocket: Number(m[9])
  }
}

/**
 * The drain composer: one pass over the face's pulse lines (the pre-pipe
 * header only - the resource tail is the receipt's own read). Honest
 * nulls: no pulse samples at all -> null. The verdict:
 * - 'no-drop'      the pocket never fell below its peak (drop 0)
 * - 'banked'       banked's rise >= the drop (the bank absorbed it)
 * - 'smelted'      smelted's rise >= the drop
 * - 'banked+smelted' both together >= the drop, neither alone
 * - 'unaccounted'  the counters cannot explain the drop - honest silence,
 *                   never a fabricated explanation
 */
export function pocketDrain (lines) {
  if (!Array.isArray(lines)) return null
  const samples = []
  for (const line of lines) {
    const h = parsePulseHeader(line)
    if (h) samples.push(h)
  }
  if (!samples.length) return null
  let peak = -1
  let peakT = null
  for (const s of samples) {
    if (s.pocket > peak) { peak = s.pocket; peakT = s.t }
  }
  const first = samples[0]
  const last = samples[samples.length - 1]
  const drop = Math.max(0, peak - last.pocket)
  const bankedDelta = last.banked - first.banked
  const smeltedDelta = last.smelted - first.smelted
  let verdict
  if (drop <= 0) verdict = 'no-drop'
  else if (bankedDelta >= drop) verdict = 'banked'
  else if (smeltedDelta >= drop) verdict = 'smelted'
  else if (bankedDelta + smeltedDelta >= drop) verdict = 'banked+smelted'
  else verdict = 'unaccounted'
  return {
    samples: samples.length,
    start: first.pocket,
    end: last.pocket,
    peak,
    peakT,
    drop,
    bankedDelta,
    smeltedDelta,
    verdict
  }
}

// (v0.452.0) THE DRAIN ATTRIBUTION - the UNACCOUNTED residual learns its
// legs. The drain ledger's honest 'unaccounted' named the open question
// (placement/loss/crafting); the fleet log prices TWO of the three legs
// itself, in its own emitters' own words:
//
//   F10 [F10] death drop: ~114u lost at [-121,54,371] (cobblestone 64, ...)
//   F7  [F7] climb bridge: placed dirt at [-135,64,419] (support) - ...
//
// The loss leg (death drops, the log's own ~Nu pricing) and the placement
// leg (climb-bridge support/pit blocks, 1u each - the only loot-block
// placement emitter the faces carry; a dry placement never 'lands', the
// torch is crafted fuel and never matches) are summed AFTER THE PEAK
// SAMPLE's line only: line order is time order, and an event BEFORE the
// peak cannot drain a peak->end drop - the peak already reflects it
// (mining refilled past it). That makes the attribution a bound read:
// events between the true peak and the peak sample's own line are unseen
// (the pulse cadence's gap, the same honesty as holeMax). Crafting stays
// unpriced BY DESIGN: the craft lines carry no quantities, and crafting
// even INFLATES the unit count (one log -> four planks) - honest silence,
// never a fabricated number. The five ledger verdicts stay byte-identical;
// the attribution rides as its own field + its own decompose row.
export const DEATH_DROP_RE = /^(\S+) \[\1\] death drop: ~(\d+)u lost at /
export const CLIMB_PLACED_RE = /^(\S+) \[\1\] climb bridge: placed ([a-z_]+) at \[/
// (v0.454.0) the death line's own kind token - the server kind stays the
// authority (the established inference law): '... died - respawning (cause:
// server: was slain by Drowned [kind=mob by Drowned] | inferred: ...)'.
// The bracketed [kind=X] is the token; the prose before it never holds '['.
export const DIED_KIND_RE = /^(\S+) \[\1\] died - respawning \(cause: [^[]*\[kind=([^\]]+)\]/

// (v0.454.0) THE POCKET KILLERS - the loss leg learns WHICH death kinds
// spent it. The attribution's first two field reads agree: when the drain
// goes unaccounted, the loss leg dominates (face 29 retrospective 1115u,
// face 36 fresh 1089u in 13 drops) - and the death line carries its own
// server kind ('[kind=mob by Drowned]', '[kind=drown]'). Every death drop
// pairs with the bot's most recent died line BEFORE it (the emitter prints
// them adjacent, died -> drop; the last-before-drop rule survives any
// interleaving); a drop with no prior died line for that bot reads kind
// 'unknown' and stays counted in pairMisses - honest, never guessed. The
// kind split rides INSIDE the same post-peak window (the killers of the
// peak->end drop, not the face-wide deaths - deathkinds owns that read).
// The cure pointer is mechanical: the top token names the lane (mob* ->
// the combat/night lane, drown -> the water lane). The v0.452.0 fields
// stay byte-identical; lossKinds/pairMisses ride as new fields.
export function pocketDrainAttr (lines) {
  if (!Array.isArray(lines)) return null
  let peakIdx = null
  let peak = -1
  for (let i = 0; i < lines.length; i++) {
    const h = parsePulseHeader(lines[i])
    if (h && h.pocket > peak) { peak = h.pocket; peakIdx = i }
  }
  if (peakIdx === null) return null
  const pd = pocketDrain(lines)
  const residual = pd.drop - pd.bankedDelta - pd.smeltedDelta
  let lossDelta = 0
  let lossCount = 0
  let placedDelta = 0
  let pairMisses = 0
  const placedBlocks = {}
  const lossKinds = {}
  const lastDiedKind = new Map()
  if (residual > 0) {
    for (let i = peakIdx + 1; i < lines.length; i++) {
      const km = lines[i].match(DIED_KIND_RE)
      if (km) { lastDiedKind.set(km[1], km[2]); continue }
      const dm = lines[i].match(DEATH_DROP_RE)
      if (dm) {
        const u = Number(dm[2])
        lossDelta += u
        lossCount++
        const bot = dm[1]
        const kind = lastDiedKind.get(bot)
        if (kind === undefined) pairMisses++
        const key = kind === undefined ? 'unknown' : kind
        if (!lossKinds[key]) lossKinds[key] = { u: 0, n: 0 }
        lossKinds[key].u += u
        lossKinds[key].n++
        continue
      }
      const pm = lines[i].match(CLIMB_PLACED_RE)
      if (pm) { placedDelta++; placedBlocks[pm[2]] = (placedBlocks[pm[2]] || 0) + 1 }
    }
  }
  const legs = lossDelta + placedDelta
  const attr = residual <= 0
    ? 'none'      // the counters already cover the drop - nothing to attribute
    : legs >= residual
      ? 'covered' // the legs' totals cover the residual (a bound read)
      : legs > 0
        ? 'partial' // the legs price part of it - the rest stays open
        : 'open'    // no priced legs after the peak - crafting/the unseen holds it
  return {
    residual,
    lossDelta,
    lossCount,
    lossKinds,
    pairMisses,
    placedDelta,
    placedBlocks,
    legs,
    attr
  }
}

// (v0.453.0) THE MATERIAL BALANCE - the counter identity's own cross-check.
// The drain ledger (v0.451.0) reads the pocket's drop against the bank's
// and furnace's rise; the attribution (v0.452.0) prices the residual's
// legs from the EVENT lines. Both never asked the simplest question the
// pulse header's own counters can answer: does MINED close the loop?
//
//   mined = d(pocket) + d(banked) + d(smelted) + LEAKS
//
// over the face's first and last samples (the counters are cumulative;
// the pocket is the live pile - its delta is a legitimate sink, the
// not-yet-banked share). LEAKS = placement + loss + crafting's unit
// inflation, unsplit BY DESIGN (the event lens owns the split; this is
// the whole-face arithmetic bound, the independent cross-check):
// - 'no-flow'   dMined = 0 - the identity has no subject (banking from a
//               start pile reads honestly here, not as a balance)
// - 'balanced'  |leaks| <= 5% of mined - the counters close the loop
// - 'leaky'     leaks > 5% of mined - a NAMED whole-face share sits
//               outside the three sinks (the event lens splits it)
// - 'inflated'  leaks < -5% - crafting's unit inflation (one log -> four
//               planks) outran the losses; the unit-count trap the
//               attribution lens named, seen from the counters' side
// Rides parsePulseHeader (v0.451.0) - no re-parse drift, no new emitter
// assumptions. Honest nulls: no samples, non-array input.
export function materialBalance (lines) {
  if (!Array.isArray(lines)) return null
  const samples = []
  for (const line of lines) {
    const h = parsePulseHeader(line)
    if (h) samples.push(h)
  }
  if (!samples.length) return null
  const first = samples[0]
  const last = samples[samples.length - 1]
  const dMined = last.mined - first.mined
  const dPocket = last.pocket - first.pocket
  const dBanked = last.banked - first.banked
  const dSmelted = last.smelted - first.smelted
  const leaks = dMined - (dPocket + dBanked + dSmelted)
  const share = dMined > 0 ? leaks / dMined : 0
  const verdict = dMined === 0 ? 'no-flow'
    : share > 0.05 ? 'leaky'
      : share < -0.05 ? 'inflated'
        : 'balanced'
  return { samples: samples.length, mined: dMined, pocket: dPocket, banked: dBanked, smelted: dSmelted, leaks, share, verdict }
}

// (v0.455.0) THE LENSES CONVERGE - the balance's leak meets the event
// lens's whole-face legs. The material balance (v0.453.0) prices the
// whole-face leak from the COUNTERS alone (leaky 64.6% on face 36, 26.3%
// on face 34); the drain attribution (v0.452.0) prices the loss/placement
// legs from the EVENT lines - but only post-peak (a peak->end drop read).
// The two lenses never met. Here they do, whole-face to whole-face: the
// same identity's leaks side read against the SAME emitters' lines summed
// over ALL lines (not post-peak) - the death drop's own ~Nu pricing and
// the climb bridge's 1u placements, the same DEATH_DROP_RE/CLIMB_PLACED_RE
// shapes (one parser per emitter - no new parse assumptions, no drift).
//
//   verdicts:
//   - 'no-leak'    the balance's leaks <= 0 - the counters saw no leak
//                  (the inflated side lands here honestly: crafting's
//                  inflation made the sinks outrun mined, nothing to
//                  reconcile)
//   - 'covered'    legs >= leaks - the emitters' own words account for the
//                  whole-face leak; slack = legs - leaks is the ~Nu
//                  pricing's inflation margin, a NUMBER (face 36: legs
//                  1189u vs leak 862u, slack +327u; faces 34/35 covered
//                  too, slacks +545/+548 - the pricing runs a wide
//                  margin, itself the next read's subject)
//   - 'shortfall'  legs < leaks - a NAMED share the log's emitters never
//                  priced (unemitted losses, the lens's own blind spot),
//                  quantified by -slack (no live anchor yet - all three
//                  faces covered; the branch stays hand-built, the
//                  honesty that would name an unpriced loss class)
//
// Boundary notes kept honest: the balance's window is first<->last pulse
// sample while the leg sum is all lines - an event before the first sample
// or after the last lands in the legs side only (part of the bound's
// slack, the same holeMax honesty). Crafting stays unpriced (no
// quantities; its inflation shows up in the leaks side's sign). Honest
// nulls: non-array input, no pulse samples.
export function balanceReconcile (lines) {
  if (!Array.isArray(lines)) return null
  const mb = materialBalance(lines)
  if (!mb) return null
  let lossDelta = 0
  let lossCount = 0
  let placedDelta = 0
  for (const line of lines) {
    const dm = line.match(DEATH_DROP_RE)
    if (dm) { lossDelta += Number(dm[2]); lossCount++; continue }
    const pm = line.match(CLIMB_PLACED_RE)
    if (pm) placedDelta++
  }
  const legs = lossDelta + placedDelta
  const verdict = mb.leaks <= 0
    ? 'no-leak'
    : legs >= mb.leaks ? 'covered' : 'shortfall'
  return {
    leaks: mb.leaks,
    share: mb.share,
    balanceVerdict: mb.verdict,
    lossDelta,
    lossCount,
    placedDelta,
    legs,
    slack: legs - mb.leaks,
    verdict
  }
}
