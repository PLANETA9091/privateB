// THE ASK'S OWN WHY BOOK - the census's own tests (v0.652.0).
// The face that prices the shape: fleet 37249185472 (the v0.650.0 face, the
// water storm) - 36 dry 'budget spent' terminals, the ask ladder's whys
// (the decide class, the fleet goal ceiling, the water rescue interlock)
// riding NO census anywhere in the mining surface.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askWhyCensus, askWhyClass, decideSkin, askSide, ASK_TERMINAL_RE, ASK_WHY_RE, ASK_WHY_CLASSES, DECIDE_SKIN_CLASSES, ASK_SIDES } from '../../src/lib/askwhycensus.mjs'

test('THE ASK WHY CENSUS: the storm face re-priced byte-exact (the decide, the ceiling, the water, the dry terminals)', () => {
  // the v0.650.0 face's own shapes, verbatim (the tags, the parens, the prose)
  const lines = [
    'F5 fuel commons: chest walk failed (Took to long to decide path to goal!)',
    'F5 fuel commons: path nudge inside the direct envelope',
    'F5 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
    'F5 fuel commons: budget spent (0/1 units)',
    'F9 fuel commons: chest walk failed after the nudge (fleet goal ceiling: 30 goals fleet-wide in 5s - fuel commons walk @-130,394 (nudge retry) refused for 4s)',
    'F9 fuel commons: the last mile refused (raw walk timeout after 6973ms (d=19.0))',
    'F9 fuel commons: budget spent (0/1 units)',
    'F11 food commons: chest walk failed (water rescue in progress (food commons walk @-128,394 refused))',
    'F11 food commons: the plate stays empty (no chest reached) - the next trip retries',
    'F1 fuel commons: budget spent (0/1 units)'
  ]
  const c = askWhyCensus(lines)
  assert.equal(c.terminals, 3, 'three budget terminals closed (F5, F9, F1; F11 never closed one)')
  assert.equal(c.unitsDry, 3, 'each terminal read 1 unit dry (0 of 1)')
  assert.equal(c.whys.decide, 2, 'F5 rode the decide class twice (the first goto + the post-nudge)')
  assert.equal(c.whys.ceiling, 1, 'F9 rode the ceiling class (the re-goto the fleet goal ceiling refused)')
  assert.equal(c.whys.water, 1, 'F11 rode the water interlock (the food commons walk refused mid-rescue)')
  assert.equal(c.whys.timeout, 0, 'the last mile\'s raw-walk timeout is NOT a chest-walk-failed why (a different line family)')
  assert.equal(c.whys.unnamed, 0, 'the face\'s whys all named their class - no unnamed grain')
  assert.equal(c.dryByWhy.decide, 1, 'F5\'s terminal prices the decide class (the last refusal wins)')
  assert.equal(c.dryByWhy.ceiling, 1, 'F9\'s terminal prices the ceiling class')
  assert.equal(c.dryByWhy.water, 0, 'F11 never closed a terminal - the water why prices nothing (the interlock is not the terminal)')
})

test('THE ASK WHY CENSUS: the goal brake rides the ceiling family (the v0.650.0 face\'s own skin pair)', () => {
  // the face's own lines: F13's food commons walks rode the per-burst goal
  // brake x3 while F9's re-goto rode the fleet goal ceiling - siblings of
  // the same jobqueue throttle (the codebase names the family the goal
  // brake), one class owns both skins.
  const c = askWhyCensus([
    'F13 food commons: chest walk failed (goal brake: 6 goals in 5s - food commons walk @-130,394 refused for 16s)',
    'F13 food commons: chest walk failed (goal brake: 6 goals in 5s - food commons walk @-129,394 refused for 16s)',
    'F13 food commons: chest walk failed (goal brake: 6 goals in 5s - food commons walk @-128,394 refused for 16s)',
    'F13 food commons: budget spent (0/1 units)'
  ])
  assert.equal(c.whys.ceiling, 3, 'all three brake skins ride the ceiling class')
  assert.equal(c.whys.unnamed, 0)
  assert.equal(c.dryByWhy.ceiling, 1, 'the terminal prices the ceiling family')
})

