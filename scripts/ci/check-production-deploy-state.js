#!/usr/bin/env node
'use strict';

const assert = require('assert');

const {
  calculateBehindDevelop,
  createInitialProductionDeployState,
  failProductionDeployState,
  isFullSha,
  markProductionDeployState,
  parseProductionStatusIssue,
  resolveTargetSha,
  shouldBlockDuplicateDeployment,
} = require('./production-deploy-state');

const shaA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const shaB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

assert.ok(isFullSha(shaA), 'full SHA should be accepted');
assert.ok(!isFullSha('abc123'), 'short SHA should be rejected for target_sha');
assert.strictEqual(resolveTargetSha({ targetSha: '', latestDevelopSha: shaA }), shaA);
assert.strictEqual(resolveTargetSha({ targetSha: shaA, latestDevelopSha: shaA }), shaA);
assert.throws(
  () => resolveTargetSha({ targetSha: shaB, latestDevelopSha: shaA }),
  /latest origin\/develop/,
  'target_sha must match latest develop',
);

let state = createInitialProductionDeployState({
  targetSha: shaA,
  latestDevelopSha: shaA,
  dryRun: true,
  force: false,
  workflowRunUrl: 'https://github.example/actions/runs/1',
});
assert.strictEqual(state.status, 'preflight');
assert.strictEqual(state.sourcePush, 'not-started');
assert.strictEqual(state.currentProductionSha, 'unknown');

state = markProductionDeployState(state, 'source-pushed');
assert.strictEqual(state.status, 'source-pushed');
assert.strictEqual(state.sourcePush, 'success');

state = markProductionDeployState(state, 'deployment-updated');
assert.strictEqual(state.status, 'deployment-updated');
assert.strictEqual(state.deploymentUpdate, 'success');

state = markProductionDeployState(state, 'deployed');
assert.strictEqual(state.status, 'deployed');
assert.strictEqual(state.currentProductionSha, shaA);
assert.strictEqual(state.smokeTest, 'success');
assert.strictEqual(state.lastFailureStage, '');

const failed = failProductionDeployState(state, 'smoke-test', new Error('safe failure'));
assert.strictEqual(failed.status, 'failed');
assert.strictEqual(failed.lastFailureStage, 'smoke-test');
assert.match(failed.failureMessage, /safe failure/);

assert.deepStrictEqual(
  shouldBlockDuplicateDeployment({
    currentProductionSha: shaA,
    productionStatus: 'deployed',
    targetSha: shaA,
    force: false,
  }),
  {
    blocked: true,
    reason: 'target_sha is already recorded as deployed. Re-run with force=true only when redeploy is intentional.',
  },
);
assert.strictEqual(
  shouldBlockDuplicateDeployment({
    currentProductionSha: shaA,
    productionStatus: 'deployed',
    targetSha: shaA,
    force: true,
  }).blocked,
  false,
  'force=true should allow a deliberate redeploy',
);
assert.strictEqual(
  shouldBlockDuplicateDeployment({
    currentProductionSha: shaA,
    productionStatus: 'failed',
    targetSha: shaA,
    force: false,
  }).blocked,
  false,
  'failed previous deploy should not block retry',
);

const parsed = parseProductionStatusIssue([
  '# 本番反映ステータス',
  '',
  '- 状態: `deployed`',
  `- 本番commit: \`${shaA}\``,
  `- 最新develop: \`${shaB}\``,
  '- developとの差分: `2 commits`',
  '- 最終失敗ステージ: `none`',
].join('\n'));
assert.strictEqual(parsed.productionStatus, 'deployed');
assert.strictEqual(parsed.currentProductionSha, shaA);
assert.strictEqual(parsed.latestDevelopSha, shaB);
assert.strictEqual(parsed.commitsBehindDevelop, '2 commits');

assert.strictEqual(
  calculateBehindDevelop({
    currentProductionSha: shaA,
    latestDevelopSha: shaA,
    isAncestor: true,
    commitCount: 0,
  }),
  '0 commits',
);
assert.strictEqual(
  calculateBehindDevelop({
    currentProductionSha: shaA,
    latestDevelopSha: shaB,
    isAncestor: true,
    commitCount: 3,
  }),
  '3 commits',
);
assert.strictEqual(
  calculateBehindDevelop({
    currentProductionSha: shaA,
    latestDevelopSha: shaB,
    isAncestor: false,
    commitCount: 0,
  }),
  'unknown-diverged',
);

console.log('production deploy state checks passed');
