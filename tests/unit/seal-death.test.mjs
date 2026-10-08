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
import { parseSealDeathDrop, sealDeathCensus, strandedPiles, relootRecovery, relootRecoveryRow, relootRefusalPrice, relootRefusalPriceRow, SEAL_DEATH_LOSS_RE, SEAL_DEATH_EMPTY_RE, DEATH_END_PHASE_WINDOW_S, DEATH_BURST_WINDOW_S, DEATH_BURST_MIN } from '../../src/lib/sealdeath.mjs'
import { SEAL_PRIORITY } from '../../src/lib/shelter.mjs'

const CLOCK_ZERO = { timed: 0, untimed: 0, clockEnd: null, firstTs: null, lastTs: null, endPhase: 0, endPhaseWindowS: 60, maxBurst: 0, burstWindowS: 30, burstMin: 3, burstDeaths: 0, burstClusters: 0, burstEndPhase: 0, pace: null, spanS: 0, thirds: null } // (v0.733.0) the siege's own thirds ride the zero shape as null (the calm paradox owns the zero-death face)

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

test('seal-death thirds: the 51st face byte-verbatim - the deadline\'s own third (v0.733.0)', () => {
  // face 51 (run 37543519356): 18 deaths, first at ts=441 of clock end 841.
  // The era's own stamps: 441 461 621 681 701 721 721 741 741 761 761 761
  // 801 801 801 821 841 841. Thirds of 841 = 280.33: the opening third
  // took 0, the middle took 2 (441, 461), the late took 16 (89%) - the
  // storm is the deadline's own, the opening is the face's witness.
  const stamps = [441, 461, 621, 681, 701, 721, 721, 741, 741, 761, 761, 761, 801, 801, 801, 821, 841, 841]
  const log = []
  let n = 1
  let seen = 0
  for (const ts of stamps) {
    while (seen < ts) {
      // the hb cadence walks ahead of the deaths so each stamp is the last hb
      seen = Math.min(ts, seen + 20)
      log.push(`b] n=${n} ts=${seen}s rss=300M late=5ms mainLate=0ms`)
      n++
    }
    log.push(`F${(seen % 19) + 1} [F${(seen % 19) + 1}] death drop: pocket read empty at death (0u)`)
  }
  const c = sealDeathCensus(log)
  assert.equal(c.clock.timed, 18)
  assert.equal(c.clock.clockEnd, 841)
  assert.deepEqual(c.clock.thirds, { early: 0, mid: 2, late: 16, thirdS: 841 / 3, unplaced: 0 })
})

test('seal-death thirds: the boundary second belongs to the LATER third', () => {
  // clock end 840 -> thirdS exactly 280: ts=100 early, ts=279 early (the
  // strict cut), ts=280 mid, ts=559 mid, ts=560 late. The zero clock's
  // own law - the boundary second joins the later third.
  const log = [
    'b] n=1 ts=100s rss=250M late=5ms mainLate=0ms',
    'F1 [F1] death drop: pocket read empty at death (0u)',
    'b] n=2 ts=279s rss=250M late=5ms mainLate=0ms',
    'F1 [F1] death drop: pocket read empty at death (0u)',
    'b] n=3 ts=280s rss=250M late=5ms mainLate=0ms',
    'F1 [F1] death drop: pocket read empty at death (0u)',
    'b] n=4 ts=559s rss=250M late=5ms mainLate=0ms',
    'F1 [F1] death drop: pocket read empty at death (0u)',
    'b] n=5 ts=560s rss=250M late=5ms mainLate=0ms',
    'F1 [F1] death drop: pocket read empty at death (0u)',
    'b] n=6 ts=840s rss=250M late=5ms mainLate=0ms'
  ]
  const c = sealDeathCensus(log)
  assert.equal(c.clock.timed, 5)
  assert.deepEqual(c.clock.thirds, { early: 2, mid: 2, late: 1, thirdS: 280, unplaced: 0 })
})

test('seal-death thirds: the untimed death rides unplaced, never a third', () => {
  // a death before the first hb has no stamp - the counts exclude it and
  // the field names it (the clock never invents).
  const log = [
    'F1 [F1] death drop: pocket read empty at death (0u)',
    'b] n=1 ts=300s rss=250M late=5ms mainLate=0ms',
    'F2 [F2] death drop: pocket read empty at death (0u)',
    'b] n=2 ts=900s rss=250M late=5ms mainLate=0ms'
  ]
  const c = sealDeathCensus(log)
  assert.equal(c.clock.timed, 1)
  assert.equal(c.clock.untimed, 1)
  assert.deepEqual(c.clock.thirds, { early: 0, mid: 1, late: 0, thirdS: 300, unplaced: 1 })
})