test('THE ASK WHY CENSUS: the last refusal wins (the multi-why ladder prices the terminal)', () => {
  const lines = [
    'F2 fuel commons: chest walk failed (No path to the goal!)',
    'F2 fuel commons: chest walk failed (fleet goal ceiling: 30 goals fleet-wide in 5s - refused for 2s)',
    'F2 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
    'F2 fuel commons: budget spent (3/8 units)'
  ]
  const c = askWhyCensus(lines)
  assert.equal(c.terminals, 1)
  assert.equal(c.unitsDry, 5, 'the partial delivery reads 5 units dry (8 wanted, 3 taken)')
  assert.equal(c.whys.decide, 2, 'both decide whys count (the first goto + the post-nudge)')
  assert.equal(c.whys.ceiling, 1)
  assert.equal(c.dryByWhy.decide, 5, 'the LAST why before the terminal owns the dry units')
  assert.equal(c.dryByWhy.ceiling, 0, 'the earlier whys stay counted but price nothing')
})

test('THE ASK WHY CENSUS: the cross-bot law (F5\'s whys never price F9\'s terminal)', () => {
  const lines = [
    'F5 fuel commons: chest walk failed (Took to long to decide path to goal!)',
    'F9 fuel commons: budget spent (0/2 units)',
    'F5 fuel commons: budget spent (0/2 units)'
  ]
  const c = askWhyCensus(lines)
  assert.equal(c.terminals, 2)
  assert.equal(c.unitsDry, 4)
  assert.equal(c.dryByWhy.decide, 2, 'only F5\'s own terminal prices F5\'s why')
  assert.equal(c.whys.decide, 1)
})

test('THE ASK WHY CENSUS: the terminal with no why prices nothing (missing evidence is not a class)', () => {
  const c = askWhyCensus(['F1 fuel commons: budget spent (0/4 units)'])
  assert.equal(c.terminals, 1)
  assert.equal(c.unitsDry, 4)
  assert.equal(c.dryByWhy.decide + c.dryByWhy.ceiling + c.dryByWhy.water + c.dryByWhy.timeout + c.dryByWhy.unnamed, 0, 'no why, no class - the junk never invents (the v0.203.0 law)')
})

test('THE ASK WHY CENSUS: the unnamed bucket keeps the grain lossless (an unclassed why never vanishes)', () => {
  const lines = [
    'F7 fuel commons: chest walk failed (something novel the taxonomy never met)',
    'F7 fuel commons: budget spent (0/1 units)'
  ]
  const c = askWhyCensus(lines)
  assert.equal(c.whys.unnamed, 1, 'the novel why rides the unnamed bucket (the v0.583.0 law)')
  assert.equal(c.dryByWhy.unnamed, 1, 'the unnamed why still prices the terminal it owns')
})

test('THE ASK WHY CENSUS: the class order owns the why (the throttle prose can name a timeout inside itself)', () => {
  assert.equal(askWhyClass('fleet goal ceiling: 30 goals fleet-wide in 5s - fuel commons walk (nudge retry) refused for 4s'), 'ceiling', 'the ceiling IS the front even when the prose carries the walk\'s own refusal')
  assert.equal(askWhyClass('goal brake: 6 goals in 5s - food commons walk @-130,394 refused for 16s'), 'ceiling', 'the per-burst goal brake is the ceiling family\'s second skin (the jobqueue\'s own throttle pair)')
  assert.equal(askWhyClass('water rescue in progress (food commons walk @-128,394 refused)'), 'water', 'the water interlock IS the front even when the prose names a walk')
  assert.equal(askWhyClass('Took to long to decide path to goal!'), 'decide')
  assert.equal(askWhyClass('No path to the goal!'), 'decide')
  assert.equal(askWhyClass('fuel commons walk @-1,394: timeout after 3000ms'), 'timeout', 'the goto timeout that is NOT the decide class rides the timeout bucket')
  assert.equal(askWhyClass(''), 'unnamed')
  assert.equal(askWhyClass(null), 'unnamed')
  assert.equal(askWhyClass(42), 'unnamed')
})

