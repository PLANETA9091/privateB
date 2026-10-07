// THE DEATH KIND CENSUS (v0.425.0): the vertical-death front's mechanical
// leg. The sweep (v0.389.0) LISTS the fleet's real deaths; every mine still
// counted the KIND by hand off the announce text. The census reads the
// server's own verdict from the announce payload ('cause: server: fell from
// a high place [kind=fall] | inferred: ...') - the server kind stays the
// authority (the v0.117.0 doctrine), the census never re-adjudicates. The
// verbatims are the faces 26/27 field lines (the F-9 front's witnesses:
// face 27's F14 fall is the class's live death; face 26's two deaths read
// drown + mob, vertical 0).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { deathKindCensus, deathKindBill, deathKindBillRow, deathKindRiders, deathKindRidersRow, mobAttackerBill, mobAttackerBillRow, mobAttackerRiders, mobAttackerRidersRow } from '../../src/lib/deathkinds.mjs'

// the face-27 verbatims (36870593766), byte for byte from the artifact
const FACE27_FALL = 'F14 [F14] died - respawning (cause: server: fell from a high place [kind=fall] | inferred: fall/env (0s before death at [-132,45,405]) [the inference corroborates the server verdict])'
const FACE27_DROWN = 'F5 [F5] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-115,47,400]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
const FACE27_MOB = 'F4 [F4] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.5 (0s before death at [-110,66,400]) [the inference corroborates the server verdict])'
const FACE27_DROWN_F10 = 'F10 [F10] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-134,60,393]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
const FACE27_DROWN_F6 = 'F6 [F6] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-132,52,410]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'

// the face-26 verbatims (36864564525)
const FACE26_DROWN = 'F14 [F14] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-125,53,372]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
const FACE26_MOB = 'F4 [F4] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@9.7 (0s before death at [-128,65,397]) [the inference corroborates the server verdict])'

test('the face-27 fall: the vertical family counts, the death cell and the corroboration ride the row', () => {
  const c = deathKindCensus([FACE27_FALL])
  assert.equal(c.total, 1)
  assert.equal(c.byKind.fall, 1)
  assert.equal(c.verticalCount, 1)
  assert.equal(c.vertical[0].bot, 'F14')
  assert.equal(c.vertical[0].verb, 'fell from a high place')
  assert.equal(c.vertical[0].attacker, null)
  assert.deepEqual(c.vertical[0].pos, [-132, 45, 405])
  assert.equal(c.vertical[0].corroboration, 'corroborates')
})

test('the face-26 pair: drown + mob, vertical 0 - the census splits what the hand counted before', () => {
  const c = deathKindCensus([FACE26_DROWN, FACE26_MOB])
  assert.equal(c.total, 2)
  assert.equal(c.byKind.drown, 1)
  assert.equal(c.byKind.mob, 1)
  assert.equal(c.verticalCount, 0)
  assert.deepEqual(c.byBot, { F14: 1, F4: 1 })
  // the mob row keeps the server's named killer
  assert.equal(deathKindCensus([FACE26_MOB]).byKind.mob, 1)
  assert.equal(deathKindCensus([FACE26_MOB]).vertical.length, 0)
})

test('the face-27 full anatomy: 5 deaths, the context lines never count', () => {
  const c = deathKindCensus([
    FACE27_FALL,
    'F14 [F14] death drop: pocket read empty at death (0u)', // context-shaped, not an announce
    'F14 [F14] water: death spot memorized as a hazard at [-132,45,405] (4 live, fleet-wide)',
    FACE27_DROWN,
    'F5 [F5] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg unknown, wet 26s)',
    FACE27_MOB,
    FACE27_DROWN_F10,
    FACE27_DROWN_F6
  ])
  assert.equal(c.total, 5)
  assert.equal(c.byKind.fall, 1)
  assert.equal(c.byKind.drown, 3)
  assert.equal(c.byKind.mob, 1)
  assert.equal(c.verticalCount, 1)
  assert.equal(c.unparsed.length, 0)
})

test('the inference verdict names itself the way the line prints it', () => {
  assert.equal(deathKindCensus([FACE27_FALL]).vertical[0].corroboration, 'corroborates')
  assert.equal(deathKindCensus([FACE27_DROWN]).total, 1) // the blind tail parses clean
  assert.equal(deathKindCensus([FACE27_DROWN]).verticalCount, 0) // drown is not the vertical family
})

test('the void phrasing rides the vertical family (kind=other today, vertical by verb)', () => {
  const voidLine = 'F9 [F9] died - respawning (cause: server: fell out of the world [kind=other] | inferred: fall/env (0s before death at [-100,1,300]) [the inference corroborates the server verdict])'
  const c = deathKindCensus([voidLine])
  assert.equal(c.total, 1)
  assert.equal(c.byKind.other, 1)
  assert.equal(c.verticalCount, 1)
  assert.deepEqual(c.vertical[0].pos, [-100, 1, 300])
})

test('an announce without the inferred tail still counts (junk-safe, honest absence)', () => {
  const bare = 'F7 [F7] died - respawning (cause: server: starved to death [kind=starve])'
  const c = deathKindCensus([bare])
  assert.equal(c.total, 1)
  assert.equal(c.byKind.starve, 1)
  assert.equal(c.verticalCount, 0)
  assert.equal(c.unparsed.length, 0)
})

test('an announce-shaped line the payload cannot parse surfaces in the escape hatch - never vanishes', () => {
  const weird = 'F3 [F3] died - respawning (cause: server: unknown death phrasing x2 [kind=Other] )'
  const c = deathKindCensus([weird])
  assert.equal(c.total, 0)
  assert.equal(c.unparsed.length, 1)
  assert.equal(c.unparsed[0], weird)
})