test('seal-death thirds: the honest silences - no clock end, no deaths', () => {
  // no hb, no clock end - the thirds stay null (the shape never invents a
  // window it did not see); no deaths - the calm paradox owns the face.
  const noClock = sealDeathCensus(['F1 [F1] death drop: pocket read empty at death (0u)'])
  assert.equal(noClock.clock.timed, 0)
  assert.equal(noClock.clock.clockEnd, null)
  assert.equal(noClock.clock.thirds, null)
  const calm = sealDeathCensus(['b] n=1 ts=600s rss=250M late=5ms mainLate=0ms'])
  assert.equal(calm.clock.timed, 0)
  assert.equal(calm.clock.clockEnd, 600)
  assert.equal(calm.clock.thirds, null)
})

test('seal-death thirds: the spread case prices honestly (no dominant seat)', () => {
  // 2/2/2 across thirds of 200 (clock end 600): no third holds 2/3 of 6
  // (the bar is ceil(4) = 4) - the counts stay, the seat stays unnamed.
  const log = []
  const stamps = [50, 150, 250, 350, 450, 550]
  let n = 1
  let seen = 0
  for (const ts of stamps) {
    while (seen < ts) {
      seen = Math.min(ts, seen + 50)
      log.push(`b] n=${n} ts=${seen}s rss=250M late=5ms mainLate=0ms`)
      n++
    }
    log.push('F1 [F1] death drop: pocket read empty at death (0u)')
  }
  log.push('b] n=7 ts=600s rss=250M late=5ms mainLate=0ms') // the face's clock end - the last hb, not the last death
  const c = sealDeathCensus(log)
  assert.equal(c.clock.timed, 6)
  assert.deepEqual(c.clock.thirds, { early: 2, mid: 2, late: 2, thirdS: 200, unplaced: 0 })
})

test('WIRING: the decompose prints the siege thirds row (v0.733.0)', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /the siege's own thirds \(v0\.733\.0\): early \$\{t\.early\} \/ mid \$\{t\.mid\} \/ late \$\{t\.late\}/, 'the face grain prints beside the burst share')
  assert.match(src, /THE DEADLINE'S OWN THIRD/, 'the dominant-late seat names the storm')
})

// (v0.755.0) THE THIRDS' OWN VERDICT - the classification's own unit pins.
// The field's own thirds reads are the honest cells (the mine's published
// numbers, now the lib's one truth): face 51's 0/2/16 (the storm is the
// deadline's own), face 60/61's 0/1/2 (the deadline's third again - the
// 2/3 law's exact boundary), face 62's 0/3/0 (THE MIDDLE'S OWN STORM -
// the thirds' first mid-dominant read).
import { thirdsVerdict } from '../../src/lib/sealdeath.mjs'

test('the thirds\' own verdict (v0.755.0): the field\'s own reads classify byte-compatibly', () => {
  // Face 51 (run 37543519356): 18 deaths, the opening third took 0.
  const f51 = thirdsVerdict({ early: 0, mid: 2, late: 16, thirdS: 280 }, 18)
  assert.equal(f51.cls, 'late')
  assert.equal(f51.dominant, true)
  assert.ok(Math.abs(f51.share - 16 / 18) < 1e-9)
  // Face 61 (37583836654): 3 deaths, the deadline's third again - the
  // exact 2/3 boundary (dom 2 >= ceil(2*3/3) = 2).
  const f61 = thirdsVerdict({ early: 0, mid: 1, late: 2, thirdS: 200 }, 3)
  assert.equal(f61.cls, 'late')
  assert.equal(f61.dominant, true)
  // Face 62 (37586368766): THE MIDDLE'S OWN STORM - the first mid-dominant read.
  const f62 = thirdsVerdict({ early: 0, mid: 3, late: 0, thirdS: 200 }, 3)
  assert.equal(f62.cls, 'mid')
  assert.equal(f62.dominant, true)
  // A unique max below the bar reads 'spread' (5 of 9 < ceil(6)).
  const spread = thirdsVerdict({ early: 5, mid: 2, late: 2 }, 9)
  assert.equal(spread.cls, 'spread')
  assert.equal(spread.dominant, false)
  // The early seat (the class that awaits its face).
  const early = thirdsVerdict({ early: 4, mid: 1, late: 0 }, 6)
  assert.equal(early.cls, 'early')
})

