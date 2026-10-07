// THE ASK'S OWN WHY BOOK (pure, no bot dependencies - unit-testable).
//
// (v0.652.0) The delivery side's write-off got its why book (the v0.612.0
// why-suffix law, the v0.650.0 residual feed) - the ask side stayed BLIND:
// face 37249185472 (the v0.650.0 face, the water storm) read 36 dry
// 'budget spent' terminals and the mining surface could not say WHY - the
// ask ladder's walk-failure lines ('chest walk failed (...)', the decide
// class, the fleet goal ceiling, the water rescue interlock) ride NO census
// anywhere in decompose.mjs. The whys were on the face the whole time; the
// tool never joined them.
//
// This census joins, per bot, in file order (the log is chronological - the
// emitter's own convention, the death-ground's law):
//   - every walk-failure why the ask ladder names, classed;
//   - every 'budget spent (x/y units)' terminal, with its units-dry (y - x);
//   - the terminal's own pricing: the LAST why gathered since the bot's
//     previous terminal prices the dry units ('the last refusal wins - the
//     terminal truth', the v0.650.0 law's own convention). A terminal with
//     no why since the last one prices its dry units to NOTHING - missing
//     evidence is not a class (the junk never invents, the v0.203.0 law).
//
// The census reads the lines the ask block already owns: zero fleet wiring,
// zero new log lines (the v0.379.0/v0.647.0 mining-surface precedent). The
// next face prices the ask storm by name - the decide class, the ceiling
// class, the water interlock - and the next lever prices from DATA.

// (v0.659.0) THE IRON LADDER'S OWN JOIN - the ask census's own scope grows the
// third ask ladder. THE EVIDENCE (fleet 37258915708, the v0.656.0 face, the
// calm-ish one - the same face whose write-off whys row read the climb's first
// wall as the strand's owner, stalled-s0 295u of 565u): the ask side's own
// read found the IRON LADDER BLIND - 'F16 iron commune: chest walk failed
// (iron commune walk @-128,387: timeout after 14967ms)' and its four siblings
// (4 timeout whys + 1 decide why) plus 2 'budget spent (0/3 units)' terminals
// (6u dry) rode NO census - the census's own RE covered the fuel|food commons
// pair only, and the iron commune ladder speaks the SAME vocabulary (the same
// chest-walk-failed line, the same budget-spent terminal, the same decide
// grain). THE FACE'S OWN ANATOMY: 3 of the 4 iron timeouts name ONE chest
// (@-128,387 - F16 14967ms, F1 726ms, F18 1724ms; F19's 890ms names
// @-129,387) - and the SAME chest @-128,387 refused the food ladder too (F16
// food commons walk @-128,387: timeout after 9306ms): ONE CHEST, THREE
// LADDERS REFUSED - a multi-ladder wall priced nowhere until this join. THE
// LAWS: the class regexes are ladder-agnostic (the timeout is the timeout,
// the decide is the decide - the iron whys ride the SAME classes); the sides
// slice grows 'iron' so the conservation law holds over the WHOLE ask mass
// (sum(dryBySide decide skins) == dryByWhy.decide - every ask why now names
// its side); the fuel/food rows keep their order and counts byte-stable, the
// iron segment prints itself only when the iron mass is non-zero (the
// additive law, the v0.656.0 Object.entries precedent).

/** The ask's dry terminal: 'F9 fuel commons: budget spent (0/4 units)'. */
export const ASK_TERMINAL_RE = /^F\d+ (?:(?:fuel|food) commons|iron commune): budget spent \((\d+)\/(\d+) units\)$/

/** The ask ladder's walk-failure line: the first goto, the post-nudge retry. */
export const ASK_WHY_RE = /^F\d+ (?:(?:fuel|food) commons|iron commune): chest walk failed(?: after the nudge)? \((.+)\)$/

