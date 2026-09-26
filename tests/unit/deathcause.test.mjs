// Tests for the authoritative death-cause parser (src/lib/deathcause.mjs).
// The run102 mine (35889087936, the v0.116.0 fleet) exposed the attribution
// gap: the fleet log said 'fall/env' x3 while the server log told the truth -
// 'F3 drowned', 'F13 drowned', 'F18 suffocated in a wall'. Two runs of death
// maps (run99 AND run102 'fall x3') were mined on the polluted 'fall/env'
// fallback. These tests pin the parser that ends that pollution: every
// template the 26.2 server broadcasts for the deaths the fleet actually
// suffers, the other-bot isolation (one shared chat), and the junk family.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDeathMessage, inferenceVerdict } from '../../src/lib/deathcause.mjs'

test('parseDeathMessage: the run102 death lines parse to the SERVER truth', () => {
  // the exact server lines that the fleet log mis-attributed to fall/env
  const f3 = parseDeathMessage('F3 drowned', 'F3')
  assert.equal(f3.kind, 'drown', 'F3 drowned (the fleet log said fall/env)')
  assert.equal(f3.attacker, null)
  assert.equal(f3.verb, 'drowned')

  const f13 = parseDeathMessage('F13 drowned', 'F13')
  assert.equal(f13.kind, 'drown', 'F13 drowned (the fleet log said fall/env)')

  const f18 = parseDeathMessage('F18 suffocated in a wall', 'F18')
  assert.equal(f18.kind, 'suffocate', 'F18 suffocated in a wall (the fleet log said fall/env)')

  // the mob kills the inference already got right stay right, now structured
  const f5 = parseDeathMessage('F5 was shot by Skeleton', 'F5')
  assert.equal(f5.kind, 'mob')
  assert.equal(f5.attacker, 'Skeleton')

  const f15 = parseDeathMessage('F15 was slain by Drowned', 'F15')
  assert.equal(f15.kind, 'mob')
  assert.equal(f15.attacker, 'Drowned', 'a drowned is the attacker, not the cause')

  const f16 = parseDeathMessage('F16 was slain by Spider', 'F16')
  assert.equal(f16.kind, 'mob')
  assert.equal(f16.attacker, 'Spider')
})

test('parseDeathMessage: the other vanilla templates the fleet can hit', () => {
  assert.equal(parseDeathMessage('F4 fell from a high place', 'F4').kind, 'fall')
  assert.equal(parseDeathMessage('F4 hit the ground too hard', 'F4').kind, 'fall')
  assert.equal(parseDeathMessage('F4 fell off a ladder', 'F4')?.kind, 'fall')
  assert.equal(parseDeathMessage('F4 fell while climbing', 'F4')?.kind, 'fall')
  assert.equal(parseDeathMessage('F4 tried to swim in lava', 'F4').kind, 'lava')
  assert.equal(parseDeathMessage('F4 blew up', 'F4').kind, 'explosion')
  // (v0.119.0) the run104 F15 line: the server's passive form - the active
  // 'blew up' matched nothing and the death landed in the honest-other bucket
  const f15 = parseDeathMessage('F15 was blown up by Creeper', 'F15')
  assert.equal(f15.kind, 'explosion', 'the passive creeper form is an explosion')
  assert.equal(f15.attacker, 'Creeper')
  assert.equal(parseDeathMessage('F4 starved to death', 'F4').kind, 'starve')
  assert.equal(parseDeathMessage('F4 froze to death', 'F4').kind, 'freeze')
  assert.equal(parseDeathMessage('F4 was slain by Witch', 'F4').attacker, 'Witch', 'the witch front names its killer')
})

test('parseDeathMessage: other bots and mobs never claim us (one shared chat)', () => {
  assert.equal(parseDeathMessage('F3 drowned', 'F7'), null, "another bot's death is not ours")
  assert.equal(parseDeathMessage('Zombie was slain by F3', 'F3'), null, 'our KILL is not our death')
  assert.equal(parseDeathMessage('F3 joined the game', 'F3'), null, 'a join line is not a death')
  assert.equal(parseDeathMessage('F3 has made the advancement [Stone Age]', 'F3'), null, 'advancement spam is not a death')
  assert.equal(parseDeathMessage('F3 left the game', 'F3'), null, 'a leave line is not a death')
  assert.equal(parseDeathMessage('F3: hello world', 'F3'), null, 'own chat is not a death')
  assert.equal(parseDeathMessage('F3 lost connection: Disconnected', 'F3'), null,
    'a disconnect line is a system notice, not a death (it joins the not-death list)')
})

test('parseDeathMessage: unknown future phrasings degrade to honest other', () => {
  const p = parseDeathMessage('F3 was turned into a skeleton horse', 'F3')
  assert.ok(p, 'a name-prefixed line is a death shape')
  assert.equal(p.kind, 'other', 'unknown template = other, NOT null - the fallback must never silently win')
  assert.equal(p.verb, 'was turned into a skeleton horse', 'the verbatim verb rides along for the next mine')
})

