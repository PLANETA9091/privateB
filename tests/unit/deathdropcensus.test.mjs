// (v0.647.0) THE DEATH-DROP CENSUS - the silent-arm join's own pins.
// The face rows are byte-exact from fleet 37239853197 (the v0.644.0 tree,
// the wet storm): 7 deaths, ~714u at stake, the lane's voice on exactly
// ONE (F18, the 0u empty read) - the six mass piles rode silence.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deathDropCensus, isDeathDropLine, DEATH_DROP_RE, DEATH_DROP_LOSS_RE, DEATH_DROP_EMPTY_RE, RELOOT_ROW_RE } from '../../src/lib/deathdropcensus.mjs'
import { isDeathLine } from '../../src/lib/deathsweep.mjs'

const FACE = [
  'F6 [F6] hop: chest at [-146,72,405] d=10 zero: chest unreachable (Took to long to decide path to goal!)',
  'F18 [F18] died - respawning (cause: server: fell from a high place [kind=fall] | inferred: fall/env (0s before death at [-115,43,410]) [the inference corroborates the server verdict])',
  'F18 [F18] death drop: pocket read empty at death (0u)',
  'F18 reloot: no walk (unarmed) - the empty pocket bootstraps first, the read re-arms (a delay, not a verdict)',
  'a death is a cost the deficit cannot repay - prose with the keyword, never a death',
  'F18 reloot: walking to the own death spot [-115,43,410] (31b, budget 14s, window 120s)',
  'F18 reloot: retry failed (Took to long to decide path to goal!) - the drops stay lost (no surface: land)',
  'F18 reloot: write-off (goal [-115,43,410], stake unknown, age 181s/300s window, walk \'Took to long to decide path to goal!\' -> retry \'Took to long to decide path to goal!\' -> surface \'land\')',
  'F14 [F14] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-141,60,394]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
  'F14 [F14] death drop: ~113u lost at [-141,60,394] (sand 29, cobblestone 22, diorite 20, dirt 12, leaf_litter 5, +13 more)',
  'F14 [F14] death: drown context (o2 reset(-1), feet water, head water, rescue 200s ago, leg next column alt, wet 1s@last)',
  'F14 [F14] water: death spot memorized as a hazard at [-141,60,394] (2 live, fleet-wide)',
  'F16 [F16] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.0 (0s before death at [-128,59,372]) [the inference corroborates the server verdict])',
  'F16 [F16] death drop: ~156u lost at [-128,59,372] (cobblestone 57, cobblestone 21, andesite 18, dirt 11, coal 10, +12 more)',
  'F12 [F12] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@10.9 (0s before death at [-134,64,408]) [the inference corroborates the server verdict])',
  'F12 [F12] death drop: ~39u lost at [-134,64,408] (dirt 8, oak_log 8, sand 8, cobblestone 3, stick 3, +8 more)',
  'F6 [F6] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.5 (0s before death at [-142,61,385]) [the inference corroborates the server verdict])',
  'F6 [F6] death drop: ~218u lost at [-142,61,385] (cobblestone 64, cobblestone 36, diorite 35, raw_copper 30, dirt 22, +15 more)',
  'F7 [F7] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@0.9 (0s before death at [-144,61,384]) [the inference corroborates the server verdict])',
  'F7 [F7] death drop: ~34u lost at [-144,61,384] (leaf_litter 12, oak_planks 6, stick 5, torch 3, birch_log 2, +5 more)',
  'F13 [F13] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.8 (0s before death at [-117,65,395]) [the inference corroborates the server verdict])',
  'F13 [F13] death drop: ~154u lost at [-117,65,395] (cobblestone 60, leaf_litter 38, dirt 21, torch 12, andesite 7, +10 more)'
]

test('the wet-storm face reads byte-exact: 7 deaths, ~714u at stake, the silent six named', () => {
  const c = deathDropCensus(FACE)
  assert.equal(c.drops.length, 7)
  assert.equal(c.deaths, 7)
  assert.equal(c.lostU, 714)
  assert.equal(c.emptyReads, 1)
  // the lane spoke for F18's empty read only - the silent six carry the mass
  assert.deepEqual(c.armed, { n: 1, u: 0, bots: ['F18'] })
  assert.deepEqual(c.silent, { n: 6, u: 714, bots: ['F6', 'F16', 'F13', 'F14', 'F12', 'F7'] })
  // the stakes ride their source indexes in log order
  assert.equal(c.drops[0].bot, 'F18')
  assert.equal(c.drops[0].kind, 'empty')
  assert.equal(c.drops[0].pos, null)
  assert.equal(c.drops[1].bot, 'F14')
  assert.equal(c.drops[1].u, 113)
  assert.deepEqual(c.drops[1].pos, { x: -141, y: 60, z: 394 })
  assert.equal(c.drops[6].bot, 'F13')
  assert.equal(c.drops[6].u, 154)
})

