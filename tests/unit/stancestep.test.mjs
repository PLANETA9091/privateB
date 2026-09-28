// Tests for v0.283.0 THE STANCE STEP - the COMPOSED tree (the near-duplicate
// law's composition branch). The 1930 lane's bde0622 shipped the behavior
// (stanceStepBlocks + the four-form step on the vein sweep band) while this
// lane's parallel fire built the same cure with its own day-scale census
// (the row's step=/stepcut= tokens). TWIN behavior, COMPLEMENTARY
// instruments - the per-event forms name the fences live, the row census
// answers the day-scale question the ngap token opened: how many gap-band
// candidates did the step cure? The behavior stands byte-true (bde0622);
// this file pins the composition: the census wiring + the band coherence.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stanceStepBlocks, stepWalkProgress, LEDGE_CUT_REACH, sealCutClass, sweepDropRecord, belowResidueRow } from '../../src/lib/drops.mjs'

test('the ceil law: the whole-block step count closes the stand-off honestly', () => {
  assert.equal(stanceStepBlocks(1.5), null, 'distXZ === reach is INSIDE the magnet - the cut arms without help, no step')
  assert.equal(stanceStepBlocks(1.6), 1, 'just outside the magnet - the face 36411203362 census\'s own band (the candidates sat at 1.8-2.0)')
  assert.equal(stanceStepBlocks(2.5), 1, 'the whole 1.5-2.5 band reads 1 (ceil(1.0) = 1 - the ceil law\'s edge)')
  assert.equal(stanceStepBlocks(2.6), 2, 'beyond 2.5 two whole blocks are the honest count')
  assert.equal(stanceStepBlocks(0), null, 'standing on the column - nothing to close')
  assert.equal(stanceStepBlocks(-0.1), null, 'a negative stand-off is junk - no step')
  assert.equal(stanceStepBlocks(), null, 'the zero-arg call refuses')
  assert.equal(stanceStepBlocks(NaN), null, 'a junk distance claims no step')
  assert.equal(stanceStepBlocks(1.8, 1.2), 1, 'the reach injection - the fence family\'s test form')
  assert.equal(LEDGE_CUT_REACH, 1.5, 'the magnet law stands - the step closes the gap TO the fence, never widens the fence')
})

test('the composition coherence: every gap-band candidate reads a ONE-block step (the ngap class is the class the step cures)', () => {
  for (let d = 1.6; d <= 2.0; d += 0.1) {
    assert.equal(sealCutClass(d, 2), 'gap', `distXZ ${d.toFixed(1)} is the split's gap class (the setup)`)
    assert.equal(stanceStepBlocks(d), 1, `distXZ ${d.toFixed(1)}: the step closes the gap band in ONE block - the ngap census and the cure are the same class`)
  }
  assert.equal(sealCutClass(1.4, 2), 'cut', 'inside the magnet the split says cut - the step never fires there')
  assert.equal(stanceStepBlocks(1.4), null, 'the coherence holds at the magnet\'s inside edge')
})

test('the row carries the step: sweepDropRecord + the fleet row tail (the identity-extends law)', () => {
  const rec = sweepDropRecord({ sweeps: 1, seal3: 4, sealNear: 1, sealFar: 3, sealCutGap: 4, stanceStep: 2, stanceCut: 1 })
  assert.equal(rec.stanceStep, 2)
  assert.equal(rec.stanceCut, 1)
  assert.equal(sweepDropRecord({ stanceStep: 'x' }).stanceStep, 0, 'junk floors at zero - the row never carries a guess')
  assert.equal(sweepDropRecord({ stanceCut: -3 }).stanceCut, 0)
  const row = belowResidueRow([{ sweeps: 1, seal3: 4, sealNear: 1, sealFar: 3, sealCutGap: 4, stanceStep: 2, stanceCut: 1 }])
  assert.match(row, /ngap=4 step=2 stepcut=1$/, 'the step rides the row tail behind ngap - the legacy tokens keep their positions')
  assert.match(belowResidueRow([{ stanceStep: 2 }, { stanceCut: 1 }, null, undefined]), /step=2 stepcut=1$/, 'the fleet row sums the step and its conversions')
  assert.match(belowResidueRow([null, undefined, {}]), /ngap=0 step=0 stepcut=0$/, 'the all-junk row still renders the tokens (byte-true zeros)')
  assert.equal(belowResidueRow(undefined).endsWith('ngap=0 step=0 stepcut=0'), true, 'the zero-arg row carries the full tail')
})

test('the census is wired: the miner\'s step counts ride stats for the fleet row (the composition)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const dropsSrc = readFileSync(new URL('../../src/lib/drops.mjs', import.meta.url), 'utf8')
  assert.ok(minerSrc.includes('stanceStepBlocks'), 'the miner imports the behavior fence (bde0622, byte-true)')
  assert.ok(minerSrc.includes("stanceCuts++ // (v0.283.0) the row's stepcut= - the step bought THIS cut"), 'the conversion census rides the recut branch (the step\'s own dig)')
  assert.ok(minerSrc.includes('sd.stanceStep += stanceSteps'), 'the armed-walk count accumulates into the stats')
  assert.ok(minerSrc.includes('sd.stanceCut += stanceCuts'), 'the conversion count accumulates into the stats')
  assert.ok(minerSrc.includes('sealCutGap: 0, stanceStep: 0, stanceCut: 0 }'), 'the stats seed grows with the step buckets')
  assert.ok(dropsSrc.includes('stanceStep: fl(stanceStep)'), 'the record normalizes the step census (junk floors at zero)')
  assert.ok(dropsSrc.includes('stepcut=${acc.stanceCut}'), 'the row renders the conversion tail (the v0.283.0 tail-append law)')
  const recutAt = minerSrc.indexOf('const recut = ledgeCutWanted(')
  const censusAt = minerSrc.indexOf('stanceCuts++')
  assert.ok(recutAt > 0 && censusAt > recutAt, 'the census increments AFTER the re-read arms - the count is the re-read\'s conversion, never a guess')
})

