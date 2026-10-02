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

// (v0.467.0) THE DEFER PROMISE JOIN tests
import { deferPromise } from '../../src/lib/upgradecensus.mjs'

test('deferPromise reads took-after (the promise live: defer, then the rung)', () => {
  const lines = [
    'F9 steer tier defer: iron_ore, copper_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)',
    'F9 [toolupgrade] [upgrade] due: stone',
    'F9 [toolupgrade] [upgrade] upgraded: stone_pickaxe,wooden_shovel'
  ]
  const r = deferPromise(lines)
  assert.equal(r.deferringBots, 1)
  assert.equal(r.tookAfter, 1)
  assert.deepEqual(r.perBot, { F9: 'took-after' })
})

test('deferPromise reads kept (the F16 face-42 case verbatim: no upgrade event)', () => {
  const lines = [
    'F16 steer tier defer: iron_ore, copper_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)',
    'F19 [toolupgrade] [upgrade] upgraded: stone_pickaxe,wooden_shovel,wooden_pickaxe,wooden_pickaxe'
  ]
  const r = deferPromise(lines)
  assert.equal(r.deferringBots, 1)
  assert.equal(r.kept, 1)
  assert.equal(r.tookAfter, 0)
  assert.deepEqual(r.perBot, { F16: 'kept' })
})

test('deferPromise reads took-before-only (the defer outlived the rung)', () => {
  const lines = [
    'F3 [toolupgrade] [upgrade] upgraded: stone_pickaxe',
    'F3 steer tier defer: coal_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)'
  ]
  const r = deferPromise(lines)
  assert.deepEqual(r.perBot, { F3: 'took-before-only' })
  assert.equal(r.tookBeforeOnly, 1)
})

test('deferPromise lets the LAST defer govern (mid upgrade then defer again waits)', () => {
  const lines = [
    'F5 steer tier defer: iron_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)',
    'F5 [toolupgrade] [upgrade] upgraded: stone_pickaxe',
    'F5 steer tier defer: copper_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)'
  ]
  const r = deferPromise(lines)
  assert.deepEqual(r.perBot, { F5: 'took-before-only' })
})

test('deferPromise splits a mixed cast honestly', () => {
  const lines = [
    'F16 steer tier defer: iron_ore, copper_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)',
    'F9 [toolupgrade] [upgrade] upgraded: stone_pickaxe',
    'F9 steer tier defer: iron_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)',
    'F9 [toolupgrade] [upgrade] upgraded: stone_pickaxe,iron_pickaxe'
  ]
  const r = deferPromise(lines)
  assert.equal(r.deferringBots, 2)
  assert.deepEqual(r.perBot, { F16: 'kept', F9: 'took-after' })
  assert.equal(r.tookAfter, 1)
  assert.equal(r.kept, 1)
})

test('deferPromise is junk-safe and nulls on non-array', () => {
  assert.equal(deferPromise(null), null)
  assert.equal(deferPromise('nope'), null)
  const r = deferPromise([null, 7, 'F2 [toolupgrade] [upgrade] upgraded: x', 'garbage'])
  assert.deepEqual(r, { deferringBots: 0, tookAfter: 0, tookBeforeOnly: 0, kept: 0, perBot: {} })
})

test('deferPromise reads zero honestly (the zero law)', () => {
  const r = deferPromise(['F1 [toolupgrade] [upgrade] upgraded: stone_pickaxe'])
  assert.deepEqual(r, { deferringBots: 0, tookAfter: 0, tookBeforeOnly: 0, kept: 0, perBot: {} })
})

// (v0.468.0) THE VERDICT CENSUS tests
import { upgradeVerdicts, VERDICT_RE } from '../../src/lib/upgradecensus.mjs'

