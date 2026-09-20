// Yard build verification (v0.18.17): the fleet's bank/smelt chain has been dead
// since v0.9.0 with 'no chest in range' - and run #130 finally caught the REAL
// killer red-handed. The yard is built by firing ~169 console commands through
// the cmd.fifo pipe and walking away. CI run 35521952724 shows the failure mode:
// the server's latest.log contains feedback for ONLY THE LAST ~11 commands
// (9 sea lanterns + setworldspawn); the first ~159 (floor, clearance, ALL 50
// chests, ALL 16 machines, portals) never executed - no success, no error,
// nothing. A fire-and-forget batch through a pipe with NO verification means
// the yard silently half-exists and every bot banks into emptiness.
//
// The fix is client-side truth: the survey bot STAYS ONLINE after the survey,
// the build is verified from the bot's own world view (findBlocks over the
// loaded spawn chunks), and the batch is RE-SENT (idempotent - same commands,
// same coordinates) until the structures exist or a bounded retry budget dies
// LOUD (exit 1 at build time, not a silent fleet-wide bank death later).
//
// This module is the pure verdict math so the contract is unit-testable.

// What buildYard() places when every command lands (keep in sync with the
// layout): 2 fuel chests + 3-chest fill row + 5 warehouse rows x 9 = 50 chests,
// 9 output barrels, 8 furnaces, 4 blast furnaces, 4 smokers.
export const YARD_EXPECTED = {
  chests: 50,
  barrels: 9,
  furnaces: 8,
  blastFurnaces: 4,
  smokers: 4
}

// Verify thresholds: a handful of placements can legitimately lose a race with
// terrain (setblock overwrites unconditionally, so in practice they do not) -
// but a transport that swallowed 159/169 commands shows up as near-zero, not
// as -3. The minima sit just under the full counts so a real build always
// passes and a lost batch always fails.
export const YARD_MINIMA = {
  chestsAndBarrels: YARD_EXPECTED.chests + YARD_EXPECTED.barrels - 5,
  machines: YARD_EXPECTED.furnaces + YARD_EXPECTED.blastFurnaces + YARD_EXPECTED.smokers - 2
}

/**
 * Verdict for one verification probe.
 * @param found {chests:number, barrels:number, furnaces:number, blastFurnaces:number, smokers:number}
 *        counts from the bot's world view (findBlocks) around the yard origin
 * @returns {ok:boolean, detail:string} - 'ok' when BOTH minima are met
 */
export function yardVerdict (found, minima = YARD_MINIMA) {
  const f = {
    chests: found?.chests ?? 0,
    barrels: found?.barrels ?? 0,
    furnaces: found?.furnaces ?? 0,
    blastFurnaces: found?.blastFurnaces ?? 0,
    smokers: found?.smokers ?? 0
  }
  const containers = f.chests + f.barrels
  const machines = f.furnaces + f.blastFurnaces + f.smokers
  const ok = containers >= minima.chestsAndBarrels && machines >= minima.machines
  const detail = `chests=${f.chests} barrels=${f.barrels} (min ${minima.chestsAndBarrels}) machines=${machines}/${YARD_EXPECTED.furnaces + YARD_EXPECTED.blastFurnaces + YARD_EXPECTED.smokers} (min ${minima.machines})`
  return { ok, detail }
}

/**
 * Group raw findBlocks names into the verdict buckets. Unknown names are
 * ignored (the matcher already filters, but a stray trapdoor must not crash).
 */
export function tallyYardBlocks (names) {
  const t = { chests: 0, barrels: 0, furnaces: 0, blastFurnaces: 0, smokers: 0 }
  for (const n of names ?? []) {
    if (n === 'chest' || n === 'trapped_chest') t.chests++
    else if (n === 'barrel') t.barrels++
    else if (n === 'furnace') t.furnaces++
    else if (n === 'blast_furnace') t.blastFurnaces++
    else if (n === 'smoker') t.smokers++
  }
  return t
}
