import { test } from 'node:test'
import assert from 'node:assert/strict'
import { counterGap, upgradeJoin, TALLY_RE, PATHB_VERDICT_RE, PATHA_FAIL_RE } from '../../src/lib/countergap.mjs'
import { upgradeVerdicts } from '../../src/lib/upgradecensus.mjs'

// The live shapes verbatim. The tally line is run36289053811's final
// console line; the local-path verdicts and the rung's words carry the
// toolupgrade emitter's own prefixes.
const tallyLine = 'bots=19 spawned=19 reconnects=4 kicks=0 tools=18 recovered=2 reboots=0 upgraded=23 swords=17 alive=19 climbs=30 banked=744 smelted=24 planted=8 torched=4 fights=16 kills=1 shelters=2 rescues=46 airGlitches=375 claims=15 claimedHolds=0 wet=12 wt=2'
const rungWords = 'F9 [toolupgrade] [upgrade] upgraded: stone_pickaxe,wooden_shovel,wooden_pickaxe,wooden_pickaxe'
const localCrafted = 'F12 [toolupgrade] iron_pickaxe: crafted (tier raise: iron_ingot 3)'
const localFailed = 'F7 [toolupgrade] stone_pickaxe: FAILED (phantom or missing mats) (worn replacement: wooden_pickaxe)'
const rungFailed = 'F4 [toolupgrade] [upgrade] failed: no path to the table'

test('counterGap closes the book when every surplus is named (the identity case)', () => {
  // tally 3 = the rung's 2 ok passes (words) + the local path's 1 crafted:
  // gap 1 fully named by the crafted verdict, residual 0.
  const r = counterGap([rungWords, rungWords, localCrafted, 'bots=19 spawned=19 reboots=0 upgraded=3 swords=2 alive=19'])
  assert.equal(r.tally, 3)
  assert.equal(r.tallyLines, 1)
  assert.equal(r.words, 2)
  assert.equal(r.gap, 1)
  assert.equal(r.pathBCrafted, 1)
  assert.equal(r.pathBFailed, 0)
  assert.equal(r.pathAFailed, 0)
  assert.equal(r.residual, 0)
})

test('counterGap names the deficit window (rung failed-words leave their mark)', () => {
  // tally 1 = one ok word pass; the census also saw an exception word the
  // tally counted as ok - gap 0, but the failed-words window shows as the
  // remainder: residual = 0 - 0 + 1 = 1.
  const r = counterGap([rungWords, rungFailed, 'bots=19 spawned=19 reboots=0 upgraded=1 swords=1 alive=19'])
  assert.equal(r.tally, 1)
  assert.equal(r.words, 1)
  assert.equal(r.gap, 0)
  assert.equal(r.pathBCrafted, 0)
  assert.equal(r.pathAFailed, 1)
  assert.equal(r.residual, 1)
})

test('counterGap reads the residual honestly (the unnamed remainder stays visible)', () => {
  // tally 5, words 0, one local crafted: 4 units the lines do not name
  // (the completed-but-empty words, the catch edge - never guessed).
  const r = counterGap([localCrafted, 'bots=19 spawned=19 upgraded=5 alive=19'])
  assert.equal(r.tally, 5)
  assert.equal(r.words, 0)
  assert.equal(r.gap, 5)
  assert.equal(r.pathBCrafted, 1)
  assert.equal(r.residual, 4)
})

test('counterGap lets the LAST tally govern and counts the tally lines', () => {
  const r = counterGap(['bots=19 spawned=19 upgraded=5 alive=19', tallyLine])
  assert.equal(r.tallyLines, 2)
  assert.equal(r.tally, 23)
  assert.equal(r.gap, 23)
})

test('counterGap reads a truncated log honestly (no tally line -> nulls)', () => {
  const r = counterGap([rungWords, localCrafted])
  assert.equal(r.tally, null)
  assert.equal(r.tallyLines, 0)
  assert.equal(r.words, 1)
  assert.equal(r.gap, null)
  assert.equal(r.residual, null)
  assert.equal(r.pathBCrafted, 1)
})

test('counterGap never mistakes the intermediate steps for verdicts (the tool-name pin)', () => {
  const r = counterGap([
    'F9 [toolupgrade] sticks: crafted (have 4)',
    'F9 [toolupgrade] spare table: crafted',
    'F9 [toolupgrade] sticks: FAILED',
    localCrafted
  ])
  assert.equal(r.pathBCrafted, 1)
  assert.equal(r.pathBFailed, 0)
})

