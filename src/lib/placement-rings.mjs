// (v0.363.0) THE FLOODED-ALCOVE SITE PICKER - placeMachine's candidate pool,
// factored out of tests/integration/smelting.test.mjs so the ring shapes and
// the widening trigger are unit-pinned instead of living as literals.
//
// THE PROBLEM (CI 36752156115, the smelting flake's third sighting): a bot
// standing in water-adjacent terrain saw ALL 8 neighbour cells wet or blocked -
// the dry-cell law (v0.362.0) then named and skipped every one of them, the
// scan ended with rejected=0 (not a single attempt fired), and the placement
// gave up on a pond the bot could have walked a placement cell out of. The
// carve/relocate ladder downstream handles the WET COLUMN (carveAlcove's wet
// verdict -> relocateToSolidGround), but the placement scan itself only ever
// looked ONE block out.
//
// THE CURE: when the first ring produces ZERO attempts (the flooded-alcove
// signature - everything skipped, nothing tried), widen the scan to a SECOND
// ring of 16 cells at Chebyshev distance 2. Every ring-2 cell rides the same
// dry-cell law and the same floor checks (a fluid cell is named and skipped
// BEFORE any attempt - the cure's law reaches the wider pool unchanged), and
// the placement still never fires into water. The trigger is deliberately
// narrow: any rejected attempt means the first ring DID offer a try, so the
// gravity/entity/refusal classes belong to the carve ladder, not to a wider
// scan - the fast path stays byte-identical whenever the old behavior got a
// chance to speak.

// the historic ring 1: the 8 horizontal neighbours of the feet cell, cardinals
// first, diagonals after - byte-identical to placeMachine's original literal
// (the order decides which cell is tried first; the sync law pins it here)
export const RING1_OFFSETS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, -1], [1, -1], [-1, 1]
]

// ring 2: the 16 cells at Chebyshev distance exactly 2, same shape - the four
// cardinal-axis cells first (the nearest, euclidean 2), then the 8 cells one
// step off the axes (euclidean ~2.24), then the 4 far corners (euclidean 2.83)
// - the scan walks outward, the nearest dry cell wins
export const RING2_OFFSETS = [
  [2, 0], [-2, 0], [0, 2], [0, -2],
  [2, 1], [2, -1], [-2, 1], [-2, -1],
  [1, 2], [-1, 2], [1, -2], [-1, -2],
  [2, 2], [-2, -2], [2, -2], [-2, 2]
]

/**
 * The flooded-alcove widening trigger: did the first ring produce ZERO
 * placement attempts?
 *
 * rejected === 0 means every scanned cell was named-and-skipped (fluid,
 * box, floor or chunk lag) - the placement never even tried, so a wider
 * scan is the only move left before the give-up line. Any rejected > 0
 * means the ring DID offer a cell and the failure is a placement class
 * (gravity refill, entity hitbox, server refusal) that the carve/relocate
 * ladder owns - widening would just re-burn 5-tick rounds on the same
 * terrain. Junk (NaN, strings, floats, missing counters) reads as
 * "do not widen" - a broken counter never invents a wider search (the
 * body-guard law).
 *
 * @param {number} rejected  placeMachine's rejected-attempt counter
 * @returns {boolean} true only when the widening is justified
 */
export function floodedAlcove (rejected) {
  return Number.isInteger(rejected) && rejected === 0
}