test('junk battery: non-strings, prose and keyword carriers judge nothing (the FATAL-truncation lesson)', () => {
  const c = deathKindCensus([null, undefined, 42, '', {}, [], 'F15 steer hazard defer: coal_ore@-122,58,384 held behind the ledger (a death is a cost the deficit cannot repay, the tail keeps the option)', 'bots=19 spawned=19 alive=19 climbs=28'])
  assert.equal(c.total, 0)
  assert.equal(c.verticalCount, 0)
  assert.deepEqual(c.byKind, {})
  assert.deepEqual(c.unparsed, [])
})

test('a non-array input judges nothing (junk-safe by contract)', () => {
  assert.equal(deathKindCensus(null).total, 0)
  assert.equal(deathKindCensus(undefined).verticalCount, 0)
  assert.equal(deathKindCensus('F1 [F1] died - respawning (cause: server: drowned [kind=drown])').total, 0)
})

test('WIRING: the decompose prints the causes row and the vertical rows (the DEATHS block)', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /import \{ deathKindCensus, deathKindBill, deathKindBillRow, deathKindRiders, deathKindRidersRow, mobAttackerBill, mobAttackerBillRow, mobAttackerRiders, mobAttackerRidersRow \} from '\.\.\/\.\.\/src\/lib\/deathkinds\.mjs'/, 'the census import rides the decompose head (v0.784.0: the kind seat rides too; v0.788.0: the attacker seat rides too)')
  assert.match(src, /death causes: \$\{causeRow\}\$\{inferredNote\}\$\{unparsedNote\}/, 'the mechanical causes row prints on every face (v0.672.0: the inferred-only note rides too)')
  assert.match(src, /vertical death: \$\{v\.bot\}/, 'the vertical row names the front\'s witness')
})

// (v0.672.0) THE FIELD WITNESS - run37397155884 line 2477, byte for byte:
// the authFresh-false row that sank into the escape hatch and opened THE
// ARC'S FIRST DISPUTE (the causes row read 9, the death clock said 10).
const RUN15_INFERRED_DROWN = 'F16 [F16] died - respawning (cause: drowning (0s before death at [-122,48,403]))'

test('THE FIELD WITNESS: the inferred-only drowning row joins the census - the arc reads the clock raw', () => {
  const c = deathKindCensus([RUN15_INFERRED_DROWN])
  assert.equal(c.total, 1)
  assert.equal(c.byKind.drown, 1)
  assert.deepEqual(c.byBot, { F16: 1 })
  assert.equal(c.unparsed.length, 0)
  assert.equal(c.inferredOnlyCount, 1)
  assert.equal(c.inferredOnly[0].bot, 'F16')
  assert.equal(c.inferredOnly[0].name, 'drowning')
  assert.equal(c.inferredOnly[0].kind, 'drown')
  assert.equal(c.inferredOnly[0].attacker, null)
  assert.deepEqual(c.inferredOnly[0].pos, [-122, 48, 403])
  assert.equal(c.verticalCount, 0) // drown is not the vertical family
})

test('the inferred-only hostile row: the name@dist shape names the mob family and the attacker', () => {
  const line = 'F9 [F9] died - respawning (cause: zombie@2.2 (0.3s before death at [-110,64,410]))'
  const c = deathKindCensus([line])
  assert.equal(c.total, 1)
  assert.equal(c.byKind.mob, 1)
  assert.equal(c.inferredOnlyCount, 1)
  assert.equal(c.inferredOnly[0].kind, 'mob')
  assert.equal(c.inferredOnly[0].attacker, 'zombie')
  assert.deepEqual(c.inferredOnly[0].pos, [-110, 64, 410])
})

test('the inferred-only fall row rides the vertical family - honest inferred-only corroboration', () => {
  const line = 'F7 [F7] died - respawning (cause: fall/env (0s before death at [-130,52,411]))'
  const c = deathKindCensus([line])
  assert.equal(c.total, 1)
  assert.equal(c.byKind.fall, 1)
  assert.equal(c.verticalCount, 1)
  assert.equal(c.vertical[0].verb, 'fall/env')
  assert.equal(c.vertical[0].corroboration, 'inferred-only')
  assert.deepEqual(c.vertical[0].pos, [-130, 52, 411])
})

test('the stale-harm unknown row counts as kind unknown (never the hatch)', () => {
  const line = 'F2 [F2] died - respawning (cause: unknown (no hp drop in the last 6s at [-126,50,408]))'
  const c = deathKindCensus([line])
  assert.equal(c.total, 1)
  assert.equal(c.byKind.unknown, 1)
  assert.equal(c.inferredOnlyCount, 1)
  assert.equal(c.inferredOnly[0].kind, 'unknown')
  assert.equal(c.inferredOnly[0].attacker, null)
})

test('server-verdict rows NEVER read inferred-only (the v0.117.0 doctrine untouched)', () => {
  const c = deathKindCensus([FACE27_FALL, FACE27_DROWN, FACE27_MOB, FACE26_MOB])
  assert.equal(c.total, 4)
  assert.equal(c.inferredOnlyCount, 0)
  assert.deepEqual(c.inferredOnly, [])
})

test('the mixed face: server rows + the inferred row count together - the dispute closes', () => {
  // run37397155884's anatomy: 3 parsed server rows + F16's inferred row =
  // the death clock's 4; before v0.672.0 the row read 3 + UNPARSED 1.
  const c = deathKindCensus([
    FACE27_FALL,
    FACE27_DROWN,
    FACE27_MOB,
    RUN15_INFERRED_DROWN
  ])
  assert.equal(c.total, 4)
  assert.equal(c.byKind.drown, 2)
  assert.equal(c.byKind.fall, 1)
  assert.equal(c.byKind.mob, 1)
  assert.equal(c.inferredOnlyCount, 1)
  assert.equal(c.unparsed.length, 0)
})

