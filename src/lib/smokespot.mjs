// (v0.670.0) THE SMOKE PLACE SPOT - the water-reclaim hang's own named fix.
//
// Face 37386244195 (the 12th flight) died in the Integration smoke test: the
// bot dug a sand cell, the ~30s of slow server ticks let the neighbouring
// water flow back INTO the hole, and the place-back step then (a) selected the
// watered cell as its placement target (the hole path never read the hole's
// own content - only the floor below it) and (b) tried to DIG the water
// (the dig-back guard was `name !== 'air'`), which hangs forever - fluids have
// no break progress. The script spun to the 180s overall timeout.
//
// This lens is the cell selector, made pure and water-aware:
//   - the hole path REQUIRES the hole cell to still be empty (air) - a
//     watered hole is refused and the neighbour scan takes over;
//   - the neighbour scan requires an empty cell over a solid, non-fluid floor.
// A fluid can never be selected, and the dig-back guard downstream only ever
// digs `boundingBox === 'block'` cells - the water race can cost the place
// step at most a WARN, never the hang.

// The four horizontal neighbour offsets, scan order pinned (the smoke log's
// historical order: +x, -x, +z, -z).
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

const sameCell = (a, b) => a && b && a.x === b.x && a.y === b.y && a.z === b.z

// The floor read: solid and not a fluid - the place needs something to click.
const floorOk = (b) => !!b && b.boundingBox !== 'empty' && b.boundingBox !== 'fluid'

// The cell read: empty (air) - a fluid or a solid cannot take the placement.
const cellEmpty = (b) => !!b && b.boundingBox === 'empty'

/**
 * Pick a placement cell for the smoke place-back step.
 *
 * @param {object} args
 * @param {{x:number,y:number,z:number}} args.feet   the bot's floored feet cell
 * @param {{x:number,y:number,z:number}|null} args.target  the dug hole (or null)
 * @param {(p:{x:number,y:number,z:number})=>{boundingBox:string,name?:string}|null} args.at
 *        the block read (injected - keeps this pure and testable)
 * @returns {{ref:object, face:{x:number,y:number,z:number}, cell:{x:number,y:number,z:number}}|null}
 */
export function pickSmokeSpot({ feet, target, at }) {
  // The hole path: if the hole is NOT where we stand, it is a candidate - but
  // ONLY if water has not reclaimed it (the v0.670.0 guard: the old selector
  // never read the hole itself and hung digging the water that answered).
  if (target && !sameCell(target, feet)) {
    const hole = at(target)
    if (cellEmpty(hole)) {
      const floor = at({ x: target.x, y: target.y - 1, z: target.z })
      if (floorOk(floor)) {
        return { ref: floor, face: { x: 0, y: 1, z: 0 }, cell: { x: target.x, y: target.y, z: target.z } }
      }
    }
  }
  // The neighbour scan: a free cell beside the feet over a solid floor.
  for (const [dx, dz] of NEIGHBOURS) {
    const cell = { x: feet.x + dx, y: feet.y, z: feet.z + dz }
    if (!cellEmpty(at(cell))) continue
    const floor = at({ x: cell.x, y: cell.y - 1, z: cell.z })
    if (!floorOk(floor)) continue
    return { ref: floor, face: { x: 0, y: 1, z: 0 }, cell }
  }
  return null
}

// The dig-back guard: only a real block may be re-dug. A fluid answer (the
// water that beat the place) is skipped with a warn, never dug - digging a
// fluid has no break progress and hangs the smoke script to its timeout.
export const diggableBack = (b) => !!b && b.boundingBox === 'block'
