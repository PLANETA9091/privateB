// (v0.403.0) THE SEAL DEATH LEDGER - unit pins (the sealcensus v0.397.0
// shape). The death-drop lines are the seal economy's loss leg: the
// reserve (v0.396.0) keeps at bank time, DEATH bypasses the pocket
// entirely (face 23's F14 arrived 0/8 six times and then dropped ~172u
// with cobble 83 + dirt 26 inside). The verbatims are the fleet's own
// words; the '+N more' tail is the fleet's honest truncation - counted,
// never invented.
//
// (v0.407.0) THE DEATH CLOCK LENS - the WHEN leg: every ledger death
// (drops AND the empty reads) rides the b] heartbeat's ts= clock; the
// census prices the end-phase share and the max burst. The clock stamps,
// it never invents - a death before the first hb stays untimed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseSealDeathDrop, sealDeathCensus, strandedPiles, SEAL_DEATH_LOSS_RE, SEAL_DEATH_EMPTY_RE, DEATH_END_PHASE_WINDOW_S, DEATH_BURST_WINDOW_S, DEATH_BURST_MIN } from '../../src/lib/sealdeath.mjs'
import { SEAL_PRIORITY } from '../../src/lib/shelter.mjs'

const CLOCK_ZERO = { timed: 0, untimed: 0, clockEnd: null, firstTs: null, lastTs: null, endPhase: 0, endPhaseWindowS: 60, maxBurst: 0, burstWindowS: 30, burstMin: 3, burstDeaths: 0, burstClusters: 0, burstEndPhase: 0, pace: null, spanS: 0 } // (v0.721.0) the deadline's own storm joins the zero shape

test('seal-death: the F14 verbatim loss parses - stacks SUMMED per name, seal-class priced', () => {
  const line = 'F14 [F14] death drop: ~172u lost at [-117,60,380] (cobblestone 64, diorite 28, dirt 26, cobblestone 19, andesite 7, +12 more)'
  const p = parseSealDeathDrop(line)
  assert.equal(p.bot, 'F14')
  assert.equal(p.lost, 172)
  assert.equal(p.named, 144)
  assert.equal(p.tail, 12)
  assert.equal(p.empty, false)
  // cobblestone appears TWICE in the parens - separate stacks, one read
  assert.deepEqual(p.items, { cobblestone: 83, diorite: 28, dirt: 26, andesite: 7 })
  // all four named items ride the SEAL_PRIORITY list - the one-list law
  assert.equal(p.sealLost, 144)
})

test('seal-death: non-seal items stay out of sealLost (the F1 verbatim)', () => {
  const line = 'F1 [F1] death drop: ~93u lost at [-131,46,389] (cobblestone 36, torch 20, diorite 10, andesite 9, stick 4, +10 more)'
  const p = parseSealDeathDrop(line)
  assert.equal(p.lost, 93)
  assert.equal(p.named, 79)
  assert.equal(p.tail, 10)
  assert.deepEqual(p.items, { cobblestone: 36, torch: 20, diorite: 10, andesite: 9, stick: 4 })
  assert.equal(p.sealLost, 55)
})

test('seal-death: the F13 verbatim - the seal class is the list, not the eye', () => {
  const line = 'F13 [F13] death drop: ~131u lost at [-125,52,407] (cobblestone 38, raw_copper 36, andesite 15, coal 10, oak_planks 6, +14 more)'
  const p = parseSealDeathDrop(line)
  assert.deepEqual(p.items, { cobblestone: 38, raw_copper: 36, andesite: 15, coal: 10, oak_planks: 6 })
  // raw_copper and coal are NOT seal material; oak_planks IS (the planks ride last)
  assert.equal(p.sealLost, 59)
})

test('seal-death: the empty-pocket form reads its own count', () => {
  const line = 'F14 [F14] death drop: pocket read empty at death (0u)'
  const p = parseSealDeathDrop(line)
  assert.equal(p.bot, 'F14')
  assert.equal(p.empty, true)
  assert.equal(p.lost, 0)
  assert.equal(p.sealLost, 0)
  assert.deepEqual(p.items, {})
})