test('upgradeVerdicts reads the face-42 verdicts verbatim (the window: 14 = tier 12 + worn 2)', () => {
  const lines = [
    'F9 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_shovel,wooden_pickaxe,wooden_pickaxe)',
    'F1 tool upgrade: OK -> stone_pickaxe (worn (left=11/131))',
    'F3 tool upgrade: OK -> stone_pickaxe (worn (left=5/131))'
  ]
  const r = upgradeVerdicts(lines)
  assert.equal(r.ok, 3)
  assert.equal(r.tier, 1)
  assert.equal(r.worn, 2)
  assert.equal(r.maxWear, 5)
  assert.equal(r.noop, 0)
})

test('upgradeVerdicts counts the silent no-op (already stone+)', () => {
  const r = upgradeVerdicts(['F7 tool upgrade: OK -> stone_pickaxe (already stone+)'])
  assert.equal(r.ok, 1)
  assert.equal(r.noop, 1)
  assert.equal(r.tier, 0)
})

test('upgradeVerdicts separates the commune variant', () => {
  const r = upgradeVerdicts([
    'F2 tool upgrade (commune): OK -> stone_pickaxe (stone_pickaxe,wooden_shovel)',
    'F2 tool upgrade (commune): failed -> none (no cobblestone)',
    'F2 tool upgrade: OK -> stone_pickaxe (stone_pickaxe)'
  ])
  assert.equal(r.commune, 2)
  assert.equal(r.failed, 0)
  assert.equal(r.ok, 1)
  assert.equal(r.tier, 1)
})

test('upgradeVerdicts counts failures by their reason (detail rides as data)', () => {
  const r = upgradeVerdicts([
    'F5 tool upgrade: failed -> none (cannot make sticks (no planks?))',
    'F6 tool upgrade: failed -> none (no crafting table placeable)'
  ])
  assert.equal(r.failed, 2)
  assert.equal(r.ok, 0)
})

test('upgradeVerdicts never matches the near-miss emitters (the anchor law)', () => {
  assert.ok(!VERDICT_RE.test('F10 spare pick: OK (wooden_pickaxe, holds 2)'))
  assert.ok(!VERDICT_RE.test('F12 tool recovery: OK (stone_pickaxe)'))
  assert.ok(!VERDICT_RE.test('F9 tool upgrade due: worn (left=3/131) -> stone_pickaxe'))
  assert.ok(!VERDICT_RE.test('F9 [toolupgrade] [upgrade] upgraded: stone_pickaxe'))
})

test('upgradeVerdicts is junk-safe and nulls on non-array (the laws)', () => {
  assert.equal(upgradeVerdicts(null), null)
  assert.equal(upgradeVerdicts('x'), null)
  assert.deepEqual(upgradeVerdicts([null, 5, 'garbage']), { ok: 0, failed: 0, commune: 0, tier: 0, worn: 0, noop: 0, maxWear: null })
})

// (v0.470.0) THE VERDICT SPREAD - the verdict census's per-bot half.
import { verdictSpread } from '../../src/lib/upgradecensus.mjs'

// Face 42's verdict lines verbatim (the emitter's own words, line order).
const face42Verdicts = [
  'F9 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_shovel,wooden_pickaxe,wooden_pickaxe)',
  'F1 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_pickaxe,wooden_shovel,wooden_pickaxe)',
  'F3 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_shovel,wooden_pickaxe,wooden_pickaxe)',
  'F15 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_shovel,wooden_pickaxe,wooden_pickaxe)',
  'F19 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_shovel,wooden_pickaxe,wooden_pickaxe)',
  'F10 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_shovel,wooden_pickaxe,wooden_pickaxe)',
  'F18 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_shovel,wooden_pickaxe)',
  'F4 tool upgrade: OK -> stone_pickaxe (wooden_pickaxe,stone_pickaxe,wooden_shovel,wooden_pickaxe)',
  'F17 tool upgrade: OK -> stone_pickaxe (wooden_pickaxe,stone_pickaxe,wooden_pickaxe,wooden_shovel)',
  'F13 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_pickaxe,wooden_shovel)',
  'F6 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_pickaxe,wooden_shovel,wooden_pickaxe)',
  'F1 tool upgrade: OK -> stone_pickaxe (worn (left=11/131))',
  'F19 tool upgrade: OK -> stone_pickaxe (wooden_shovel,stone_pickaxe,wooden_pickaxe,wooden_pickaxe)',
  'F3 tool upgrade: OK -> stone_pickaxe (worn (left=5/131))'
]