test('a genuinely alien announce shape still surfaces in the escape hatch', () => {
  const alien = 'F5 [F5] died - respawning (cause: the void opened beneath (a phrasing no rule knows))'
  const c = deathKindCensus([alien])
  assert.equal(c.total, 0)
  assert.equal(c.unparsed.length, 1)
})

// (v0.674.0) THE OTHER-VERB CENSUS - the run37403158305-era class: the
// spear debut ('was speared by Zombie' x2, kind=other) sat LUMPED in
// other=2 until the decode read the death lines by hand. The tally
// surfaces every honest-'other' verb BY ITS WORDS (the byte-exact run16
// field rows below).
const RUN16_SPEAR_F3 = 'F3 [F3] died - respawning (cause: server: was speared by Zombie [kind=other] | inferred: zombie@2.0 (0s before death at [-99,67,420]))'
const RUN16_SPEAR_F18 = 'F18 [F18] died - respawning (cause: server: was speared by Zombie [kind=other] | inferred: zombie@1.7 (0s before death at [-113,65,414]))'

test('THE OTHER-VERB CENSUS: the spear debut names itself (the run16 pair, byte-exact)', () => {
  const c = deathKindCensus([RUN16_SPEAR_F3, RUN16_SPEAR_F18])
  assert.equal(c.total, 2)
  assert.equal(c.byKind.other, 2)
  assert.deepEqual(c.otherVerbs, { 'was speared by Zombie': 2 })
  assert.equal(c.inferredOnlyCount, 0) // server-verdict rows, not inferred-only
})

test('the other-verb tally never pollutes from the other kinds (split stays clean)', () => {
  const c = deathKindCensus([FACE27_FALL, FACE27_MOB, RUN16_SPEAR_F3])
  assert.equal(c.total, 3)
  assert.deepEqual(c.otherVerbs, { 'was speared by Zombie': 1 })
})

test('the void phrasing (kind=other) tallies its own verb honestly', () => {
  const voidLine = 'F9 [F9] died - respawning (cause: server: fell out of the world [kind=other] | inferred: fall/env (0s before death at [-100,1,300]) [the inference corroborates the server verdict])'
  const c = deathKindCensus([voidLine])
  assert.deepEqual(c.otherVerbs, { 'fell out of the world': 1 })
  // a mixed other face sorts the verbs into one census
  const c2 = deathKindCensus([voidLine, voidLine, RUN16_SPEAR_F18])
  assert.deepEqual(c2.otherVerbs, { 'fell out of the world': 2, 'was speared by Zombie': 1 })
})

test('WIRING: the decompose prints the other-verb census row', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /other-verb census: \$\{ovs\.map/, 'the honest-other verbs print by their words')
})

// (v0.713.0) THE INFERENCE'S OWN BILL - the era's real tails, byte-exact.
// The 40th's 12 deaths: 8 agree / 4 disagree; corroborates 7, blind 2,
// contradicts 2 (the emitter prints 'CONTRADICTS' uppercase - the
// v0.425.0 case-sensitive match missed the byte), bystander 1 (the
// explosion's own skin - the exploder removed itself, the scan read the
// next-nearest hostile). The server kind stays the authority.
const FACE40_SKELETON_CONTRADICTS = 'F10 [F10] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: fall/env (0s before death at [-124,64,402]) [the inference CONTRADICTS the server verdict - the nearest harm was not the killer (the server kind stays the authority)])'
const FACE40_SPIDER_CONTRADICTS = 'F7 [F7] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: spider@1.2 (0s before death at [-133,64,444]) [the inference CONTRADICTS the server verdict - the nearest harm was not the killer (the server kind stays the authority)])'
const FACE40_CREEPER_BYSTANDER = 'F2 [F2] died - respawning (cause: server: was blown up by Creeper [kind=explosion by Creeper] | inferred: zombie@0.5 (0s before death at [-163,64,413]) [the inference names a BYSTANDER - the exploder removed itself at detonation, the nearest-harm scan read the next-nearest hostile (a real witness, not the killer; the server killer stays the authority)])'
const FACE40_DROWN_BLIND = 'F6 [F6] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-118,49,394]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
const FACE40_ZOMBIE_AGREE = 'F13 [F13] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.6 (0s before death at [-151,63,425]) [the inference corroborates the server verdict])'

test("the inference's own bill: the era's two-way read byte-exact (the 40th's 12)", () => {
  const c = deathKindCensus([
    FACE40_SKELETON_CONTRADICTS, // mob|fall/env - kindDisagree, contradicts
    FACE40_SPIDER_CONTRADICTS, // mob|spider - kindAgree (both mob), contradicts
    FACE40_CREEPER_BYSTANDER, // explosion|zombie - kindDisagree, bystander
    FACE40_DROWN_BLIND, // drown|fall/env - kindDisagree, blind
    FACE40_ZOMBIE_AGREE // mob|zombie - kindAgree, corroborates
  ])
  assert.equal(c.total, 5)
  assert.deepEqual(c.inference, {
    total: 5, corroborates: 1, blind: 1, contradicts: 2, bystander: 1,
    unknown: 0, absent: 0, kindAgree: 2, kindDisagree: 3,
    confusions: { 'mob->fall': 1, 'explosion->mob': 1, 'drown->fall': 1 },
    o2Blind: { n: 0, pairs: {}, bots: {} }
  })
  // the case byte: the emitter's 'CONTRADICTS' lands in contradicts now
  // (the v0.425.0 bracket match was case-sensitive and read it unknown)
  const alone = deathKindCensus([FACE40_SKELETON_CONTRADICTS])
  assert.equal(alone.inference.contradicts, 1)
  assert.equal(alone.inference.unknown, 0)
  // the bystander tail is the explosion's own skin (the 37th's Creeper
  // pair rides it - the fire-2240 'blind to the kind' note corrected)
  const by = deathKindCensus([FACE40_CREEPER_BYSTANDER])
  assert.equal(by.inference.bystander, 1)
  assert.equal(by.inference.blind, 0)
})

