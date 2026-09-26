// Authoritative death causes (pure, unit-testable - no bot, no server).
//
// The run102 mine (35889087936, the v0.116.0 fleet) exposed the attribution
// gap: the fleet log said 'fall/env' x3 while the SERVER log told the truth -
// 'F3 drowned', 'F13 drowned', 'F18 suffocated in a wall'. The lastHarm
// inferrer (miner.mjs) labels every hp drop with the nearest hostile or the
// 'fall/env' fallback - it cannot see suffocation (no hostile, dry air), and
// it misses the drowning read whenever the oxygen bar is stale at the killing
// tick. Two runs of death maps ('fall x3' in run99 AND run102) were mined on
// that polluted fallback, and the death map drives the whole water program.
//
// The server itself broadcasts every death as a system chat line with the
// AUTHORITATIVE vanilla cause: 'F3 drowned', 'F18 suffocated in a wall',
// 'F5 was shot by Skeleton'. This module parses that line for OUR bot and
// turns it into a small structured verdict the death handler prints next to
// the inferred one. Pure string work: junk in, null out - the inference
// stays the fallback, the parse never guesses.

/**
 * The vanilla death-cause templates the fleet can actually receive, mapped
 * to the short kinds the death map buckets on. Ordered matcher list: first
 * hit wins (the 'was slain by' family must win before any generic check).
 */
const KINDS = [
  { re: /\bdrowned\b/, kind: 'drown' },
  { re: /\bsuffocated in a wall\b/, kind: 'suffocate' },
  { re: /\bfell from a high place\b/, kind: 'fall' },
  { re: /\bhit the ground too hard\b/, kind: 'fall' },
  { re: /\bfell off a ladder\b|\bfell while climbing\b/, kind: 'fall' },
  { re: /\btried to swim in lava\b/, kind: 'lava' },
  { re: /\bdiscovered (the floor was|that the floor was) lava\b/, kind: 'lava' },
  { re: /\bblew up\b/, kind: 'explosion' },
  // (v0.119.0) the passive form the server actually broadcasts for a creeper
  // kill - run104 (35899827086) mined 'F15 was blown up by Creeper' landing
  // in the honest-'other' bucket because only the active 'blew up' matched
  { re: /\bwas blown up by (\w+)\b/, kind: 'explosion', group: 1 },
  // (v0.136.0) THE KNOCKOFF TEMPLATE: 'was doomed to fall by X' is vanilla's
  // assisted-fall kill (the attacker knocked the victim from a height). run550
  // (35950649305) measured F7 'was doomed to fall by Drowned' landing in the
  // honest-'other' bucket - the generic mob family matches 'was doomed by'
  // but the actual verb carries 'to fall' between, so the attacker was LOST
  // and a mob kill left the death map (mob pressure undercounted, again).
  { re: /\bwas doomed to fall by (\w+)\b/, kind: 'mob', group: 1 },
  { re: /\bwas killed by (?:an?\s+)?(?:magic|trying to hurt)\b/, kind: 'other' },
  // (v0.210.0) THE DRAGON KIND: run30 (fleet 36229765630) mined the first
  // death the cause-module had no tier for - the testbed world carries an
  // UNKILLED legacy dragon (the server console scans for it at boot: 'the
  // dragon has not yet been killed in this world'), and F6 died to it
  // through the vanilla indirectMagic template: 'F6 was killed by Ender
  // Dragon using magic'. The verbatim-magic rule above needs 'by magic'
  // directly and misses; the generic mob family DOES match but its
  // single-word \w+ TRUNCATES the two-word proper name - the death map
  // bucketed a phantom 'mob by Ender' attacker. This rule names the whole
  // one-or-two-word CAPITALIZED name between 'by' and 'using magic': the
  // server verdict stays the authority, the death map gains the real
  // killer. The lowercase 'magic' of the verbatim form never matches here
  // (the [A-Z] gate keeps it in the honest-'other' bucket).
  { re: /\bwas killed by ((?:[A-Z]\w+\s+)?[A-Z]\w+) using magic\b/, kind: 'mob', group: 1 },
  { re: /\bstarved to death\b/, kind: 'starve' },
  { re: /\bfroze to death\b/, kind: 'freeze' },
  { re: /\bwent out with a splash\b|\bexperienced kinetic energy\b/, kind: 'other' },
  { re: /\bwas (?:slain|shot|killed|stabbed|doomed|impaled|fireballed|pummeled|skewered) by (\w+)\b/, kind: 'mob', group: 1 },
  { re: /\bwas slain by (\w+)\b/, kind: 'mob', group: 1 }
]

/**
 * Non-death system lines that START with the bot's name but are NOT deaths
 * (the fleet's chat carries joins, leaves, advancements, kicks). A line
 * matching one of these must NOT degrade to the honest-'other' verdict -
 * it is simply not a death line.
 */
