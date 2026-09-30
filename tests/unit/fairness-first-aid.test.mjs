// (v0.332.0) THE FAIRNESS FIRST-AID - the account-level queue instrument,
// pinned. The 0938-1038 fires found the starvation mechanism: the runner pool
// is per-ACCOUNT while the concurrency group is per-ref, so a sibling repo's
// self-generated backlog (~660 runs, 100-300/hour generation vs ~135/hour
// drain) monopolized the account FIFO and privateB's face dispatch starved
// behind runs it had never seen. The tool turns that audit and its surgical
// cure into one command. The text is the contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(root, 'scripts/account-sweep.mjs'), 'utf8');

test('the instrument exists and dispatches its three verbs', () => {
  assert.match(src, /sweep/);
  assert.match(src, /fifo/);
  assert.match(src, /cancel-older-than/);
});

test('the cancel path is QUEUED-ONLY (the body-guard law)', () => {
  assert.match(
    src,
    /status === 'queued' && x\.created_at < iso/,
    'a queued run has started no work; the tool must never touch in-progress'
  );
  const fnStart = src.indexOf('async function cancelOlderThan');
  const fnBody = src.slice(fnStart, src.indexOf('const [cmd, ...args]'));
  assert.doesNotMatch(fnBody, /in_progress/,
    'inside the cancel verb, nothing may even look at in-progress runs');
  assert.doesNotMatch(src, /workflows\/[^/]*\/disable/,
    'the tool never disables a sibling workflow - that kills a project');
});

test('the token never lives in source (the repo is public)', () => {
  assert.doesNotMatch(src, /ghp_[A-Za-z0-9]/, 'env-only auth: GH_TOKEN/GITHUB_TOKEN');
  assert.match(src, /GH_TOKEN \|\| process\.env\.GITHUB_TOKEN/);
  assert.match(src, /refusing to guess/, 'missing token must exit, not improvise');
});

test('the fifo verdict names the starvation explicitly', () => {
  assert.match(src, /STARVED:/, 'head-of-line not ours -> the lane must know');
  assert.match(src, /FAIR:/, 'head-of-line ours -> the lane must know that too');
});