test('seal-death: the census accumulates per bot across drops + the empty reads', () => {
  const c = sealDeathCensus([
    'F14 [F14] death drop: ~172u lost at [-117,60,380] (cobblestone 64, dirt 26, +12 more)',
    'F14 [F14] death drop: pocket read empty at death (0u)',
    'F1 [F1] death drop: ~93u lost at [-131,46,389] (torch 20, stick 4, +10 more)'
  ])
  assert.equal(c.drops, 2)
  assert.equal(c.emptyReads, 1)
  assert.equal(c.lostTotal, 265)
  assert.equal(c.sealLostTotal, 90)
  assert.deepEqual(c.byBot.F14, { drops: 1, emptyReads: 1, lost: 172, sealLost: 90, items: { cobblestone: 64, dirt: 26 } })
  assert.deepEqual(c.byBot.F1, { drops: 1, emptyReads: 0, lost: 93, sealLost: 0, items: { torch: 20, stick: 4 } })
})

test('seal-death: the junk battery - prose, anatomy strangers, non-strings', () => {
  const junk = [
    'F16 [F16] died - respawning (cause: zombie)',
    'F16 [F16] death: drown context (o2 0.0)',
    'a death is a cost the deficit cannot repay',
    'F1 [F1] death drop:', // truncated (the FATAL-face lesson)
    null,
    42,
    'launching 19 bots for 600s'
  ]
  for (const l of junk) assert.equal(parseSealDeathDrop(l), null)
  const c = sealDeathCensus(junk)
  assert.deepEqual(c, { drops: 0, emptyReads: 0, lostTotal: 0, sealLostTotal: 0, byBot: {}, deathRows: [], endPhaseLost: 0, clock: CLOCK_ZERO }) // (v0.675.0) the tax fields ride the zero shape
})

test('seal-death clock: the deadline storm join - the 45th all-inside regime (v0.721.0)', () => {
  // face 45 (37516287610) byte-verbatim: three deaths in ONE 30s window at
  // ts=781, clock end 821 - the whole burst sits inside the final 60s. The
  // join names THE DEADLINE'S OWN STORM: all riders are end-phase riders.
  const deaths = [
    'F14 [F14] death drop: ~41u lost at [-115,64,424] (cobblestone 20, dirt 12, +4 more)',
    'F2 [F2] death drop: ~19u lost at [-141,65,397] (dirt 11, cobblestone 5, +2 more)',
    'F15 [F15] death drop: ~227u lost at [-119,65,392] (cobblestone 98, dirt 44, +9 more)'
  ]
  const log = ['b] n=1 ts=10s rss=250M late=5ms mainLate=0ms']
  let n = 2
  for (const line of deaths) {
    log.push(`b] n=${n} ts=781s rss=255M late=5ms mainLate=0ms`, line)
    n++
  }
  log.push('b] n=30 ts=821s rss=261M late=4ms mainLate=0ms')
  const c = sealDeathCensus(log)
  assert.equal(c.clock.clockEnd, 821)
  assert.equal(c.clock.maxBurst, 3)
  assert.equal(c.clock.burstDeaths, 3)
  assert.equal(c.clock.burstClusters, 1)
  assert.equal(c.clock.endPhase, 3)
  // the join: all three riders inside the final 60s (cut 761) - the named
  // storm's own number, and the row's all-inside branch fires
  assert.equal(c.clock.burstEndPhase, 3)
  assert.equal(c.clock.burstEndPhase === c.clock.burstDeaths, true)
})