const NOT_DEATH = [
  /\bjoined the game\b/,
  /\bleft the game\b/,
  /\bhas made the advancement\b/,
  /\bhas made the goal\b/,
  /\bhas completed the challenge\b/,
  /\blost connection\b/,
  /\breached out and touched the (?:cake|best)\b/, // cake joke line, not a death
  /\bwas moved (?:flying|too quickly|across worlds?)\b/, // anticheat/kick notices
  /\bflying is not enabled\b/,
  /\btimed out\b/
]

/**
 * Parse one chat line as OUR bot's death message.
 * @param {string} text the raw chat line (messagestr or the rendered text)
 * @param {string|null} botName this bot's username - a death line for any
 *   OTHER bot (or for a mob) must NOT claim us: the fleet shares one chat
 * @returns {{kind: string, attacker: string|null, verb: string}|null}
 *   null when the line is not a death message for this bot (junk, another
 *   bot, a join/leave line, a chat message)
 */
export function parseDeathMessage (text, botName = null) {
  if (typeof text !== 'string' || !text.length) return null
  const name = typeof botName === 'string' && botName.length ? botName : null
  if (!name) return null
  // the rendered vanilla line starts with the dead entity's name; tolerate
  // the '<name> ' chat rendering and any surrounding whitespace
  const s = String(text).trim()
  const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(.+)$`)
  const m = re.exec(s)
  if (!m) return null
  // a join/leave/advancement line starts with our name too - it is not a
  // death, and it must not eat the honest-'other' verdict below
  for (const nd of NOT_DEATH) if (nd.test(m[1])) return null
  for (const k of KINDS) {
    const km = k.re.exec(m[1])
    if (km) {
      return {
        kind: k.kind,
        attacker: k.group ? (km[k.group] ?? null) : null,
        verb: m[1]
      }
    }
  }
  // a line that starts with our name and matches NO known template is still
  // a death line shape - call it 'other' with the verbatim verb (the death
  // handler prints it; a future vanilla phrasing must never fall back to the
  // polluted inference silently)
  return { kind: 'other', attacker: null, verb: m[1] }
}

// (v0.136.0) THE INFERENCE VERDICT - the annotation lie gets a NAMED verdict.
//
// Four consecutive mines (run530 through run550) spent decode time re-adjudicating
// the same shape: the death line prints 'server: drowned [kind=drown] | inferred:
// zombie@12.0' and every session had to re-derive that a zombie 12 blocks away is
// NOT the killer (the server kind stays the authority - the v0.117.0 doctrine).
// The worst faces: F16 'kind=drown | inferred: zombie@12.0' (contradiction), F10
// 'kind=suffocate | inferred: drowned@9.7' (the hp inferrer is BLIND to suffocation
// - no hostile touch, dry air - so the hint is noise by construction), F7
// 'kind=other | inferred: fall/env' (half-right: the fall WAS assisted - see the
// knockoff template above). This function names the relationship once, in the line:
// corroborates / contradicts / blind - the next mine reads the verdict, not the
// whole argument again.
//
// Pure string work, junk-safe: a junk server verdict or a junk inferred name never
// throws - junk reads as 'unknown' / 'blind'.
export function inferenceVerdict (server, inferredName) {
  if (!server || typeof server.kind !== 'string' || !server.kind.length) return 'unknown'
  const kind = server.kind
  // 'blind' kinds: the lastHarm inferrer structurally cannot see these deaths
  // (suffocation has no hostile touch and dry air; lava/starve/freeze have no
  // hp-drop signature the nearest-hostile heuristic can name) - the hint is
  // noise by construction, whatever it says.
  if (kind === 'suffocate' || kind === 'lava' || kind === 'starve' || kind === 'freeze') return 'blind'
  if (typeof inferredName !== 'string' || !inferredName.length) return 'blind'
  const name = inferredName.trim()
  if (!name.length) return 'blind'
  // the two non-hostile fallback names the inferrer prints (miner.mjs lastHarm):
  // 'drowning' = the oxygen state, 'fall/env' = the gravity fallback. Any OTHER
  // name is a hostile entity's name (Zombie, Drowned, Skeleton, ...).
  const isDrownHint = name === 'drowning'
  const isFallHint = name === 'fall/env' || name === 'fall'
  const attacker = typeof server.attacker === 'string' ? server.attacker.toLowerCase() : null
  if (kind === 'drown') {
    // the server saw NO attacker (plain 'drowned') - a nearby mob (even a
    // Drowned MOB: the melee kill broadcasts 'was slain by Drowned') is not
    // the killer; only the oxygen state itself corroborates.
    return isDrownHint ? 'corroborates' : 'contradicts'
  }
  if (kind === 'fall') return isFallHint ? 'corroborates' : 'contradicts'
  if (kind === 'mob' || kind === 'explosion') {
    // the killer is named - the hint corroborates only when it names THE killer
    if (attacker && name.toLowerCase() === attacker) return 'corroborates'
    return 'contradicts'
  }
  return 'unknown'
}
