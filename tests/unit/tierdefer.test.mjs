// Tests for the tier defer census (v0.463.0): the tool ladder's own
// voice counted. The live shapes are byte-verbatim from faces 38/41
// (the emitters' real lines); the junk law: non-lines skipped,
// non-array -> null.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tierDeferCensus, TIER_DEFER_RE } from '../../src/lib/tierdefer.mjs'

describe('tierdefer', () => {
  it('reads the live face-41 shape (iron_ore, copper_ore)', () => {
    const lines = [
      'F9 steer tier defer: iron_ore, copper_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)',
      'F14 steer tier defer: iron_ore, copper_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)',
      'F5 steer tier defer: iron_ore, copper_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)',
      'F10 steer tier defer: iron_ore, copper_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)',
      'F2 steer tier defer: iron_ore, copper_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)'
    ]
    const c = tierDeferCensus(lines)
    assert.equal(c.defers, 5)
    assert.deepEqual(c.perBot, { F9: 1, F14: 1, F5: 1, F10: 1, F2: 1 })
    assert.deepEqual(c.byResource, { iron_ore: 5, copper_ore: 5 })
  })

  it('counts per-bot repeats (the same bot defers across trips)', () => {
    const line = 'F9 steer tier defer: iron_ore, copper_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)'
    const c = tierDeferCensus([line, line, line])
    assert.equal(c.defers, 3)
    assert.deepEqual(c.perBot, { F9: 3 })
    assert.deepEqual(c.byResource, { iron_ore: 3, copper_ore: 3 })
  })

  it('splits the fresh-name join generically (any resource names)', () => {
    const c = tierDeferCensus([
      'F3 steer tier defer: coal_ore, gold_ore, diamond_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)'
    ])
    assert.equal(c.defers, 1)
    assert.deepEqual(c.byResource, { coal_ore: 1, gold_ore: 1, diamond_ore: 1 })
    assert.deepEqual(c.perBot, { F3: 1 })
  })

  it('skips junk lines and non-strings', () => {
    const c = tierDeferCensus([
      42,
      null,
      'F9 steer hazard defer: coal_ore@-123,60,389 held behind the ledger (d 2.5) - the clean veins led',
      'F2 took 1 x copper_ingot (1/3)',
      'F9 steer tier defer: iron_ore deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)'
    ])
    assert.equal(c.defers, 1)
    assert.deepEqual(c.perBot, { F9: 1 })
    assert.deepEqual(c.byResource, { iron_ore: 1 })
  })

  it('returns null on non-array input (honest silence)', () => {
    assert.equal(tierDeferCensus(null), null)
    assert.equal(tierDeferCensus('face41.log'), null)
    assert.equal(tierDeferCensus(undefined), null)
  })

  it('empty input reads zero defers (the picks harvested what they steered to)', () => {
    const c = tierDeferCensus([])
    assert.equal(c.defers, 0)
    assert.deepEqual(c.perBot, {})
    assert.deepEqual(c.byResource, {})
  })

  it('the regex anchors on the bot tag and the deferred tail', () => {
    assert.ok(TIER_DEFER_RE.test('F14 steer tier defer: iron_ore deferred - the pick cannot harvest the drops (the tail)'))
    assert.ok(!TIER_DEFER_RE.test('F14 steer tier defer: iron_ore deferred - partial'))
    assert.ok(!TIER_DEFER_RE.test('X9 steer tier defer: iron_ore deferred - the pick cannot harvest the drops'))
  })
})