test("the inference's own bill: the honest silence and the junk battery", () => {
  // a deathless face reads the zero bill
  const c = deathKindCensus(['F1 [F1] combat: fighting zombie (dist 2.0, hp 20.0, 0 nearby, proximity)'])
  assert.deepEqual(c.inference, {
    total: 0, corroborates: 0, blind: 0, contradicts: 0, bystander: 0,
    unknown: 0, absent: 0, kindAgree: 0, kindDisagree: 0, confusions: {},
    o2Blind: { n: 0, pairs: {}, bots: {} }
  })
  // junk-safe: the non-string rows judge nothing
  const j = deathKindCensus([42, null, undefined])
  assert.deepEqual(j.inference, {
    total: 0, corroborates: 0, blind: 0, contradicts: 0, bystander: 0,
    unknown: 0, absent: 0, kindAgree: 0, kindDisagree: 0, confusions: {},
    o2Blind: { n: 0, pairs: {}, bots: {} }
  })
  // the spear pair (kind=other, inferred zombie) disagrees at the kind
  // join - the server kind stays the authority, the bill only measures
  const spear = deathKindCensus([RUN16_SPEAR_F3])
  assert.equal(spear.inference.kindDisagree, 1)
  assert.equal(spear.inference.kindAgree, 0)
})

// (v0.719.0) THE CONFUSION'S OWN PAIRS - the 43rd's five kind joins,
// the lines byte-verbatim from the stored face: the drown kind misread
// twice (the creeper CONTRADICTS + the fall/env blind) and the
// explosion kind misread three times (the fall/env blind + two
// BYSTANDER zombies). The witness's own blind seats, named per pair.
const FACE43_DROWN_CREEPER = 'F12 [F12] died - respawning (cause: server: drowned [kind=drown] | inferred: creeper@11.4 (0s before death at [-127,48,412]) [the inference CONTRADICTS the server verdict - the nearest harm was not the killer (the server kind stays the authority)])'
const FACE43_DROWN_FALL = 'F11 [F11] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-126,53,408]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
const FACE43_EXPLOSION_FALL = 'F16 [F16] died - respawning (cause: server: was blown up by Creeper [kind=explosion by Creeper] | inferred: fall/env (0s before death at [-112,66,408]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
const FACE43_EXPLOSION_ZOMBIE_A = 'F11 [F11] died - respawning (cause: server: was blown up by Creeper [kind=explosion by Creeper] | inferred: zombie@2.9 (0s before death at [-166,64,449]) [the inference names a BYSTANDER - the exploder removed itself at detonation, the nearest-harm scan read the next-nearest hostile (a real witness, not the killer; the server killer stays the authority)])'
const FACE43_EXPLOSION_ZOMBIE_B = 'F15 [F15] died - respawning (cause: server: was blown up by Creeper [kind=explosion by Creeper] | inferred: zombie@1.2 (0s before death at [-170,65,421]) [the inference names a BYSTANDER - the exploder removed itself at detonation, the nearest-harm scan read the next-nearest hostile (a real witness, not the killer; the server killer stays the authority)])'

test("the confusion's own pairs: the 43rd's kind joins named per pair (byte-verbatim)", () => {
  const c = deathKindCensus([
    FACE43_DROWN_CREEPER,
    FACE43_DROWN_FALL,
    FACE43_EXPLOSION_FALL,
    FACE43_EXPLOSION_ZOMBIE_A,
    FACE43_EXPLOSION_ZOMBIE_B
  ])
  assert.equal(c.inference.kindDisagree, 5)
  assert.deepEqual(c.inference.confusions, {
    'drown->mob': 1,
    'drown->fall': 1,
    'explosion->fall': 1,
    'explosion->mob': 2
  })
  // the pair map rides the additive law: the v0.713.0 cells stay byte-stable
  assert.equal(c.inference.total, 5)
  assert.equal(c.inference.kindAgree, 0)
  assert.equal(c.inference.contradicts, 1)
  assert.equal(c.inference.bystander, 2)
  assert.equal(c.inference.blind, 2)
})

test("the confusion's own pairs: the honest silence - an all-agree face never opens the map", () => {
  const c = deathKindCensus([FACE27_FALL, FACE27_MOB])
  assert.equal(c.inference.kindDisagree, 0)
  assert.deepEqual(c.inference.confusions, {})
  // a mixed face keeps only the pairs that lied (the 40th's skeleton
  // contradict rides mob->fall; the spider's contradict agrees at the
  // kind join - both mob - so it opens no pair)
  const mixed = deathKindCensus([FACE40_SKELETON_CONTRADICTS, FACE40_SPIDER_CONTRADICTS])
  assert.deepEqual(mixed.inference.confusions, { 'mob->fall': 1 })
  assert.equal(mixed.inference.contradicts, 2)
})

// (v0.725.0) THE MISREAD'S OWN WITNESS - the confusion's own context join.
// The 47th (run 37524391418) named the class: ALL THREE drown->fall
// confusions rode the death context's o2 reset(-1) skin (the sensor died
// and the water kept the bot) - the witness's own blindness has an
// anatomy. The lines below carry the face's own bytes.

