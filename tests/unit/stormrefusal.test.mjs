import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stormRefusalLedger } from '../../src/lib/stormrefusal.mjs'

// (v0.478.0) THE STORM LEDGER's pins - the face-43 verbatim anatomy first
// (the live storm: five refusals, one bot, three episodes, three classes),
// then the class laws, the episode-split law, the skins census, the anchor
// battery and the junk/zero laws.

test('storm ledger: the face-43 verbatim anatomy - five refusals, one bot, three episodes, three classes', () => {
  // The live sequence (run 36970605824, lines 533..2641, order-faithful;
  // the between-lines are the lanes' own voices - junk to this lens).
  const lines = [
    'F13 tool upgrade due: cobble available -> stone_pickaxe',
    'F13 [toolupgrade] [upgrade] craft stone_pickaxe: storm cooldown 2166ms left (3 consecutive timeouts) - refusing',
    'F13 [toolupgrade] [upgrade] craft stone_shovel: storm cooldown 2166ms left (3 consecutive timeouts) - refusing',
    'F13 [toolupgrade] [upgrade] upgraded: wooden_shovel,wooden_pickaxe',
    'F13 tool upgrade: failed -> none (wooden_shovel,wooden_pickaxe)',
    'F13 spare pick due: spare (cobble available)',
    'F13 craft stone_pickaxe: storm cooldown 2158ms left (3 consecutive timeouts) - refusing',
    'F13 spare pick: craft did not land (stone_pickaxe, holds 1)',
    'F13 sword due: cobble available',
    'F13 craft stone_sword: storm cooldown 2151ms left (3 consecutive timeouts) - refusing',
    'F13 sword: craft did not land (stone_sword, holds 0)',
    'F13 [F13] craft torches: skip (no coal: sticks 6 coals 0)',
    'F13 tunnel: steering iron_ore @ 3.9b',
    'F13 tool upgrade due: cobble available -> stone_pickaxe',
    'F13 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_shovel,wooden_pickaxe)',
    'F13 recovery brake: 1 consecutive failures - next attempt in 45s',
    'F13 tool recovery: failed (no crafting table)',
    'F13 [F13] craft oak_planks: storm cooldown 3986ms left (3 consecutive timeouts) - refusing',
    'F13 [F13] craft torches: skip (no spare sticks: sticks 0 coals 0)'
  ]
  const l = stormRefusalLedger(lines)
  assert.ok(l)
  assert.equal(l.refusals, 5)
  assert.deepEqual(l.refusalBots, ['F13'])
  assert.deepEqual(l.byItem, { stone_pickaxe: 2, stone_shovel: 1, stone_sword: 1, oak_planks: 1 })
  assert.deepEqual(l.skins, { tagged: 1, upgrade: 2, plain: 2, other: 0 })
  assert.equal(l.episodes, 3)
  assert.deepEqual(l.byClass, { recovered: 1, terminal: 1, commune: 0, unanswered: 1 })
  assert.deepEqual(l.terminalBots, ['F13'])
  assert.deepEqual(l.recoveredBots, ['F13'])
  assert.deepEqual(l.unansweredBots, ['F13'])
  assert.equal(l.maxWaitMs, 3986)
  assert.equal(l.maxConsecutive, 3)
  // THE EPISODES, verbatim: A terminal (the upgrade verdict failed -> none),
  // B recovered (the OK -> stone_pickaxe verdict 300+ lines later - the
  // brake is TRANSIENT on live data), C unanswered (the face's tail).
  assert.deepEqual(l.rows[0], { bot: 'F13', items: ['stone_pickaxe', 'stone_shovel'], refusals: 2, maxWaitMs: 2166, maxConsecutive: 3, class: 'terminal' })
  assert.deepEqual(l.rows[1], { bot: 'F13', items: ['stone_pickaxe', 'stone_sword'], refusals: 2, maxWaitMs: 2158, maxConsecutive: 3, class: 'recovered' })
  assert.deepEqual(l.rows[2], { bot: 'F13', items: ['oak_planks'], refusals: 1, maxWaitMs: 3986, maxConsecutive: 3, class: 'unanswered' })
})

