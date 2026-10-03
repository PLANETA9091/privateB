// (v0.331.0) THE FLEET-QUEUE SECESSION - the workflow's concurrency laws, pinned.
// One shared group (ci-<ref>) let CI push-churn starve and supersede the
// fleet's own dispatch: 36647887487 (the eight-instrument face) died queued
// when a lane pushed into its shadow, and six gates died the same death
// between 00:34Z and 01:50Z. The group now splits: run_fleet=true dispatches
// group under ...-fleet (untouchable by CI churn), everything else under
// ...-gate. These tests read the workflow file itself - the fleet's queue
// rights live in text, so the text is the contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const yml = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');

test('the fleet secedes: the concurrency group splits fleet from gate', () => {
  assert.match(
    yml,
    /group:\s*ci-\$\{\{ github\.ref \}\}-\$\{\{ github\.event\.inputs\.run_fleet == 'true' && 'fleet' \|\| 'gate' \}\}/,
    'the group key must be conditional: run_fleet=true lands in ...-fleet, every other run in ...-gate'
  );
});

test('cancel-in-progress stays false - a running fleet is never killed', () => {
  assert.match(yml, /cancel-in-progress:\s*false/);
  assert.doesNotMatch(yml, /cancel-in-progress:\s*true/,
    'a duplicate dispatch must queue behind an in-flight fleet, not kill it');
});

test('no tabs in the workflow (the structural law)', () => {
  assert.doesNotMatch(yml, /\t/);
});

test('the fleet dispatch path still keys on inputs.run_fleet', () => {
  assert.match(
    yml,
    /github\.event_name == 'workflow_dispatch' && inputs\.run_fleet == 'true'/,
    'the secession must not disturb how the fleet job arms itself'
  );
});

test('the stuck-fleet circuit breaker survives the secession', () => {
  assert.match(yml, /timeout-minutes:\s*18/,
    'the launch step keeps its own cap (v0.246.0) - a hung fleet must not hold the slot hostage');
});

test('the secession comment carries the evidence trail', () => {
  assert.match(yml, /THE FLEET-QUEUE SECESSION/,
    'the law and its reason must live beside the law');
});

// (v0.571.0) THE CALIBRATED DEFAULT - fleet 37147076203 (the v0.570.0 tree)
// launched for 300s because a dispatcher passed run_fleet=true but no
// fleet_seconds and BOTH defaults (the input's and the launch step's
// fallback) said 300. A half-regime run: the cadence economy never armed
// (zero bank trips, every smelt read 'nothing to smelt', the arrival seat
// silent by the lean law), pockets rode unbanked into a doom-latched
// write-off - and no row of the face vocabulary can read it. The rate
// points, the crater decodes and every census row calibrate on the 600s
// regime the 18-minute step cap is already sized for. The two sites must
// agree, and both must say 600.
test('the calibrated default: both fleet_seconds sites read 600 - a dispatcher omission cannot price a half-regime run', () => {
  const inputDefault = yml.match(/fleet_seconds:\s*\n\s*description:\s*'([^']*)'\s*\n\s*required:\s*false\s*\n\s*default:\s*'(\d+)'/);
  assert.ok(inputDefault, 'the fleet_seconds input block exists');
  assert.equal(inputDefault[2], '600', "the input's default is the calibrated 600s regime");
  const launch = yml.match(/fleet19\.mjs 19 \$\{\{ inputs\.fleet_seconds \|\| '(\d+)' \}\}/);
  assert.ok(launch, 'the launch line reads the input with a fallback');
  assert.equal(launch[1], '600', "the launch fallback equals the input's default (the two sites agree)");
  assert.match(yml, /THE CALIBRATED DEFAULT/, 'the law and its reason live beside the law (the evidence-trail shape)');
});
