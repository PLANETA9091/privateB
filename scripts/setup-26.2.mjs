#!/usr/bin/env node
// Idempotently patches the installed PrismarineJS stack so it speaks Minecraft 26.2
// (protocol 776 / dataVersion 4903). Run after every `npm install`.
//
// What it does:
//   1. minecraft-data: add complete pc/26.2 data set (from minecraft-data branch pc_26_2)
//   2. minecraft-data: register 26.2 in dataPaths.json, protocolVersions.json, versions.json
//   3. minecraft-data: regenerate data.js index
//   4. prismarine-chunk: map 26.2 -> 1.18+ implementation
//   5. prismarine-chunk: allow global-palette bit widths > 16 (26.2 has >65536 block states)
//   6. prismarine-physics: add "26.2" to every feature list that ends with "26.1"
//      (otherwise entities fall through the world - silent!)
//   7. mineflayer: add '26.2' to testedVersions
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nm = path.join(root, 'node_modules')
const mcdata = path.join(nm, 'minecraft-data')
const dataDir = path.join(mcdata, 'minecraft-data', 'data')
const src262 = path.join(root, 'vendor', 'mcdata-26.2', 'data', 'pc', '26.2')

const log = (...a) => console.log('[setup-26.2]', ...a)
function readJson (p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (e) {
    throw new Error(`cannot read JSON ${p}: ${e.message}`)
  }
}
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n')

function assertInstalled () {
  for (const p of ['minecraft-data', 'mineflayer', 'prismarine-chunk', 'prismarine-physics']) {
    if (!fs.existsSync(path.join(nm, p))) throw new Error(`missing dependency: ${p} (run npm install first)`)
  }
  if (!fs.existsSync(src262)) throw new Error(`missing vendored data: ${src262}`)
}

// ---------------------------------------------------------------- 1. data files
function installData () {
  const dst = path.join(dataDir, 'pc', '26.2')
  fs.mkdirSync(dst, { recursive: true })
  let n = 0
  for (const f of fs.readdirSync(src262)) {
    fs.copyFileSync(path.join(src262, f), path.join(dst, f))
    n++
  }
  log(`copied ${n} files into minecraft-data/data/pc/26.2`)
}

// --------------------------------------------------------- 2. registry entries
const PATHS_26_2 = {
  attributes: 'pc/26.2',
  blockCollisionShapes: 'pc/26.2',
  blocks: 'pc/26.2',
  blockLoot: 'pc/26.2',
  biomes: 'pc/26.2',
  commands: 'pc/26.2',
  effects: 'pc/26.1',
  enchantments: 'pc/26.1',
  entities: 'pc/26.2',
  entityLoot: 'pc/26.2',
  foods: 'pc/26.2',
  instruments: 'pc/26.1',
  items: 'pc/26.2',
  language: 'pc/26.2',
  loginPacket: 'pc/26.2',
  mapIcons: 'pc/1.20.2',
  materials: 'pc/26.2',
  particles: 'pc/26.2',
  protocol: 'pc/26.2',
  recipes: 'pc/26.2',
  sounds: 'pc/26.2',
  tints: 'pc/26.2',
  version: 'pc/26.2',
  windows: 'pc/1.20.3',
  proto: 'pc/latest'
}

function registerVersion () {
  const dpPath = path.join(dataDir, 'dataPaths.json')
  const dp = readJson(dpPath)
  if (JSON.stringify(dp.pc['26.2']) !== JSON.stringify(PATHS_26_2)) {
    dp.pc['26.2'] = PATHS_26_2
    writeJson(dpPath, dp)
    log('dataPaths.json: registered pc/26.2')
  }

  const pvPath = path.join(dataDir, 'pc', 'common', 'protocolVersions.json')
  const pv = readJson(pvPath)
  if (!pv.some(e => e.minecraftVersion === '26.2')) {
    const entry = {
      minecraftVersion: '26.2',
      version: 776,
      dataVersion: 4903,
      usesNetty: true,
      majorVersion: '26.2',
      releaseType: 'release'
    }
    const i = pv.findIndex(e => e.minecraftVersion === '26.1' || e.minecraftVersion === '26.1.1')
    pv.splice(i < 0 ? 0 : i, 0, entry)
    writeJson(pvPath, pv)
    log('protocolVersions.json: added 26.2 (protocol 776, dataVersion 4903)')
  }

  const vPath = path.join(dataDir, 'pc', 'common', 'versions.json')
  const vs = readJson(vPath)
  if (!vs.includes('26.2')) {
    vs.push('26.2')
    writeJson(vPath, vs)
    log('versions.json: added 26.2')
  }
}

