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
import { deathKindCensus } from '../../src/lib/deathkinds.mjs'

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
  assert.match(src, /import \{ deathKindCensus \} from '\.\.\/\.\.\/src\/lib\/deathkinds\.mjs'/, 'the census import rides the decompose head')
  assert.match(src, /death causes: \$\{causeRow\}\$\{unparsedNote\}/, 'the mechanical causes row prints on every face')
  assert.match(src, /vertical death: \$\{v\.bot\}/, 'the vertical row names the front\'s witness')
})