test('storm ledger: the episode-split law - ANY verdict of the bot splits, even a failed one', () => {
  const l = stormRefusalLedger([
    'F5 craft stone_pickaxe: storm cooldown 1000ms left (3 consecutive timeouts) - refusing',
    'F5 tool upgrade: failed -> none (wooden_pickaxe)',
    'F5 craft stone_axe: storm cooldown 900ms left (3 consecutive timeouts) - refusing'
  ])
  assert.equal(l.episodes, 2)
  assert.deepEqual(l.byClass, { recovered: 0, terminal: 1, commune: 0, unanswered: 1 })
  assert.deepEqual(l.rows[0].items, ['stone_pickaxe'])
  assert.deepEqual(l.rows[1].items, ['stone_axe'])
})

test('storm ledger: the transient proof - two recovered episodes, the bot deduped', () => {
  const l = stormRefusalLedger([
    'F2 craft stone_shovel: storm cooldown 800ms left (3 consecutive timeouts) - refusing',
    'F2 tool upgrade: OK -> stone_shovel (stone_shovel,wooden_axe)',
    'F2 craft stone_hoe: storm cooldown 1200ms left (3 consecutive timeouts) - refusing',
    'F2 tool upgrade: OK -> stone_hoe (stone_hoe,wooden_pickaxe)'
  ])
  assert.equal(l.episodes, 2)
  assert.deepEqual(l.byClass, { recovered: 2, terminal: 0, commune: 0, unanswered: 0 })
  assert.deepEqual(l.recoveredBots, ['F2'])
})

test('storm ledger: the commune law - the commune lane resolves its own episode', () => {
  const l = stormRefusalLedger([
    'F7 craft stick: storm cooldown 500ms left (3 consecutive timeouts) - refusing',
    'F7 tool upgrade (commune): OK -> stone_pickaxe (stone_pickaxe,wooden_shovel)'
  ])
  assert.equal(l.episodes, 1)
  assert.deepEqual(l.byClass, { recovered: 0, terminal: 0, commune: 1, unanswered: 0 })
})

test('storm ledger: another bot verdict never splits nor resolves', () => {
  const l = stormRefusalLedger([
    'F1 craft stone_pickaxe: storm cooldown 700ms left (3 consecutive timeouts) - refusing',
    'F2 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_axe)',
    'F1 craft stone_sword: storm cooldown 600ms left (3 consecutive timeouts) - refusing'
  ])
  // F2's verdict is invisible to F1's episode: one episode, both refusals,
  // resolved by nothing (F1 has no verdict of its own).
  assert.equal(l.episodes, 1)
  assert.deepEqual(l.rows[0].items, ['stone_pickaxe', 'stone_sword'])
  assert.equal(l.rows[0].refusals, 2)
  assert.equal(l.rows[0].class, 'unanswered')
  assert.deepEqual(l.refusalBots, ['F1'])
})

test('storm ledger: the skins census counts the three skins and the honest other', () => {
  const l = stormRefusalLedger([
    'F3 [F3] craft oak_planks: storm cooldown 100ms left (3 consecutive timeouts) - refusing',
    'F3 [toolupgrade] [upgrade] craft stone_pickaxe: storm cooldown 200ms left (3 consecutive timeouts) - refusing',
    'F3 craft stone_axe: storm cooldown 300ms left (3 consecutive timeouts) - refusing',
    'F3 [chestlog] craft stone_shovel: storm cooldown 400ms left (3 consecutive timeouts) - refusing'
  ])
  assert.deepEqual(l.skins, { tagged: 1, upgrade: 1, plain: 1, other: 1 })
  // One episode: no verdict of F3 anywhere, all four refusals cluster.
  assert.equal(l.episodes, 1)
  assert.equal(l.rows[0].refusals, 4)
  assert.deepEqual(l.rows[0].items, ['oak_planks', 'stone_pickaxe', 'stone_axe', 'stone_shovel'])
  assert.equal(l.rows[0].class, 'unanswered')
})

test('storm ledger: the anchor battery - near-miss shapes judge nothing', () => {
  const l = stormRefusalLedger([
    'F12 [F12] storm cooldown (3 consecutive timeouts)', // the hand quote - no craft item
    'F12 [F12] craft wooden_pickaxe: storm cooldown soon', // no numbers
    'F12 [F12] craft wooden_pickaxe: storm cooldown 45000ms left (2 consecutive timeouts) - refusing later', // tail off
    'craft stone_pickaxe: storm cooldown 500ms left (3 consecutive timeouts) - refusing', // no bot token
    'F9 tool upgrade: failed -> none (no table material)' // the verdict alone is no refusal
  ])
  assert.ok(l)
  assert.equal(l.refusals, 0)
  assert.equal(l.episodes, 0)
  assert.deepEqual(l.refusalBots, [])
  assert.deepEqual(l.byClass, { recovered: 0, terminal: 0, commune: 0, unanswered: 0 })
  assert.equal(l.maxWaitMs, null)
  assert.equal(l.maxConsecutive, null)
  assert.deepEqual(l.rows, [])
})