test('counterGap counts the local FAILED verdict as the no-count exit', () => {
  const r = counterGap([localFailed])
  assert.equal(r.pathBCrafted, 0)
  assert.equal(r.pathBFailed, 1)
})

test('counterGap is junk-safe and nulls on non-array', () => {
  assert.equal(counterGap(null), null)
  assert.equal(counterGap('bots=19 upgraded=1'), null)
  assert.equal(counterGap({}), null)
  const r = counterGap([null, 42, rungWords, 'garbage'])
  assert.equal(r.tally, null)
  assert.equal(r.words, 1)
  assert.deepEqual({ g: r.gap, res: r.residual, pc: r.pathBCrafted, pf: r.pathBFailed, pa: r.pathAFailed }, { g: null, res: null, pc: 0, pf: 0, pa: 0 })
})

test('counterGap reads zero honestly (the zero law)', () => {
  assert.deepEqual(counterGap([]), { tally: null, tallyLines: 0, words: 0, gap: null, pathBCrafted: 0, pathBFailed: 0, pathAFailed: 0, residual: null })
})

test('the three REs anchor their emitter shapes (one parser per emitter)', () => {
  assert.ok(TALLY_RE.test(tallyLine))
  assert.ok(!TALLY_RE.test('F9 [toolupgrade] [upgrade] upgraded: stone_pickaxe'))
  assert.ok(PATHB_VERDICT_RE.test(localCrafted))
  assert.ok(PATHB_VERDICT_RE.test(localFailed))
  assert.ok(!PATHB_VERDICT_RE.test(rungWords))
  assert.ok(!PATHB_VERDICT_RE.test('F9 [toolupgrade] sticks: crafted (have 4)'))
  assert.ok(!PATHB_VERDICT_RE.test('F9 tool upgrade (commune): OK -> stone_pickaxe (x)'))
  assert.ok(PATHA_FAIL_RE.test(rungFailed))
  assert.ok(!PATHA_FAIL_RE.test(rungWords))
})

// ---- (v0.474.0) THE WORDS-VERDICT JOIN - the residual's name ----
// Face 43's live anatomy verbatim (run 36970605824, the first live read):
// 16 verdicts (13 ok, 3 failed) against 14 words. The storm class: F13's
// rung printed 'upgraded: wooden_shovel,wooden_pickaxe' while its verdict
// read 'failed -> none' (the stone crafts refused by the storm cooldown).
// The silent class: F9's two 'failed -> none (no table material)' verdicts
// printed no word at all. THE BOOK: gap = okSilent - wordedNotOk - unpaired.
const fourKitWord = (bot) => `${bot} [toolupgrade] [upgrade] upgraded: stone_pickaxe,wooden_shovel,wooden_pickaxe,wooden_pickaxe`
const fourKitVerdict = (bot) => `${bot} tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_shovel,wooden_pickaxe,wooden_pickaxe)`
const f13StormWord = 'F13 [toolupgrade] [upgrade] upgraded: wooden_shovel,wooden_pickaxe'
const f13StormVerdict = 'F13 tool upgrade: failed -> none (wooden_shovel,wooden_pickaxe)'
const f13OkWord = 'F13 [toolupgrade] [upgrade] upgraded: stone_pickaxe,wooden_shovel,wooden_pickaxe'
const f13OkVerdict = 'F13 tool upgrade: OK -> stone_pickaxe (stone_pickaxe,wooden_shovel,wooden_pickaxe)'
const f9SilentVerdict = 'F9 tool upgrade: failed -> none (no table material)'
const f13Refusal = 'F13 [toolupgrade] [upgrade] craft stone_pickaxe: storm cooldown 2166ms left (3 consecutive timeouts) - refusing'
const f13Due = 'F13 tool upgrade due: cobble available -> stone_pickaxe'

// the twelve paired bots verbatim, then the storm, the second rung, the silence
const face43Fixture = [
  ...['F8', 'F1', 'F6', 'F11', 'F15', 'F16', 'F3', 'F12', 'F14', 'F18', 'F17', 'F4'].flatMap((b) => [fourKitWord(b), fourKitVerdict(b)]),
  f13Due, f13Refusal,
  f13StormWord, f13StormVerdict,
  f13OkWord, f13OkVerdict,
  f9SilentVerdict, f9SilentVerdict,
  'bots=19 spawned=19 reconnects=9 kicks=0 tools=19 recovered=0 reboots=0 upgraded=13'
]