test('seal-death clock: the deadline storm join - the ride-in and the mid-face silences (v0.721.0)', () => {
  // face 43 (37509214512) shape: the burst rides INTO the final window -
  // one rider at 681 stays before the cut (clock end 761, cut 701), the
  // other seven land inside: 7 of 8, the partial form (the storm crossed
  // the cut, it did not start there).
  const rideIn = [
    'F5 [F5] death drop: ~30u lost at [0,64,0] (cobblestone 30)', // 681 - the pre-cut rider
    'F12 [F12] death drop: ~20u lost at [1,64,1] (dirt 20)', // 701
    'F14 [F14] death drop: ~10u lost at [2,64,2] (dirt 10)', // 701
    'F2 [F2] death drop: ~15u lost at [3,64,3] (cobblestone 15)', // 701
    'F9 [F9] death drop: ~25u lost at [4,64,4] (cobblestone 25)', // 701
    'F15 [F15] death drop: ~35u lost at [5,64,5] (dirt 35)', // 721
    'F18 [F18] death drop: ~12u lost at [6,64,6] (dirt 12)', // 721
    'F3 [F3] death drop: ~18u lost at [7,64,7] (cobblestone 18)' // 741
  ]
  const stamps = [681, 701, 701, 701, 701, 721, 721, 741]
  const log43 = ['b] n=1 ts=10s rss=250M late=5ms mainLate=0ms']
  let n = 2
  for (let i = 0; i < rideIn.length; i++) {
    log43.push(`b] n=${n} ts=${stamps[i]}s rss=255M late=5ms mainLate=0ms`, rideIn[i])
    n++
  }
  log43.push('b] n=40 ts=761s rss=261M late=4ms mainLate=0ms')
  const c43 = sealDeathCensus(log43)
  assert.equal(c43.clock.burstDeaths, 8)
  assert.equal(c43.clock.burstClusters, 1)
  assert.equal(c43.clock.endPhase, 7)
  assert.equal(c43.clock.burstEndPhase, 7) // 7 of 8 - the partial keeps the number
  assert.equal(c43.clock.burstEndPhase === c43.clock.burstDeaths, false)
  // face 42 (37504847346) shape: the MID-FACE storm - the whole burst sits
  // before the cut (clock end 981, cut 921, cluster 821..901): 0 of 8, the
  // deadline never touched the regime.
  const midFace = [
    'F6 [F6] death drop: ~22u lost at [0,64,0] (cobblestone 22)', // 821
    'F1 [F1] death drop: ~14u lost at [1,64,1] (dirt 14)', // 841
    'F10 [F10] death drop: ~16u lost at [2,64,2] (dirt 16)', // 841
    'F11 [F11] death drop: ~19u lost at [3,64,3] (cobblestone 19)', // 841
    'F7 [F7] death drop: ~21u lost at [4,64,4] (cobblestone 21)', // 861
    'F8 [F8] death drop: ~17u lost at [5,64,5] (dirt 17)', // 881
    'F4 [F4] death drop: ~13u lost at [6,64,6] (dirt 13)', // 881
    'F16 [F16] death drop: ~24u lost at [7,64,7] (cobblestone 24)' // 901
  ]
  const stamps42 = [821, 841, 841, 841, 861, 881, 881, 901]
  const log42 = ['b] n=1 ts=10s rss=250M late=5ms mainLate=0ms']
  n = 2
  for (let i = 0; i < midFace.length; i++) {
    log42.push(`b] n=${n} ts=${stamps42[i]}s rss=255M late=5ms mainLate=0ms`, midFace[i])
    n++
  }
  log42.push('b] n=50 ts=981s rss=261M late=4ms mainLate=0ms')
  const c42 = sealDeathCensus(log42)
  assert.equal(c42.clock.burstDeaths, 8)
  assert.equal(c42.clock.endPhase, 0)
  assert.equal(c42.clock.burstEndPhase, 0) // 0 of 8 - the mid-face storm's own zero
  // face 44 (37512568836) shape: no bursts - the join keeps the burst
  // share's own silence (0 stays 0, no row fires, no invented storm).
  const log44 = [
    'b] n=1 ts=10s rss=250M late=5ms mainLate=0ms',
    'b] n=2 ts=601s rss=252M late=5ms mainLate=0ms',
    'F14 [F14] death drop: ~15u lost at [0,64,0] (cobblestone 15)',
    'b] n=3 ts=661s rss=255M late=5ms mainLate=0ms',
    'F2 [F2] death drop: ~9u lost at [1,64,1] (dirt 9)',
    'b] n=4 ts=841s rss=261M late=4ms mainLate=0ms',
    'F15 [F15] death drop: ~17u lost at [2,64,2] (cobblestone 17)'
  ]
  const c44 = sealDeathCensus(log44)
  assert.equal(c44.clock.maxBurst, 1)
  assert.equal(c44.clock.burstDeaths, 0)
  assert.equal(c44.clock.burstEndPhase, 0) // the honest silence where the burst share's is
})

test('seal-death: the honest zero on a deathless face + the pinned anatomy', () => {
  const c = sealDeathCensus(['launching 19 bots for 600s', 'F2 [F2] combat: fighting skeleton'])
  assert.deepEqual(c, { drops: 0, emptyReads: 0, lostTotal: 0, sealLostTotal: 0, byBot: {}, deathRows: [], endPhaseLost: 0, clock: CLOCK_ZERO }) // (v0.675.0) the tax fields ride the zero shape
  // the anatomy pins: the RES list lives in the module, the seal class rides
  // shelter.mjs's ONE list (the co-derivation law)
  assert.match('F1 [F1] death drop: ~1u lost at [0,0,0] (dirt 1)', SEAL_DEATH_LOSS_RE)
  assert.match('F1 [F1] death drop: pocket read empty at death (0u)', SEAL_DEATH_EMPTY_RE)
  assert.ok(SEAL_PRIORITY.includes('dirt') && SEAL_PRIORITY.includes('oak_planks'))
  // the clock bounds are the named constants (the v0.400.0 bound law)
  assert.equal(DEATH_END_PHASE_WINDOW_S, 60)
  assert.equal(DEATH_BURST_WINDOW_S, 30)
})

