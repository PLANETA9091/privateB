// THE ASK'S OWN WHY BOOK - the census's own tests (v0.652.0).
// The face that prices the shape: fleet 37249185472 (the v0.650.0 face, the
// water storm) - 36 dry 'budget spent' terminals, the ask ladder's whys
// (the decide class, the fleet goal ceiling, the water rescue interlock)
// riding NO census anywhere in the mining surface.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askWhyCensus, askWhyClass, decideSkin, askSide, governorRunBucket, dryAskVerdict, dryAskVerdictRow, dryAskBotBill, dryAskBotBillRow, dryAskRiders, dryAskRidersRow, ASK_TERMINAL_RE, ASK_WHY_RE, ASK_WHY_CLASSES, ASK_WHY_LEVERS, DECIDE_SKIN_CLASSES, ASK_SIDES, GOVERNOR_RUN_BUCKETS } from '../../src/lib/askwhycensus.mjs'

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
  assert.equal(c.dryByWhy.decide + c.dryByWhy.ceiling + c.dryByWhy.water + c.dryByWhy.governor + c.dryByWhy.timeout + c.dryByWhy.goalChanged + c.dryByWhy.unnamed, 0, 'no why, no class - the junk never invents (the v0.203.0 law)')
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
  assert.equal(askWhyClass('walk governor: bot churned 4 goals without progress - food commons walk @-152,392 refused for 8s'), 'governor', 'the per-bot churn refusal rides its OWN class - NOT the ceiling family (a progress-aware refusal, not a budget-aware one)')
  assert.equal(askWhyClass('The goal was changed before it could be completed!'), 'goalChanged', 'the superseded goal is the ask ladder\u0027s own churn witness')
  assert.equal(askWhyClass(''), 'unnamed')
  assert.equal(askWhyClass(null), 'unnamed')
  assert.equal(askWhyClass(42), 'unnamed')
})

