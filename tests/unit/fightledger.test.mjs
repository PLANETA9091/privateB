//
// fightledger.test.mjs - THE FIGHT COST LEDGER's own battery (v0.486.0)
//
// The fixtures are byte-verbatim emitter lines (faces 42/43's skins):
// the fighting start's full body, the fight-ended terminus's full
// anatomy, the fleeing/sheltering/died closes. The book law: every
// start closes exactly once - mob-down + deadline + chase-ceiling +
// verdict-ignore + abandoned + sheltered + died + open = starts.
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fightLedger, FIGHTING_RE, FIGHT_END_RE } from '../../src/lib/fightledger.mjs'

// the face-43 anatomy, hand-traced line by line from the stored
// artifact (the mini covers every close class the lane emits)
const face43Mini = [
  'F3 [F3] combat: fighting zombie (dist 4.6, hp 17.0, 1 nearby, proximity)',
  'F3 [F3] combat: fight ended vs zombie (mob down, hp 17.0 -> 9.0, swings 7, weapon wooden_sword, 7 rounds)',
  'F6 [F6] combat: fighting zombie_villager (dist 3.8, hp 20.0, 1 nearby, proximity)',
  'F6 [F6] combat: fight ended vs zombie_villager (verdict ignore, hp 20.0 -> 20.0, swings 1, weapon wooden_sword, 1 rounds)',
  'F5 [F5] combat: fighting spider (dist 5.0, hp 11.0, 2 nearby, proximity)',
  'F5 [F5] combat: verdict flipped to flee vs spider (hp 11.0)',
  'F5 [F5] combat: open-field yield vs spider (hp 11.0 < 14 in the dark) - the flee fired before the drain',
  'F5 [F5] combat: fleeing zombie_villager (dist 4.8, hp 2.0, 2 nearby, proximity)',
  'F4 [F4] combat: fighting spider (dist 3.0, hp 18.0, 1 nearby, proximity)',
  'F4 [F4] combat: sheltering from creeper (ring 8/8, proximity)',
  'F2 [F2] combat: fighting drowned (dist 4.4, hp 16.0, 1 nearby, proximity)',
  'F2 [F2] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-142,61,71]))',
  'F9 [F9] combat: fighting skeleton (dist 7.7, hp 16.0, 1 nearby, proximity)'
]

test('fightLedger - the face-43 anatomy: every close class, the book law, the win cost', () => {
  const r = fightLedger(face43Mini)
  assert.ok(r, 'the mini reads')
  assert.equal(r.starts, 6)
  // the book closes exactly once: 1 + 1 + 0 + 1 + 1 + 1 + 1 + 0 = 6
  assert.equal(r.mobDown, 1)
  assert.equal(r.deadline, 0)
  assert.equal(r.chaseCeiling, 0)
  assert.equal(r.verdictIgnore, 1)
  assert.equal(r.abandoned, 1)
  assert.equal(r.sheltered, 1)
  assert.equal(r.died, 1)
  assert.equal(r.open, 1)
  assert.equal(r.mobDown + r.deadline + r.chaseCeiling + r.verdictIgnore +
    r.abandoned + r.sheltered + r.died + r.open, r.starts)
  // the win's cost: the zombie took 8.0 hp on the way down
  assert.deepEqual(r.costs, { min: 8, median: 8, max: 8 })
  assert.equal(r.freeWins, 0)
  // the slog: the mini's longest fight is the 7-round zombie win
  assert.deepEqual(r.slog, { maxRounds: 7, bot: 'F3', mob: 'zombie', weapon: 'wooden_sword' })
  assert.deepEqual(r.weapons, { wooden_sword: 2 })
  assert.deepEqual(r.perBot, { F3: 1, F6: 1, F5: 1, F4: 1, F2: 1, F9: 1 })
  // the rows' own anatomy, row by row
  const byBot = Object.fromEntries(r.rows.map(x => [x.bot, x]))
  // the mob-down win: the emitter's full anatomy rides
  assert.equal(byBot.F3.outcome, 'mob-down')
  assert.equal(byBot.F3.endMob, 'zombie')
  assert.equal(byBot.F3.cost, 8)
  assert.equal(byBot.F3.swings, 7)
  assert.equal(byBot.F3.weapon, 'wooden_sword')
  assert.equal(byBot.F3.rounds, 7)
  // the verdict-ignore exit: the machinery ended it, zero cost
  assert.equal(byBot.F6.outcome, 'verdict-ignore')
  assert.equal(byBot.F6.cost, 0)
  // the abandon: the fight yielded to the escape, the flee line's own
  // hp prices the drain between the start and the flight, and the mob
  // token's mismatch names the threat change (spider -> zombie_villager)
  assert.equal(byBot.F5.outcome, 'abandoned')
  assert.equal(byBot.F5.closeHp, 2)
  assert.equal(byBot.F5.closeMob, 'zombie_villager')
  assert.equal(byBot.F5.threatChanged, true)
  // the shelter takeover: the wall answered the fight first
  assert.equal(byBot.F4.outcome, 'sheltered')
  assert.equal(byBot.F4.closeMob, 'creeper')
  assert.equal(byBot.F4.threatChanged, true)
  // the death: the fight ran out, the kind rides (the authority law)
  assert.equal(byBot.F2.outcome, 'died')
  assert.equal(byBot.F2.deathKind, 'drown')
  // the truncation leg: no terminus inside the window, honest open
  assert.equal(byBot.F9.outcome, 'open')
  assert.equal(byBot.F9.closerIdx, null)
})