test('seal-death clock: every death rides the last hb ts - drops AND the empty reads', () => {
  const c = sealDeathCensus([
    'launching 19 bots for 600s',
    'b] n=1 ts=21s rss=251M late=5ms mainLate=0ms',
    'F14 [F14] death drop: ~10u lost at [0,64,0] (cobblestone 10)',
    'b] n=2 ts=100s rss=252M late=6ms mainLate=0ms',
    'F1 [F1] death drop: pocket read empty at death (0u)',
    'F2 [F2] combat: fighting skeleton',
    'b] n=3 ts=590s rss=260M late=4ms mainLate=0ms'
  ])
  assert.equal(c.clock.timed, 2)
  assert.equal(c.clock.untimed, 0)
  assert.equal(c.clock.clockEnd, 590)
  assert.equal(c.clock.firstTs, 21)
  assert.equal(c.clock.lastTs, 100)
  assert.equal(c.clock.endPhase, 0) // both deaths ride mid-face (21, 100 << 530)
  assert.equal(c.clock.maxBurst, 1)
})

test('seal-death clock: the face-24 spiral shape - end-phase share + the sliding burst', () => {
  // the 1838 fire's field decode: ALL 10 deaths inside the last ~64s
  // (8 drops + 2 empty-pocket re-deaths); the clock must read it alone
  const deaths = [
    ['F12 [F12] death drop: ~40u lost at [0,64,0] (cobblestone 40)', 530],
    ['F14 [F14] death drop: pocket read empty at death (0u)', 536],
    ['F18 [F18] death drop: ~60u lost at [1,64,1] (dirt 60)', 540],
    ['F3 [F3] death drop: ~20u lost at [2,64,2] (cobblestone 20)', 545],
    ['F5 [F5] death drop: ~15u lost at [3,64,3] (dirt 15)', 550],
    ['F7 [F7] death drop: ~25u lost at [4,64,4] (cobblestone 25)', 560],
    ['F9 [F9] death drop: ~30u lost at [5,64,5] (dirt 30)', 570],
    ['F11 [F11] death drop: ~35u lost at [6,64,6] (cobblestone 35)', 580],
    ['F14 [F14] death drop: pocket read empty at death (0u)', 585],
    ['F18 [F18] death drop: ~45u lost at [7,64,7] (dirt 45)', 590]
  ]
  const log = ['b] n=1 ts=10s rss=250M late=5ms mainLate=0ms']
  let n = 2
  for (const [line, ts] of deaths) {
    log.push(`b] n=${n} ts=${ts}s rss=255M late=5ms mainLate=0ms`, line)
    n++
  }
  log.push('b] n=30 ts=596s rss=261M late=4ms mainLate=0ms')
  const c = sealDeathCensus(log)
  assert.equal(c.drops, 8)
  assert.equal(c.emptyReads, 2)
  assert.equal(c.clock.timed, 10)
  assert.equal(c.clock.clockEnd, 596)
  assert.equal(c.clock.firstTs, 530)
  assert.equal(c.clock.lastTs, 590)
  // the end-phase window prices against the CLOCK's end (596), not the
  // last death: ts >= 536 -> 9 of the 10 land inside the final 60s
  assert.equal(c.clock.endPhase, 9)
  // the densest 30s slide: 530..560 (6 deaths) and 560..590 (6 deaths)
  assert.equal(c.clock.maxBurst, 6)
})

test('seal-death clock: the burst window boundary - 30s rides, 31s splits', () => {
  const c = sealDeathCensus([
    'b] n=1 ts=100s rss=251M late=5ms mainLate=0ms',
    'F1 [F1] death drop: ~1u lost at [0,64,0] (dirt 1)',
    'b] n=2 ts=130s rss=251M late=5ms mainLate=0ms',
    'F2 [F2] death drop: ~1u lost at [1,64,1] (dirt 1)',
    'b] n=3 ts=161s rss=251M late=5ms mainLate=0ms',
    'F3 [F3] death drop: ~1u lost at [2,64,2] (dirt 1)'
  ])
  // 130-100 = 30 -> one burst of 2; 161-130 = 31 -> the pair splits
  assert.equal(c.clock.maxBurst, 2)
})