// (v0.656.0) THE GOVERNOR'S OWN CLASS - the unnamed bucket's grain priced by
// name. THE EVIDENCE (fleet 37254403895, the v0.653.0 face, the mob storm):
// the ask why census read unnamed x7 - and the raw grain named the anatomy
// itself: 'walk governor: bot churned 4 goals without progress - food commons
// walk @... refused' x6 (ALL food-side: F18 x3 + F8 x3 - the food ladder's
// walks churn-refused, the food side's OWN mass sitting OUTSIDE the decide
// skins the side row prices) plus 'The goal was changed before it could be
// completed!' x1 - the same grain the calm face (37251959440) read unnamed
// x1: twice-seen grain is a class, not noise (the census's own law: the
// unnamed bucket keeps the grain lossless UNTIL the class is priced).
// THE FAMILY LAW: the walk governor is a throttle, but NOT the ceiling
// family's sibling - the ceiling is the fleet-wide goal budget ('30 goals
// fleet-wide in 5s'), the goal brake its per-burst share ('6 goals in 5s'),
// the governor the per-bot CHURN detection ('bot churned 4 goals without
// progress') - a progress-aware refusal, not a budget-aware one, so its own
// class (the v0.652.0 family law prices siblings together only when the
// mechanism is the same). goalChanged: the ask ladder's own churn witness -
// the goal superseded before completion, the scheduler's reassignment made
// visible. Both ride ADDITIVELY: the existing classes keep their order and
// their counts (the rows byte-stable), the unnamed bucket shrinks by the
// named mass only.

/**
 * The why classes, in match order (the first matching class owns the why -
 * the throttle's prose can name a timeout inside itself, the throttle IS
 * the front; the water interlock's parens can name a walk, the water IS the
 * front). The ceiling class owns BOTH jobqueue throttle skins (the v0.652.0
 * field read: 'fleet goal ceiling' x2 AND 'goal brake' x3 rode one face -
 * siblings of the same goal-budget throttle, the codebase's own vocabulary
 * names the family the goal brake - dropwalk.mjs's 'the goal brake's share').
 * (v0.656.0) the governor rides its OWN class (the per-bot churn refusal is
 * a different mechanism from the fleet budget throttle) and the goal-changed
 * grain its own (twice-seen). The unnamed bucket keeps the remaining grain
 * lossless without inventing a class (the v0.583.0 'unnamed' law).
 */
export const ASK_WHY_CLASSES = [
  { key: 'ceiling', re: /fleet goal ceiling|goal brake:/ },
  { key: 'water', re: /water rescue in progress/ },
  { key: 'governor', re: /walk governor:/ },
  { key: 'decide', re: /Took to long to decide path to goal|No path to the goal/ },
  { key: 'timeout', re: /timeout after \d+ms/ },
  { key: 'goalChanged', re: /goal was changed/ }
]

// (v0.653.0) THE DECIDE'S OWN SKINS - the decide class is TWO anatomies with
// opposite cures: 'No path to the goal!' is GEOMETRY (the stance cannot reach
// the chest - a retry from the same spot deterministically fails; the cure
// family is a different chest or an honest early terminal) while 'Took to
// long to decide path to goal!' is BUDGET (the pathfinder's computation slice
// expired - a re-decide under lighter tick pressure can succeed). The v0.651.0
// face (fleet 37251959440, the calm one) read the split no-path x14 vs
// decide-budget x12 on 26 decide whys - and the lanes split by SIDE: the fuel
// asks failed ALL after-the-nudge (17/17, the post-nudge direct walk), the
// food asks ALL on the first walk (9/9, no nudge yet). The skins ride the
// census ADDITIVELY: the decide class stays the owner (the existing rows stay
// byte-stable), the new fields price WHICH skin owns the dry - the next lever
// prices from DATA (the price-before-wire law). The unnamed skin is the drift
// guard: if the emitter's prose ever renames itself partially (a why that
// names the decide family but neither skin), the grain stays lossless (the
// v0.583.0 unnamed law).
export const DECIDE_SKIN_CLASSES = [
  { key: 'noPath', re: /No path to the goal/ },
  { key: 'decideBudget', re: /Took to long to decide/ }
]

const ZERO_SKINS = () => ({ noPath: 0, decideBudget: 0, unnamed: 0 })

/** Which decide skin owns this why string (non-decide / junk -> 'unnamed'). */
export function decideSkin (why) {
  if (typeof why !== 'string' || why.length === 0) return 'unnamed'
  for (const s of DECIDE_SKIN_CLASSES) {
    if (s.re.test(why)) return s.key
  }
  return 'unnamed'
}

