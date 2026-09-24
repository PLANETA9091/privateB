// Suffocation policy (pure, unit-testable - no bot, no server).
//
// run554 (dispatch 35974993311, the v0.139.0 fleet, NORMAL END 19/19, mined by
// the 17:05 session) named suffocation the TOP death class: SIX of 17 deaths
// read 'server: suffocated in a wall' (F4/F2/F15/F14/F5/F3), all inside
// digging ops, four of the six clustered within a four-block radius of
// [-167,50,428] (two bots suffocated on the SAME cell class the fleet re-digs
// every pass). The mechanics: a rage-mode dig frees a cell under a gravity
// column (gravel/sand) or under an unstable ceiling; the falling block lands
// in the freed cell WHILE the bot walks in, and the bot's eye ends inside a
// solid cube. Vanilla drains the bar at eye level while every dig loop keeps
// looking DOWN - the water lane has a whole rescue stack (drowning.mjs), the
// bury lane had nothing.
//
// Policy pinned here (the mechanics live in miner.mjs suffocateWatch):
// - the watch reads the EYE cell and the FEET cell every
//   SUFFOCATE_WATCH_EVERY_TICKS physics ticks;
// - a solid, opaque, diggable block in either cell is a bury: the HEAD cell
//   kills (vanilla suffocation drains at eye level), the FEET cell pins (the
//   bot cannot step out and the next falling block lands on the head);
// - the rescue digs HEAD first (the lethal cell), then FEET;
// - junk/unreadable cells never dig (a guessed block read must not swing the
//   pick at air), and bedrock never plans a dig (undiggable by construction -
//   the watch would just spin on it every cadence).

/** The watch cadence in physics ticks (50ms each): 10 ticks = 0.5s. A bury
 * that lands mid-dig is seen within half a second - vanilla suffocation
 * deals its first tick of damage after the block fully closes, so a 0.5s
 * reaction converts a death into a one-heart scratch plus a ~1s dig. */
export const SUFFOCATE_WATCH_EVERY_TICKS = 10

/** The fastDig window (ticks) for one rescue dig: 60 ticks = 3s of STOP spam.
 * A dry dig lands far inside this; a contested/undiggable cell fails honestly
 * and the next cadence re-plans. The watch skips swimming bots (the drowning
 * rescue owns the controls, and wet digs are the 5x-slow class the swim lane
 * already handles). */
export const SUFFOCATE_DIG_MAX_TICKS = 60

/** Full-cube lookalikes that NEVER suffocate: glass families and panes (full
 * collision, see-through in mineflayer's transparent flag, but the flag alone
 * is not trusted for the name-shaped liars), leaves, the cobweb (a movement
 * trap, not a suffocator), slime/honey (stickers). Name-based because the
 * measured buries are all gravel/sand/dirt/stone - the safe list only has to
 * never swallow a REAL bury, and none of these families has ever buried a bot. */
export const SUFFOCATE_SAFE_RE = /glass$|pane$|leaves$|cobweb|slime_block|honey_block/

/**
 * Would standing INSIDE this block suffocate the bot? A prismarine block
 * suffocates when it is a full solid cube, opaque (transparent !== true) and
 * not on the safe-name list. Junk-safe: null/junk reads never suffocate (the
 * watch must not dig on a guess), a solid block with a missing transparent
 * flag still reads suffocating (digging a solid block off the head is never
 * wrong when the collision box says full).
 * @param {object|null|undefined} [block] a bot.blockAt read (name/boundingBox/
 *   transparent fields consulted)
 */
export function suffocates (block) {
  if (!block || typeof block !== 'object') return false
  if (block.boundingBox !== 'block') return false
  const name = typeof block.name === 'string' ? block.name : null
  if (name && SUFFOCATE_SAFE_RE.test(name)) return false
  return block.transparent !== true
}

/**
 * Which buried cells need a rescue dig, in dig order (HEAD first - the lethal
 * cell - then FEET). A cell qualifies when suffocates() reads true AND the
 * block is diggable-by-construction (bedrock is refused: the watch would spin
 * on it every cadence without ever landing a dig).
 * @param {object} [p]
 * @param {object|null|undefined} [p.headBlock] the block at the bot's eye cell
 * @param {object|null|undefined} [p.feetBlock] the block at the bot's feet cell
 * @returns {Array<'head'|'feet'>} empty = no bury, nothing to dig
 */
export function suffocateRescueTargets ({ headBlock = null, feetBlock = null } = {}) {
  const out = []
  if (suffocates(headBlock) && headBlock.name !== 'bedrock') out.push('head')
  if (suffocates(feetBlock) && feetBlock.name !== 'bedrock') out.push('feet')
  return out
}