test('seal-death clock: a death before the first hb stays untimed - the stamp never invents', () => {
  const c = sealDeathCensus([
    'F1 [F1] death drop: ~5u lost at [0,64,0] (cobblestone 5)',
    'b] n=1 ts=50s rss=251M late=5ms mainLate=0ms',
    'F2 [F2] death drop: ~5u lost at [1,64,1] (dirt 5)'
  ])
  assert.equal(c.clock.timed, 1)
  assert.equal(c.clock.untimed, 1)
  assert.equal(c.clock.lastTs, 50)
  // the untimed death cannot enter a window it has no place in
  assert.equal(c.clock.endPhase, 1) // the TIMED one (50 >= 50-60)
  assert.equal(c.clock.maxBurst, 1)
})

test('seal-death clock: no heartbeats at all - the honest zero clock', () => {
  const c = sealDeathCensus([
    'F1 [F1] death drop: ~5u lost at [0,64,0] (cobblestone 5)',
    'F2 [F2] death drop: pocket read empty at death (0u)'
  ])
  assert.equal(c.clock.timed, 0)
  assert.equal(c.clock.untimed, 2)
  assert.equal(c.clock.clockEnd, null)
  assert.equal(c.clock.endPhase, 0)
  assert.equal(c.clock.maxBurst, 0)
})

// ---- (v0.476.0) THE STRANDED PILES - the sweep-reach wire's price ----
// Face 43's death-drop lines verbatim (run 36970605824): 5 piles ~645u,
// the biggest F16's 163u = 25% (the concentration's own read), the reloot
// lane's single voice: 'no walk (unarmed) - the empty pocket bootstraps
// first, the read re-arms (a delay, not a verdict)'.
const f43Piles = [
  'F13 [F13] death drop: ~141u lost at [-142,61,391] (cobblestone 58, diorite 15, cobblestone 13, oak_planks 12, sand 12, +11 more)',
  'F1 [F1] death drop: ~161u lost at [-128,60,395] (cobblestone 64, cobblestone 34, dirt 19, andesite 17, diorite 8, +11 more)',
  'F17 [F17] death drop: ~151u lost at [-127,64,431] (cobblestone 58, torch 22, cobblestone 10, granite 10, coal 9, +15 more)',
  'F5 [F5] death drop: ~29u lost at [-152,65,407] (stick 7, oak_log 6, oak_planks 5, leaf_litter 4, oak_sapling 2, +5 more)',
  'F16 [F16] death drop: ~163u lost at [-132,64,407] (cobblestone 61, gravel 29, dirt 17, diorite 15, leaf_litter 12, +13 more)'
]
const f43RelootRefusal = 'F13 reloot: no walk (unarmed) - the empty pocket bootstraps first, the read re-arms (a delay, not a verdict)'

test('strandedPiles reads the face-43 stranded table (the wire\u0027s price)', () => {
  const r = strandedPiles([...f43Piles, f43RelootRefusal])
  assert.equal(r.drops, 5)
  assert.equal(r.dropped, 645)
  assert.deepEqual(r.biggest, { bot: 'F16', units: 163, pos: '-132,64,407' })
  assert.equal(r.bigPiles, 4)
  assert.equal(r.bigPileUnits, 616)
  assert.ok(Math.abs(r.topShare - 163 / 645) < 1e-9)
  assert.equal(r.arms, 0)
  assert.equal(r.arrivals, 0)
  assert.equal(r.refusals, 1)
  assert.deepEqual(r.refusalWhys, { unarmed: 1 })
  assert.equal(r.emptyReads, 0)
})

test('strandedPiles keeps the first pile on a tie (the line-order law)', () => {
  const a = 'F2 [F2] death drop: ~100u lost at [-1,60,-1] (cobblestone 100)'
  const b = 'F3 [F3] death drop: ~100u lost at [-2,60,-2] (dirt 100)'
  const r = strandedPiles([a, b])
  assert.equal(r.biggest.bot, 'F2')
  assert.equal(r.topShare, 0.5)
})