test('THE ASK WHY CENSUS: the junk battery (the parser judges nothing it cannot read)', () => {
  // the junk-safe law: non-strings judge nothing, junk shapes never match
  assert.deepEqual(askWhyCensus(null), { terminals: 0, unitsDry: 0, whys: { ceiling: 0, water: 0, governor: 0, decide: 0, timeout: 0, goalChanged: 0, unnamed: 0 }, dryByWhy: { ceiling: 0, water: 0, governor: 0, decide: 0, timeout: 0, goalChanged: 0, unnamed: 0 }, decideSkins: { noPath: 0, decideBudget: 0, unnamed: 0 }, dryBySkin: { noPath: 0, decideBudget: 0, unnamed: 0 }, sides: { fuel: { noPath: 0, decideBudget: 0, unnamed: 0 }, food: { noPath: 0, decideBudget: 0, unnamed: 0 }, iron: { noPath: 0, decideBudget: 0, unnamed: 0 } }, dryBySide: { fuel: { noPath: 0, decideBudget: 0, unnamed: 0 }, food: { noPath: 0, decideBudget: 0, unnamed: 0 }, iron: { noPath: 0, decideBudget: 0, unnamed: 0 } }, governorRuns: { len1: 0, len2: 0, len3: 0, len4plus: 0 }, whysByBot: {} })
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
  assert.equal(ASK_WHY_CLASSES[2].key, 'governor', 'the governor sits with the throttle family (after the water interlock, before the decide)')
  assert.equal(ASK_WHY_CLASSES[5].key, 'goalChanged', 'the goal-changed grain closes the class law before the unnamed fallback')
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
  // (v0.659.0) the iron commune IS an ask ladder now - it wears its own side
  assert.equal(askSide('F16 iron commune: chest walk failed (No path to the goal!)'), 'iron', 'the iron ladder wears its own side (the third ask ladder)')
  assert.equal(askSide('F9 fuel bank: chest walk failed (No path to the goal!)'), null, 'a non-ask ladder never wears a side')
  assert.equal(askSide('F9 iron commune: budget spent (0/3 units)'), 'iron', 'the iron terminal names its side too')
  assert.equal(askSide('not a line'), null)
  assert.equal(askSide(''), null)
  assert.equal(askSide(null), null)
  assert.equal(askSide(42), null)
  assert.deepEqual(ASK_SIDES, ['fuel', 'food', 'iron'], 'the side order is part of the law (the iron joins third, the v0.659.0 join)')

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
  assert.deepEqual(cross.dryBySide, { fuel: { noPath: 0, decideBudget: 0, unnamed: 0 }, food: { noPath: 0, decideBudget: 0, unnamed: 0 }, iron: { noPath: 0, decideBudget: 0, unnamed: 0 } })
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

test("THE IRON LADDER'S OWN JOIN: the third ask ladder's own mass joins the census (the v0.656.0 face's own iron read)", () => {
  // fleet 37258915708 (the v0.656.0 face, the calm-ish one) - the iron mass
  // rode NO census before this join: 5 chest-walk-failed whys (4 timeout +
  // 1 decide) + 2 budget-spent terminals (6u dry). THE FACE'S OWN LINES in
  // file order (3 of the 4 timeouts name ONE chest @-128,387 - and the SAME
  // chest refused the food ladder: one chest, three ladders refused)
  const face = [
    'F16 iron commune: chest walk failed (iron commune walk @-128,387: timeout after 14967ms)',
    'F16 iron commune: budget spent (0/3 units)',
    'F19 iron commune: chest walk failed (Took to long to decide path to goal!)',
    'F19 iron commune: chest walk failed (iron commune walk @-129,387: timeout after 890ms)',
    'F19 iron commune: budget spent (0/3 units)',
    'F1 iron commune: chest walk failed (iron commune walk @-128,387: timeout after 726ms)',
    'F18 iron commune: chest walk failed (iron commune walk @-128,387: timeout after 1724ms)'
  ]
  const c = askWhyCensus(face)
  assert.equal(c.terminals, 2, 'the iron terminals count (the same budget-spent vocabulary)')
  assert.equal(c.unitsDry, 6, '2 x 3u dry - the iron strand prices its mass')
  assert.deepEqual(c.whys, { ceiling: 0, water: 0, governor: 0, decide: 1, timeout: 4, goalChanged: 0, unnamed: 0 }, 'the class regexes are ladder-agnostic - the iron whys ride the SAME classes')
  assert.deepEqual(c.dryByWhy, { ceiling: 0, water: 0, governor: 0, decide: 0, timeout: 6, goalChanged: 0, unnamed: 0 }, 'both terminals\' last why was a timeout (the last refusal wins)')
  assert.deepEqual(c.decideSkins, { noPath: 0, decideBudget: 1, unnamed: 0 }, 'the iron decide grain wears the budget skin')
  assert.deepEqual(c.sides.iron, { noPath: 0, decideBudget: 1, unnamed: 0 }, 'the iron side prices its own decide mass')
  assert.deepEqual(c.sides.fuel, { noPath: 0, decideBudget: 0, unnamed: 0 }, 'the fuel side stays untouched')
  assert.deepEqual(c.sides.food, { noPath: 0, decideBudget: 0, unnamed: 0 }, 'the food side stays untouched')
  assert.deepEqual(c.dryBySide.iron, { noPath: 0, decideBudget: 0, unnamed: 0 }, 'F19\'s decide was followed by a timeout - the last refusal prices the dry, not the decide')
  // the conservation law with iron aboard: every ask why names its side
  const sumSkins = c.sides.fuel.noPath + c.sides.fuel.decideBudget + c.sides.food.noPath + c.sides.food.decideBudget + c.sides.iron.noPath + c.sides.iron.decideBudget
  assert.equal(sumSkins, c.decideSkins.noPath + c.decideSkins.decideBudget, 'the side slice conserves the decide mass over ALL THREE ladders')
  // the iron decide's own dry join: the last-refusal-wins law per side
  const ironDecide = askWhyCensus([
    'F5 iron commune: chest walk failed (Took to long to decide path to goal!)',
    'F5 iron commune: budget spent (0/2 units)'
  ])
  assert.equal(ironDecide.dryByWhy.decide, 2, 'the iron decide prices the dry by name')
  assert.equal(ironDecide.dryBySide.iron.decideBudget, 2, 'the iron side\'s own dry seat (the conservation law\'s scope grows with the join)')
  // the junk laws: the iron ladder judges nothing it cannot read
  const junk = askWhyCensus([
    'F9 iron commune: chest walk failed (the objective was changed by the junk)',
    'F9 iron commune: budget spent (junk)',
    'F9 iron commune: chest holds 0 ingot(s) + 0 raw_iron - nothing to complete here'
  ])
  assert.equal(junk.whys.unnamed, 1, 'prose without the marker stays unnamed (the v0.583.0 law)')
  assert.equal(junk.terminals, 0, 'a malformed iron terminal never counts')
  assert.equal(junk.unitsDry, 0, 'the empty-chest line is the ladder\'s own early exit, not a why - it judges nothing')
})

test("THE GOVERNOR'S OWN CLASS: the unnamed bucket's grain priced by name (the v0.653.0 mob storm face's own read)", () => {
  // fleet 37254403895 (the v0.653.0 face, the mob storm: 14 deaths) read the
  // ask why census with unnamed x7 - the raw grain named the anatomy itself:
  // the walk governor x6 (ALL food-side: F18 x3 + F8 x3 - the food ladder's
  // walks churn-refused, the food side's own mass OUTSIDE the decide skins)
  // plus the goal-changed grain x1 (the calm face's unnamed x1 again). The
  // face's own lines, verbatim and in file order:
  const face = [
    'F10 fuel commons: budget spent (0/1 units)',
    'F4 fuel commons: budget spent (0/1 units)',
    'F5 fuel commons: chest walk failed after the nudge (fleet goal ceiling: 30 goals fleet-wide in 5s - fuel commons walk @-154,408 (nudge retry) refused for 2s)',
    'F5 fuel commons: budget spent (0/1 units)',
    'F13 fuel commons: budget spent (0/1 units)',
    'F18 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
    'F18 fuel commons: budget spent (0/1 units)',
    'F3 fuel commons: budget spent (0/1 units)',
    'F1 fuel commons: budget spent (0/1 units)',
    'F17 fuel commons: budget spent (0/1 units)',
    'F7 fuel commons: budget spent (0/1 units)',
    'F11 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
    'F11 fuel commons: budget spent (0/1 units)',
    'F19 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F19 fuel commons: budget spent (0/1 units)',
    'F15 fuel commons: chest walk failed after the nudge (fuel commons walk @-129,418 (nudge retry): timeout after 4994ms)',
    'F15 fuel commons: budget spent (0/1 units)',
    'F14 fuel commons: budget spent (0/1 units)',
    'F13 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F13 fuel commons: budget spent (0/1 units)',
    'F11 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F11 fuel commons: budget spent (0/1 units)',
    'F12 fuel commons: budget spent (0/1 units)',
    'F5 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F5 fuel commons: budget spent (0/1 units)',
    'F4 fuel commons: budget spent (0/1 units)',
    'F19 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F14 fuel commons: chest walk failed after the nudge (No path to the goal!)',
    'F14 fuel commons: budget spent (0/1 units)',
    'F19 fuel commons: budget spent (0/1 units)',
    'F13 fuel commons: budget spent (0/1 units)',
    'F1 food commons: chest walk failed (The goal was changed before it could be completed!)',
    'F1 food commons: chest walk failed (Took to long to decide path to goal!)',
    'F18 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-152,392 refused for 8s)',
    'F18 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-150,392 refused for 8s)',
    'F18 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-154,408 refused for 8s)',
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-129,418 refused for 12s)',
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-134,418 refused for 12s)',
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-134,416 refused for 12s)'
  ]
  const c = askWhyCensus(face)
  assert.equal(c.terminals, 21, 'the face\'s own 21 dry terminals')
  assert.equal(c.unitsDry, 21, 'each terminal read 1 unit dry (0 of 1)')
  assert.equal(c.whys.unnamed, 0, 'the unnamed bucket EMPTY - the storm face\'s grain all named')
  assert.equal(c.whys.governor, 6, 'the walk governor x6 - the food ladder\'s own churn-refusal mass')
  assert.equal(c.whys.goalChanged, 1, 'the superseded goal\'s own witness')
  assert.equal(c.whys.ceiling, 1)
  assert.equal(c.whys.decide, 9, 'the owner class never changes - the additive law')
  assert.equal(c.whys.timeout, 1)
  assert.equal(c.whys.water, 0)
  // the dry rows byte-stable: the governor and goal-changed whys price no
  // terminal on this face (no ask terminal followed them) - the re-classing
  // moves COUNTS only, the dry stays where the last-refusal law put it
  assert.equal(c.dryByWhy.ceiling, 1)
  assert.equal(c.dryByWhy.decide, 8)
  assert.equal(c.dryByWhy.timeout, 1)
  assert.equal(c.dryByWhy.governor, 0)
  assert.equal(c.dryByWhy.goalChanged, 0)
  assert.equal(c.dryByWhy.unnamed, 0)
  // the decide skins ride unchanged (the second face CONFIRMS the split:
  // noPath owns the mass again, 6 vs 3 - the geometry seat)
  assert.deepEqual(c.decideSkins, { noPath: 6, decideBudget: 3, unnamed: 0 })
  assert.deepEqual(c.dryBySkin, { noPath: 6, decideBudget: 2, unnamed: 0 })
  // the side slice: the fuel side owns the decide dry AGAIN (8u of 8u); the
  // food side's decide mass is ONE budget why - the food side's REAL mass is
  // the governor, which the decide-skin slice cannot price (its own seat)
  assert.deepEqual(c.sides.fuel, { noPath: 6, decideBudget: 2, unnamed: 0 })
  assert.deepEqual(c.sides.food, { noPath: 0, decideBudget: 1, unnamed: 0 })
  assert.deepEqual(c.dryBySide.fuel, { noPath: 6, decideBudget: 2, unnamed: 0 })
  assert.deepEqual(c.dryBySide.food, { noPath: 0, decideBudget: 0, unnamed: 0 })

  // the governor's own dry join: when a terminal DOES follow a governor why,
  // the dry prices the governor class (the last refusal wins - the same law)
  const gov = askWhyCensus([
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-129,418 refused for 12s)',
    'F8 food commons: budget spent (0/2 units)'
  ])
  assert.equal(gov.dryByWhy.governor, 2, 'the governor seat owns its units by name')
  assert.equal(gov.whys.governor, 1)
  // a non-decide why never wears a skin: the governor's mass stays OUT of
  // the decide-skin rows (the skins slice stays pure - the v0.653.0 law)
  assert.deepEqual(gov.decideSkins, { noPath: 0, decideBudget: 0, unnamed: 0 })
  // the goal-changed grain's own dry join
  const gc = askWhyCensus([
    'F1 food commons: chest walk failed (The goal was changed before it could be completed!)',
    'F1 food commons: budget spent (0/3 units)'
  ])
  assert.equal(gc.dryByWhy.goalChanged, 3, 'the goal-changed seat owns its units by name')
  // the junk laws ride: junk never becomes a governor
  assert.equal(askWhyCensus(['F5 fuel commons: chest walk failed (walk governor junk without the colon prose)']).whys.governor, 0, 'the prose without the governor\'s own marker stays unnamed - the junk never invents')
  assert.equal(askWhyCensus(['F5 fuel commons: chest walk failed (the objective was changed by the junk)']).whys.goalChanged, 0, 'the prose without the goal-changed marker stays unnamed - the junk never invents (the v0.583.0 law)')
})

