// Structure detection for survival bots: no /locate, no op - a scout just looks at blocks.
//
// Every structure has a block signature that does not occur naturally elsewhere, so a flying
// bot can spot it in the loaded chunks and cluster the hits into one detection. The output is
// the chunk of the structure's bounding box, which the cracker turns into seed constraints.
import { Vec3 } from 'vec3'

// signature blocks -> which structure they belong to. `need` = how many hits in a cluster
// before we trust it (avoids single decorative blocks, e.g. a lone pumpkin in a village farm).
// Only unambiguous signatures are allowed here. Mossy cobblestone / plain planks were
// dropped because dungeons and ruins scatter them, which produced 130-block false blobs.
export const SIGNATURES = {
  ocean_monument: {
    need: 12,
    blocks: ['prismarine', 'prismarine_bricks', 'dark_prismarine', 'sea_lantern'],
    // monuments are the only source of prismarine in the overworld
    confident: true
  },
  desert_pyramid: {
    need: 6,
    blocks: ['chiseled_sandstone', 'cut_sandstone'],
    // chiseled/cut sandstone also appears in desert wells and villages, but together with
    // orange terracotta below it is a pyramid
    also: ['orange_terracotta'],
    confident: true
  },
  ruined_portal: {
    need: 1,
    // crying obsidian and gilded blackstone exist nowhere else in the overworld
    blocks: ['crying_obsidian', 'gilded_blackstone'],
    confident: true
  },
  pillager_outpost: {
    need: 8,
    blocks: ['dark_oak_planks', 'dark_oak_log', 'dark_oak_fence', 'carved_pumpkin'],
    confident: false
  },
  swamp_hut: {
    need: 10,
    blocks: ['spruce_fence', 'spruce_log', 'cauldron'],
    confident: false
  },
  igloo: {
    need: 10,
    blocks: ['snow_block', 'white_carpet'],
    confident: false
  },
  shipwreck: {
    need: 12,
    blocks: ['jungle_planks', 'dark_oak_planks', 'acacia_planks'],
    confident: false
  },
  village: {
    need: 6,
    blocks: ['hay_block', 'bell', 'composter', 'cartography_table', 'fletching_table'],
    confident: false
  }
}

// Which signature blocks are worth looking for at all (the union of every list).
export const SIGNATURE_BLOCKS = [...new Set(
  Object.values(SIGNATURES).flatMap(sig => [...sig.blocks, ...(sig.also ?? [])])
)]

// Scan the loaded world around the bot and cluster hits into structures.
// findBlocks() is synchronous, so a huge radius would starve the event loop (and with it the
// anti-kick, which gets the bot kicked for "floating too long"). Keep it small and yield.
export async function scanForStructures (bot, { maxDistance = 48, clusterRadius = 40, log = () => {}, chunkSize = 128 } = {}) {
  const found = bot.findBlocks({
    matching: block => SIGNATURE_BLOCKS.includes(block.name),
    maxDistance,
    count: chunkSize
  })
  if (!found.length) return []
  await new Promise(resolve => setImmediate(resolve)) // give the network/anti-kick a turn

  const hits = []
  for (const pos of found) {
    const block = bot.blockAt(pos)
    if (block) hits.push({ pos, block })
    if (hits.length % 32 === 0) await new Promise(resolve => setImmediate(resolve))
  }
  const clusters = []

  // Greedy clustering with a hard extent cap: merging by "close to any member" chains hits
  // across hundreds of blocks (one temple looked like a 128-block blob), so a hit only joins
  // a cluster when it stays near the centroid AND keeps the bounding box small.
  const MAX_EXTENT = 48
  for (const hit of hits) {
    let merged = null
    for (const cluster of clusters) {
      if (cluster.center.distanceTo(hit.pos) > clusterRadius) continue
      if (Math.abs(cluster.center.x - hit.pos.x) > MAX_EXTENT) continue
      if (Math.abs(cluster.center.z - hit.pos.z) > MAX_EXTENT) continue
      merged = cluster
      break
    }
    if (merged) {
      merged.hits.push(hit)
      const n = merged.hits.length
      merged.center = merged.center.scale((n - 1) / n).add(hit.pos.scale(1 / n))
    } else {
      clusters.push({ hits: [hit], center: hit.pos.clone() })
    }
  }

  const detections = []
  for (const cluster of clusters) {
    const counts = {}
    for (const hit of cluster.hits) counts[hit.block.name] = (counts[hit.block.name] || 0) + 1
    for (const [name, sig] of Object.entries(SIGNATURES)) {
      const given = sig.blocks.reduce((sum, b) => sum + (counts[b] || 0), 0)
      if (given < sig.need) continue
      if (sig.also && !sig.also.some(b => counts[b])) continue
      const min = cluster.hits.reduce((acc, h) => new Vec3(
        Math.min(acc.x, h.pos.x), Math.min(acc.y, h.pos.y), Math.min(acc.z, h.pos.z)
      ), cluster.hits[0].pos.clone())
      const max = cluster.hits.reduce((acc, h) => new Vec3(
        Math.max(acc.x, h.pos.x), Math.max(acc.y, h.pos.y), Math.max(acc.z, h.pos.z)
      ), cluster.hits[0].pos.clone())
      detections.push({
        structure: name,
        confident: !!sig.confident,
        hits: cluster.hits.length,
        blocks: counts,
        min,
        max,
        center: cluster.center.clone(),
        minChunk: { x: min.x >> 4, z: min.z >> 4 },
        centerChunk: { x: Math.floor(cluster.center.x) >> 4, z: Math.floor(cluster.center.z) >> 4 },
        seenAt: Date.now()
      })
      break
    }
  }
  log(`scan: ${hits.length} signature blocks -> ${clusters.length} clusters -> ${detections.length} structures`)
  return detections
}