test('strandedPiles prices the big-pile class at the threshold boundary', () => {
  const small = 'F4 [F4] death drop: ~99u lost at [-3,60,-3] (cobblestone 99)'
  const big = 'F4 [F4] death drop: ~100u lost at [-3,60,-3] (cobblestone 100)'
  assert.equal(strandedPiles([small]).bigPiles, 0)
  const r = strandedPiles([big])
  assert.equal(r.bigPiles, 1)
  assert.equal(r.bigPileUnits, 100)
})

test('strandedPiles passes the empty-pocket reads through (counted, unitless)', () => {
  const r = strandedPiles([
    ...f43Piles,
    'F9 [F9] death drop: pocket read empty at death (0u)',
    f43RelootRefusal
  ])
  assert.equal(r.emptyReads, 1)
  assert.equal(r.drops, 5)
  assert.equal(r.dropped, 645)
})

test('strandedPiles reflects the lane\u0027s walks without inventing a recovered mass', () => {
  const r = strandedPiles([
    ...f43Piles,
    'F16 reloot: walking to the own death spot',
    'F16 reloot: arrived in [-132,64,407]',
    f43RelootRefusal
  ])
  assert.equal(r.arms, 1)
  assert.equal(r.pileArms, 0, 'a legacy arm carries no pile marker (the v0.484.0 counter names only the bypass class)')
  assert.equal(r.arrivals, 1)
  assert.equal(r.dropped, 645)
  assert.equal(r.refusals, 1)
})

test('strandedPiles counts the pile arms (the v0.484.0 bypass\u0027s own voice)', () => {
  const r = strandedPiles([
    ...f43Piles,
    // the bypass walk's line shape: the markers ride the walking line's tail
    'F13 reloot: walking to the own death spot [-142,61,391] (20b, budget 5s, window 280s, the unarmed escalation, the pile arm)',
    'F13 reloot: arrived in [-142,61,391]',
    f43RelootRefusal
  ])
  assert.equal(r.arms, 1)
  assert.equal(r.pileArms, 1, 'the pile arm is a SUBCLASS of the arms (never double-counted)')
  assert.equal(r.arrivals, 1)
  // the plain arm stays plain
  const plain = strandedPiles(['F1 reloot: walking to the own death spot [-128,60,395] (25b, budget 6s, window 290s)'])
  assert.equal(plain.arms, 1)
  assert.equal(plain.pileArms, 0)
})

test('strandedPiles splits the refusal whys on the first word (the census\u0027s own law)', () => {
  const r = strandedPiles([
    f43RelootRefusal,
    'F5 reloot: no walk (budget 3 left) - the walk prices over the lane'
  ])
  assert.equal(r.refusals, 2)
  assert.deepEqual(r.refusalWhys, { unarmed: 1, budget: 1 })
})

test('strandedPiles reads zero honestly and skips junk (the zero law)', () => {
  const zero = { drops: 0, emptyReads: 0, dropped: 0, biggest: null, bigPiles: 0, bigPileUnits: 0, topShare: 0, arms: 0, pileArms: 0, arrivals: 0, refusals: 0, refusalWhys: {} }
  assert.deepEqual(strandedPiles([]), zero)
  assert.deepEqual(strandedPiles(null), zero)
  assert.deepEqual(strandedPiles('not an array'), zero)
  const r = strandedPiles([null, 42, 'garbage line', f43RelootRefusal])
  assert.equal(r.drops, 0)
  assert.equal(r.refusals, 1)
})

test('parseSealDeathDrop captures the pile\u0027s pos (the additive capture, the shape untouched)', () => {
  const p = parseSealDeathDrop(f43Piles[0])
  assert.equal(p.pos, '-142,61,391')
  const e = parseSealDeathDrop('F9 [F9] death drop: pocket read empty at death (0u)')
  assert.equal(e.pos, null)
})

// (v0.675.0) THE END-PHASE TAX - the clock counted the end-phase DEATHS,
// the leak clock priced the late THIRD; neither named the UNITS lost
// inside the final 60s window. deathRows joins the stamp to the drop's
// own price. The synthetic face: 3 priced drops + 1 empty read, the
// last hb at ts=305 (the window opens at 245).
const HB = (n, ts) => `    b] n=${n} ts=${ts}s rss=400M late=100ms mainLate=40ms`
const TAX_FACE = [
  HB(1, 100),
  'F2 [F2] death drop: ~100u lost at [-120,50,400] (cobblestone 60, dirt 40)', // ts=100, mid-face
  HB(2, 200),
  'F3 [F3] death drop: ~40u lost at [-125,52,407] (cobblestone 30, coal 10)', // ts=200, pre-window (245)
  HB(3, 250),
  'F4 [F4] death drop: ~70u lost at [-130,55,410] (raw_copper 55, andesite 15)', // ts=250, IN window
  HB(4, 290),
  'F5 [F5] death drop: pocket read empty at death (0u)', // ts=290, in window, prices 0
  HB(5, 305)
]

