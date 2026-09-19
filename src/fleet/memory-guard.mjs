// Memory guard for long fleet runs.
//
// The first Big Fleet run (19 bots in ONE Node process) died at t+210s with
// "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of
// memory" (~4 GB heap on the 7 GB CI runner, the Java server holds another 2 GB).
// The dominant term is loaded chunk columns: the vanilla server sends unload_chunk
// when a chunk leaves the player's tracking range, but bots that die and respawn
// (dimension switch), reconnect, or simply miss packets keep stale columns forever.
// prismarine-world only deletes a column when it SEES the unload packet.
//
// The guard keeps that term bounded:
//   * evicts chunk columns farther than maxRadius from the bot. With
//     view-distance=4 the server stops tracking a chunk ~64-80 blocks out, so a
//     96-block radius only ever removes columns the server has ALREADY dropped
//     (deleting those client-side is safe: if the bot walks back, the server
//     re-sends them). Deleting a chunk the server still tracks would leave the
//     bot walking on void - that is why the radius must stay >= view range.
//   * nudges the GC when node runs with --expose-gc
//   * exposes stats() (columns, entities, evicted, heap) for the fleet reporter,
//     so memory growth is visible in the log run over run
export function evictFarColumns (world, position, maxRadius = 96) {
  if (!world || !position) return 0
  const cols = world.columns
  if (!cols) return 0
  let evicted = 0
  for (const key of Object.keys(cols)) {
    const comma = key.indexOf(',')
    if (comma < 0) continue
    const cx = Number(key.slice(0, comma))
    const cz = Number(key.slice(comma + 1))
    if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue
    const dx = cx * 16 + 8 - position.x
    const dz = cz * 16 + 8 - position.z
    if (dx * dx + dz * dz > maxRadius * maxRadius) {
      // sync wrapper has unloadColumn too; no storageProvider in fleet worlds,
      // so this is an immediate forceUnloadColumn
      if (typeof world.unloadColumn === 'function') world.unloadColumn(cx, cz)
      else delete cols[key]
      evicted++
    }
  }
  return evicted
}

export function attachMemoryGuard (bot, { maxRadius = 96, everyMs = 20000, log = () => {} } = {}) {
  let evicted = 0
  let lastTick = 0

  function tick () {
    try {
      const pos = bot.entity?.position
      const world = bot.world?.async ?? bot.world
      if (!pos || !world) return
      const n = evictFarColumns(world, pos, maxRadius)
      evicted += n
      lastTick = Date.now()
      if (n > 0 && log) log(`memory-guard: evicted ${n} far chunks (total ${evicted})`)
      if (typeof global.gc === 'function') global.gc()
    } catch { /* a dead bot mid-tick must never break the fleet */ }
  }

  const timer = setInterval(tick, everyMs)
  if (timer.unref) timer.unref() // never keep the process alive just for the guard

  function stats () {
    const world = bot.world?.async ?? bot.world
    const cols = world?.columns
    const mem = process.memoryUsage()
    return {
      evicted,
      columns: cols ? Object.keys(cols).length : 0,
      entities: bot.entities ? Object.keys(bot.entities).length : 0,
      heapUsedMb: Math.round(mem.heapUsed / 1048576),
      rssMb: Math.round(mem.rss / 1048576),
      lastTickAgo: lastTick ? Math.round((Date.now() - lastTick) / 1000) : -1
    }
  }

  function stop () { clearInterval(timer) }

  return { stats, stop, tick }
}