test('verdictSpread reads the live face-42 verdicts: the worn class spreads across TWO bots', () => {
  const r = verdictSpread(face42Verdicts)
  assert.equal(r.bots, 11)
  assert.deepEqual(r.wornBots, ['F1', 'F3'])
  assert.equal(r.maxWearBot, 'F3')
  assert.equal(r.maxWear, 5)
  assert.equal(r.perBot.F1.worn, 1)
  assert.equal(r.perBot.F3.worn, 1)
  assert.equal(r.perBot.F19.ok, 2)
  assert.equal(r.perBot.F1.ok, 2)
  assert.equal(r.perBot.F9.tier, 1)
})

test('verdictSpread reconciles with the face-level verdict census (the sums law)', () => {
  const r = verdictSpread(face42Verdicts)
  const uv = upgradeVerdicts(face42Verdicts)
  const sum = key => Object.values(r.perBot).reduce((a, row) => a + row[key], 0)
  assert.equal(sum('ok'), uv.ok)
  assert.equal(sum('tier'), uv.tier)
  assert.equal(sum('worn'), uv.worn)
  assert.equal(sum('noop'), uv.noop)
  assert.equal(sum('failed'), uv.failed)
  assert.equal(sum('commune'), uv.commune)
})

test('verdictSpread names the closest call with its bot (the first-occurrence tie law)', () => {
  const r = verdictSpread([
    'F2 tool upgrade: OK -> stone_pickaxe (worn (left=7/131))',
    'F5 tool upgrade: OK -> stone_pickaxe (worn (left=7/131))',
    'F8 tool upgrade: OK -> stone_pickaxe (worn (left=3/131))'
  ])
  assert.equal(r.maxWearBot, 'F8')
  assert.equal(r.maxWear, 3)
  const tie = verdictSpread([
    'F4 tool upgrade: OK -> stone_pickaxe (worn (left=6/131))',
    'F9 tool upgrade: OK -> stone_pickaxe (worn (left=6/131))'
  ])
  assert.equal(tie.maxWearBot, 'F4')
  assert.equal(tie.maxWear, 6)
})

test('verdictSpread separates the commune variant per bot (main ok untouched)', () => {
  const r = verdictSpread([
    'F2 tool upgrade (commune): OK -> stone_pickaxe (stone_pickaxe)',
    'F2 tool upgrade (commune): failed -> none (no cobblestone)',
    'F2 tool upgrade: OK -> stone_pickaxe (stone_pickaxe)',
    'F2 tool upgrade: failed -> none (no crafting table placeable)'
  ])
  assert.equal(r.bots, 1)
  assert.deepEqual(r.perBot.F2, { ok: 1, tier: 1, worn: 0, noop: 0, failed: 1, commune: 2 })
  assert.deepEqual(r.wornBots, [])
  assert.equal(r.maxWearBot, null)
  assert.equal(r.maxWear, null)
})

test('verdictSpread is junk-safe and nulls on non-array (the laws)', () => {
  assert.equal(verdictSpread(null), null)
  assert.equal(verdictSpread(42), null)
  assert.deepEqual(verdictSpread([null, 'F10 spare pick: OK (wooden_pickaxe, holds 2)', 'F9 tool upgrade due: cobble available -> stone_pickaxe', 'garbage']), { bots: 0, perBot: {}, wornBots: [], maxWearBot: null, maxWear: null })
})

test('verdictSpread reads zero verdicts honestly (the zero law)', () => {
  const r = verdictSpread([])
  assert.deepEqual(r, { bots: 0, perBot: {}, wornBots: [], maxWearBot: null, maxWear: null })
})