test('THE ASK WHY CENSUS: the junk battery (the parser judges nothing it cannot read)', () => {
  // the junk-safe law: non-strings judge nothing, junk shapes never match
  assert.deepEqual(askWhyCensus(null), { terminals: 0, unitsDry: 0, whys: { ceiling: 0, water: 0, decide: 0, timeout: 0, unnamed: 0 }, dryByWhy: { ceiling: 0, water: 0, decide: 0, timeout: 0, unnamed: 0 }, decideSkins: { noPath: 0, decideBudget: 0, unnamed: 0 }, dryBySkin: { noPath: 0, decideBudget: 0, unnamed: 0 }, sides: { fuel: { noPath: 0, decideBudget: 0, unnamed: 0 }, food: { noPath: 0, decideBudget: 0, unnamed: 0 } }, dryBySide: { fuel: { noPath: 0, decideBudget: 0, unnamed: 0 }, food: { noPath: 0, decideBudget: 0, unnamed: 0 } } })
  assert.deepEqual(askWhyCensus(undefined).terminals, 0)
  assert.deepEqual(askWhyCensus(42).terminals, 0)
  assert.equal(askWhyCensus([null, 42, {}, 'not a line']).terminals, 0)
  assert.equal(askWhyCensus(['F5 fuel commons: budget spent (junk)']).terminals, 0, 'a malformed terminal never counts')
  assert.equal(askWhyCensus(['F5 fuel commons: budget spent (2/1 units)']).unitsDry, 0, 'took > want is junk - no negative dry (the Number(null) lesson)')
  assert.equal(askWhyCensus(['F5 fuel commons: chest walk failed ()']).whys.unnamed, 0, 'the empty parens are a MALFORMED line - junk never matches (the junk-safe law), it never counts as a why')
})

test('THE ASK WHY CENSUS: the regexes ride the emitter\'s own shapes (the anchoring law)', () => {
  assert.ok(ASK_TERMINAL_RE.test('F9 fuel commons: budget spent (0/1 units)'))
  assert.ok(ASK_TERMINAL_RE.test('F11 food commons: budget spent (0/4 units)'), 'the food commons rides the same terminal shape')
  assert.ok(!ASK_TERMINAL_RE.test('F9 fuel commons: budget spent (0/1 units) plus noise'), 'the anchor holds - a suffixed line is not the terminal')
  assert.ok(ASK_WHY_RE.test('F5 fuel commons: chest walk failed (Took to long to decide path to goal!)'))
  assert.ok(ASK_WHY_RE.test('F5 fuel commons: chest walk failed after the nudge (No path to the goal!)'), 'the post-nudge skin rides the same why')
  assert.ok(!ASK_WHY_RE.test('F5 fuel commons: the last mile refused (raw walk timeout after 6973ms (d=19.0))'), 'the raw hop\'s refusal is NOT a chest-walk-failed why')
  assert.ok(!ASK_WHY_RE.test('F11 food commons: chest walk failed after the nudge (water rescue in progress) and more'), 'the anchor holds')
  assert.equal(ASK_WHY_CLASSES[0].key, 'ceiling', 'the class order is part of the law - the ceiling reads first')
})