test('upgradeJoin names the face-43 live anatomy (the storm and the silence)', () => {
  const r = upgradeJoin(face43Fixture)
  assert.equal(r.attempts, 16)
  assert.equal(r.ok, 13)
  assert.equal(r.failed, 3)
  assert.equal(r.commune, 0)
  assert.equal(r.words, 14)
  assert.equal(r.okWorded, 13)
  assert.equal(r.wordedNotOk, 1)
  assert.equal(r.verdictNotWorded, 2)
  assert.equal(r.unpairedWords, 0)
  assert.deepEqual(r.wordedFailedBots, ['F13'])
  assert.deepEqual(r.silentBots, ['F9'])
})

test('upgradeJoin closes the book: gap = okSilent - wordedNotOk - unpaired', () => {
  const cg = counterGap(face43Fixture)
  const uj = upgradeJoin(face43Fixture)
  assert.equal(cg.gap, -1)
  assert.equal(cg.residual, -1)
  const okSilent = uj.ok - uj.okWorded
  assert.equal(cg.gap, okSilent - uj.wordedNotOk - uj.unpairedWords)
})

test('upgradeJoin reconciles with the verdict census (the same classes)', () => {
  const uv = upgradeVerdicts(face43Fixture)
  const uj = upgradeJoin(face43Fixture)
  assert.equal(uj.ok, uv.ok)
  assert.equal(uj.failed, uv.failed)
  assert.equal(uj.commune, uv.commune)
  assert.equal(uj.attempts, uv.ok + uv.failed + uv.commune)
})

test('upgradeJoin pairs a word with the bot\u0027s NEXT verdict (the adjacency law)', () => {
  const r = upgradeJoin([f13StormWord, f13StormVerdict, f13OkWord, f13OkVerdict])
  assert.equal(r.wordedNotOk, 1)
  assert.equal(r.okWorded, 1)
  assert.equal(r.unpairedWords, 0)
  assert.deepEqual(r.wordedFailedBots, ['F13'])
})

test('upgradeJoin supersedes a pending word when a second one lands (no verdict between)', () => {
  const r = upgradeJoin([fourKitWord('F2'), fourKitWord('F2'), fourKitVerdict('F2')])
  assert.equal(r.unpairedWords, 1)
  assert.equal(r.okWorded, 1)
  assert.equal(r.words, 2)
})

test('upgradeJoin reads the truncation window honestly (a word no verdict answered)', () => {
  const r = upgradeJoin([f13OkWord])
  assert.equal(r.unpairedWords, 1)
  assert.equal(r.okWorded, 0)
  assert.equal(r.attempts, 0)
  assert.equal(r.words, 1)
})

test('upgradeJoin names the silent class (the bailed-pre-kit failures)', () => {
  const r = upgradeJoin([f9SilentVerdict, f9SilentVerdict])
  assert.equal(r.verdictNotWorded, 2)
  assert.deepEqual(r.silentBots, ['F9'])
  assert.equal(r.words, 0)
  assert.equal(r.failed, 2)
})

test('upgradeJoin skips the refusal and due lines (neither shape claims them)', () => {
  const r = upgradeJoin([f13Due, f13Refusal])
  assert.equal(r.attempts, 0)
  assert.equal(r.words, 0)
  assert.deepEqual(r.silentBots, [])
  assert.deepEqual(r.wordedFailedBots, [])
})

test('upgradeJoin tags the commune lane (the census\u0027s own separation)', () => {
  const r = upgradeJoin([
    'F5 [toolupgrade] [upgrade] upgraded: stone_pickaxe',
    'F5 tool upgrade (commune): OK -> stone_pickaxe (commune pool)',
    'F7 [toolupgrade] [upgrade] upgraded: stone_pickaxe',
    'F7 tool upgrade (commune): failed -> none (commune pool)'
  ])
  assert.equal(r.commune, 2)
  assert.equal(r.ok, 0)
  assert.equal(r.failed, 0)
  assert.equal(r.okWorded, 1)
  assert.equal(r.wordedNotOk, 1)
  assert.equal(r.attempts, 2)
})

test('upgradeJoin is junk-safe and nulls on non-array', () => {
  assert.equal(upgradeJoin(null), null)
  assert.equal(upgradeJoin('F9 tool upgrade: OK -> x'), null)
  assert.equal(upgradeJoin({}), null)
  const r = upgradeJoin([null, 42, f13OkWord, 'garbage'])
  assert.equal(r.words, 1)
  assert.equal(r.unpairedWords, 1)
})

test('upgradeJoin reads zero honestly (the zero law)', () => {
  assert.deepEqual(upgradeJoin([]), { attempts: 0, ok: 0, failed: 0, commune: 0, words: 0, okWorded: 0, wordedNotOk: 0, verdictNotWorded: 0, unpairedWords: 0, wordedFailedBots: [], silentBots: [] })
})