test('the walk contest names itself: the step\'s bottleneck speaks (v0.285.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // face 36423614693: step=5 stepcut=2 with THREE walks contested - the cure
  // converts but its own bottleneck (the contested walk) stayed blind because
  // the catch swallowed gotoSafe's named refusal (the water-rescue gate, the
  // spin breaker, the doomed-goal ledger, the governor's timeout - every
  // family already has a name in the message).
  assert.ok(minerSrc.includes('vein sweep: stance step refused - the walk contested ('), 'the contest line keeps its byte-true prefix (the band pin holds) and grows the message window')
  assert.ok(minerSrc.includes("String(e?.message ?? 'no error read').slice(0, 40)"), 'the refusal name rides the SAME line, capped at 40 chars (the write-off ladder trace\'s own cap)')
  assert.ok(minerSrc.includes('} catch (e) {') || minerSrc.includes('catch (e)'), 'the catch binds the error - a swallowed contest is a blind decode')
})

test('the step re-arms against the doomed ledger: the honest attempt (v0.286.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // face 36431514130 (v0.285.0's first field read): the contest named its
  // families - 'the walk contested (doomed goal (ledgered 3s ago at
  // [-142,43...)' with the ledger CLUSTERED ([-113,41,427] [-114,41,428]
  // [-115,41,427] within 12s) - another bot's failed walk from ANOTHER start
  // dooms the support cell fleet-wide and the step dies at the consult for
  // free. The re-arm is the v0.87.0 yard lesson verbatim: ONE honest
  // bounded-A* attempt from THIS bot's start, the cap law unchanged.
  assert.ok(minerSrc.includes("timeoutMs: 4000, label: 'stance step', doomedRearm: true"), 'the step walk carries doomedRearm: true - the poisoned cell gets the honest attempt, a proven-dead verdict re-records with a fresh TTL')
  const armAt = minerSrc.indexOf('doomedRearm: true')
  const capAt = minerSrc.indexOf('stanceSteps < 1')
  assert.ok(armAt > 0 && capAt > 0, 'both the re-arm and the cap law live in the miner')
  assert.ok(armAt > capAt, 'the re-arm rides the capped walk (the cap gates first - the re-arm cannot orbit the sweep)')
})

test('the step progress: the timeout walk measures itself (v0.287.0)', () => {
  // face 36438371944 (the re-arm's first field flight, SUCCESS): step=3
  // stepcut=2 - the re-arm converts (67% vs 40% and 0%), the doomed-goal
  // suffix is GONE (the poisoning healed), and the ONLY remaining loss is
  // `the walk contested (stance step: timeout after 4000ms)` on the far
  // edge (dist 2.5). The timeout family owns the bottleneck, but a cure
  // needs the walk's anatomy: 'never moved' (a stuck pathfinder - a
  // geometry read) vs 'walked and the budget bit' (a budget or a retry).
  // The progress read names the distance; junk names nothing.
  assert.equal(stepWalkProgress({ x: 1, z: 2 }, { x: 4, z: 6 }), 5, 'a clean 3-4-5 read walks 5')
  assert.equal(stepWalkProgress({ x: 1, z: 2 }, { x: 1, z: 2 }), 0, 'a zero-progress read walks 0 - the stuck class names itself')
  assert.equal(stepWalkProgress(null, { x: 4, z: 6 }), null, 'a missing start names nothing')
  assert.equal(stepWalkProgress({ x: 1, z: 2 }, null), null, 'a missing end (a lost entity) names nothing')
  assert.equal(stepWalkProgress({ x: NaN, z: 2 }, { x: 4, z: 6 }), null, 'a junk start coordinate names nothing')
  assert.equal(stepWalkProgress({ x: 1, z: 2 }, { x: Infinity, z: 6 }), null, 'a junk end coordinate names nothing')
  assert.equal(stepWalkProgress(undefined, undefined), null, 'junk in, nothing out')
})

test('the step progress is wired: the start fixes at the arm, the catch appends the distance (v0.287.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const letAt = minerSrc.indexOf('let stepFrom = null')
  const armAt = minerSrc.indexOf('stanceSteps++')
  const setAt = minerSrc.indexOf('stepFrom = { x: bot.entity.position.x, z: bot.entity.position.z }')
  const gotoAt = minerSrc.indexOf('doomedRearm: true')
  assert.ok(letAt > 0 && setAt > 0, 'the start lives past the catch (a const inside the try dies with it)')
  assert.ok(letAt > armAt && setAt > letAt && gotoAt > setAt, 'the order is arm -> fix the start -> walk (the progress measures THIS walk)')
  assert.ok(minerSrc.includes('stepWalkProgress(stepFrom, bot.entity && bot.entity.position)'), 'the catch reads the progress from the fixed start and the live position')
  assert.ok(minerSrc.includes('`, walked ${walked.toFixed(1)}`'), 'the distance rides the SAME line (the tail-append law) - junk stays bare')
  assert.ok(minerSrc.includes("String(e?.message ?? 'no error read').slice(0, 40)"), 'the 40-char message window keeps its byte-true shape (the v0.285.0 pin holds)')
})