test("THE GOVERNOR'S OWN RUNS: the consecutive-refusal anatomy (the two mob-storm faces' own read)", () => {
  // the bucket laws: a closed run of n governor whys rides its own bucket
  assert.equal(governorRunBucket(1), 'len1')
  assert.equal(governorRunBucket(2), 'len2')
  assert.equal(governorRunBucket(3), 'len3')
  assert.equal(governorRunBucket(4), 'len4plus')
  assert.equal(governorRunBucket(9), 'len4plus', 'every run of 4+ rides one bucket - the spiral signature needs no finer grain')
  assert.equal(governorRunBucket(0), null, 'a run of zero never existed - the junk never invents')
  assert.equal(governorRunBucket(-1), null)
  assert.equal(governorRunBucket(1.5), null)
  assert.equal(governorRunBucket('x'), null)
  assert.equal(governorRunBucket(null), null)
  assert.deepEqual(GOVERNOR_RUN_BUCKETS, ['len1', 'len2', 'len3', 'len4plus'], 'the bucket order is part of the law')

  // the run laws: one bot's back-to-back governor whys are ONE run (EOF closes)
  const triplet = askWhyCensus([
    'F18 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-152,392 refused for 8s)',
    'F18 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-150,392 refused for 8s)',
    'F18 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-154,408 refused for 8s)'
  ])
  assert.deepEqual(triplet.governorRuns, { len1: 0, len2: 0, len3: 1, len4plus: 0 }, 'three consecutive refusals = the spiral signature')
  // a NON-governor why closes the run (the refusal chain changed its mind)
  const broke = askWhyCensus([
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-129,418 refused for 12s)',
    'F8 food commons: chest walk failed (No path to the goal!)',
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-134,418 refused for 12s)'
  ])
  assert.deepEqual(broke.governorRuns, { len1: 2, len2: 0, len3: 0, len4plus: 0 }, 'the decide why between the governors breaks the run')
  // a TERMINAL closes the run (the ladder's outcome happened)
  const termed = askWhyCensus([
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-129,418 refused for 12s)',
    'F8 food commons: budget spent (0/1 units)',
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-134,418 refused for 12s)'
  ])
  assert.deepEqual(termed.governorRuns, { len1: 2, len2: 0, len3: 0, len4plus: 0 }, 'the terminal closes the bot\'s open run')
  // the cross-bot law for runs: interleaved governors are SEPARATE runs
  const cross = askWhyCensus([
    'F18 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-152,392 refused for 8s)',
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-129,418 refused for 12s)',
    'F18 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-150,392 refused for 8s)',
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-134,418 refused for 12s)'
  ])
  assert.deepEqual(cross.governorRuns, { len1: 0, len2: 2, len3: 0, len4plus: 0 }, 'each bot\'s run grows only from its OWN refusals (F18 x2 = a run of 2, F8 x2 = a run of 2 - the runs weave, never merge)')
  // the run WEAVES across other bots' lines (per-bot independence)
  const weave = askWhyCensus([
    'F18 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-152,392 refused for 8s)',
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-129,418 refused for 12s)',
    'F18 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-150,392 refused for 8s)'
  ])
  assert.deepEqual(weave.governorRuns, { len1: 1, len2: 1, len3: 0, len4plus: 0 }, 'F18\'s run of 2 weaves through F8\'s run of 1')

  // fleet 37256535767 (the v0.655.0 face, the mob storm's twin) byte-exact:
  // the governor x7 = F15's singleton (the FIRST fuel-side governor, the
  // post-nudge retry) + F1's triplet + F7's triplet (F7's three no-path whys
  // sit BEFORE its governor run - the decide mass and the run are separate)
  const twin = askWhyCensus([
    'F15 fuel commons: budget spent (0/1 units)',
    'F15 fuel commons: chest walk failed after the nudge (walk governor: bot churned 4 goals without progress - fuel commons walk @-128,393 (nudge retry) refused for 12s)',
    'F7 food commons: chest walk failed (No path to the goal!)',
    'F7 food commons: chest walk failed (No path to the goal!)',
    'F7 food commons: chest walk failed (No path to the goal!)',
    'F1 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-139,411 refused for 12s)',
    'F1 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-139,409 refused for 12s)',
    'F1 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-139,413 refused for 12s)',
    'F7 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-139,415 refused for 12s)',
    'F7 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-139,413 refused for 12s)',
    'F7 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-144,415 refused for 12s)'
  ])
  assert.equal(twin.whys.governor, 7)
  assert.equal(twin.whys.decide, 3, 'F7\'s pre-run no-path mass stays decide (the owner class never changes)')
  assert.deepEqual(twin.governorRuns, { len1: 1, len2: 0, len3: 2, len4plus: 0 }, 'the twin face\'s own run split: one singleton + two triplets')
  assert.equal(twin.dryByWhy.governor, 0, 'the runs are pure counts - the dry rows stay untouched (the conservation law)')

  // fleet 37254403895 (the v0.653.0 face, the mob storm) byte-exact tail:
  // the governor x6 = TWO triplets (F18 then F8, back-to-back in the log)
  const storm = askWhyCensus([
    'F1 food commons: chest walk failed (The goal was changed before it could be completed!)',
    'F1 food commons: chest walk failed (Took to long to decide path to goal!)',
    'F18 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-152,392 refused for 8s)',
    'F18 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-150,392 refused for 8s)',
    'F18 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-154,408 refused for 8s)',
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-129,418 refused for 12s)',
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-134,418 refused for 12s)',
    'F8 food commons: chest walk failed (walk governor: bot churned 4 goals without progress - food commons walk @-134,416 refused for 12s)'
  ])
  assert.equal(storm.whys.governor, 6)
  assert.deepEqual(storm.governorRuns, { len1: 0, len2: 0, len3: 2, len4plus: 0 }, 'the storm face\'s own run split: two triplets')
  // the spiral's own witness: each refusal names a DIFFERENT chest - the bot
  // churns through the exclusion while the governor holds (the lever's own
  // price: a run of 3 means the exclude+next-chest answer fed the churn)
  assert.ok(true, 'the run-length distribution is the lever\'s data - wire NOTHING until a fresh face prices it (the price-before-wire law)')
})