test("THE DECIDE'S OWN SKINS: the decide class is two anatomies with opposite cures (the v0.651.0 face's own split)", () => {
  // the skin laws: geometry vs budget, the first matching skin owns the why
  assert.equal(decideSkin('No path to the goal!'), 'noPath', 'the geometry skin - the stance cannot reach the chest')
  assert.equal(decideSkin('Took to long to decide path to goal!'), 'decideBudget', 'the budget skin - the pathfinder\'s slice expired')
  assert.equal(decideSkin('water rescue in progress (walk refused)'), 'unnamed', 'a non-decide why never wears a skin')
  assert.equal(decideSkin('the decide took a coffee break'), 'unnamed', 'the prose-drift guard - a decide-family grain that matches neither skin stays lossless')
  assert.equal(decideSkin(''), 'unnamed')
  assert.equal(decideSkin(null), 'unnamed')
  assert.equal(decideSkin(42), 'unnamed')
  assert.equal(DECIDE_SKIN_CLASSES[0].key, 'noPath', 'the skin order is part of the law - the geometry reads first')

  // the v0.651.0 face (fleet 37251959440) byte-exact shape: 26 decide whys
  // split no-path x14 vs decide-budget x12 - the fuel side ALL after-the-nudge
  // (17/17), the food side ALL first-walk (9/9), two lanes two seats
  const face = []
  for (let i = 0; i < 11; i++) face.push(`F${1 + (i % 3)} fuel commons: chest walk failed after the nudge (No path to the goal!)`)
  for (let i = 0; i < 6; i++) face.push(`F${4 + (i % 3)} fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)`)
  for (let i = 0; i < 3; i++) face.push(`F${7 + (i % 2)} food commons: chest walk failed (No path to the goal!)`)
  for (let i = 0; i < 6; i++) face.push(`F9 food commons: chest walk failed (Took to long to decide path to goal!)`)
  const c = askWhyCensus(face)
  assert.equal(c.whys.decide, 26, 'the owner class never changes - the additive law')
  assert.deepEqual(c.decideSkins, { noPath: 14, decideBudget: 12, unnamed: 0 }, 'the face\'s own split')
  assert.deepEqual(c.dryBySkin, { noPath: 0, decideBudget: 0, unnamed: 0 }, 'whys without terminals price no dry')

  // the dry join rides the skin when the last why was a decide
  const geo = askWhyCensus([
    'F5 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F5 fuel commons: budget spent (1/4 units)'
  ])
  assert.equal(geo.dryByWhy.decide, 3, 'the owner class still prices the dry')
  assert.equal(geo.dryBySkin.noPath, 3, 'the geometry seat owns its units by name')
  assert.equal(geo.dryBySkin.decideBudget, 0)
  const bud = askWhyCensus([
    'F6 food commons: chest walk failed (Took to long to decide path to goal!)',
    'F6 food commons: budget spent (0/2 units)'
  ])
  assert.equal(bud.dryBySkin.decideBudget, 2, 'the budget seat owns its units by name')
  // the cross-bot law holds for skins too: F5's skin never prices F9's terminal
  const cross = askWhyCensus([
    'F5 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F9 fuel commons: budget spent (0/7 units)'
  ])
  assert.equal(cross.dryByWhy.decide, 0)
  assert.deepEqual(cross.dryBySkin, { noPath: 0, decideBudget: 0, unnamed: 0 })
  // a terminal with no why prices nothing (the v0.652.0 law rides unchanged)
  const silent = askWhyCensus(['F2 fuel commons: budget spent (0/6 units)'])
  assert.deepEqual(silent.dryBySkin, { noPath: 0, decideBudget: 0, unnamed: 0 })
})