test('the thirds\' own verdict (v0.755.0): the tie branch reads honestly - the storm has no seat', () => {
  // The old inline law silently resolved ties late > mid > early by order;
  // the field never read a tie - the extraction names it 'even'.
  const tie = thirdsVerdict({ early: 0, mid: 2, late: 2 }, 4)
  assert.equal(tie.cls, 'even')
  assert.equal(tie.dom, 2)
  assert.equal(tie.dominant, false, 'a two-way tie can never hold 2/3 of the clock')
  const threeWay = thirdsVerdict({ early: 2, mid: 2, late: 2 }, 6)
  assert.equal(threeWay.cls, 'even')
  // The zero clock reads 'none' (the calm paradox owns the zero-death face).
  const none = thirdsVerdict({ early: 0, mid: 0, late: 0 }, 0)
  assert.equal(none.cls, 'none')
  assert.equal(none.total, 0)
})

test('the thirds\' own verdict (v0.755.0): junk battery - the clock never invents', () => {
  assert.equal(thirdsVerdict(null, 5), null)
  assert.equal(thirdsVerdict('a string', 5), null)
  assert.equal(thirdsVerdict(42, 5), null)
  assert.equal(thirdsVerdict({ early: 'x', mid: 1, late: 2 }, 3), null)
  assert.equal(thirdsVerdict({ early: -1, mid: 1, late: 2 }, 2), null)
  assert.equal(thirdsVerdict({ mid: 1, late: 2 }, 3), null)
  // A non-finite timed falls back to the thirds' own sum.
  const fb = thirdsVerdict({ early: 1, mid: 0, late: 2 }, undefined)
  assert.equal(fb.total, 3)
  assert.equal(fb.cls, 'late')
})

test('WIRING: the decompose rides the lib\'s one truth (v0.755.0)', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), import.meta.url ? 'utf8' : 'utf8')
  assert.match(src, /thirdsVerdict\(t, c\.timed\)/, 'the inline classification is gone - the lib classifies')
  assert.match(src, /THE MIDDLE'S OWN STORM/, 'the mid seat keeps its name')
  assert.match(src, /THE OPENING'S OWN STORM/, 'the early seat keeps its name')
})

// (v0.843.0) THE RELOOT'S OWN PRICE - the walk's own mass read. The join
// prices the recovery from the lane's own words: the arm's death spot
// cell-matches the bot's own pile (parseSealDeathDrop's own estimate), the
// arrival credits it. No invention: the number rides the drop line's own
// '~Nu'; the arrival line carries stack counts only. The verbatim trio is
// face 112's own words (the first arrival face, 37803061727).
const f112Drop = 'F10 [F10] death drop: ~163u lost at [-114,61,367] (cobblestone 64, torch 24, raw_copper 20, andesite 15, coal 13, +12 more)'
const f112Arm = 'F10 reloot: walking to the own death spot [-114,61,367] (34b, budget 14s, window 186s, the unarmed escalation, the pile arm)'
const f112Arrival = 'F10 reloot: arrived in 9s - 1 item stack(s) in reach'

test('relootRecovery prices the face-112 first arrival verbatim (the walk\u0027s own mass read)', () => {
  const r = relootRecovery([f112Drop, f112Arm, f112Arrival])
  assert.equal(r.arms, 1)
  assert.equal(r.armsNamed, 1)
  assert.equal(r.armsUnnamed, 0)
  assert.equal(r.arrivals, 1)
  assert.equal(r.arrivalsNamed, 1)
  assert.equal(r.arrivalsUnnamed, 0)
  assert.equal(r.recovered, 163)
  assert.equal(r.armedEstimate, 163)
  assert.deepEqual(r.walks, [{ bot: 'F10', units: 163, walkS: 9 }])
  // The mutual fence: the join's own lane counts agree with strandedPiles'
  // (the two lenses read the same REs - one truth, two seats).
  const sp = strandedPiles([f112Drop, f112Arm, f112Arrival])
  assert.equal(r.arms, sp.arms)
  assert.equal(r.arrivals, sp.arrivals)
  assert.equal(relootRecoveryRow(r), 'the reloot recovery\'s own price (v0.843.0): 1 arrival(s) walked, the recovered estimate ~163u (1 of 1 named, the armed pile(s)\' own drop estimate)')
})