test('parseDeathMessage: the junk family never throws, never claims', () => {
  assert.equal(parseDeathMessage(null, 'F3'), null)
  assert.equal(parseDeathMessage(undefined, 'F3'), null)
  assert.equal(parseDeathMessage('', 'F3'), null)
  assert.equal(parseDeathMessage(42, 'F3'), null)
  assert.equal(parseDeathMessage({}, 'F3'), null)
  assert.equal(parseDeathMessage('F3 drowned'), null, 'no bot name: nothing may claim us')
  assert.equal(parseDeathMessage('F3 drowned', ''), null)
  assert.equal(parseDeathMessage('F3 drowned', null), null)
  assert.equal(parseDeathMessage('F3 drowned', 42), null)
})

test('parseDeathMessage: regex metachars in a name never break the match', () => {
  const p = parseDeathMessage('bot(F3)+ drowned', 'bot(F3)+')
  assert.equal(p?.kind, 'drown', 'a metachar-laden username is escaped, not interpreted')
})

// (v0.136.0) THE KNOCKOFF TEMPLATE - run550 (35950649305) measured F7
// 'was doomed to fall by Drowned' landing in the honest-'other' bucket: the
// generic mob family matches 'was doomed by' but the actual verb carries
// 'to fall' between, so the attacker was LOST and a mob kill left the death
// map (mob pressure undercounted - the fleet's top death front, undercounted).
test('parseDeathMessage: the assisted-fall kill keeps its killer (the run550 F7 pin)', () => {
  const f7 = parseDeathMessage('F7 was doomed to fall by Drowned', 'F7')
  assert.equal(f7.kind, 'mob', 'the knockoff is a mob kill, not an honest other')
  assert.equal(f7.attacker, 'Drowned', 'the killer survives the parse')
  assert.equal(f7.verb, 'was doomed to fall by Drowned')
  // the other assisted-fall actors parse too
  const z = parseDeathMessage('F9 was doomed to fall by Zombie', 'F9')
  assert.equal(z.kind, 'mob')
  assert.equal(z.attacker, 'Zombie')
})

// (v0.210.0) THE DRAGON KIND - run30 (fleet 36229765630) mined the first
// death the cause-module had no tier for: the testbed world carries an
// unkilled legacy dragon and F6 died to its magic through the vanilla
// indirectMagic template. The old parse bucketed a phantom attacker ('mob
// by Ender' - the generic single-word \w+ truncated the two-word name).
// These pins freeze the real killer's name and the honest-other boundary.
test('parseDeathMessage: the dragon kind names the whole killer (the run30 F6 pin)', () => {
  const f6 = parseDeathMessage('F6 was killed by Ender Dragon using magic', 'F6')
  assert.equal(f6.kind, 'mob', 'the dragon kill is a mob kill, not an honest other')
  assert.equal(f6.attacker, 'Ender Dragon', 'the TWO-WORD killer survives the parse (run30 measured the phantom Ender)')
  assert.equal(f6.verb, 'was killed by Ender Dragon using magic')
  // the one-word capitalized form rides the same rule
  const w = parseDeathMessage('F9 was killed by Wither using magic', 'F9')
  assert.equal(w.kind, 'mob')
  assert.equal(w.attacker, 'Wither', 'the one-word proper name is not broken by the optional pair')
  // the verbatim lowercase 'magic' form stays honest-other (the [A-Z] gate)
  const m = parseDeathMessage('F4 was killed by magic', 'F4')
  assert.equal(m.kind, 'other', 'the verbatim magic form never becomes a mob')
  assert.equal(m.attacker, null)
  // the generic single-word mob family is untouched (no using-magic suffix)
  const s = parseDeathMessage('F4 was slain by Drowned', 'F4')
  assert.equal(s.kind, 'mob')
  assert.equal(s.attacker, 'Drowned')
})

