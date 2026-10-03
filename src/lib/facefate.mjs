// (v0.546.0) THE FACE FATE - the frozen book's READER side.
//
// A fleet face ends one of three ways, and the evidence tool must NAME
// which one it read BEFORE the censuses speak (the reader's own account
// was incomplete: the v0.358.0 lesson - 'a FATAL face never prints the
// FLEET RESULT, the mid-run lines are ALL the account there is' - lived
// as a COMMENT in decompose.mjs, never as a printed row; a face read from
// a truncated artifact looked exactly like a face read from a complete
// one until the human scrolled the raw log):
//   result  - the FLEET RESULT block printed (printFinalReport: the normal
//             end, the hard kill's v0.31.0 contract, the heap cliff, the
//             server-death watchdog's exit 14) - the complete account.
//   partial - the report block is ABSENT but the kill's own evidence line
//             landed ('[fleet] partial: alive=...' or the report's own
//             death row '[fleet] hard-kill report failed:') - the run died
//             mid-teardown; the counters exist, the full account does not.
//   none    - neither line exists: the frozen book (the CI cancelled the
//             run, the OOM killer, a crash before the teardown) - the
//             account is the mid-run lines ALONE.
// THE LAW: result outranks partial (the hard kill prints the partial line
// AND THEN the full report - both present means the report landed); a junk
// or empty read is 'none' with the honest why - the diagnostics never
// invent a fate the log does not carry.

const RESULT_RE = /FLEET RESULT \((.*)\) =+/ // greedy: the reason may carry nested parens (the hard kill's own)
const PARTIAL_RES = [
  /\[fleet\] partial: alive=/, // the hard kill's own counters row
  /\[fleet\] hard-kill report failed:/ // the report block's own death row
]

/**
 * Read the face's fate from its fleet19.log lines.
 * @param {string[]} lines the log's lines
 * @returns {{fate:'result', reason:string, line:string}
 *          |{fate:'partial', line:string}
 *          |{fate:'none', why:string}}
 */
export function faceFate (lines) {
  if (!Array.isArray(lines)) return { fate: 'none', why: 'junk input - no lines array read' }
  for (const l of lines) {
    const m = typeof l === 'string' && l.match(RESULT_RE)
    if (m) return { fate: 'result', reason: m[1].trim(), line: l }
  }
  for (const l of lines) {
    if (typeof l === 'string' && PARTIAL_RES.some(re => re.test(l))) {
      return { fate: 'partial', line: l }
    }
  }
  return {
    fate: 'none',
    why: lines.length === 0
      ? 'empty read - zero lines'
      : 'no final report in the log - the frozen book (the account is the mid-run lines alone)'
  }
}