test('fightLedger - the face-42 leg: the regen slog and the free win', () => {
  // byte-verbatim face-42 skins: the pickaxe ran 42 rounds and the hp
  // came back UP (the regen outpaced the grind - the negative cost IS
  // the slog signature), while the sword won free (cost 0)
  const face42Mini = [
    'F7 [F7] combat: fighting zombie (dist 3.5, hp 17.0, 1 nearby, proximity)',
    'F7 [F7] combat: fight ended vs zombie (mob down, hp 17.0 -> 20.0, swings 42, weapon wooden_pickaxe, 42 rounds)',
    'F8 [F8] combat: fighting zombie (dist 4.0, hp 20.0, 1 nearby, proximity)',
    'F8 [F8] combat: fight ended vs zombie (mob down, hp 20.0 -> 20.0, swings 1, weapon wooden_sword, 1 rounds)'
  ]
  const r = fightLedger(face42Mini)
  assert.equal(r.starts, 2)
  assert.equal(r.mobDown, 2)
  // the cost book reads the regen honestly: min is NEGATIVE
  assert.deepEqual(r.costs, { min: -3, median: -1.5, max: 0 })
  assert.equal(r.freeWins, 1)
  // the pickaxe tax's own ruler: 42 rounds on a pickaxe
  assert.deepEqual(r.slog, { maxRounds: 42, bot: 'F7', mob: 'zombie', weapon: 'wooden_pickaxe' })
  assert.deepEqual(r.weapons, { wooden_pickaxe: 1, wooden_sword: 1 })
})

test('fightLedger - the second-fight law: the fresh fight wins, the stale one opens honestly', () => {
  const over = [
    'F5 [F5] combat: fighting spider (dist 5.0, hp 11.0, 2 nearby, proximity)',
    'F5 [F5] combat: fighting skeleton (dist 7.7, hp 16.0, 1 nearby, proximity)',
    'F5 [F5] combat: fight ended vs skeleton (mob down, hp 16.0 -> 12.8, swings 6, weapon wooden_sword, 6 rounds)'
  ]
  const r = fightLedger(over)
  assert.equal(r.starts, 2)
  const first = r.rows.find(x => x.mob === 'spider')
  const second = r.rows.find(x => x.mob === 'skeleton')
  assert.equal(first.outcome, 'open', 'the stale fight never closed - it reads open')
  assert.equal(first.closerIdx, 1, 'the fresh fight start is the stale one\'s boundary')
  assert.equal(second.outcome, 'mob-down', 'the fresh fight takes the lane')
  assert.equal(second.cost, 3.2)
})