test('relootRecovery keeps the line-order law (the LATEST own same-cell pile owns the arm)', () => {
  const first = 'F2 [F2] death drop: ~50u lost at [-5,60,-5] (cobblestone 50)'
  const later = 'F2 [F2] death drop: ~70u lost at [-5,60,-5] (dirt 70)'
  const arm = 'F2 reloot: walking to the own death spot [-5,60,-5] (10b, budget 14s, window 186s, the pile arm)'
  const arrival = 'F2 reloot: arrived in 4s - 1 item stack(s) in reach'
  const r = relootRecovery([first, later, arm, arrival])
  assert.equal(r.recovered, 70, 'the later same-cell pile owns the arm (the house clock)')
  // The future pile can never own: a drop AFTER the arm stays out of the join.
  const future = 'F2 [F2] death drop: ~90u lost at [-5,60,-5] (stone 90)'
  const r2 = relootRecovery([first, arm, arrival, future])
  assert.equal(r2.recovered, 50, 'the arm reads only the piles at-or-before its own line')
})

test('relootRecovery is bot-scoped (the arm says the OWN death spot - no neighbor credit)', () => {
  const neighbor = 'F16 [F16] death drop: ~249u lost at [-114,61,367] (cobblestone 249)'
  const arm = 'F10 reloot: walking to the own death spot [-114,61,367] (34b, budget 14s, window 186s, the pile arm)'
  const arrival = 'F10 reloot: arrived in 9s - 1 item stack(s) in reach'
  const r = relootRecovery([neighbor, arm, arrival])
  assert.equal(r.armsNamed, 0, 'F16\'s pile never rides F10\'s arm')
  assert.equal(r.arrivalsNamed, 0)
  assert.equal(r.recovered, 0)
  assert.equal(r.walks[0].units, null)
  assert.equal(relootRecoveryRow(r), 'the reloot recovery\'s own price (v0.843.0): 1 arrival(s) walked, the recovered estimate ~0u (0 of 1 named, the armed pile(s)\' own drop estimate), 1 unnamed (the arm\'s own spot matched no own pile)')
})

test('relootRecovery pairs one arm to one arrival (the pointer\u0027s own consumption)', () => {
  const drop = 'F2 [F2] death drop: ~50u lost at [-5,60,-5] (cobblestone 50)'
  const arm = 'F2 reloot: walking to the own death spot [-5,60,-5] (10b, budget 14s, window 186s, the pile arm)'
  const arrival = 'F2 reloot: arrived in 4s - 1 item stack(s) in reach'
  const second = 'F2 reloot: arrived in 6s - 2 item stack(s) in reach'
  const r = relootRecovery([drop, arm, arrival, second])
  assert.equal(r.arrivals, 2)
  assert.equal(r.arrivalsNamed, 1, 'the first arrival consumed the arm')
  assert.equal(r.arrivalsUnnamed, 1, 'a second arrival without a new arm reads honestly unnamed')
  assert.equal(r.recovered, 50)
})

test('relootRecoveryRow: the honest silence - zero arrivals and junk read null', () => {
  const drop = 'F2 [F2] death drop: ~50u lost at [-5,60,-5] (cobblestone 50)'
  const arm = 'F2 reloot: walking to the own death spot [-5,60,-5] (10b, budget 14s, window 186s, the pile arm)'
  assert.equal(relootRecoveryRow(relootRecovery([drop, arm])), null, 'an arm with no arrival prints nothing (the v0.476.0 never-walked price owns the row)')
  assert.equal(relootRecoveryRow(null), null)
  assert.equal(relootRecoveryRow(undefined), null)
  assert.equal(relootRecoveryRow('a string'), null)
  assert.equal(relootRecoveryRow(42), null)
  assert.equal(relootRecoveryRow({}), null)
  assert.equal(relootRecoveryRow({ arrivals: 0 }), null)
})

test('relootRecovery: junk battery - the join never invents (v0.843.0)', () => {
  // The zero shape on junk inputs (the census's own convention).
  for (const junk of [null, undefined, 42, {}, { lines: true }]) {
    const r = relootRecovery(junk)
    assert.equal(r.arms, 0)
    assert.equal(r.arrivals, 0)
    assert.equal(r.recovered, 0)
    assert.deepEqual(r.walks, [])
  }
  // Non-string rows judge nothing; the empty pocket (no pos) never joins.
  const empty = 'F9 [F9] death drop: pocket read empty at death (0u)'
  const arm = 'F9 reloot: walking to the own death spot [-117,65,412] (5b, budget 14s, window 186s, the pile arm)'
  const arrival = 'F9 reloot: arrived in 3s - 1 item stack(s) in reach'
  const r = relootRecovery([empty, null, 42, arm, arrival])
  assert.equal(r.arms, 1)
  assert.equal(r.armsUnnamed, 1, 'the empty pocket names no pile')
  assert.equal(r.arrivalsUnnamed, 1)
  assert.equal(r.recovered, 0)
  // A drift-format arm (no spot bracket) stays honest: counted, unnamed.
  const drift = 'F3 reloot: walking to the own death spot (the spot line drifted)'
  const r2 = relootRecovery([drift])
  assert.equal(r2.arms, 1)
  assert.equal(r2.armsUnnamed, 1)
})

