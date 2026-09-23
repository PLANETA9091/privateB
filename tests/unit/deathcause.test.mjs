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
import { parseDeathMessage } from '../../src/lib/deathcause.mjs'

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