// (v0.769.0) THE DRY ASK'S OWN VERDICT - the face-69 cell: the mine's own
// 68 verbatim ask lines (37617643599, the held artifact, the log's own
// order) - the decide class owns the dry ask under the strict-majority law
// (22 of 34 why rows, the priced dry 31 of 41 units) with the crowded
// sky's own lever. The census's own cells stay byte-untouched beside it.
const FACE69_ASK_LINES = [
  "F6 fuel commons: chest walk failed after the nudge (fleet goal ceiling: 30 goals fleet-wide in 5s - fuel commons walk @-132,405 (nudge retry) refused for 4s)",
  "F6 fuel commons: budget spent (0/2 units)",
  "F12 fuel commons: budget spent (0/2 units)",
  "F8 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)",
  "F16 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)",
  "F16 fuel commons: budget spent (0/2 units)",
  "F8 fuel commons: budget spent (0/2 units)",
  "F3 fuel commons: budget spent (0/2 units)",
  "F2 fuel commons: budget spent (0/2 units)",
  "F1 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)",
  "F19 fuel commons: chest walk failed after the nudge (No path to the goal!)",
  "F11 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)",
  "F1 fuel commons: budget spent (0/2 units)",
  "F11 fuel commons: budget spent (0/2 units)",
  "F19 fuel commons: budget spent (0/2 units)",
  "F15 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)",
  "F15 fuel commons: budget spent (0/2 units)",
  "F18 fuel commons: budget spent (0/2 units)",
  "F7 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)",
  "F13 fuel commons: budget spent (0/2 units)",
  "F7 fuel commons: budget spent (0/2 units)",
  "F14 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)",
  "F5 fuel commons: budget spent (0/2 units)",
  "F9 fuel commons: budget spent (0/2 units)",
  "F17 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)",
  "F17 fuel commons: budget spent (0/2 units)",
  "F14 fuel commons: budget spent (0/2 units)",
  "F10 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)",
  "F10 fuel commons: budget spent (0/2 units)",
  "F12 fuel commons: chest walk failed after the nudge (water rescue in progress (fuel commons walk @-143,389 (nudge retry) refused))",
  "F12 fuel commons: budget spent (0/2 units)",
  "F11 fuel commons: chest walk failed after the nudge (No path to the goal!)",
  "F7 fuel commons: chest walk failed after the nudge (No path to the goal!)",
  "F11 fuel commons: budget spent (0/2 units)",
  "F7 fuel commons: budget spent (0/2 units)",
  "F9 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)",
  "F9 fuel commons: budget spent (0/2 units)",
  "F18 fuel commons: chest walk failed after the nudge (fuel commons walk @-107,411 (nudge retry): timeout after 12093ms)",
  "F18 fuel commons: budget spent (0/2 units)",
  "F10 fuel commons: chest walk failed after the nudge (No path to the goal!)",
  "F11 iron commune: chest walk failed (iron commune walk @-147,409: timeout after 6716ms)",
  "F10 iron commune: iron commune: chest walk failed after the nudge (No path to the goal!)",
  "F10 iron commune: chest walk failed (No path to the goal!)",
  "F10 iron commune: chest walk failed (No path to the goal!)",
  "F10 iron commune: chest walk failed (iron commune walk @-128,389: timeout after 1358ms)",
  "F5 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)",
  "F5 fuel commons: budget spent (0/2 units)",
  "F9 fuel commons: chest walk failed after the nudge (fuel commons walk @-147,415 (nudge retry): timeout after 4096ms)",
  "F9 fuel commons: budget spent (0/2 units)",
  "F11 fuel commons: budget spent (0/2 units)",
  "F1 iron commune: chest walk failed (goal brake: 6 goals in 5s - iron commune walk @-107,409 refused for 4s)",
  "F1 food commons: chest walk failed (goal brake: 6 goals in 5s - food commons walk @-107,411 refused for 4s)",
  "F1 food commons: chest walk failed (goal brake: 6 goals in 5s - food commons walk @-107,409 refused for 4s)",
  "F1 food commons: chest walk failed (goal brake: 6 goals in 5s - food commons walk @-107,415 refused for 4s)",
  "F18 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)",
  "F4 iron commune: chest walk failed (Took to long to decide path to goal!)",
  "F4 iron commune: budget spent (0/3 units)",
  "F16 fuel commons: budget spent (0/2 units)",
  "F14 end-bank budget spent - smelt skipped",
  "F5 smelt: 0 (raw_copper@blast_furnace: machine unreachable (visit budget spent (walk slice)))",
  "F7 end-bank budget spent - smelt skipped",
  "F1 end-bank budget spent - smelt skipped",
  "F11 food commons: chest walk failed (Took to long to decide path to goal!)",
  "F11 food commons: chest walk failed (Took to long to decide path to goal!)",
  "F10 end-bank budget spent - smelt skipped",
  "F11 food commons: chest walk failed (Took to long to decide path to goal!)",
  "F7 food commons: chest walk failed (fleet goal ceiling: 30 goals fleet-wide in 5s - food commons walk @-126,389 refused for 5s)",
  "F7 food commons: chest walk failed (fleet goal ceiling: 30 goals fleet-wide in 5s - food commons walk @-127,405 refused for 5s)",
]

