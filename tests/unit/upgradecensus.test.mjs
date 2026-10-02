import { test } from 'node:test'
import assert from 'node:assert/strict'
import { upgradeCensus, UPGRADE_RE } from '../../src/lib/upgradecensus.mjs'

// The live shapes verbatim (face 42's own lines).
const face42 = [
  'F9 [toolupgrade] [upgrade] upgraded: stone_pickaxe,wooden_shovel,wooden_pickaxe,wooden_pickaxe',
  'F1 [toolupgrade] [upgrade] upgraded: stone_pickaxe,wooden_pickaxe,wooden_shovel,wooden_pickaxe',
  'F18 [toolupgrade] [upgrade] upgraded: stone_pickaxe,wooden_shovel,wooden_pickaxe'
]

test('upgradeCensus reads the live face-42 shapes verbatim', () => {
  const r = upgradeCensus(face42)
  assert.equal(r.upgrades, 3)
  assert.equal(r.tools, 11)
  assert.deepEqual(r.perBot, { F9: 1, F1: 1, F18: 1 })
  assert.deepEqual(r.byTool, { stone_pickaxe: 3, wooden_shovel: 3, wooden_pickaxe: 5 })
})

test('upgradeCensus counts per-bot repeats (one line = one rung pass)', () => {
  const r = upgradeCensus([...face42, face42[0]])
  assert.equal(r.upgrades, 4)
  assert.deepEqual(r.perBot, { F9: 2, F1: 1, F18: 1 })
  assert.equal(r.byTool.wooden_pickaxe, 7)
})

test('upgradeCensus joins any tool names generically (not just the observed four)', () => {
  const r = upgradeCensus(['F7 [toolupgrade] [upgrade] upgraded: iron_pickaxe, iron_shovel'])
  assert.equal(r.upgrades, 1)
  assert.equal(r.tools, 2)
  assert.deepEqual(r.byTool, { iron_pickaxe: 1, iron_shovel: 1 })
})

test('upgradeCensus is junk-safe (non-lines and near-misses ignored)', () => {
  const r = upgradeCensus([
    'F9 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_shovel)',
    'F10 spare pick: OK (wooden_pickaxe, holds 2)',
    'F9 [toolupgrade] [upgrade] upgraded: stone_pickaxe',
    null,
    42,
    'bots=19 spawned=19 tools=19'
  ])
  assert.equal(r.upgrades, 1)
  assert.deepEqual(r.byTool, { stone_pickaxe: 1 })
})

test('upgradeCensus returns null on non-array (the null law)', () => {
  assert.equal(upgradeCensus(null), null)
  assert.equal(upgradeCensus('F9 [toolupgrade] [upgrade] upgraded: x'), null)
  assert.equal(upgradeCensus({}), null)
})

test('upgradeCensus reads zero honestly (the zero law)', () => {
  const r = upgradeCensus([])
  assert.deepEqual(r, { upgrades: 0, perBot: {}, byTool: {}, tools: 0 })
})

test('UPGRADE_RE anchors the emitter shape (one parser per emitter)', () => {
  assert.ok(UPGRADE_RE.test('F9 [toolupgrade] [upgrade] upgraded: stone_pickaxe'))
  assert.ok(!UPGRADE_RE.test('F9 tool upgrade: OK -> stone_pickaxe (x)'))
  assert.ok(!UPGRADE_RE.test('F9 [toolupgrade] [upgrade] due: stone'))
})
