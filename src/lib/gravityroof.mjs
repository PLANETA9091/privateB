// THE GRAVITY ROOF FENCE (v0.140.0) - the sand/gravel column that kills the digger.
//
// MEASURED (run554, fleet 35974993311, the v0.139.0 HARVEST SWEEP fleet, 19 bots
// x 600s, mined by the 17:54 session): deaths hit the all-time worst 16, and the
// single biggest class is SUFFOCATE x6 - F4 [-118,43,437], F2 [-113,42,428],
// F15 [-117,55,371], F14 [-170,56,412], F5 [-166,50,430], F3 [-167,50,428].
// All six sit in the mine zone (y 42-56); F5 and F3 died five log lines apart
// at the SAME pocket ([-166,50,430] vs [-167,50,428]); the deaths ride the
// tunnel/vein-sweep dig lines ('branch mine at the floor', 'vein sweep: 6 ores
// dug (ore detour)'). The vanilla mechanism: digging a block whose column
// above holds sand/gravel/red_sand lets the column collapse INTO the just-
// cleared cell - the tunnel steps into its own face, the vein detour walks the
// bot under the refill, and the landed block fills the bot's head cell:
// 'suffocated in a wall'. The v0.25.0 climb already proved the textbook cure
// for gravity columns (RE-SCAN and RE-DIG, top-down); this module carries the
// same rule to the horizontal digs.
//
// THE CURE: before digging a target, read the 3 cells above it and clear any
// gravity blocks TOP-DOWN (digging the top one first can never drop a lower
// cell's load - support is below it). Re-scan after each pass: a column taller
// than the read window settles one cell per pass and the next pass catches it.
// A column that will not exhaust within GRAVITY_MAX_PASSES refuses the dig for
// THIS iteration (named, the loop moves on) instead of gambling a bot. Junk
// reads never fence (un-readable world -> allow: the dig is the point of the
// run; a guessed refusal could stall every tunnel in an unread chunk).

/** Blocks that fall when unsupported (vanilla gravity blocks the fleet meets). */
export const GRAVITY_ROOF_BLOCKS = new Set(['sand', 'red_sand', 'gravel'])

/** Re-scan passes before a stuck column refuses the dig (the v0.25.0 budget:
 * beach bands run 2-4 blocks, 6 passes exhausts any column the client can see). */
export const GRAVITY_MAX_PASSES = 6

/**
 * The gravity cells of one above-column, TOP-DOWN dig order (pure).
 * Reads are the names of target+1..target+N (index 0 = the cell directly above
 * the target). Junk entries (null/undefined/non-string) count as NON-gravity:
 * a guessed refusal could stall every tunnel in an unread chunk.
 * Returns 1-based offsets the caller feeds straight into pos.offset(0, k, 0),
 * highest first - digging top-down can never drop a lower cell's load.
 * @param {Array<string|null|undefined>} [reads]
 * @returns {number[]}
 */
export function gravityColumnOrder (reads) {
  if (!Array.isArray(reads)) return []
  const order = []
  for (let i = reads.length - 1; i >= 0; i--) {
    const name = reads[i]
    if (typeof name !== 'string' || !GRAVITY_ROOF_BLOCKS.has(name)) continue
    order.push(i + 1)
  }
  return order
}