test('WIRING: the decompose rides the reloot price beside the stranded seat (v0.843.0)', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  // (v0.847.0) THE BAND'S OWN RE-PIN: the v0.847.0 twin joined the band
  // (relootRefusalPrice + relootRefusalPriceRow) - the byte-exact pin moves
  // with the band, the strictness holds (the new band is the old band's
  // strict superset, every v0.843.0 token still rides).
  assert.ok(src.includes("import { sealDeathCensus, strandedPiles, relootRecovery, relootRecoveryRow, relootRefusalPrice, relootRefusalPriceRow, BIG_PILE_U, thirdsVerdict } from '../../src/lib/sealdeath.mjs'"), 'the price joins the sealdeath import band')
  assert.ok(src.includes('relootRecovery, relootRecoveryRow'), 'the v0.843.0 tokens keep their band seats')
  const strandedAt = src.indexOf('stranded piles (v0.476.0)')
  const priceAt = src.indexOf('relootRecoveryRow(rr)')
  assert.ok(strandedAt > 0 && priceAt > strandedAt && priceAt - strandedAt < 900, 'the price row prints beside the stranded seat (the family\'s books adjacent)')
})

// ---- (v0.847.0) THE RELOOT REFUSAL'S OWN PRICE - the refused walk's own mass read ----
// The verbatim corpus is face 120's REAL lines (run 37836342484, fleet19.log
// lines 1082/1159/1345/1633/1653/1791/1881): three unarmed refusals, three
// own piles priced, F16's pile riding between the lines and never priced.

test('relootRefusalPrice reads the face-120 refusal table verbatim (the refused walk\u0027s own mass)', () => {
  const f10drop = 'F10 [F10] death drop: ~74u lost at [-121,43,385] (cobblestone 43, oak_log 9, dirt 7, oak_planks 5, stick 3, +6 more)'
  const f10ref = 'F10 reloot: no walk (unarmed) - the empty pocket bootstraps first, the read re-arms (a delay, not a verdict)'
  const f7drop = 'F7 [F7] death drop: ~59u lost at [-137,50,412] (dirt 26, oak_log 10, cobblestone 6, diorite 3, sand 3, +9 more)'
  const f7ref = 'F7 reloot: no walk (unarmed) - the empty pocket bootstraps first, the read re-arms (a delay, not a verdict)'
  const f16drop = 'F16 [F16] death drop: ~141u lost at [-108,57,366] (cobblestone 64, dirt 26, leaf_litter 22, sand 7, coal 6, +10 more)'
  const f19drop = 'F19 [F19] death drop: ~78u lost at [-73,62,391] (cobblestone 38, diorite 17, oak_log 5, dirt 4, oak_planks 3, +8 more)'
  const f19ref = 'F19 reloot: no walk (unarmed) - the empty pocket bootstraps first, the read re-arms (a delay, not a verdict)'
  const r = relootRefusalPrice([f10drop, f10ref, f7drop, f7ref, f16drop, f19drop, f19ref])
  assert.equal(r.refusals, 3)
  assert.equal(r.refusalsNamed, 3)
  assert.equal(r.refusalsUnnamed, 0)
  assert.equal(r.refusedMass, 74 + 59 + 78, 'F16\u0027s pile (141u) rides between the lines and never prices - the line-order law + the cross-bot fence')
  const row = relootRefusalPriceRow(r)
  assert.equal(row, 'the reloot refusal\u0027s own price (v0.847.0): 3 of 3 refusal(s) priced, the refused mass ~211u (the own-latest-pile join, distinct pile(s) priced once)')
})