test("the 47th's confused trio: every drown->fall rode the dead sensor - the o2Blind join reads the adjacency", () => {
  // the face's own bytes: the death row, the breath mirror interleaved,
  // the context line (the join survives the interleave - the log prints
  // them 1-3 lines apart)
  const d1 = 'F1 [F1] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-126,53,408]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
  const m1 = 'F1 [F1] water: breath mirror [rescue-ran] - the rescue lane owned the death window (paged 1.1s before death) - its own timeline lines own the failure (o2 reset(-1), head WET, snapshot 1.1s old)'
  const c1 = 'F1 [F1] death: drown context (o2 reset(-1), feet water, head water, rescue active, leg fuel commons walk @-126,414, wet 14s)'
  const d2 = 'F13 [F13] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-137,54,428]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
  const c2 = 'F13 [F13] death: drown context (o2 reset(-1), feet water, head water, rescue active, leg fuel commons walk @-136,418 (nudge retry), wet 6s)'
  const d3 = 'F10 [F10] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-134,51,411]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
  const c3 = 'F10 [F10] death: drown context (o2 reset(-1), feet water, head water, rescue active, leg deploy, wet 3s)'
  // the five mob agrees - no drown context follows (the death drop owns
  // their wake), the pending drops honestly
  const mobs = [
    'F12 [F12] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.9 (0s before death at [-180,64,421]) [the inference corroborates the server verdict])',
    'F19 [F19] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.5 (0s before death at [-95,66,435]) [the inference corroborates the server verdict])',
    'F2 [F2] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@11.4 (0s before death at [-110,66,399]) [the inference corroborates the server verdict])',
    'F10 [F10] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.8 (0s before death at [-140,64,430]) [the inference corroborates the server verdict])',
    'F5 [F5] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.5 (0s before death at [-139,64,448]) [the inference corroborates the server verdict])'
  ]
  const c = deathKindCensus([d1, m1, c1, d2, c2, d3, c3, ...mobs])
  // the v0.713.0/v0.719.0 cells byte-stable
  assert.equal(c.inference.total, 8)
  assert.equal(c.inference.corroborates, 5)
  assert.equal(c.inference.blind, 3)
  assert.equal(c.inference.kindAgree, 5)
  assert.equal(c.inference.kindDisagree, 3)
  assert.deepEqual(c.inference.confusions, { 'drown->fall': 3 })
  // the new cell: every confusion rode the dead sensor
  assert.deepEqual(c.inference.o2Blind, {
    n: 3,
    pairs: { 'drown->fall': 3 },
    bots: { F1: 1, F13: 1, F10: 1 }
  })
  assert.equal(c.unparsed.length, 0)
})

test('the join never invents - the drops, the agree row and the counted o2 skin resolve without counting', () => {
  // (i) the confused death whose context never comes - the next death
  // row replaces the pending (the confusion still counts, the witness
  // stays silent)
  const noContext = deathKindCensus([
    'F7 [F7] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-120,50,400]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
    FACE27_MOB
  ])
  assert.deepEqual(noContext.inference.confusions, { 'drown->fall': 1 })
  assert.deepEqual(noContext.inference.o2Blind, { n: 0, pairs: {}, bots: {} })
  // (ii) the kindAgree drown death with a reset context - the join
  // prices the LIE's witness, not the sensor's toll (the v0.707.0
  // census's own subject)
  const agree = deathKindCensus([
    'F6 [F6] died - respawning (cause: server: drowned [kind=drown] | inferred: drowning@0.5 (0s before death at [-118,49,402]) [the inference corroborates the server verdict])',
    'F6 [F6] death: drown context (o2 reset(-1), feet water, head water, rescue active, leg walk, wet 9s)'
  ])
  assert.equal(agree.inference.kindAgree, 1)
  assert.equal(agree.inference.kindDisagree, 0)
  assert.deepEqual(agree.inference.o2Blind, { n: 0, pairs: {}, bots: {} })
  // (iii) the confused death whose context rode the counted skin (o2 0)
  // - the mirror read zero, the sensor SPOKE - resolves without counting
  const counted = deathKindCensus([
    'F8 [F8] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-122,51,404]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
    'F8 [F8] death: drown context (o2 0, feet water, head water, rescue active, leg walk, wet 4s)'
  ])
  assert.deepEqual(counted.inference.confusions, { 'drown->fall': 1 })
  assert.deepEqual(counted.inference.o2Blind, { n: 0, pairs: {}, bots: {} })
  // (iv) another bot's context speaks for nobody (F8's context cannot
  // resolve F7's pending confusion)
  const cross = deathKindCensus([
    'F7 [F7] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-120,50,400]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
    'F8 [F8] death: drown context (o2 reset(-1), feet water, head water, rescue active, leg walk, wet 4s)'
  ])
  assert.deepEqual(cross.inference.confusions, { 'drown->fall': 1 })
  assert.deepEqual(cross.inference.o2Blind, { n: 0, pairs: {}, bots: {} })
})

test("the drowned-kill fence - the 42nd's other grammar stays outside the join", () => {
  // the 42nd's F16 byte: the Drowned KILL rides 'drowned-kill context'
  // (a different grammar, kind=mob) - a confused mob death followed by
  // it resolves nothing (the fence: the cell prices what the drown
  // context owns)
  const mobConfused = 'F16 [F16] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: fall/env (0s before death at [-107,63,368]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
  const c = deathKindCensus([
    mobConfused,
    'F16 [F16] death: drowned-kill context (dry-shore, y 63, feet air, head air, water none)'
  ])
  assert.deepEqual(c.inference.confusions, { 'mob->fall': 1 })
  assert.deepEqual(c.inference.o2Blind, { n: 0, pairs: {}, bots: {} })
})

