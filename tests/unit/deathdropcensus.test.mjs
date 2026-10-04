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