test('relootRefusalPrice dedupes the every-pass grace (one pile refused twice is one mass left sitting)', () => {
  const drop = 'F19 [F19] death drop: ~78u lost at [-73,62,391] (cobblestone 38, diorite 17, oak_log 5, dirt 4, oak_planks 3, +8 more)'
  const ref = 'F19 reloot: no walk (unarmed) - the empty pocket bootstraps first, the read re-arms (a delay, not a verdict)'
  const r = relootRefusalPrice([drop, ref, ref, ref])
  assert.equal(r.refusals, 3, 'the events count every pass')
  assert.equal(r.refusalsNamed, 3)
  assert.equal(r.refusedMass, 78, 'the mass prices once - the dedupe law (the face-36359454749 x7 anatomy\u0027s own fence)')
})

test('relootRefusalPrice keeps the line-order law (a refusal before its own drop names nothing)', () => {
  const drop = 'F10 [F10] death drop: ~74u lost at [-121,43,385] (cobblestone 43, oak_log 9, dirt 7, oak_planks 5, stick 3, +6 more)'
  const ref = 'F10 reloot: no walk (unarmed) - the empty pocket bootstraps first, the read re-arms (a delay, not a verdict)'
  const r = relootRefusalPrice([ref, drop])
  assert.equal(r.refusals, 1)
  assert.equal(r.refusalsNamed, 0, 'the pile after the refusal is not the walk the refusal declined')
  assert.equal(r.refusalsUnnamed, 1)
  assert.equal(r.refusedMass, 0)
  const row = relootRefusalPriceRow(r)
  assert.ok(row.includes(', 1 unnamed (the own-latest read named no priced pile)'), 'the unnamed class reads its own note')
})

test('relootRefusalPrice junk battery (the census\u0027s own convention)', () => {
  const zero = relootRefusalPrice(null)
  assert.deepEqual(zero, { refusals: 0, refusalsNamed: 0, refusalsUnnamed: 0, refusedMass: 0 }, 'null in the zero shape out')
  assert.deepEqual(relootRefusalPrice('junk'), { refusals: 0, refusalsNamed: 0, refusalsUnnamed: 0, refusedMass: 0 }, 'a string splits and judges nothing')
  assert.deepEqual(relootRefusalPrice([]), { refusals: 0, refusalsNamed: 0, refusalsUnnamed: 0, refusedMass: 0 }, 'the empty face')
  assert.deepEqual(relootRefusalPrice([null, 42, undefined]), { refusals: 0, refusalsNamed: 0, refusalsUnnamed: 0, refusedMass: 0 }, 'junk rows judge nothing')
  assert.equal(relootRefusalPriceRow(relootRefusalPrice([])), null, 'a face with no refusals stays silent (the whys\u0027 own counts ride above)')
})

test('relootRefusalPriceRow fences (the consistency law - a self-inconsistent shape never renders)', () => {
  const ok = { refusals: 3, refusalsNamed: 2, refusalsUnnamed: 1, refusedMass: 100 }
  assert.ok(relootRefusalPriceRow(ok).startsWith('the reloot refusal\u0027s own price (v0.847.0): 2 of 3 refusal(s) priced'), 'the consistent shape renders')
  assert.equal(relootRefusalPriceRow(null), null, 'null row in null out')
  assert.equal(relootRefusalPriceRow('junk'), null, 'a string is not a shape')
  assert.equal(relootRefusalPriceRow({ refusals: 0, refusalsNamed: 0, refusalsUnnamed: 0, refusedMass: 0 }), null, 'the zero shape stays silent')
  assert.equal(relootRefusalPriceRow({ refusals: 3, refusalsNamed: 4, refusalsUnnamed: -1, refusedMass: 100 }), null, 'named above refusals never renders')
  assert.equal(relootRefusalPriceRow({ refusals: 3, refusalsNamed: 2, refusalsUnnamed: 0, refusedMass: 100 }), null, 'the unnamed gap must equal refusals minus named (the mutual fence)')
  assert.equal(relootRefusalPriceRow({ refusals: 3, refusalsNamed: 2, refusalsUnnamed: 1, refusedMass: NaN }), null, 'a NaN mass invents nothing')
  assert.equal(relootRefusalPriceRow({ refusals: -1, refusalsNamed: 0, refusalsUnnamed: -1, refusedMass: 0 }), null, 'a negative refusals reads junk')
})

test('WIRING: the decompose rides the refusal price beside the recovery seat (v0.847.0)', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('relootRefusalPrice, relootRefusalPriceRow'), 'the refusal price joins the sealdeath import band')
  const priceAt = src.indexOf('relootRecoveryRow(rr)')
  const refusalAt = src.indexOf('relootRefusalPriceRow(rp)')
  assert.ok(priceAt > 0 && refusalAt > priceAt, 'the refusal row prints beside the recovery row (the twins adjacent)')
})