test('v0.769.0 the face-69 verdict cell - the decide class owns the dry ask', () => {
  const c = askWhyCensus(FACE69_ASK_LINES)
  // the census's own cells byte-untouched (the decompose's own numbers)
  assert.equal(c.terminals, 28)
  assert.equal(c.unitsDry, 57)
  // the verdict: decide owns 22 of 34 why rows, the priced dry 31 of 41
  const v = dryAskVerdict(c)
  assert.deepEqual(v, {
    cls: 'decide', owns: 22, ofWhys: 34, shareOfWhys: 0.647,
    dryUnits: 31, dryPriced: 41, shareOfDry: 0.756,
    lever: ASK_WHY_LEVERS.decide,
  })
  assert.equal(dryAskVerdictRow(v), "the dry ask's own verdict (v0.769.0): decide owns 22 of 34 why row(s) (64.7%), the priced dry 31 of 41 unit(s) (75.6%): the decider's own clock is the front (the crowded sky's own law - the v0.727.0 lane prices the starve)")
})

test('v0.769.0 the verdict tie owns nothing + the zero book', () => {
  // a tied spread seats no class (the storm-has-no-seat precedent)
  const tie = askWhyCensus([
    'F5 fuel commons: chest walk failed (Took to long to decide path to goal!)',
    'F5 fuel commons: budget spent (0/1 units)',
    'F9 fuel commons: chest walk failed (fleet goal ceiling: 30 goals fleet-wide in 5s - food commons walk @-132,405 refused for 4s)',
    'F9 fuel commons: budget spent (0/1 units)',
  ])
  assert.equal(dryAskVerdict(tie), null)
  // a zero why book never invents a verdict (terminals without whys)
  const silent = askWhyCensus(['F5 fuel commons: budget spent (0/2 units)'])
  assert.equal(dryAskVerdict(silent), null)
})

