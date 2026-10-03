// The report seal pins (v0.547.0) - the fleet report never lands half-written.
//
// THE SEAM: the final report went down with a naked writeFileSync straight to
// data/fleet-report.json - a writeFileSync is NOT atomic, so the OOM killer,
// the hard kill (the exit 14 class) or any crash landing MID-WRITE left a
// TRUNCATED file under the report's own name: it starts with '{' and sits
// where the report sits, reading as the report until a JSON.parse meets the
// SyntaxError - the frozen book FILE side, lying about being whole.
//
// THE WIRE: writeFileAtomic(file, data) in src/lib/atomicsave.mjs - the
// payload lands in a .tmp sibling first, then POSIX rename(2) carries it onto
// the final name ATOMICALLY: the final path holds either the old whole file
// or the new whole file, never a hybrid; a death mid-write leaves only the
// honestly-named .tmp junk. The stringify stays in the caller, so a stringify
// throw touches nothing on disk - the naked write contract, kept.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileAtomic, REPORT_TMP_SUFFIX } from '../../src/lib/atomicsave.mjs'

const sealSrc = readFileSync(new URL('../../src/lib/atomicsave.mjs', import.meta.url), 'utf8')
const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')

test('THE LAW: the tmp suffix is .tmp and the docblock names the non-atomic writeFileSync seam', () => {
  assert.equal(REPORT_TMP_SUFFIX, '.tmp')
  assert.ok(sealSrc.includes("export const REPORT_TMP_SUFFIX = '.tmp'"), 'the constant export line present')
  assert.ok(sealSrc.includes('THE REPORT SEAL'), 'the seal docblock present')
  assert.ok(sealSrc.includes('writeFileSync is NOT'), 'the seam names the naked write as non-atomic')
  assert.ok(sealSrc.includes('rename(2)'), 'the fix names the atomic rename')
})

test('THE WIRE: happy path - the content lands, the tmp sibling is consumed, the receipt is honest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pvb-seal-'))
  const f = join(dir, 'fleet-report.json')
  const data = JSON.stringify({ alive: 19, banked: 954 }, null, 2)
  const receipt = writeFileAtomic(f, data)
  assert.equal(readFileSync(f, 'utf8'), data, 'the final path carries the new whole file')
  assert.equal(existsSync(f + '.tmp'), false, 'the tmp sibling is gone after the rename')
  assert.equal(receipt.file, f)
  assert.equal(receipt.tmp, f + '.tmp')
  assert.equal(receipt.bytes, Buffer.byteLength(data))
  rmSync(dir, { recursive: true, force: true })
})

test('THE WIRE: overwrite - the old whole file is replaced by the new whole file, never a hybrid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pvb-seal-'))
  const f = join(dir, 'fleet-report.json')
  writeFileAtomic(f, JSON.stringify({ gen: 1 }, null, 2))
  const second = writeFileAtomic(f, JSON.stringify({ gen: 2, alive: 18 }, null, 2))
  const back = JSON.parse(readFileSync(f, 'utf8'))
  assert.equal(back.gen, 2, 'the final path holds the newest complete content')
  assert.equal(back.alive, 18)
  assert.equal(existsSync(f + '.tmp'), false, 'the tmp is consumed on every pass')
  assert.equal(second.bytes, Buffer.byteLength(JSON.stringify({ gen: 2, alive: 18 }, null, 2)))
  rmSync(dir, { recursive: true, force: true })
})

test('THE CONTRACT: a refused write touches nothing - the old file keeps its bytes, no tmp junk appears', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pvb-seal-'))
  const f = join(dir, 'fleet-report.json')
  const whole = '{"alive":19,"note":"the previous complete run"}'
  writeFileSync(f, whole)
  assert.throws(() => writeFileAtomic(f, Symbol('the payload is not a string')), TypeError)
  assert.equal(readFileSync(f, 'utf8'), whole, 'the old whole file untouched')
  assert.equal(existsSync(f + '.tmp'), false, 'the validation throws before any disk touch')
  rmSync(dir, { recursive: true, force: true })
})

test('THE CONTRACT: the stale tmp of a dead run is self-healed - overwritten and consumed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pvb-seal-'))
  const f = join(dir, 'fleet-report.json')
  writeFileSync(f + '.tmp', '{"alive": 9, "tru') // the truncated junk a mid-write death leaves
  const data = JSON.stringify({ alive: 19, gen: 3 }, null, 2)
  writeFileAtomic(f, data)
  assert.equal(readFileSync(f, 'utf8'), data, 'the new report landed whole')
  assert.equal(existsSync(f + '.tmp'), false, 'the dead run leftover consumed by the rename')
  rmSync(dir, { recursive: true, force: true })
})

test('THE WIRING: fleet19 rides the seal - the naked report write is gone, the channel lines stay', () => {
  assert.ok(
    fleetSrc.includes("import { writeFileAtomic } from '../src/lib/atomicsave.mjs'"),
    'the seal import present'
  )
  assert.equal(
    (fleetSrc.match(/fs\.writeFileSync\('data\/fleet-report\.json'/g) || []).length,
    0,
    'ZERO naked writeFileSync to the report path - the truncated-file class is dead'
  )
  assert.equal(
    (fleetSrc.match(/writeFileAtomic\('data\/fleet-report\.json', JSON\.stringify\(fleetReport, null, 2\)\)/g) || []).length,
    1,
    'exactly one sealed write site'
  )
  assert.ok(fleetSrc.includes('THE REPORT SEAL'), 'the wire comment names the seal')
  assert.ok(
    fleetSrc.includes("console.log('report: data/fleet-report.json written')"),
    'the success line rides its existing channel'
  )
  assert.ok(
    fleetSrc.includes('report: could not write fleet-report.json'),
    'the failure line rides its existing channel'
  )
  assert.ok(fleetSrc.includes("noteGlobal('report:write')"), 'the sync-block marker stays before the write')
})