// (v0.655.0) THE DECIDE'S OWN SIDES - the skin split rides TWO ask ladders
// (fuel commons and food commons) and the sides' anatomy is NOT the same:
// the v0.651.0 face (fleet 37251959440) read the fuel asks failing ALL
// after-the-nudge (17/17 - the post-nudge direct walk decides-fails INSIDE
// the fuel ladder's three-leg rescue: the nudge, the last-mile raw hop, the
// re-segment) while the food asks failed ALL on the FIRST walk (9/9 - the
// food ladder owns NO rescue at all, the exclude-and-move-on is its whole
// law). The next lever is the food ladder's own rescue seat - and it prices
// from the per-side split: WHICH side owns WHICH skin and HOW MUCH dry, per
// face (a food-side decide-budget mass prices a re-decide rescue; a food-side
// no-path mass prices the exclude as already-honest). The census grows the
// side fields ADDITIVELY (the existing rows stay byte-stable): sides +
// dryBySide, each {fuel: ZERO_SKINS, food: ZERO_SKINS}. The side fields are
// a pure SLICE of the existing decide pricing - the why's own side names the
// row ('the last refusal wins' keeps its side, the dry rides the same row as
// the why that priced it - the conservation holds: sum(dryBySide decide
// skins) == dryByWhy.decide when every why names its side). A line the verb
// cannot name prices nothing (the junk never invents, the v0.203.0 law).
// (v0.659.0) the iron commune is the THIRD ask side - the same ladder family,
// the same vocabulary, its own wall (the conservation law's own scope: every
// ask why names its side)
export const ASK_SIDES = ['fuel', 'food', 'iron']

const ZERO_SIDES = () => ({ fuel: ZERO_SKINS(), food: ZERO_SKINS(), iron: ZERO_SKINS() })

/** Which ask side owns this line (junk / non-ask -> null - nothing prices). */
export function askSide (raw) {
  if (typeof raw !== 'string') return null
  const m = /^F\d+ (fuel commons|food commons|iron commune):/.exec(raw)
  if (!m) return null
  return m[1] === 'iron commune' ? 'iron' : m[1].replace(' commons', '')
}

// (v0.658.0) THE GOVERNOR'S OWN RUNS - the churn governor's refusal anatomy:
// how many governor whys land CONSECUTIVELY for the same bot. THE EVIDENCE
// (two faces): fleet 37254403895 (the v0.653.0 face, the mob storm) read the
// governor x6 as TWO TRIPLETS (F18 x3 then F8 x3, back-to-back in the log);
// fleet 37256535767 (the v0.655.0 face, the mob storm's twin) read x7 as
// F1 x3 + F7 x3 + F15 x1 (the first fuel-side governor, post-nudge). The
// shape is the EXCLUSION SPIRAL: the governor holds the bot refused ('bot
// churned 4 goals without progress'), the ladder answers exclude+next-chest,
// the next chest is a NEW goal - and the governor refuses it too (each
// refusal names a DIFFERENT chest: @-152,392 / @-150,392 / @-154,408 - the
// bot churns while the governor holds). A run of 1 is one refusal; a run of
// 3+ is the spiral signature - the lever (a spiral break) prices from the
// run-length distribution (the price-before-wire law). THE LAWS: a run
// breaks when a NON-governor why rides the same bot (the refusal chain
// changed its mind), when a terminal closes the bot's ask (the ladder's
// outcome happened), and at EOF (the unclosed run still counts - the rescue
// ledger's own convention). The runs are pure COUNTS - the dry rows stay
// untouched (the conservation law: sum(dryByWhy) never moves).
export const GOVERNOR_RUN_BUCKETS = ['len1', 'len2', 'len3', 'len4plus']

const ZERO_RUNS = () => ({ len1: 0, len2: 0, len3: 0, len4plus: 0 })

/** Which run-length bucket owns a closed run of n governor whys (junk -> null). */
export function governorRunBucket (n) {
  if (!Number.isInteger(n) || n < 1) return null
  if (n === 1) return 'len1'
  if (n === 2) return 'len2'
  if (n === 3) return 'len3'
  return 'len4plus'
}

const ZERO_CLASSES = () => ({ ceiling: 0, water: 0, governor: 0, decide: 0, timeout: 0, goalChanged: 0, unnamed: 0 })

/** Which class owns this why string (junk / unknown -> 'unnamed'). */
export function askWhyClass (why) {
  if (typeof why !== 'string' || why.length === 0) return 'unnamed'
  for (const c of ASK_WHY_CLASSES) {
    if (c.re.test(why)) return c.key
  }
  return 'unnamed'
}

