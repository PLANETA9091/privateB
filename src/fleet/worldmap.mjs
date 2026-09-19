// Shared resource map for the bot fleet: scouts fill it while flying, miners consume it.
// Everything the fleet knows about the world lives here, so no bot needs to be told
// where to dig - they discover it themselves.
import fs from 'node:fs'
import { Vec3 } from 'vec3'

export class WorldMap {
  constructor ({ file = null } = {}) {
    this.file = file
    this.scannedChunks = new Set()
    this.found = new Map() // blockName -> Map("x,y,z" -> {pos, seenAt})
    this.scanTicks = 0
    if (file && fs.existsSync(file)) this.load()
  }

  markScanned (cx, cz) {
    this.scannedChunks.add(`${cx},${cz}`)
  }

  isScanned (cx, cz) {
    return this.scannedChunks.has(`${cx},${cz}`)
  }

  add (name, pos) {
    let bucket = this.found.get(name)
    if (!bucket) {
      bucket = new Map()
      this.found.set(name, bucket)
    }
    const key = `${pos.x},${pos.y},${pos.z}`
    if (!bucket.has(key)) bucket.set(key, { pos: new Vec3(pos.x, pos.y, pos.z), seenAt: Date.now() })
  }

  counts () {
    const out = {}
    for (const [name, bucket] of this.found) out[name] = bucket.size
    return out
  }

  size (name) {
    return this.found.get(name)?.size ?? 0
  }

  total () {
    let n = 0
    for (const bucket of this.found.values()) n += bucket.size
    return n
  }

  // Closest known position of a block type; drops entries that the world no longer has.
  nearest (name, from, { maxDistance = Infinity, verifyWith = null } = {}) {
    const bucket = this.found.get(name)
    if (!bucket) return null
    let best = null
    let bestDist = Infinity
    for (const [key, entry] of bucket) {
      const dist = entry.pos.distanceTo(from)
      if (dist > maxDistance || dist >= bestDist) continue
      if (verifyWith) {
        const block = verifyWith(entry.pos)
        if (!block || block.name !== name) {
          bucket.delete(key)
          continue
        }
      }
      best = entry.pos
      bestDist = dist
    }
    return best
  }

  take (name, pos) {
    const bucket = this.found.get(name)
    if (!bucket) return
    bucket.delete(`${pos.x},${pos.y},${pos.z}`)
  }

  save () {
    if (!this.file) return
    const payload = {
      scannedChunks: [...this.scannedChunks],
      found: {}
    }
    for (const [name, bucket] of this.found) {
      payload.found[name] = [...bucket.values()].map(e => [e.pos.x, e.pos.y, e.pos.z])
    }
    fs.writeFileSync(this.file, JSON.stringify(payload))
  }

  load () {
    try {
      const payload = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      for (const key of payload.scannedChunks ?? []) this.scannedChunks.add(key)
      for (const [name, list] of Object.entries(payload.found ?? {})) {
        for (const [x, y, z] of list) this.add(name, { x, y, z })
      }
    } catch (err) {
      console.warn(`[worldmap] cannot load ${this.file}: ${err.message}`)
    }
  }

  report (limit = 12) {
    const counts = Object.entries(this.counts()).sort((a, b) => b[1] - a[1])
    return {
      chunksScanned: this.scannedChunks.size,
      positions: this.total(),
      top: counts.slice(0, limit)
    }
  }
}