test('v0.769.0 the verdict junk battery', () => {
  assert.equal(dryAskVerdict(null), null)
  assert.equal(dryAskVerdict('junk'), null)
  assert.equal(dryAskVerdict({ whys: null, dryByWhy: null }), null)
  // junk counts are skipped, never priced (the census's own junk law)
  const junk = dryAskVerdict({ whys: { decide: -1, ceiling: Number.NaN, governor: 3 }, dryByWhy: { decide: 5 } })
  assert.equal(junk.cls, 'governor')
  assert.equal(junk.owns, 3)
  assert.equal(junk.dryUnits, 0) // the governor priced no dry
  assert.equal(junk.dryPriced, 5)
  // the row never prints a junk seat
  assert.equal(dryAskVerdictRow(null), null)
  assert.equal(dryAskVerdictRow({ cls: '', owns: 1, ofWhys: 2, shareOfWhys: 0.5, dryUnits: 0, dryPriced: 0, shareOfDry: 0, lever: 'x' }), null)
  assert.equal(dryAskVerdictRow({ cls: 'decide', owns: 3, ofWhys: 2, shareOfWhys: 1.5, dryUnits: 0, dryPriced: 0, shareOfDry: 0, lever: 'x' }), null)
})

test('v0.769.0 the verdict rides the decompose mine (WIRING)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.equal(src.includes('dryAskVerdictRow'), true)
  assert.equal(src.includes("the dry ask's own verdict"), false) // the prose lives in the lib, never duplicated in the mine
})