// The upstream generator (bin/generate_data.js) cannot run on the published package:
// dataPaths.json references files that are not vendored (e.g. pc/1.20.3/windows.json),
// so it aborts on unrelated versions. Instead we clone the 26.1 index block and
// repoint only the keys that 26.2 ships its own files for, then validate every path.
const INHERITED_FIXUPS = [
  ['minecraft-data/data/pc/1.20/blockLoot.json', 'minecraft-data/data/pc/26.2/blockLoot.json'],
  ['minecraft-data/data/pc/1.20/entityLoot.json', 'minecraft-data/data/pc/26.2/entityLoot.json'],
  ['minecraft-data/data/pc/1.20.3/commands.json', 'minecraft-data/data/pc/26.2/commands.json']
]

function patchDataIndex () {
  const p = path.join(mcdata, 'data.js')
  let s = fs.readFileSync(p, 'utf8')
  if (/^\s*'26\.2': \{/m.test(s)) {
    log('data.js: 26.2 already indexed')
    return
  }
  const start = s.indexOf("    '26.1': {")
  if (start < 0) throw new Error('data.js: cannot locate the 26.1 entry to anchor on')
  const close = '\n    }'
  const end = s.indexOf(close, start) + close.length

  let block = s.slice(start, end).replace("'26.1': {", "'26.2': {")
  // repoint only the keys that 26.2 ships its own files for; the rest keep inheriting 26.1
  for (const [key, loc] of Object.entries(PATHS_26_2)) {
    if (loc === 'pc/26.2') block = block.replaceAll(`pc/26.1/${key}.json`, `pc/26.2/${key}.json`)
  }
  for (const [from, to] of INHERITED_FIXUPS) block = block.replace(from, to)

  const missing = []
  for (const m of block.matchAll(/minecraft-data\/data\/(pc\/[\w.]+)\/([\w]+)\.(json|yml)/g)) {
    if (!fs.existsSync(path.join(dataDir, m[1], `${m[2]}.${m[3]}`))) missing.push(`${m[1]}/${m[2]}.${m[3]}`)
  }
  if (missing.length) throw new Error(`data.js: 26.2 references missing files: ${missing.join(', ')}`)

  s = s.slice(0, end) + ',\n' + block + s.slice(end)
  fs.writeFileSync(p, s)
  log('data.js: indexed 26.2 (mirrored from 26.1)')
}

// ------------------------------------------------------- 3. prismarine-chunk
function patchChunk () {
  const idx = path.join(nm, 'prismarine-chunk', 'src', 'index.js')
  let s = fs.readFileSync(idx, 'utf8')
  if (!/^\s*26\.2:/m.test(s)) {
    s = s.replace(/(\n\s*26\.1: require\('\.\/pc\/1\.18\/chunk'\))/, "$1,\n    26.2: require('./pc/1.18/chunk')")
    fs.writeFileSync(idx, s)
    log('prismarine-chunk: mapped 26.2 -> pc/1.18 chunk impl')
  }

  const sec = path.join(nm, 'prismarine-chunk', 'src', 'pc', 'common', 'PaletteChunkSection.js')
  let t = fs.readFileSync(sec, 'utf8')
  if (/bitsPerBlock > 16\) throw/.test(t)) {
    t = t.replace(
      'if (bitsPerBlock > 16) throw new Error(`Bits per block is too big: ${bitsPerBlock}`)',
      'if (bitsPerBlock > Math.max(16, maxBitsPerBlock)) throw new Error(`Bits per block is too big: ${bitsPerBlock}`)'
    )
    fs.writeFileSync(sec, t)
    log('prismarine-chunk: relaxed bitsPerBlock ceiling (global palette, 26.2)')
  }
}

// ----------------------------------------------------- 4. prismarine-physics
function patchPhysics () {
  const p = path.join(nm, 'prismarine-physics', 'lib', 'features.json')
  const raw = fs.readFileSync(p, 'utf8')
  if (raw.includes('"26.2"')) return
  let feats
  try {
    feats = JSON.parse(raw)
  } catch (e) {
    throw new Error(`cannot parse ${p}: ${e.message}`)
  }
  let n = 0
  for (const f of feats) {
    for (const key of ['versions', 'version']) {
      const v = f[key]
      if (!v) continue
      const list = Array.isArray(v) ? v : [v]
      if (list.includes('26.1') && !list.includes('26.2')) {
        list.push('26.2')
        f[key] = Array.isArray(v) ? list : list[0]
        n++
      }
    }
  }
  fs.writeFileSync(p, JSON.stringify(feats, null, 2) + '\n')
  log(`prismarine-physics: added 26.2 to ${n} feature entries`)
}

// ------------------------------------------------------------- 5. mineflayer
function patchMineflayer () {
  const p = path.join(nm, 'mineflayer', 'lib', 'version.js')
  let s = fs.readFileSync(p, 'utf8')
  if (/['"]26\.2['"]/.test(s)) return
  s = s.replace(/('26\.1')\s*\]/, "'26.1', '26.2']")
  fs.writeFileSync(p, s)
  log('mineflayer: added 26.2 to testedVersions')
}

assertInstalled()
installData()
registerVersion()
patchDataIndex()
patchChunk()
patchPhysics()
patchMineflayer()
log('done - stack speaks 26.2')