// (v0.136.0) THE INFERENCE VERDICT - the annotation lie gets a NAMED verdict
// in the line. Four mines (run530 -> run550) re-adjudicated the same shape by
// hand; the matrix below pins every relationship the line can now name.
test('inferenceVerdict: the run550 death matrix names every face', () => {
  // F16: kind=drown, the nearest harm was a Zombie 12.0 blocks away - contradiction
  assert.equal(inferenceVerdict({ kind: 'drown', attacker: null }, 'Zombie'), 'contradicts')
  // a nearby Drowned MOB is not the drowning state either (the melee kill
  // would broadcast 'was slain by Drowned' - kind=mob)
  assert.equal(inferenceVerdict({ kind: 'drown', attacker: null }, 'Drowned'), 'contradicts')
  // the oxygen state itself corroborates a plain drown
  assert.equal(inferenceVerdict({ kind: 'drown', attacker: null }, 'drowning'), 'corroborates')
  // F10: kind=suffocate - the hp inferrer is STRUCTURALLY blind to suffocation
  assert.equal(inferenceVerdict({ kind: 'suffocate', attacker: null }, 'drowned'), 'blind')
  assert.equal(inferenceVerdict({ kind: 'suffocate', attacker: null }, 'fall/env'), 'blind')
  // the other blind kinds
  assert.equal(inferenceVerdict({ kind: 'lava', attacker: null }, 'drowning'), 'blind')
  assert.equal(inferenceVerdict({ kind: 'starve', attacker: null }, 'Zombie'), 'blind')
  assert.equal(inferenceVerdict({ kind: 'freeze', attacker: null }, 'Zombie'), 'blind')
  // F13/F11: kind=mob by Zombie, the hint names the same killer - corroborates
  assert.equal(inferenceVerdict({ kind: 'mob', attacker: 'Zombie' }, 'Zombie'), 'corroborates')
  // case-insensitive: the inferrer prints the entity name as-is
  assert.equal(inferenceVerdict({ kind: 'mob', attacker: 'Zombie' }, 'zombie'), 'corroborates')
  // F9: kind=mob by Drowned, the hint says drowning (the STATE) - contradiction
  assert.equal(inferenceVerdict({ kind: 'mob', attacker: 'Drowned' }, 'drowning'), 'contradicts')
  // the wrong killer name contradicts
  assert.equal(inferenceVerdict({ kind: 'mob', attacker: 'Skeleton' }, 'Zombie'), 'contradicts')
  // explosions: the creeper's passive form carries the attacker
  assert.equal(inferenceVerdict({ kind: 'explosion', attacker: 'Creeper' }, 'Creeper'), 'corroborates')
  assert.equal(inferenceVerdict({ kind: 'explosion', attacker: 'Creeper' }, 'Zombie'), 'contradicts')
  // (v0.218.0) THE SUICIDE-BOMBER BLINDNESS: the exploder removes itself at
  // detonation, so the nearest-hostile scan degrades to the 'fall/env'
  // fallback - noise by construction, read blind (run870 F4 + run96 F4, both
  // 'blown up by Creeper | inferred fall/env')
  assert.equal(inferenceVerdict({ kind: 'explosion', attacker: 'Creeper' }, 'fall/env'), 'blind')
  assert.equal(inferenceVerdict({ kind: 'explosion', attacker: 'Creeper' }, 'fall'), 'blind')
  // (v0.218.0) the plain drown's 'fall/env' fallback is noise too: an oxygen
  // death has no gravity event and no hostile touch (run870 F4 'kind=drown |
  // inferred fall/env'); a hostile hint still contradicts
  assert.equal(inferenceVerdict({ kind: 'drown', attacker: null }, 'fall/env'), 'blind')
  assert.equal(inferenceVerdict({ kind: 'drown', attacker: null }, 'fall'), 'blind')
  // falls: only the gravity fallback corroborates
  assert.equal(inferenceVerdict({ kind: 'fall', attacker: null }, 'fall/env'), 'corroborates')
  assert.equal(inferenceVerdict({ kind: 'fall', attacker: null }, 'Zombie'), 'contradicts')
})

test('inferenceVerdict: junk-safe (no throw, honest unknown/blind)', () => {
  // junk server verdicts
  assert.equal(inferenceVerdict(null, 'Zombie'), 'unknown')
  assert.equal(inferenceVerdict(undefined, 'Zombie'), 'unknown')
  assert.equal(inferenceVerdict({}, 'Zombie'), 'unknown')
  assert.equal(inferenceVerdict({ kind: '' }, 'Zombie'), 'unknown')
  // junk inferred names read blind (there is no hint to weigh)
  assert.equal(inferenceVerdict({ kind: 'drown' }, null), 'blind')
  assert.equal(inferenceVerdict({ kind: 'drown' }, undefined), 'blind')
  assert.equal(inferenceVerdict({ kind: 'drown' }, ''), 'blind')
  assert.equal(inferenceVerdict({ kind: 'drown' }, '   '), 'blind')
  // non-string junk never throws
  assert.equal(inferenceVerdict(42, 17), 'unknown')
  assert.equal(inferenceVerdict({ kind: 'drown' }, 17), 'blind')
  // the honest-other bucket stays unknown (no doctrine can label it)
  assert.equal(inferenceVerdict({ kind: 'other', attacker: null }, 'fall/env'), 'unknown')
})

// (v0.136.0) THE WIRING PIN (the witch-lane pin style): the death handler must
// actually consult the verdict - an import without the call would leave the lie
// unnamed in the field.
test('REGRESSION PIN: the miner death handler wires the inference verdict', async () => {
  const fs = await import('node:fs')
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(/inferenceVerdict\(serverDeath, lastHarm \? lastHarm\.name : null\)/.test(minerSrc),
    'the death handler asks the verdict with the live server death and the last-harm name')
  assert.ok(/the inference \$\{note\}/.test(minerSrc) || /` \[the inference \$\{note\}\]`/.test(minerSrc),
    'the verdict note lands in the printed cause line')
  assert.ok(/CONTRADICTS the server verdict/.test(minerSrc), 'the contradiction names itself loudly')
  assert.ok(/is blind to this kind/.test(minerSrc), 'the blind class names itself')
})