// (v0.663.0) THE SILENT STAKE'S OWN CLOCK - the clock leg's own pins.
test('the wet-storm face (no heartbeat anchors) reads the arm lag from the walk row alone, the silent split stays untimed', () => {
  const c = deathDropCensus(FACE)
  // F18's walk row carries window 120s - the despawn inverted prices the
  // lag at 180s straight from the runner's own plan arithmetic
  assert.deepEqual(c.clock.armLag, { n: 1, medianS: 180, maxS: 180 })
  // no heartbeat anchors - every silent stake stays untimed, never judged
  assert.equal(c.drops[1].ts, null)
  assert.deepEqual(c.clock.silent.preTail, { n: 0, u: 0, bots: [] })
  assert.deepEqual(c.clock.silent.endPhase, { n: 0, u: 0, bots: [] })
  assert.equal(c.clock.silent.untimed, 6)
})

test('the clock face: the silent split rides the seal death clock\'s end-phase law', () => {
  const lines = [
    'b] n=1 ts=100s rss=251M late=5ms mainLate=0ms',
    'F5 [F5] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-118,46,389]))',
    'F5 [F5] death drop: ~5u lost at [-118,46,389] (stick 3, cobblestone 2)',
    'b] n=2 ts=300s rss=252M late=4ms mainLate=1ms',
    'F8 [F8] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-124,51,404]))',
    'F8 [F8] death drop: ~33u lost at [-124,51,404] (cobblestone 20, torch 8, dirt 5)',
    'F8 reloot: no walk (unarmed) - the empty pocket bootstraps first, the read re-arms (a delay, not a verdict)',
    'F8 reloot: walking to the own death spot [-124,51,404] (42b, budget 15s, window 108s)',
    'F8 reloot: retry arrived in 11s - 13 item stack(s) within 8 (in read reach - the magnet takes what it can)',
    'b] n=3 ts=900s rss=253M late=3ms mainLate=2ms',
    'F6 [F6] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@8.6 (0s before death at [-140,64,407]))',
    'F6 [F6] death drop: ~115u lost at [-140,64,407] (cobblestone 42, diorite 31, dirt 17, raw_copper 5, birch_planks 4, +10 more)',
    'b] n=4 ts=941s rss=254M late=2ms mainLate=3ms'
  ]
  const c = deathDropCensus(lines)
  // F5's stake: silent at ts=100, clockEnd 941 - 941-60=881, 100 < 881 -> PRE-TAIL
  // F6's stake: silent at ts=900 >= 881 -> END-PHASE (the bank's loop outlived the read)
  // F8's stake: armed - never in the silent split; its walk window 108s prices lag 192s
  assert.deepEqual(c.armed, { n: 1, u: 33, bots: ['F8'] })
  assert.deepEqual(c.silent, { n: 2, u: 120, bots: ['F6', 'F5'] })
  assert.deepEqual(c.clock.silent.preTail, { n: 1, u: 5, bots: ['F5'] })
  assert.deepEqual(c.clock.silent.endPhase, { n: 1, u: 115, bots: ['F6'] })
  assert.equal(c.clock.silent.untimed, 0)
  // the armed walk's lag rides too: window 108s -> 300-108 = 192s
  assert.deepEqual(c.clock.armLag, { n: 1, medianS: 192, maxS: 192 })
  // the drops carry their heartbeat stamps
  assert.equal(c.drops[0].ts, 100)
  assert.equal(c.drops[1].ts, 300)
  assert.equal(c.drops[2].ts, 900)
})