// (v0.772.0) THE ASK'S OWN SEATS - the face-71 cell: the mine's own
// distribution rebuilt as the census's own lines (37627512023, the held
// artifact): ceiling 19 (F3 x8, F12 x3, F18 x3, F4 x3, F8 x2), decide 9
// (nine single-ask walkers), timeout 3 (F12, F13, F18). The verdict seats
// the ceiling class (19 of 31); the bill's tie law held (F3 8 of 19 = no
// majority) and the riders measure prices the spike (F3 x8 + F12 x3 own
// 11 of 19, 57.9%). The v0.769.0 verdict's own cells stay byte-untouched
// beside the seats.
function face71AskLines () {
  const lines = []
  const add = (bot, raw, n) => { for (let i = 0; i < n; i++) lines.push(`${bot} fuel commons: chest walk failed (${raw})`) }
  add('F3', 'fleet goal ceiling 1200', 8); add('F12', 'fleet goal ceiling 1200', 3)
  add('F18', 'fleet goal ceiling 1200', 3); add('F4', 'fleet goal ceiling 1200', 3)
  add('F8', 'fleet goal ceiling 1200', 2)
  for (const bot of ['F6', 'F10', 'F1', 'F5', 'F7', 'F2', 'F16', 'F15', 'F19']) add(bot, 'No path to the goal!', 1)
  add('F12', 'walk to chest (retry): timeout after 28090ms', 1)
  add('F13', 'walk to chest (retry): timeout after 28090ms', 1)
  add('F18', 'walk to chest (retry): timeout after 28090ms', 1)
  return lines
}

test('v0.772.0 the face-71 seats cell - the spike rides in the bill\'s own silence', () => {
  const c = askWhyCensus(face71AskLines())
  // the verdict's own cells byte-untouched (the ceiling owns 19 of 31)
  assert.deepEqual(c.whys, { ceiling: 19, water: 0, governor: 0, decide: 9, timeout: 3, goalChanged: 0, unnamed: 0 })
  const dav = dryAskVerdict(c)
  assert.equal(dav.cls, 'ceiling')
  assert.equal(dav.owns, 19)
  // the bot-level cell rides the census return (additive)
  assert.equal(c.whysByBot.F3.ceiling, 8)
  assert.equal(c.whysByBot.F3.decide, 0)
  // the bill's tie law held: F3 owns 8 of 19 - no majority
  assert.equal(dryAskBotBill(c), null)
  // the companion prices the spike, never an owner (F12 wins the runner
  // tier's own tie by the name's own order - F12 < F18 < F4)
  assert.deepEqual(dryAskRiders(c), { klass: 'ceiling', leader: 'F3', leaderOwns: 8, runner: 'F12', runnerOwns: 3, ofRows: 19, pairOwns: 11, shareOfRows: 0.579, duet: false })
  assert.equal(dryAskRidersRow(dryAskRiders(c)), 'the dry ask\'s own riders (v0.772.0): no solo asker owns the majority - F3 x8 + F12 x3 own 11 of 19 ceiling row(s) (57.9%) - THE SPIKE\'S OWN SEAT: the bill\'s tie law held, the concentration is still real - the pair prices the asks the solo law refused to name')
})