test("THE DECIDE'S OWN SIDES: the skins ride two ladders with different anatomies (the v0.651.0 face's own side split)", () => {
  // the side laws: the verb names the row, junk names nothing
  assert.equal(askSide('F5 fuel commons: chest walk failed (No path to the goal!)'), 'fuel')
  assert.equal(askSide('F11 food commons: budget spent (0/4 units)'), 'food')
  assert.equal(askSide('F9 iron commune: chest walk failed (No path to the goal!)'), null, 'a non-ask ladder never wears a side')
  assert.equal(askSide('not a line'), null)
  assert.equal(askSide(''), null)
  assert.equal(askSide(null), null)
  assert.equal(askSide(42), null)
  assert.deepEqual(ASK_SIDES, ['fuel', 'food'], 'the side order is part of the law')

  // the v0.651.0 face byte-exact side split: fuel no-path x11 / decide-budget
  // x6, food no-path x3 / decide-budget x6 (fuel ALL after-the-nudge 17/17,
  // food ALL first-walk 9/9)
  const face = []
  for (let i = 0; i < 11; i++) face.push(`F${1 + (i % 3)} fuel commons: chest walk failed after the nudge (No path to the goal!)`)
  for (let i = 0; i < 6; i++) face.push(`F${4 + (i % 3)} fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)`)
  for (let i = 0; i < 3; i++) face.push(`F${7 + (i % 2)} food commons: chest walk failed (No path to the goal!)`)
  for (let i = 0; i < 6; i++) face.push(`F9 food commons: chest walk failed (Took to long to decide path to goal!)`)
  const c = askWhyCensus(face)
  assert.deepEqual(c.sides.fuel, { noPath: 11, decideBudget: 6, unnamed: 0 }, 'the fuel side owns the post-nudge geometry mass')
  assert.deepEqual(c.sides.food, { noPath: 3, decideBudget: 6, unnamed: 0 }, 'the food side owns the first-walk budget mass')
  assert.equal(c.sides.fuel.noPath + c.sides.fuel.decideBudget + c.sides.food.noPath + c.sides.food.decideBudget, 26, 'the side slice conserves the decide mass')

  // the dry rides the why's own side (the conservation: the side slice of the
  // decide pricing)
  const geo = askWhyCensus([
    'F5 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F5 fuel commons: budget spent (1/4 units)'
  ])
  assert.equal(geo.dryBySide.fuel.noPath, 3)
  assert.equal(geo.dryBySide.food.noPath, 0)
  const bud = askWhyCensus([
    'F6 food commons: chest walk failed (Took to long to decide path to goal!)',
    'F6 food commons: budget spent (0/2 units)'
  ])
  assert.equal(bud.dryBySide.food.decideBudget, 2, 'the food budget seat owns its dry by name')
  // the cross-SIDE law: F5's fuel why never prices F9's food terminal
  const cross = askWhyCensus([
    'F5 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F9 food commons: budget spent (0/7 units)'
  ])
  assert.equal(cross.dryByWhy.decide, 0, 'the cross-bot law covers the cross-side case too (different bots)')
  assert.deepEqual(cross.dryBySide, { fuel: { noPath: 0, decideBudget: 0, unnamed: 0 }, food: { noPath: 0, decideBudget: 0, unnamed: 0 } })
  // the same bot's cross-side join: the why's own side names the dry row
  // (the pure-slice law - 'the last refusal wins' keeps its side)
  const samebot = askWhyCensus([
    'F5 fuel commons: chest walk failed (Took to long to decide path to goal!)',
    'F5 food commons: budget spent (0/5 units)'
  ])
  assert.equal(samebot.dryByWhy.decide, 5, 'the per-bot join law rides unchanged (the v0.652.0 convention)')
  assert.equal(samebot.dryBySide.fuel.decideBudget, 5, 'the dry rides the WHY\'s side - the slice stays pure')
  assert.equal(samebot.dryBySide.food.decideBudget, 0)
  // a non-decide why never prices a side row
  const wet = askWhyCensus([
    'F8 fuel commons: chest walk failed (water rescue in progress)',
    'F8 fuel commons: budget spent (0/3 units)'
  ])
  assert.deepEqual(wet.sides.fuel, { noPath: 0, decideBudget: 0, unnamed: 0 })
  assert.deepEqual(wet.dryBySide.fuel, { noPath: 0, decideBudget: 0, unnamed: 0 })
})