test('the lag join is bounded by the bot\'s own next drop: a repeat death\'s walk never lags the earlier stake', () => {
  const lines = [
    'F11 [F11] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-136,51,414]))',
    'F11 [F11] death drop: ~102u lost at [-136,51,414] (cobblestone 44, dirt 20, coal 18, gravel 20)',
    'F11 reloot: walking to the own death spot [-136,51,414] (17b, budget 14s, window 295s, the unarmed escalation, the pile arm)',
    'F11 reloot: write-off (goal [-136,51,414], stake ~102u, age 7s/300s window, walk \'No path to the goal!\' -> retry \'water rescue in progress (reloot retry refused)\' -> surface \'not-no-path\')',
    'F11 [F11] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-140,49,418]))',
    'F11 [F11] death drop: ~61u lost at [-140,49,418] (cobblestone 30, dirt 12, coal 9, gravel 10)'
  ]
  const c = deathDropCensus(lines)
  assert.deepEqual(c.armed, { n: 1, u: 102, bots: ['F11'] })
  assert.deepEqual(c.silent, { n: 1, u: 61, bots: ['F11'] })
  // the walk row sits between the two drops - it lags the FIRST stake only
  // (window 295s -> lag 5s); the second stake's silence lags nothing
  assert.deepEqual(c.clock.armLag, { n: 1, medianS: 5, maxS: 5 })
})

test('the lag junk battery: a window past the despawn, a zero window and a windowless walk row lag nothing', () => {
  const mk = (walkLine) => [
    'F7 [F7] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-144,61,384]))',
    'F7 [F7] death drop: ~34u lost at [-144,61,384] (leaf_litter 12, oak_planks 6, stick 5, torch 3, birch_log 2, +5 more)',
    walkLine
  ]
  // window past the despawn (400s > 300s) - the arithmetic would read
  // negative, junk never arms a number
  assert.deepEqual(deathDropCensus(mk('F7 reloot: walking to the own death spot [-144,61,384] (12b, budget 14s, window 400s)')).clock.armLag, { n: 0, medianS: null, maxS: null })
  // a zero window - the expired edge, the plan's own fence never walks it
  assert.deepEqual(deathDropCensus(mk('F7 reloot: walking to the own death spot [-144,61,384] (12b, budget 14s, window 0s)')).clock.armLag, { n: 0, medianS: null, maxS: null })
  // a walk row without a window field - the shape never matches
  assert.deepEqual(deathDropCensus(mk('F7 reloot: walking to the own death spot [-144,61,384] (12b, budget 14s)')).clock.armLag, { n: 0, medianS: null, maxS: null })
  // the healthy window at the despawn's edge reads lag zero honestly
  assert.deepEqual(deathDropCensus(mk('F7 reloot: walking to the own death spot [-144,61,384] (12b, budget 14s, window 300s)')).clock.armLag, { n: 1, medianS: 0, maxS: 0 })
  // a NO-walk face (refusals only) prices no lag at all
  assert.deepEqual(deathDropCensus([
    'F7 [F7] died - respawning (cause: server: drowned [kind=drown])',
    'F7 [F7] death drop: ~34u lost at [-144,61,384] (leaf_litter 12)',
    'F7 reloot: no walk (unarmed) - the empty pocket bootstraps first, the read re-arms (a delay, not a verdict)'
  ]).clock.armLag, { n: 0, medianS: null, maxS: null })
})

test('the armed mass pile: a reloot row AFTER the drop joins the stake to the lane', () => {
  const lines = [
    'F15 [F15] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-128,51,405]))',
    'F15 [F15] death drop: ~97u lost at [-128,51,405] (cobblestone 40, dirt 22, sand 15, coal 10, gravel 10)',
    'F15 reloot: no walk (unarmed) - the empty pocket bootstraps first, the read re-arms (a delay, not a verdict)',
    'F15 reloot: walking to the own death spot [-128,51,405] (9b, budget 14s, window 120s)',
    'F15 reloot: retry arrived in 3s - 15 item stack(s) within 8 (in read reach - the magnet takes what it can)'
  ]
  const c = deathDropCensus(lines)
  assert.equal(c.lostU, 97)
  assert.deepEqual(c.armed, { n: 1, u: 97, bots: ['F15'] })
  assert.deepEqual(c.silent, { n: 0, u: 0, bots: [] })
})