// (v0.772.0) the bill's own case: one walker owns the owner class's own
// majority - the seat names the repeat asker, the companion waits (the
// decompose's own branch law - one row, never both).
test('v0.772.0 the bill\'s own case + the branch law', () => {
  const lines = face71AskLines()
  for (let i = 0; i < 4; i++) lines.push('F3 fuel commons: chest walk failed (fleet goal ceiling 1200)') // F3 ceiling 8 -> 12 of 23
  const c = askWhyCensus(lines)
  const dav = dryAskVerdict(c)
  assert.equal(dav.owns, 23)
  const bill = dryAskBotBill(c)
  assert.deepEqual(bill, { klass: 'ceiling', bot: 'F3', owns: 12, ofRows: 23, shareOfRows: 0.522 })
  assert.equal(dryAskBotBillRow(bill), 'the dry ask\'s own bot bill (v0.772.0): F3 owns 12 of 23 ceiling row(s) (52.2%) - THE REPEAT ASKER\'S OWN SEAT: one walker\'s own lane owns the ask ladder\'s front - the verdict\'s own lever prices the walker\'s asks')
  // the decompose's own branch: the bill's row wins, the companion waits
  const branch = (c2) => (dryAskBotBill(c2) ? 'bill' : dryAskRiders(c2) ? 'riders' : 'silence')
  assert.equal(branch(c), 'bill')
  assert.equal(branch(askWhyCensus(face71AskLines())), 'riders')
  // a tie verdict (no owner class) seats nothing and measures nothing
  const tie = askWhyCensus([
    'F1 fuel commons: chest walk failed (fleet goal ceiling 1200)',
    'F2 fuel commons: chest walk failed (No path to the goal!)',
  ])
  assert.equal(dryAskBotBill(tie), null)
  assert.equal(dryAskRiders(tie), null)
})

// (v0.772.0) the seats junk battery: the missing/junk census, the missing
// or junk whysByBot, the single-walker book, the broken rows - the honest
// silence everywhere.
test('v0.772.0 the seats junk battery', () => {
  for (const junk of [undefined, null, 'nope', 42]) {
    assert.equal(dryAskBotBill(junk), null)
    assert.equal(dryAskRiders(junk), null)
  }
  // a census without the bot-level cell (the pre-v0.772.0 shape) never seats
  const bare = { whys: { ceiling: 3 }, dryByWhy: {} }
  assert.equal(dryAskBotBill(bare), null)
  assert.equal(dryAskRiders(bare), null)
  // junk bot entries are skipped, not priced
  const c = askWhyCensus(face71AskLines())
  c.whysByBot[''] = { ceiling: 99 } // the botless entry
  c.whysByBot.JUNK = 'nope' // the classless entry
  c.whysByBot.BAD = { ceiling: -1 } // the negative count
  assert.equal(dryAskBotBill(c), null) // F3 still 8 of 19 - no majority
  assert.deepEqual(dryAskRiders(c).leader, 'F3')
  for (const bad of [undefined, null, 'nope', 42,
    { klass: '', bot: 'F3', owns: 8, ofRows: 19, shareOfRows: 0.421 },
    { klass: 'ceiling', bot: '', owns: 8, ofRows: 19, shareOfRows: 0.421 },
    { klass: 'ceiling', bot: 'F3', owns: 0, ofRows: 19, shareOfRows: 0 },
    { klass: 'ceiling', bot: 'F3', owns: 20, ofRows: 19, shareOfRows: 1.053 },
  ]) { assert.equal(dryAskBotBillRow(bad), null); assert.equal(dryAskRidersRow(bad), null) }
})

// (v0.772.0) the WIRING assert: the decompose mine prints the seats in the
// verdict's own shadow (the bill's branch, the riders' else), the source's
// own guards read the census's own cells; the prose lives in the lib,
// never duplicated in the mine.
test('v0.772.0 the seats ride the decompose mine (WIRING)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.equal(src.includes('dryAskBotBillRow'), true)
  assert.equal(src.includes('dryAskRidersRow'), true)
  assert.equal(src.includes('else {'), true) // the riders only speak in the bill's silence
  assert.equal(src.includes("the dry ask's own bot bill"), false) // the prose lives in the lib
  assert.equal(src.includes("the dry ask's own riders"), false) // never duplicated in the mine
})