test("the zero shape and the class's debut - the face-27 anatomy retro-reads the join", () => {
  // the junk battery rides the zero shape (the FATAL-truncation lesson)
  const empty = deathKindCensus([42, 'prose', null, ''])
  assert.deepEqual(empty.inference.o2Blind, { n: 0, pairs: {}, bots: {} })
  assert.deepEqual(deathKindCensus([]).inference.o2Blind, { n: 0, pairs: {}, bots: {} })
  assert.deepEqual(deathKindCensus(null).inference.o2Blind, { n: 0, pairs: {}, bots: {} })
  // the class's debut: the face-27 anatomy's own confused drown death
  // (F5, rescue never) rode the reset context - the join retro-reads it
  const debut = deathKindCensus([
    FACE27_FALL,
    'F14 [F14] death drop: pocket read empty at death (0u)',
    FACE27_DROWN,
    'F5 [F5] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg unknown, wet 26s)',
    FACE27_MOB
  ])
  assert.deepEqual(debut.inference.confusions, { 'drown->fall': 1 })
  assert.deepEqual(debut.inference.o2Blind, {
    n: 1,
    pairs: { 'drown->fall': 1 },
    bots: { F5: 1 }
  })
})

// (v0.784.0) THE DEATHS' OWN KIND - the seat + the riders. The face-77
// and face-75 verbatims byte for byte from the artifacts (37658837046,
// 37649886742) - the mine's own answer: the owner churns face-local
// (mob 73 -> drown 74 -> duet 75 -> explosion 76 -> drown 77), the seat
// re-names the front every face.
const FACE77_DROWN_F4 = 'F4 [F4] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-137,51,414]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
const FACE77_DROWN_F10 = 'F10 [F10] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-103,41,385]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
const FACE77_FALL_F2 = 'F2 [F2] died - respawning (cause: server: fell from a high place [kind=fall] | inferred: fall/env (0s before death at [-107,44,393]) [the inference corroborates the server verdict])'
const FACE77_INFERRED_F19 = 'F19 [F19] died - respawning (cause: drowning (0s before death at [-129,48,395]))'
const FACE75_MOB_F2 = 'F2 [F2] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@3.3 (0s before death at [-128,41,434]) [the inference corroborates the server verdict])'
const FACE76_EXPLOSION_F14 = 'F14 [F14] died - respawning (cause: server: was blown up by Creeper [kind=explosion by Creeper] | inferred: skeleton@14.0 (0s before death at [-137,64,419]) [the inference names a BYSTANDER - the exploder removed itself at detonation, the nearest-harm scan read the next-nearest hostile (a real witness, not the killer; the server killer stays the authority)])'

test('the face-77 cell through the seat - the drown majority owns the book, the inferred-only rides its own bucket', () => {
  // face 77's own death book: 3 server drowns + 1 inferred-only drowning
  // (the v0.672.0 law reads the clock raw into the same buckets) + 1 fall
  // - the seat reads the census's own byKind cell, zero re-parsing
  const c = deathKindCensus([
    FACE77_DROWN_F4, FACE77_DROWN_F10, FACE77_DROWN_F10, FACE77_DROWN_F4,
    FACE77_FALL_F2, FACE77_INFERRED_F19
  ])
  assert.deepEqual(c.byKind, { drown: 5, fall: 1 })
  assert.equal(c.inferredOnlyCount, 1)
  const b = deathKindBill(c)
  assert.deepEqual(b, { kind: 'drown', owns: 5, ofDeaths: 6, shareOfDeaths: 0.833 })
  assert.equal(
    deathKindBillRow(b),
    "the deaths' own kind (v0.784.0): drown owns 5 of 6 death(s) (83.3%) - THE KIND'S OWN SEAT: one kind's own deaths own the book - the kind's own front prices the deaths the raw split rode unnamed"
  )
  // the riders stay a MEASURE even in the owner case (the seat's own
  // precedent) - the decompose's branch law leaves the companion
  // unprinted when the seat is owned (pinned in the WIRING assert)
  const m = deathKindRiders(c)
  assert.equal(m.leader, 'drown')
  assert.equal(m.runner, 'fall')
})

test("the face-75 duet - the tie law holds the seat silent, the riders measure the mix, the byte order pins 'explosion' < 'fall'", () => {
  // face 75's own book: drown=5 mob=5 fall=1 - 5 <= 6, no solo majority
  const c = deathKindCensus([
    FACE77_DROWN_F4, FACE77_DROWN_F10, FACE77_DROWN_F4, FACE77_DROWN_F10, FACE77_DROWN_F4,
    FACE75_MOB_F2, FACE75_MOB_F2, FACE75_MOB_F2, FACE75_MOB_F2, FACE75_MOB_F2,
    FACE77_FALL_F2
  ])
  assert.deepEqual(c.byKind, { drown: 5, mob: 5, fall: 1 })
  assert.equal(deathKindBill(c), null) // the tie law: the seat owns nothing
  const r = deathKindRiders(c)
  assert.equal(r.duet, true)
  assert.equal(r.leader, 'drown')
  assert.equal(r.runner, 'mob') // 5 vs 5 - the name's own byte breaks the rank order
  assert.equal(
    deathKindRidersRow(r),
    "the deaths' own kind riders (v0.784.0): no solo kind owns the majority - drown x5 + mob x5 own 10 of 11 death(s) (90.9%) - THE KIND'S OWN MIX: the seat's tie law held, the mix is the shape - the deaths' own crowd prices the kinds the solo law refused to name"
  )
  // the byte order pin: an equal-count mix ranks by the name's own byte
  const bytes = deathKindRiders(deathKindCensus([FACE77_FALL_F2, FACE76_EXPLOSION_F14]))
  assert.equal(bytes.leader, 'explosion') // 'explosion' < 'fall' byte-true
  assert.equal(bytes.duet, true)
})

