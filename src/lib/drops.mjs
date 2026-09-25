// Drop-collection targets (v0.173.0): the pure pick that turns a DUG block into
// a COLLECTED item. Why this exists - run74's F13 vein sweep logged '9 ores dug
// beside the gallery' while its pocket read ZERO coal at every snapshot: the
// sweep digs in place (reach 4.5) but an ore's drop lands INSIDE the freed cell,
// 2-4 blocks from the bot and often behind the dug face, and Minecraft only
// auto-picks items that touch the collector (~1.5 blocks). The fleet ledger
// counted coal_ore=175 mined while the pockets held ~23 - the ore-detour's
// conversion died between the dig and the pocket, and the fuel front (torches,
// furnace) starved at exactly that link. The two surface diggers (sweep,
// chopReachable) already walk their item entities after the batch; the
// underground vein sweep was the only digger that never did.
//
// Contract (pure, unit-testable):
//   - entities: mineflayer's bot.entities - the PLAIN OBJECT index (numeric keys,
//     the v0.172.0 lesson: never a Map, never .has()) or any iterable of
//     entity-likes. Anything else yields [].
//   - from: the collector's position; entries without a numeric position, a
//     non-'item' name, or a non-finite distance are skipped, never thrown.
//   - nearest first: the closest drop is the walk the bot is already facing;
//     a capped list keeps the walk bounded like the surface precedents (slice 8).
export const SWEEP_DROP_REACH = 8 // drops from swept cells sit <=4.5 away; scatter + fall gives margin
export const SWEEP_DROP_CAP = 8 // the same per-batch cap sweep() and chopReachable use
export const SWEEP_DROP_TIMEOUT_MS = 8000 // one drop's walk budget - a sealed gallery fails fast
export const SWEEP_DROP_TOTAL_MS = 24000 // the whole drop-walk budget - a bonus, never a clock burn

export function dropTargets (entities, from, { maxDistance = SWEEP_DROP_REACH, cap = SWEEP_DROP_CAP } = {}) {
  if (!entities || typeof entities !== 'object') return []
  if (!from || typeof from.x !== 'number' || typeof from.y !== 'number' || typeof from.z !== 'number') return []
  if (!Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(from.z)) return []
  const list = Array.isArray(entities) ? entities : Object.values(entities)
  const out = []
  for (const e of list) {
    if (!e || typeof e !== 'object') continue
    if (e.name !== 'item') continue
    const p = e.position
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') continue
    const dx = p.x - from.x
    const dy = p.y - from.y
    const dz = p.z - from.z
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) continue
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (!Number.isFinite(dist) || dist > maxDistance) continue
    out.push({ x: p.x, y: p.y, z: p.z, dist })
  }
  out.sort((a, b) => a.dist - b.dist)
  const n = Number.isFinite(cap) && cap > 0 ? Math.min(Math.floor(cap), out.length) : out.length
  const picked = []
  for (let i = 0; i < n; i++) picked.push({ x: out[i].x, y: out[i].y, z: out[i].z })
  return picked
}