/**
 * The ask ladder's why census over a fleet log (array of lines or one big
 * string - junk-safe: non-strings judge nothing).
 *
 * @param {string|string[]|null} lines
 * @returns {{terminals: number, unitsDry: number, whys: {ceiling: number, water: number, governor: number, decide: number, timeout: number, goalChanged: number, unnamed: number}, dryByWhy: {ceiling: number, water: number, governor: number, decide: number, timeout: number, goalChanged: number, unnamed: number}, decideSkins: {noPath: number, decideBudget: number, unnamed: number}, dryBySkin: {noPath: number, decideBudget: number, unnamed: number}, sides: {fuel: {noPath: number, decideBudget: number, unnamed: number}, food: {noPath: number, decideBudget: number, unnamed: number}, iron: {noPath: number, decideBudget: number, unnamed: number}}, dryBySide: {fuel: {noPath: number, decideBudget: number, unnamed: number}, food: {noPath: number, decideBudget: number, unnamed: number}, iron: {noPath: number, decideBudget: number, unnamed: number}}}
 */
export function askWhyCensus (lines) {
  const list = Array.isArray(lines) ? lines : (typeof lines === 'string' ? lines.split('\n') : null)
  const out = { terminals: 0, unitsDry: 0, whys: ZERO_CLASSES(), dryByWhy: ZERO_CLASSES(), decideSkins: ZERO_SKINS(), dryBySkin: ZERO_SKINS(), sides: ZERO_SIDES(), dryBySide: ZERO_SIDES(), governorRuns: ZERO_RUNS(), whysByBot: {} }
  if (!list) return out
  // per-bot pending whys since the bot's last terminal (the bot tag is the
  // join key - the cross-bot law: F5's whys never price F9's terminal)
  const pending = new Map()
  // (v0.658.0) per-bot OPEN governor run (the consecutive-refusal detector)
  const govRun = new Map()
  const closeRun = (bot) => {
    const n = govRun.get(bot) || 0
    if (n > 0) {
      out.governorRuns[governorRunBucket(n)] += 1
      govRun.set(bot, 0)
    }
  }
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    const whyM = ASK_WHY_RE.exec(raw)
    if (whyM) {
      const bot = raw.slice(0, raw.indexOf(' '))
      const klass = askWhyClass(whyM[1])
      out.whys[klass] += 1
      // (v0.772.0) the bot-level cell rides beside the class tally - the
      // ask seats' own source (zero re-parsing, the bill's own precedent)
      if (!out.whysByBot[bot]) out.whysByBot[bot] = ZERO_CLASSES()
      out.whysByBot[bot][klass] += 1
      // (v0.658.0) the governor's run anatomy: a governor why EXTENDS the
      // bot's open run, any other why CLOSES it (the refusal chain broke)
      if (klass === 'governor') govRun.set(bot, (govRun.get(bot) || 0) + 1)
      else closeRun(bot)
      // (v0.653.0) the decide class wears its skin - the anatomy rides the
      // same why line, the owner class never changes (the additive law)
      const skin = klass === 'decide' ? decideSkin(whyM[1]) : null
      if (skin !== null) out.decideSkins[skin] += 1
      // (v0.655.0) the why's own side names the side row - the pure slice
      const side = askSide(raw)
      if (skin !== null && side !== null) out.sides[side][skin] += 1
      const arr = pending.get(bot)
      if (arr) arr.push({ klass, skin, side })
      else pending.set(bot, [{ klass, skin, side }])
      continue
    }
    const termM = ASK_TERMINAL_RE.exec(raw)
    if (termM) {
      const bot = raw.slice(0, raw.indexOf(' '))
      const took = Number(termM[1])
      const want = Number(termM[2])
      const dry = Number.isFinite(took) && Number.isFinite(want) && want > took ? want - took : 0
      out.terminals += 1
      out.unitsDry += dry
      const arr = pending.get(bot)
      const last = Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : null
      if (last !== null) {
        out.dryByWhy[last.klass] += dry
        // (v0.653.0) the dry prices the skin when the last why was a decide -
        // the geometry seat and the budget seat own their units by name
        if (last.klass === 'decide' && last.skin !== null) out.dryBySkin[last.skin] += dry
        // (v0.655.0) the dry rides the why's own side - the same slice, the
        // conservation holds (the why that priced it names the row)
        if (last.klass === 'decide' && last.skin !== null && last.side !== null) out.dryBySide[last.side][last.skin] += dry
      }
      closeRun(bot)
      pending.set(bot, [])
    }
  }
  // (v0.658.0) EOF closes every open run (the rescue ledger's own convention:
  // the unclosed refusal chain still counts - it happened)
  for (const bot of [...govRun.keys()]) closeRun(bot)
  return out
}

