// (v0.598.0) THE TITHE LEDGER - the refill strand's own instrument (the
// mining-surface precedent: the v0.579/0.590/0.593/0.595/0.596 lens line).
// The charcoal rung (their v0.594.0) primed the pump - fleet 37176598172
// carried THE FIRST TITHE DELIVERY EVER ('attempted 4, delivered 1 (4u),
// dry 3') against 39 empty answers - and the queue named the suspect: the
// rung's cap 4 may be the throttle. Nobody row reads the inflow's own
// lifecycle. This lens parses the two emitter families fuelbank.mjs already
// prints (the tithe inflow row + the commons grain row), censuses them, and
// emits ONE verdict that names the throttle honestly:
//   - the asks never exceeded the cap -> the cap is the throttle (scale it)
//   - the asks outran the cap and still read dry -> the source is the throttle
//   - the inflow never ran dry -> the pump holds
// Zero fleet wiring, zero new log lines. The always-print law: a none face
// is a verdict too.

// (v0.599.0) THE PREFIX LAW, FIELD-CORRECTED: the fleet face 37178311099
// read the grain line BARE ('smelt fuel commons grain: asked 4, ...' - the
// fleet-level report carries no bot tag) and the v0.598.0 gate missed it -
// 'the tithe never spoke' while the grain stood in the log (the honest
// verdict cannot survive a blind prefix). The tag is OPTIONAL on both
// families now: the inflow rides per-bot consoles (F-tagged), the grain
// rides the fleet report (bare). The grammar behind the tag stays strict.
const TITHE_TAG_OPT = '(?:F\\d+ (?:\\[[A-Za-z0-9]+\\] )?)?'
const TITHE_PREFIX = new RegExp('^' + TITHE_TAG_OPT)
export const TITHE_CAP = 4
export const TITHE_DRY_SHARE = 0.5

const INFLOW_RE = '^' + TITHE_TAG_OPT + 'fuel tithe inflow: attempted (\\d+), delivered (\\d+)(?: \\((\\d+)u\\))?, dry (\\d+)'
const GRAIN_RE = '^' + TITHE_TAG_OPT + 'smelt fuel commons grain: asked (\\d+), delivered (\\d+)(?: \\((\\d+)u over (\\d+) opens\\))?, dry (\\d+)'
const INFLOW_MATCH = new RegExp(INFLOW_RE)
const GRAIN_MATCH = new RegExp(GRAIN_RE)

// The torn sweep: a line that STARTS like a member but failed the full
// grammar rides unparsed (the honest sweep - the v0.595.0 law).
export const TITHE_TORN_RE = /fuel tithe inflow: attempted|smelt fuel commons grain: asked/

// The inflow's dry-form lens suffixes name WHERE the opens died:
//   bare      - 'the inflow ran dry: ...'
//   far       - 'the opens fired far N of W - the walk's landed verdict lied'
//   near      - 'the opens fired near N of W - the chest refused the use'
//   split     - 'the opens split far F/near N of W - the reach reads mixed'
const FAR_RE = / - the opens fired far (\d+) of (\d+) - /
const NEAR_RE = / - the opens fired near (\d+) of (\d+) - /
const SPLIT_RE = / - the opens split far (\d+)\/near (\d+) of (\d+) - /

export function parseTitheInflow (line) {
  const m = line.match(INFLOW_MATCH)
  if (!m) return null
  const attempted = Number(m[1])
  const delivered = Number(m[2])
  const units = m[3] != null ? Number(m[3]) : 0
  const dry = Number(m[4])
  let open = null
  let far = 0
  let near = 0
  const f = line.match(FAR_RE)
  const nr = line.match(NEAR_RE)
  const sp = line.match(SPLIT_RE)
  if (sp) { open = 'split'; far = Number(sp[1]); near = Number(sp[2]) } else if (f) { open = 'far'; far = Number(f[1]) } else if (nr) { open = 'near'; near = Number(nr[1]) }
  return { kind: 'inflow', attempted, delivered, units, dry, open, far, near }
}

export function parseFuelGrain (line) {
  const m = line.match(GRAIN_MATCH)
  if (!m) return null
  return {
    kind: 'grain',
    asked: Number(m[1]),
    delivered: Number(m[2]),
    units: m[3] != null ? Number(m[3]) : 0,
    opens: m[4] != null ? Number(m[4]) : 0,
    dry: Number(m[5])
  }
}

export function titheCensus (lines) {
  const c = {
    inflow: { n: 0, attempted: 0, delivered: 0, units: 0, dry: 0, far: 0, near: 0, split: 0, bare: 0, maxAttempted: 0 },
    grain: { n: 0, asked: 0, delivered: 0, units: 0, dry: 0, opens: 0 },
    unparsed: 0
  }
  for (const line of lines) {
    const inf = parseTitheInflow(line)
    if (inf) {
      const f = c.inflow
      f.n++
      f.attempted += inf.attempted
      f.delivered += inf.delivered
      f.units += inf.units
      f.dry += inf.dry
      if (inf.open === 'far') f.far++
      else if (inf.open === 'near') f.near++
      else if (inf.open === 'split') f.split++
      else f.bare++
      if (inf.attempted > f.maxAttempted) f.maxAttempted = inf.attempted
      continue
    }
    const g = parseFuelGrain(line)
    if (g) {
      const s = c.grain
      s.n++
      s.asked += g.asked
      s.delivered += g.delivered
      s.units += g.units
      s.opens += g.opens
      s.dry += g.dry
      continue
    }
    if (TITHE_TORN_RE.test(line)) c.unparsed++
  }
  return c
}

const pct = (part, whole) => whole > 0 ? Math.round(part * 100 / whole) : 0

// ONE verdict line, always printed (the none form is a verdict too). The
// classes are exclusive - at most one owns the half boundary:
//   feed   - dry share under the half and a delivery landed
//   cap    - dry owns the half AND the asks never exceeded TITHE_CAP
//   source - dry owns the half AND the asks outran the cap
//   mixed  - dry present but under the half
export function titheRow (c) {
  const f = c.inflow
  const g = c.grain
  if (f.n === 0 && g.n === 0) return 'tithe ledger: none (the tithe never spoke this run)'
  const head = `tithe ledger: inflow ${f.n} line(s) attempted ${f.attempted} delivered ${f.delivered} (${f.units}u) dry ${f.dry}, grain asked ${g.asked} delivered ${g.delivered} dry ${g.dry}`
  if (f.n === 0) {
    // the grain-only face: the ask side speaks alone
    if (g.asked > 0 && g.dry >= g.asked * TITHE_DRY_SHARE) return `${head} - the grain reads dry ${pct(g.dry, g.asked)}% - the commons' source is the front`
    if (g.delivered > 0 && g.dry === 0) return `${head} - the grain holds the supply line`
    return `${head} - the grain reads mixed`
  }
  const dryShare = pct(f.dry, f.attempted)
  if (f.dry > 0 && dryShare >= 50) {
    if (f.maxAttempted <= TITHE_CAP) return `${head} - the inflow read dry ${dryShare}% and the asks never exceeded the cap ${TITHE_CAP} (max attempted ${f.maxAttempted}) - the cap is the throttle`
    return `${head} - the inflow read dry ${dryShare}% with the asks outrunning the cap (max attempted ${f.maxAttempted}) - the source is the throttle`
  }
  if (f.dry > 0) return `${head} - the inflow reads mixed (dry ${dryShare}%) - no class owns the face`
  return `${head} - the inflow never ran dry - the pump holds`
}