test('the line-order law: an arm row from a PREVIOUS death never arms a later stake', () => {
  const lines = [
    'F11 [F11] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-136,51,414]))',
    'F11 [F11] death drop: ~102u lost at [-136,51,414] (cobblestone 44, dirt 20, coal 18, gravel 20)',
    'F11 reloot: walking to the own death spot [-136,51,414] (17b, budget 14s, window 295s, the unarmed escalation, the pile arm)',
    'F11 reloot: write-off (goal [-136,51,414], stake ~102u, age 7s/300s window, walk \'No path to the goal!\' -> retry \'water rescue in progress (reloot retry refused)\' -> surface \'not-no-path\')',
    'F11 [F11] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-140,49,418]))',
    'F11 [F11] death drop: ~61u lost at [-140,49,418] (cobblestone 30, dirt 12, coal 9, gravel 10)'
  ]
  const c = deathDropCensus(lines)
  assert.equal(c.drops.length, 2)
  assert.equal(c.lostU, 163)
  // the first stake spoke; the second stake rides the silence (the lane's
  // one-walk-per-death law spent its voice on the first)
  assert.deepEqual(c.armed, { n: 1, u: 102, bots: ['F11'] })
  assert.deepEqual(c.silent, { n: 1, u: 61, bots: ['F11'] })
})

test('the cross-bot law: another bot\'s reloot row never arms my stake', () => {
  const lines = [
    'F6 [F6] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.5 (0s before death at [-142,61,385]))',
    'F6 [F6] death drop: ~218u lost at [-142,61,385] (cobblestone 64, cobblestone 36, diorite 35, raw_copper 30, dirt 22, +15 more)',
    'F7 reloot: walking to the own death spot [-144,61,384] (12b, budget 14s, window 280s)'
  ]
  const c = deathDropCensus(lines)
  assert.deepEqual(c.armed, { n: 0, u: 0, bots: [] })
  assert.deepEqual(c.silent, { n: 1, u: 218, bots: ['F6'] })
})

test('the anatomy pins: the prose pollution never joins, the shapes match exactly', () => {
  // the deathsweep's own law rides: the prose line is neither death nor drop
  assert.equal(isDeathLine('F17 steer hazard defer: copper_ore@-130,52,403 held behind the ledger (d 6.6) - the clean veins led (a death is a cost the deficit cannot re'), false)
  assert.equal(isDeathDropLine('a death is a cost the deficit cannot repay - prose with the keyword, never a death'), false)
  assert.equal(isDeathDropLine('F17 steer hazard defer: copper_ore@-130,52,403 held behind the ledger'), false)
  assert.equal(isDeathDropLine('F14 [F14] death drop: ~113u lost at [-141,60,394] (sand 29, cobblestone 22, diorite 20, dirt 12, leaf_litter 5, +13 more)'), true)
  assert.equal(isDeathDropLine('F18 [F18] death drop: pocket read empty at death (0u)'), true)
  // the loss shape reads mass + coord, the comma mass stays one number
  const loss = 'F6 [F6] death drop: ~1,218u lost at [-142,61,385] (cobblestone 64)'.match(DEATH_DROP_LOSS_RE)
  assert.equal(loss[2], '1,218')
  assert.deepEqual({ x: +loss[3], y: +loss[4], z: +loss[5] }, { x: -142, y: 61, z: 385 })
  // the empty shape reads the bot only
  assert.equal('F18 [F18] death drop: pocket read empty at death (0u)'.match(DEATH_DROP_EMPTY_RE)[1], '18')
  // the lane row reads the bot
  assert.equal('F15 reloot: no walk (night) - the walk-forbidden window owns the surface'.match(RELOOT_ROW_RE)[1], '15')
  assert.equal(DEATH_DROP_RE.test('F14 reloot: walking to the own death spot [-141,60,394]'), false)
})

test('the junk battery: non-strings and junk shapes read an empty census', () => {
  assert.deepEqual(deathDropCensus(null).drops, [])
  assert.deepEqual(deathDropCensus(undefined).drops, [])
  assert.deepEqual(deathDropCensus(42).drops, [])
  assert.deepEqual(deathDropCensus([null, 42, {}, 'F14 [F14] death drop: ~113u lost at [-141,60,394]']).drops.length, 1)
  assert.deepEqual(deathDropCensus(['F14 death drop: ~113u lost at [-141,60,394]']).drops, [])
  assert.deepEqual(deathDropCensus(['F14 [F14] death drop: ~113u lost at [junk]']).drops, [])
  assert.deepEqual(deathDropCensus(['F14 [F14] death drop: something else entirely']).drops, [])
  const c = deathDropCensus(['junk', 'F14 [F14] death drop: ~113u lost at [-141,60,394]'])
  assert.equal(c.deaths, 0)
  assert.equal(c.lostU, 113)
  assert.deepEqual(c.silent, { n: 1, u: 113, bots: ['F14'] })
})
