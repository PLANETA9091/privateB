// Shared resource map for the bot fleet: scouts fill it while flying, miners consume it.
// Everything the fleet knows about the world lives here, so no bot needs to be told
// where to dig - they discover it themselves.
import fs from 'node:fs'
import { Vec3 } from 'vec3'

export class WorldMap {
  constructor ({ file = null, worldKey = null } = {}) {
    this.file = file
    // (v0.18.4) Identity of the world this map describes. The fleet's test world is
    // rebuilt from the FIXED seed (config/world.json) every run, so a persisted map
    // stays valid across runs - but NOT across different worlds. Without this guard
    // a map file carried over from another seed would load positions that do not
    // exist here, and every verifyWith read would pay for entries that can never hit.
    this.worldKey = worldKey == null ? null : String(worldKey)
    this.scannedChunks = new Set()
    this.found = new Map() // blockName -> Map("x,y,z" -> {pos, seenAt})
    this.scanTicks = 0
    this._autosaveTimer = null
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

  // Up to k nearest known positions of a block type, closest first. Same verify
  // contract as nearest(): entries the world no longer has are dropped on the fly.
  // (v0.15.0) target distribution needs MORE than the single nearest candidate -
  // scoring several candidates against the fleet's claims is what spreads the bots.
  nearestK (name, from, { maxDistance = Infinity, k = 6, verifyWith = null } = {}) {
    const bucket = this.found.get(name)
    if (!bucket || !(k > 0)) return []
    const out = []
    for (const [key, entry] of bucket) {
      const dist = entry.pos.distanceTo(from)
      if (dist > maxDistance || dist >= Infinity) continue
      if (verifyWith) {
        const block = verifyWith(entry.pos)
        if (!block || block.name !== name) {
          bucket.delete(key)
          continue
        }
      }
      out.push({ pos: entry.pos, dist })
    }
    out.sort((a, b) => a.dist - b.dist)
    return out.slice(0, k).map(e => e.pos)
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

  // (v0.18.4) MERGE-ON-SAVE: read what is on disk, pull its positions into THIS map,
  // then write the union back. Why: the old save() blindly overwrote the file, so
  // (a) two processes sharing the file (a fleet + a scout in a second terminal, two
  // fleets) lost everything the slower writer had added - last writer wins; (b) a run
  // that died hard (OOM exit 134, kill -9) before the end-of-run save lost its WHOLE
  // run's finds - with merge-on-save an autosave shortly before the crash has already
  // preserved everything up to that tick.
  save () {
    if (!this.file) return { merged: 0, written: 0 }
    const disk = this.#readDiskPayload()
    let merged = 0
    if (disk && this.#diskWorldMatches(disk)) {
      // the other writer's finds land in the LIVE map too - otherwise the next save
      // would drop them again (they are only mineable through this process's reads)
      for (const key of disk.scannedChunks ?? []) {
        if (!this.scannedChunks.has(key)) { this.scannedChunks.add(key); merged++ }
      }
      for (const [name, list] of Object.entries(disk.found ?? {})) {
        for (const [x, y, z] of list) {
          const bucket = this.found.get(name)
          if (bucket?.has(`${x},${y},${z}`)) continue
          this.add(name, { x, y, z })
          merged++
        }
      }
    }
    const payload = {
      version: 2,
      worldKey: this.worldKey,
      scannedChunks: [...this.scannedChunks],
      found: {}
    }
    let written = 0
    for (const [name, bucket] of this.found) {
      payload.found[name] = [...bucket.values()].map(e => [e.pos.x, e.pos.y, e.pos.z])
      written += payload.found[name].length
    }
    fs.writeFileSync(this.file, JSON.stringify(payload))
    return { merged, written }
  }

  // Parse the on-disk file if it exists and is valid JSON with the expected shape;
  // any problem (missing, corrupt, foreign shape) yields null and save() overwrites
  // instead of dying - a broken map file must never kill a fleet run's final report.
  #readDiskPayload () {
    if (!fs.existsSync(this.file)) return null
    try {
      const payload = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (!payload || typeof payload !== 'object' || typeof payload.found !== 'object' || payload.found == null) return null
      return payload
    } catch {
      return null
    }
  }

  // The disk file describes THIS world when neither side carries a key (legacy files,
  // both-unknown = merge, the v0.18.3-and-earlier behaviour) or both keys are equal.
  // A CONFLICTING explicit key means the file came from a different seed: its positions
  // would be terrain that does not exist here - never merge, overwrite outright.
  #diskWorldMatches (disk) {
    const diskKey = disk.worldKey == null ? null : String(disk.worldKey)
    if (diskKey == null || this.worldKey == null) return true
    return diskKey === this.worldKey
  }

  load () {
    try {
      const payload = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (!this.#diskWorldMatches(payload ?? {})) {
        console.warn(`[worldmap] ${this.file} belongs to another world (worldKey ${payload.worldKey} != ${this.worldKey}) - starting empty`)
        return
      }
      for (const key of payload.scannedChunks ?? []) this.scannedChunks.add(key)
      for (const [name, list] of Object.entries(payload.found ?? {})) {
        for (const [x, y, z] of list) this.add(name, { x, y, z })
      }
    } catch (err) {
      console.warn(`[worldmap] cannot load ${this.file}: ${err.message}`)
    }
  }

  // (v0.18.4) Periodic merge-save: a fleet that dies at minute 4 (the Big Fleet OOM
  // class) keeps the knowledge it gathered up to the last interval instead of losing
  // the whole run. The timer is unref'd - it never holds the process open.
  startAutosave ({ everyMs = 300000, log = () => {} } = {}) {
    if (this._autosaveTimer || !this.file) return false
    const every = Number.isFinite(everyMs) && everyMs >= 20 ? everyMs : 300000 // small values are a test seam
    this._autosaveTimer = setInterval(() => {
      try {
        const r = this.save()
        if (r.merged > 0) log(`autosave: merged ${r.merged} from disk, ${r.written} positions on file`)
      } catch (e) {
        log(`autosave failed: ${e.message}`)
      }
    }, every)
    this._autosaveTimer.unref?.() // never keep the process alive for a save
    return true
  }

  stopAutosave () {
    if (!this._autosaveTimer) return false
    clearInterval(this._autosaveTimer)
    this._autosaveTimer = null
    return true
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