// (v0.769.0) THE DRY ASK'S OWN VERDICT - the ask ladder's why book grows its
// own seat. The v0.652.0 census priced the whys, the v0.653.0 skins priced
// the decide's anatomy, the v0.655.0 sides priced the ladders - and no row
// ever named WHICH class owns the dry ask (face 69's own read rode the mix
// raw: 28 dry terminals, decide x22 beside ceiling x7 / timeout x4 / water
// x1, with no verdict row). THE VERDICT LAW (the hop bleed's v0.760.0
// precedent, the kick kinds' v0.763.0 seat - zero re-parsing, the cells are
// the census's own): the owner under the strict-majority law on the WHY
// ROWS (the re-ask is the repeat's own meter - the units' magnitudes ride
// the ~Nu inflation margin); the priced dry joins as the second cell (the
// dry the owner's own class priced - the 'last refusal wins' law's own
// join); a tie owns nothing (the storm-has-no-seat precedent); junk never
// invents a verdict (a missing or empty census, a non-finite or negative
// count, a zero why book -> the honest silence).
export const ASK_WHY_LEVERS = {
  decide: 'the decider\'s own clock is the front (the crowded sky\'s own law - the v0.727.0 lane prices the starve)',
  ceiling: 'the fleet\'s own goal budget is the front',
  governor: 'the churn governor\'s own spiral is the front (the v0.658.0 lane prices the run)',
  timeout: 'the walk budget is the front',
  water: 'the water interlock is the front',
  goalChanged: 'the scheduler\'s own churn is the front',
  unnamed: 'the class\'s own detail is the front',
}

export function dryAskVerdict (census) {
  if (!census || typeof census !== 'object') return null
  const whys = census.whys && typeof census.whys === 'object' && !Array.isArray(census.whys) ? census.whys : {}
  const dry = census.dryByWhy && typeof census.dryByWhy === 'object' && !Array.isArray(census.dryByWhy) ? census.dryByWhy : {}
  let ofWhys = 0
  let topUnits = 0
  let topCls = null
  for (const [cls, n] of Object.entries(whys)) {
    if (!Number.isFinite(n) || n < 0) continue
    ofWhys += n
    if (n > topUnits) { topUnits = n; topCls = cls }
  }
  if (topCls === null || topUnits <= ofWhys - topUnits) return null
  let dryPriced = 0
  for (const n of Object.values(dry)) {
    if (!Number.isFinite(n) || n < 0) continue
    dryPriced += n
  }
  const dryUnits = Number.isFinite(dry[topCls]) && dry[topCls] >= 0 ? dry[topCls] : 0
  return {
    cls: topCls,
    owns: topUnits,
    ofWhys,
    shareOfWhys: +(topUnits / ofWhys).toFixed(3),
    dryUnits,
    dryPriced,
    shareOfDry: dryPriced > 0 ? +(dryUnits / dryPriced).toFixed(3) : 0,
    lever: ASK_WHY_LEVERS[topCls] || 'the class\'s own detail is the front',
  }
}

// (v0.769.0) the verdict's own row - the seat names WHICH class owns the
// dry ask; the lever table's own front prices the cure (one table, the
// fallback honest - the v0.760.0 levers' law). Junk never prints a seat.
export function dryAskVerdictRow (v) {
  if (!v || typeof v !== 'object') return null
  const { cls, owns, ofWhys, shareOfWhys, dryUnits, dryPriced, shareOfDry, lever } = v
  if (typeof cls !== 'string' || !cls ||
      !Number.isFinite(owns) || owns <= 0 || !Number.isFinite(ofWhys) || ofWhys <= 0 || owns > ofWhys ||
      !Number.isFinite(shareOfWhys) ||
      !Number.isFinite(dryUnits) || dryUnits < 0 || !Number.isFinite(dryPriced) || dryPriced < 0 ||
      dryUnits > dryPriced || !Number.isFinite(shareOfDry)) return null
  return `the dry ask's own verdict (v0.769.0): ${cls} owns ${owns} of ${ofWhys} why row(s) (${(shareOfWhys * 100).toFixed(1)}%), the priced dry ${dryUnits} of ${dryPriced} unit(s) (${(shareOfDry * 100).toFixed(1)}%): ${lever}`
}