test('the byte-exact rows and the junk battery - the unknown fence, the non-finite cells, the honest silence', () => {
  // face 76's own single death: explosion owns 1 of 1 (100.0%)
  const solo = deathKindBill(deathKindCensus([FACE76_EXPLOSION_F14]))
  assert.equal(
    deathKindBillRow(solo),
    "the deaths' own kind (v0.784.0): explosion owns 1 of 1 death(s) (100.0%) - THE KIND'S OWN SEAT: one kind's own deaths own the book - the kind's own front prices the deaths the raw split rode unnamed"
  )
  // the unknown fence: a death nobody named a kind for closes no seat
  const fenced = { byKind: { drown: 2, unknown: 3 } }
  assert.deepEqual(deathKindBill(fenced), { kind: 'drown', owns: 2, ofDeaths: 2, shareOfDeaths: 1 })
  // the junk battery - the honest silence every time
  const junk = [null, undefined, 42, 'prose', [], { byKind: null }, { byKind: 'x' }, { byKind: [] }, { byKind: {} }, { byKind: { drown: 0 } }, { byKind: { drown: -1 } }, { byKind: { drown: NaN } }, { byKind: { drown: Infinity } }]
  for (const j of junk) {
    assert.equal(deathKindBill(j), null)
    assert.equal(deathKindRiders(j), null)
  }
  // a lone kind prices no mix (the riders' own fence)
  assert.equal(deathKindRiders({ byKind: { mob: 3 } }), null)
  // the rows' own junk law - the honest silence's row
  assert.equal(deathKindBillRow(null), null)
  assert.equal(deathKindBillRow({}), null)
  assert.equal(deathKindBillRow({ kind: '', owns: 1, ofDeaths: 2, shareOfDeaths: 0.5 }), null)
  assert.equal(deathKindBillRow({ kind: 'drown', owns: 3, ofDeaths: 2, shareOfDeaths: 1.5 }), null)
  assert.equal(deathKindRidersRow(null), null)
  assert.equal(deathKindRidersRow({}), null)
  assert.equal(deathKindRidersRow({ leader: 'drown', leaderOwns: 0, runner: 'mob', runnerOwns: 1, ofDeaths: 1, pairOwns: 1, shareOfDeaths: 1 }), null)
})

test('the WIRING assert - the decompose branch rides the seat, the prose lives only in the lib', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('const kb = deathKindBill(kinds)'), 'the seat rides the census cell')
  assert.ok(src.includes('if (kb) console.log(`  ${deathKindBillRow(kb)}`)'), 'the owner row rides the branch')
  assert.ok(src.includes('const kr = deathKindRiders(kinds)'), 'the riders ride the same branch law')
  // the lib prose: the row tails live in the lib, never duplicated in decompose
  assert.ok(!src.includes("THE KIND'S OWN SEAT"), 'the prose stays in the lib')
})

// (v0.788.0) THE MOB BOOK'S OWN ATTACKER - the seat + the riders on the
// census's own byAttacker cell (the server-verdict mob rows' named
// killer). The face-79 verbatims (37668633803, THE DEATH STORM): the
// readout rode 'mob=9' with the species split unnamed - Zombie 5 +
// Skeleton 3 + Drowned 1. The face-69 verbatims (37617643599): the
// Drowned pair + the Enderman + the Zombie four.
const F79_ZOMBIE_F6 = 'F6 [F6] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@1.7 (0s before death at [-92,67,427]) [the inference corroborates the server verdict])'
const F79_ZOMBIE_F18 = 'F18 [F18] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.5 (0s before death at [-123,64,400]) [the inference corroborates the server verdict])'
const F79_SKELETON = 'F3 [F3] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@9.7 (0s before death at [-128,65,397]) [the inference corroborates the server verdict])'
const F79_DROWNED = 'F5 [F5] died - respawning (cause: server: was slain by Drowned [kind=mob by Drowned] | inferred: drowned@1.5 (0s before death at [-115,47,400]) [the inference corroborates the server verdict])'
const F69_ENDERMAN = 'F4 [F4] died - respawning (cause: server: was slain by Enderman [kind=mob by Enderman] | inferred: enderman@1.5 (0s before death at [-125,64,412]) [the inference corroborates the server verdict])'

test('the face-79 death storm: Zombie owns 5 of 9 (55.6%) - the mob book\'s own attacker seats the species', () => {
  const c = deathKindCensus([
    F79_ZOMBIE_F6, F79_ZOMBIE_F18, F79_ZOMBIE_F18, F79_ZOMBIE_F6, F79_ZOMBIE_F18,
    F79_SKELETON, F79_SKELETON, F79_SKELETON,
    F79_DROWNED
  ])
  assert.deepEqual(c.byKind, { mob: 9 })
  assert.deepEqual(c.byAttacker, { Zombie: 5, Skeleton: 3, Drowned: 1 })
  const b = mobAttackerBill(c)
  assert.deepEqual(b, { attacker: 'Zombie', owns: 5, ofKills: 9, shareOfKills: 0.556 })
  assert.equal(
    mobAttackerBillRow(b),
    "the mob book's own attacker (v0.788.0): Zombie owns 5 of 9 mob kill(s) (55.6%) - THE ATTACKER'S OWN SEAT: one server-named killer owns the mob book - the attacker's own front prices the kills the raw split rode unnamed"
  )
  // the riders stay a MEASURE even in the owner case - the decompose's
  // branch law leaves the companion unprinted when the seat is owned
  const m = mobAttackerRiders(c)
  assert.equal(m.leader, 'Zombie')
  assert.equal(m.runner, 'Skeleton')
})