test('storm ledger: the calm face reads the honest zero', () => {
  const l = stormRefusalLedger([
    'F1 [F1] tunnel: 4 blocks',
    'F2 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_shovel)',
    'mem: heap=200M/512M old=90M ext=2M ab=1M rss=300M cols=1000 ents=900 evicted=5 path=1a/0q (max 8) stale=0'
  ])
  assert.equal(l.refusals, 0)
  assert.deepEqual(l.skins, { tagged: 0, upgrade: 0, plain: 0, other: 0 })
  assert.deepEqual(l.byItem, {})
  assert.equal(l.episodes, 0)
})

test('storm ledger: junk-safe end to end - null, blob, non-string rows', () => {
  assert.equal(stormRefusalLedger(null), null)
  assert.equal(stormRefusalLedger(undefined), null)
  assert.equal(stormRefusalLedger(42), null)
  // The blob form splits on newline and reads the same.
  const blob = [
    'F4 craft stone_pickaxe: storm cooldown 900ms left (3 consecutive timeouts) - refusing',
    'F4 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_shovel)'
  ].join('\n')
  const lb = stormRefusalLedger(blob)
  assert.equal(lb.episodes, 1)
  assert.equal(lb.rows[0].class, 'recovered')
  // Non-string rows are skipped, never thrown.
  const lj = stormRefusalLedger([null, 42, {}, 'F6 craft stick: storm cooldown 300ms left (3 consecutive timeouts) - refusing'])
  assert.equal(lj.refusals, 1)
  assert.equal(lj.episodes, 1)
  assert.equal(lj.rows[0].class, 'unanswered')
})

test('storm ledger: the multi-bot law - episodes stay per-bot in first-episode order', () => {
  const l = stormRefusalLedger([
    'F8 craft stone_shovel: storm cooldown 400ms left (3 consecutive timeouts) - refusing',
    'F2 craft stone_pickaxe: storm cooldown 500ms left (3 consecutive timeouts) - refusing',
    'F2 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_axe)',
    'F8 craft stone_axe: storm cooldown 450ms left (3 consecutive timeouts) - refusing',
    'F8 tool upgrade: failed -> none (wooden_shovel)'
  ])
  assert.equal(l.refusalBots.length, 2)
  assert.deepEqual(l.refusalBots, ['F8', 'F2'])
  // F8's verdict lands AFTER its second refusal - no verdict sits between
  // the two refusals, so they are ONE episode (both rode the same storm
  // window; the lane surfaced once, after). F2's own verdict resolves F2's.
  assert.equal(l.episodes, 2)
  assert.deepEqual(l.rows[0], { bot: 'F8', items: ['stone_shovel', 'stone_axe'], refusals: 2, maxWaitMs: 450, maxConsecutive: 3, class: 'terminal' })
  assert.deepEqual(l.rows[1], { bot: 'F2', items: ['stone_pickaxe'], refusals: 1, maxWaitMs: 500, maxConsecutive: 3, class: 'recovered' })
  assert.deepEqual(l.terminalBots, ['F8'])
  assert.deepEqual(l.recoveredBots, ['F2'])
})

test('storm ledger: the interleaved split law - a verdict BETWEEN refusals splits per bot', () => {
  const l = stormRefusalLedger([
    'F8 craft stone_shovel: storm cooldown 400ms left (3 consecutive timeouts) - refusing',
    'F8 tool upgrade: failed -> none (wooden_shovel)',
    'F8 craft stone_axe: storm cooldown 450ms left (3 consecutive timeouts) - refusing',
    'F8 tool upgrade: OK -> stone_axe (stone_axe,wooden_pickaxe)'
  ])
  // The failed verdict sits BETWEEN the refusals: two episodes, one
  // terminal then one recovered - the storm re-engaged and released again.
  assert.equal(l.episodes, 2)
  assert.deepEqual(l.byClass, { recovered: 1, terminal: 1, commune: 0, unanswered: 0 })
  assert.deepEqual(l.rows[0].items, ['stone_shovel'])
  assert.deepEqual(l.rows[1].items, ['stone_axe'])
})