test('THE END-PHASE TAX: the final 60s window prices its deaths (the run16 class)', () => {
  const c = sealDeathCensus(TAX_FACE)
  assert.equal(c.drops, 3)
  assert.equal(c.lostTotal, 210)
  assert.equal(c.clock.endPhase, 2) // the ts=250 drop + the ts=290 empty read
  assert.equal(c.endPhaseLost, 70) // the empty read prices 0 - only F4's 70u
  assert.equal(c.deathRows.length, 4)
  assert.deepEqual(c.deathRows.map(r => r.bot), ['F2', 'F3', 'F4', 'F5'])
  assert.deepEqual(c.deathRows.map(r => r.ts), [100, 200, 250, 290])
})

test('the untimed death stays honestly out of the tax (the clock\'s own law)', () => {
  const c = sealDeathCensus([
    'F9 [F9] death drop: ~55u lost at [-110,48,390] (cobblestone 55)', // BEFORE the first hb - untimed
    HB(1, 300)
  ])
  assert.equal(c.lostTotal, 55) // the mass is real
  assert.equal(c.clock.untimed, 1)
  assert.equal(c.clock.endPhase, 0)
  assert.equal(c.endPhaseLost, 0) // the tax never invents a stamp
  assert.equal(c.deathRows[0].ts, null)
})

test('no clock, no tax (junk-safe honesty)', () => {
  const c = sealDeathCensus(['F1 [F1] death drop: ~20u lost at [-100,50,380] (dirt 20)'])
  assert.equal(c.clock.clockEnd, null)
  assert.equal(c.endPhaseLost, 0)
})

test('WIRING: the decompose prints the end-phase tax row', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /end-phase tax: ~\$\{sealDeath\.endPhaseLost\}u/, "the deadline's own tax prints beside the death clock")
})

// ---- (v0.676.0) THE BURST SHARE - the storm regime's own read ----
// The max burst names the densest 30s window; the share names the storm's
// SIZE. The synthetic faces ride the v0.407.0 hb-clock shapes.

test('THE BURST SHARE: riders of a 3+ window count, one cluster names one storm', () => {
  const c = sealDeathCensus([
    'b] n=1 ts=400s rss=251M late=5ms mainLate=0ms',
    'F1 [F1] death drop: ~1u lost at [0,64,0] (dirt 1)',
    'b] n=2 ts=410s rss=251M late=5ms mainLate=0ms',
    'F2 [F2] death drop: ~1u lost at [1,64,1] (dirt 1)',
    'b] n=3 ts=420s rss=251M late=5ms mainLate=0ms',
    'F3 [F3] death drop: ~1u lost at [2,64,2] (dirt 1)',
    'b] n=4 ts=800s rss=251M late=5ms mainLate=0ms',
    'F4 [F4] death drop: ~1u lost at [3,64,3] (dirt 1)'
  ])
  assert.equal(c.clock.timed, 4)
  assert.equal(c.clock.maxBurst, 3)
  assert.equal(c.clock.burstDeaths, 3) // the solitary F4 stays out
  assert.equal(c.clock.burstClusters, 1)
})

test('THE BURST SHARE: a pair is a skirmish, not a storm (the >= 3 threshold)', () => {
  const c = sealDeathCensus([
    'b] n=1 ts=100s rss=251M late=5ms mainLate=0ms',
    'F1 [F1] death drop: ~1u lost at [0,64,0] (dirt 1)',
    'b] n=2 ts=110s rss=251M late=5ms mainLate=0ms',
    'F2 [F2] death drop: ~1u lost at [1,64,1] (dirt 1)'
  ])
  assert.equal(c.clock.maxBurst, 2)
  assert.equal(c.clock.burstDeaths, 0)
  assert.equal(c.clock.burstClusters, 0)
})

