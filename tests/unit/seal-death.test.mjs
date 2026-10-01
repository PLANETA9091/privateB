// (v0.403.0) THE SEAL DEATH LEDGER - unit pins (the sealcensus v0.397.0
// shape). The death-drop lines are the seal economy's loss leg: the
// reserve (v0.396.0) keeps at bank time, DEATH bypasses the pocket
// entirely (face 23's F14 arrived 0/8 six times and then dropped ~172u
// with cobble 83 + dirt 26 inside). The verbatims are the fleet's own
// words; the '+N more' tail is the fleet's honest truncation - counted,
// never invented.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSealDeathDrop, sealDeathCensus, SEAL_DEATH_LOSS_RE, SEAL_DEATH_EMPTY_RE } from '../../src/lib/sealdeath.mjs'
import { SEAL_PRIORITY } from '../../src/lib/shelter.mjs'

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
  assert.deepEqual(c, { drops: 0, emptyReads: 0, lostTotal: 0, sealLostTotal: 0, byBot: {} })
})

test('seal-death: the honest zero on a deathless face + the pinned anatomy', () => {
  const c = sealDeathCensus(['launching 19 bots for 600s', 'F2 [F2] combat: fighting skeleton'])
  assert.deepEqual(c, { drops: 0, emptyReads: 0, lostTotal: 0, sealLostTotal: 0, byBot: {} })
  // the anatomy pins: the RES list lives in the module, the seal class rides
  // shelter.mjs's ONE list (the co-derivation law)
  assert.match('F1 [F1] death drop: ~1u lost at [0,0,0] (dirt 1)', SEAL_DEATH_LOSS_RE)
  assert.match('F1 [F1] death drop: pocket read empty at death (0u)', SEAL_DEATH_EMPTY_RE)
  assert.ok(SEAL_PRIORITY.includes('dirt') && SEAL_PRIORITY.includes('oak_planks'))
})