test('the face-75 duet - the tie law holds the seat silent, the byte order pins Skeleton < Zombie, the explosion kind stays outside', () => {
  // face 75's own mob book: Zombie 2 + Skeleton 2 + Drowned 1 - 2 <= 3
  const c = deathKindCensus([
    F79_ZOMBIE_F6, F79_ZOMBIE_F18,
    F79_SKELETON, F79_SKELETON,
    F79_DROWNED
  ])
  assert.deepEqual(c.byAttacker, { Zombie: 2, Skeleton: 2, Drowned: 1 })
  assert.equal(mobAttackerBill(c), null) // the tie law: the seat owns nothing
  const r = mobAttackerRiders(c)
  assert.equal(r.duet, true)
  assert.equal(r.leader, 'Skeleton') // 2 vs 2 - the name's own byte breaks the rank tie ('Skeleton' < 'Zombie')
  assert.equal(r.runner, 'Zombie')
  assert.equal(
    mobAttackerRidersRow(r),
    "the mob book's own attacker riders (v0.788.0): no solo killer owns the majority - Skeleton x2 + Zombie x2 own 4 of 5 mob kill(s) (80.0%) - THE ATTACKER'S OWN MIX: the seat's tie law held, the mix is the shape - the mob's own crowd prices the killers the solo law refused to name"
  )
  // the explosion kind carries no 'by' tail - the grammar's own fence
  // keeps the creeper outside the mob book (the kind is the seat's subject)
  const mixed = deathKindCensus([F79_ZOMBIE_F6, 'F14 [F14] died - respawning (cause: server: blew up [kind=explosion] | inferred: creeper@0.5 (0s before death at [-110,66,400]) [the inference names a BYSTANDER])'])
  assert.deepEqual(mixed.byAttacker, { Zombie: 1 })
  assert.equal(mobAttackerBill(mixed).owns, 1)
})

test('the inferred-only fence and the below-half law - the inference bytes stay outside the mob book', () => {
  // the inferred-only shape's lowercase name never joins the seat's cell
  // (the server verdict stays the authority - the v0.117.0 doctrine)
  const inf = deathKindCensus(['F16 [F16] died - respawning (cause: zombie@0.6 (0s before death at [-122,48,403]))'])
  assert.deepEqual(inf.byAttacker, {}) // the inference's own capture depth
  assert.equal(inf.byKind.mob, 1) // the kind still joins (the v0.672.0 law)
  assert.equal(mobAttackerBill(inf), null)
  assert.equal(mobAttackerRiders(inf), null)
  // a below-half killer seats nobody (the strict-majority law)
  const below = deathKindCensus([F79_ZOMBIE_F6, F79_ZOMBIE_F18, F79_SKELETON, F79_SKELETON, F79_SKELETON, F79_DROWNED, F69_ENDERMAN])
  assert.deepEqual(below.byAttacker, { Zombie: 2, Skeleton: 3, Drowned: 1, Enderman: 1 })
  assert.equal(mobAttackerBill(below), null) // 3 of 7 is a plurality, not a majority
  const rb = mobAttackerRiders(below)
  assert.equal(rb.leader, 'Skeleton')
  assert.equal(rb.runner, 'Zombie')
})

test('the byte-exact rows, the junk battery and the WIRING assert - the decompose branch rides the cell, the prose lives only in the lib', () => {
  // face 73's own pair: Zombie owns 2 of 2 (100.0%)
  const solo = mobAttackerBill(deathKindCensus([F79_ZOMBIE_F6, F79_ZOMBIE_F18]))
  assert.equal(
    mobAttackerBillRow(solo),
    "the mob book's own attacker (v0.788.0): Zombie owns 2 of 2 mob kill(s) (100.0%) - THE ATTACKER'S OWN SEAT: one server-named killer owns the mob book - the attacker's own front prices the kills the raw split rode unnamed"
  )
  // the junk battery - the honest silence every time
  const junk = [null, undefined, 42, 'prose', [], { byAttacker: null }, { byAttacker: 'x' }, { byAttacker: [] }, { byAttacker: {} }, { byAttacker: { Zombie: 0 } }, { byAttacker: { Zombie: -1 } }, { byAttacker: { Zombie: NaN } }, { byAttacker: { Zombie: Infinity } }]
  for (const j of junk) {
    assert.equal(mobAttackerBill(j), null)
    assert.equal(mobAttackerRiders(j), null)
  }
  // a lone killer prices no mix (the riders' own fence)
  assert.equal(mobAttackerRiders({ byAttacker: { Zombie: 3 } }), null)
  // the rows' own junk law - the honest silence's row
  assert.equal(mobAttackerBillRow(null), null)
  assert.equal(mobAttackerBillRow({}), null)
  assert.equal(mobAttackerBillRow({ attacker: '', owns: 1, ofKills: 2, shareOfKills: 0.5 }), null)
  assert.equal(mobAttackerBillRow({ attacker: 'Zombie', owns: 3, ofKills: 2, shareOfKills: 1.5 }), null)
  assert.equal(mobAttackerRidersRow(null), null)
  assert.equal(mobAttackerRidersRow({}), null)
  assert.equal(mobAttackerRidersRow({ leader: 'Zombie', leaderOwns: 0, runner: 'Skeleton', runnerOwns: 1, ofKills: 1, pairOwns: 1, shareOfKills: 1 }), null)
  // the WIRING assert - the decompose branch rides the cell, the prose
  // lives only in the lib
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('const mab = mobAttackerBill(kinds)'), 'the seat rides the census cell')
  assert.ok(src.includes('if (mab) console.log(`  ${mobAttackerBillRow(mab)}`)'), 'the owner row rides the branch')
  assert.ok(src.includes('const mar = mobAttackerRiders(kinds)'), 'the riders ride the same branch law')
  assert.ok(!src.includes("THE ATTACKER'S OWN SEAT"), 'the prose stays in the lib')
})