test('THE BURST SHARE: two storms, two clusters (the ts-gap splits)', () => {
  const log = []
  const storms = [[400, 410, 420], [700, 710, 720]]
  let n = 1
  let b = 1
  for (const storm of storms) {
    for (const ts of storm) {
      log.push(`b] n=${n} ts=${ts}s rss=251M late=5ms mainLate=0ms`, `F${b} [F${b}] death drop: ~1u lost at [${b},64,0] (dirt 1)`)
      n++
      b = (b % 19) + 1
    }
  }
  const c = sealDeathCensus(log)
  assert.equal(c.clock.timed, 6)
  assert.equal(c.clock.maxBurst, 3)
  assert.equal(c.clock.burstDeaths, 6)
  assert.equal(c.clock.burstClusters, 2)
})

test('THE BURST SHARE: the untimed death has no place in any window', () => {
  const c = sealDeathCensus([
    'F9 [F9] death drop: ~5u lost at [-1,64,0] (dirt 5)', // pre-first-hb, untimed
    'b] n=1 ts=400s rss=251M late=5ms mainLate=0ms',
    'F1 [F1] death drop: ~1u lost at [0,64,0] (dirt 1)',
    'b] n=2 ts=410s rss=251M late=5ms mainLate=0ms',
    'F2 [F2] death drop: ~1u lost at [1,64,1] (dirt 1)',
    'b] n=3 ts=420s rss=251M late=5ms mainLate=0ms',
    'F3 [F3] death drop: ~1u lost at [2,64,2] (dirt 1)'
  ])
  assert.equal(c.clock.timed, 3)
  assert.equal(c.clock.untimed, 1)
  assert.equal(c.clock.burstDeaths, 3) // only the timed trio rides
  assert.equal(c.clock.burstClusters, 1)
})

test('THE BURST SHARE: the threshold is the named constant (the bound law)', () => {
  assert.equal(DEATH_BURST_MIN, 3)
  assert.equal(DEATH_BURST_WINDOW_S, 30)
})

test('WIRING: the decompose prints the burst share row', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /burst share: \$\{c\.burstDeaths\} of \$\{c\.timed\} deaths/, "the storm's own share prints beside the death clock")
})

// ---- (v0.680.0) THE SIEGE PACE - the sustained-pressure read ----
// The 22nd flight (37416742832) rode 29 mob deaths at max burst 3 - a
// SUSTAINED siege the max burst alone underprices. The pace prices the
// deaths' own density: deaths per clock-minute over the timed span.

test('seal-death siege pace: the two-death battery prices 1.52/min over its 79s span', () => {
  const c = sealDeathCensus([
    'b] n=1 ts=21s rss=251M late=5ms mainLate=0ms',
    'F14 [F14] death drop: ~10u lost at [0,64,0] (cobblestone 10)',
    'b] n=2 ts=100s rss=252M late=6ms mainLate=0ms',
    'F1 [F1] death drop: pocket read empty at death (0u)',
    'b] n=3 ts=590s rss=260M late=4ms mainLate=0ms'
  ])
  assert.equal(c.clock.spanS, 79) // 100 - 21, the deaths' own span
  assert.equal(c.clock.pace, 1.52) // 2 deaths / (79/60) min
})

test('seal-death siege pace: the 22nd-flight shape - 29 deaths, low burst, high pace', () => {
  // a sustained siege: deaths every 26s over a 728s span (41..769), max burst 2
  const rows = []
  for (let n = 1; n <= 29; n++) {
    const ts = 41 + (n - 1) * 26 // 41..769, the 22nd's sustained shape
    rows.push(`b] n=${n} ts=${ts}s rss=300M late=5ms mainLate=0ms`)
    rows.push(`F${((n % 19) + 1)} [F${((n % 19) + 1)}] death drop: ~40u lost at [0,64,0] (cobblestone 40)`)
  }
  const c = sealDeathCensus(rows)
  assert.equal(c.clock.timed, 29)
  assert.equal(c.clock.maxBurst, 2) // 26s apart never triples within 30s - two ride each window
  assert.equal(c.clock.spanS, 728)
  assert.equal(c.clock.pace, 2.39) // 29 / (728/60)
})

test('seal-death siege pace: the clock never invents - null on a zero span', () => {
  const c = sealDeathCensus([
    'b] n=1 ts=100s rss=252M late=6ms mainLate=0ms',
    'F1 [F1] death drop: pocket read empty at death (0u)'
  ])
  assert.equal(c.clock.timed, 1)
  assert.equal(c.clock.spanS, 0)
  assert.equal(c.clock.pace, null)
})

test('WIRING: the decompose prints the siege pace row', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /siege pace: \$\{c\.pace\} deaths\/min/, 'the sustained pressure prints beside the death clock')
})