test('fightLedger - the RE anchors: the truncated bodies go blind honestly', () => {
  // the start spoke, the body did not survive (the FATAL truncation's
  // own shape): the fight opens data-blind
  const blind = fightLedger(['F9 [F9] combat: fighting skeleton (dist'])
  assert.equal(blind.starts, 1)
  assert.equal(blind.open, 1)
  assert.equal(blind.rows[0].mob, null)
  assert.equal(blind.rows[0].hp, null)
  // the REs refuse the wrong shapes directly
  assert.equal(FIGHTING_RE.test('combat: fighting spider (dist 3.0, hp 20, nearby, proximity)'), false, 'no nearby count - refused')
  assert.equal(FIGHT_END_RE.test('combat: fight ended vs spider (mob down, hp 20.0, swings 4, weapon wooden_sword)'), false, 'no hp pair / rounds - refused')
  assert.equal(FIGHT_END_RE.test('combat: fight ended vs spider (mob down, hp 18.0 -> 17.0, swings 4, weapon stone sword, 4 rounds)'), false, 'a spaced weapon token is not a weapon token - refused')
  // the terminus spoke, its anatomy did not survive: the fight closes
  // on the class the verb names, the cost reads honestly unpriced
  const trunc = fightLedger([
    'F5 [F5] combat: fighting spider (dist 3.0, hp 20.0, 1 nearby, proximity)',
    'F5 [F5] combat: fight ended vs spider (trunc'
  ])
  assert.equal(trunc.starts, 1)
  assert.equal(trunc.open, 1, 'the anatomy-less terminus closes into the honest window class')
  assert.equal(trunc.rows[0].cost, null)
})

test('fightLedger - the machinery prose never closes, never opens', () => {
  // the verdict flip, the open-field yield, the shelter try/skip/wall
  // miss, the flee ladder - the fights' own machinery: none of it ends
  // the fight, only the boundary vocabulary does
  const prose = fightLedger([
    'F5 [F5] combat: fighting spider (dist 5.0, hp 11.0, 2 nearby, proximity)',
    'F5 [F5] combat: verdict flipped to flee vs spider (hp 11.0)',
    'F5 [F5] combat: open-field yield vs spider (hp 11.0 < 14 in the dark) - the flee fired before the drain',
    'F5 [F5] combat: shelter try vs spider (dist 5.0, proximity re-verdict)',
    'F5 [F5] combat: shelter wall miss (open field: no diggable wall, ring next, spider@5.0)',
    'F5 [F5] combat: shelter skip (night=true armed=true hp=8.3 attackers=2 poison=off threat=spider@4.0)',
    'F5 [F5] combat: flee ladder 0deg -> 90deg (the threat reads the away rotation) vs spider (proximity re-verdict)',
    'F5 [F5] combat: fleeing spider (dist 4.0, hp 8.3, 2 nearby, proximity)'
  ])
  assert.equal(prose.starts, 1)
  assert.equal(prose.abandoned, 1, 'only the fleeing line closes - the machinery never did')
  assert.equal(prose.rows[0].threatChanged, false, 'the same mob answered - no threat change')
  assert.equal(prose.rows[0].closeHp, 8.3, 'the drain priced: 11.0 at the fight, 8.3 at the flight')
})

test('fightLedger - the junk battery and the honest zero shape', () => {
  assert.equal(fightLedger(null), null, 'non-array non-blob judges nothing')
  assert.equal(fightLedger(42), null)
  assert.equal(fightLedger({ lines: [] }), null)
  // the blob input splits on newline (the smeltledger convention)
  const blob = fightLedger(face43Mini.join('\n'))
  assert.equal(blob.starts, 6)
  // non-string lines skipped
  const mixed = fightLedger(['F3 [F3] combat: fighting zombie (dist 4.6, hp 17.0, 1 nearby, proximity)', 5, null])
  assert.equal(mixed.starts, 1)
  // the zero shape: the calm face reads its own keys, no NaN
  const zero = fightLedger([])
  assert.deepEqual(zero, {
    starts: 0, mobDown: 0, deadline: 0, chaseCeiling: 0, verdictIgnore: 0,
    abandoned: 0, sheltered: 0, died: 0, open: 0,
    costs: null, freeWins: 0,
    slog: { maxRounds: null, bot: null, mob: null, weapon: null },
    weapons: {}, perBot: {}, rows: []
  })
})
