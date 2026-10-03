// (v0.547.0) THE REPORT SEAL - the fleet's last word never lands half-written.
//
// THE PROBLEM (the v0.31.0 hard-kill text priced the write, the 0.546.0 FACE
// FATE fire named the file): the final report goes down with a naked
// writeFileSync straight to data/fleet-report.json. A writeFileSync is NOT
// atomic - the OOM killer, the hard kill (the exit 14 class) or any crash
// landing MID-WRITE leaves a TRUNCATED file under the report's own name: it
// starts with '{' and sits where the report sits, so it reads as the report
// until someone JSON.parses it. The reader then meets a SyntaxError where the
// account should be - the frozen book's FILE side, lying about being whole.
//
// THE FIX: write the payload to a temp sibling first, then rename it onto the
// final name. POSIX rename(2) within one directory is atomic - the final path
// carries EITHER the previous complete file OR the new complete file, never a
// hybrid. A death mid-write leaves only the .tmp sibling behind (junk,
// honestly named) while the report file itself stays whole. The stringify
// happens in the CALLER before this helper runs, so a stringify throw touches
// nothing on disk - exactly the naked write's contract, kept.

import fs from 'node:fs'

export const REPORT_TMP_SUFFIX = '.tmp'

/**
 * Replace `file` with `data` atomically (temp sibling + rename).
 *
 * @param {string} file  the final path (the report's own name)
 * @param {string|Buffer} data  the fully-formed payload (stringify BEFORE calling)
 * @returns {{file: string, tmp: string, bytes: number}} the rename receipt
 */
export function writeFileAtomic(file, data) {
  const tmp = file + REPORT_TMP_SUFFIX
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, file)
  return { file, tmp, bytes: Buffer.byteLength(data) }
}