// (v0.772.0) THE ASK'S OWN SEATS - the owner class's own bot-level book.
// The v0.769.0 verdict priced WHICH class owns the dry ask, never WHICH
// walker owns the class's rows - face 71's own read rode the answer raw
// (ceiling x19 with 'F3 x8 F12 x3 F18 x3 F4 x3 F8 x2' never seated). THE
// SEAT LAW (the hop bleed's v0.767.0 bill + the v0.770.0 riders mirror,
// zero re-parsing - the rows are the census's own whysByBot cell, the
// owner class is the verdict's own): the bill seats the walker under the
// strict-majority law on the OWNER CLASS'S OWN ROWS (a tie owns nothing -
// the storm-has-no-seat precedent); the riders are the bill's silence's
// own companion - a MEASURE of the top two walkers' concentration, never
// a verdict-owner (the deterministic order: count desc, then the name's
// own). Junk never invents a seat: a missing or junk census, a verdict
// that never seats (the tie gate), a missing or junk whysByBot, or fewer
// than two walkers reads the honest silence (null).
function askBotRows (census, klass) {
  const byBot = census.whysByBot && typeof census.whysByBot === 'object' && !Array.isArray(census.whysByBot) ? census.whysByBot : {}
  const rows = []
  for (const [bot, classes] of Object.entries(byBot)) {
    if (typeof bot !== 'string' || !bot || !classes || typeof classes !== 'object' || Array.isArray(classes)) continue
    const n = classes[klass]
    if (!Number.isFinite(n) || n <= 0) continue
    rows.push([bot, n])
  }
  return rows
}

export function dryAskBotBill (census) {
  if (!census || typeof census !== 'object') return null
  const verdict = dryAskVerdict(census)
  if (!verdict) return null // no owner class -> no seat (the verdict's own gate)
  const rows = askBotRows(census, verdict.cls)
  let topUnits = 0
  let topBot = null
  for (const [bot, n] of rows) {
    if (n > topUnits) { topUnits = n; topBot = bot }
  }
  if (topBot === null || topUnits <= verdict.owns - topUnits) return null
  return { klass: verdict.cls, bot: topBot, owns: topUnits, ofRows: verdict.owns, shareOfRows: +(topUnits / verdict.owns).toFixed(3) }
}

export function dryAskRiders (census) {
  if (!census || typeof census !== 'object') return null
  const verdict = dryAskVerdict(census)
  if (!verdict) return null
  const ranked = askBotRows(census, verdict.cls).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { klass: verdict.cls, leader, leaderOwns, runner, runnerOwns, ofRows: verdict.owns, pairOwns, shareOfRows: +(pairOwns / verdict.owns).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.772.0) the seats' own rows - THE REPEAT ASKER'S OWN SEAT names WHO
// owns the ask ladder's front (the verdict's own lever prices the cure);
// THE SPIKE'S OWN SEAT measures the shape the solo law refused to seat.
// Junk never prints a seat (the honest silence's own row law).
export function dryAskBotBillRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const { klass, bot, owns, ofRows, shareOfRows } = bill
  if (typeof klass !== 'string' || !klass || typeof bot !== 'string' || !bot ||
      !Number.isFinite(owns) || owns <= 0 || !Number.isFinite(ofRows) || ofRows <= 0 || owns > ofRows ||
      !Number.isFinite(shareOfRows)) return null
  return `the dry ask's own bot bill (v0.772.0): ${bot} owns ${owns} of ${ofRows} ${klass} row(s) (${(shareOfRows * 100).toFixed(1)}%) - THE REPEAT ASKER'S OWN SEAT: one walker's own lane owns the ask ladder's front - the verdict's own lever prices the walker's asks`
}

export function dryAskRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { klass, leader, leaderOwns, runner, runnerOwns, ofRows, pairOwns, shareOfRows } = r
  if (typeof klass !== 'string' || !klass || typeof leader !== 'string' || !leader ||
      typeof runner !== 'string' || !runner || !Number.isFinite(leaderOwns) || leaderOwns <= 0 ||
      !Number.isFinite(runnerOwns) || runnerOwns <= 0 || !Number.isFinite(ofRows) || ofRows <= 0 ||
      !Number.isFinite(pairOwns) || pairOwns > ofRows || !Number.isFinite(shareOfRows)) return null
  return `the dry ask's own riders (v0.772.0): no solo asker owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofRows} ${klass} row(s) (${(shareOfRows * 100).toFixed(1)}%) - THE SPIKE'S OWN SEAT: the bill's tie law held, the concentration is still real - the pair prices the asks the solo law refused to name`
}
