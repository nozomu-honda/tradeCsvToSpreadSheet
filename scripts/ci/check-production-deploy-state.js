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
assert.strictEqual(state.lastDeploymentWorkflowUrl, 'unknown');
assert.strictEqual(state.lastVerificationAt, 'unknown');
assert.strictEqual(state.lastVerificationWorkflowUrl, 'unknown');

state = markProductionDeployState(state, 'source-pushed');
assert.strictEqual(state.status, 'source-pushed');
assert.strictEqual(state.sourcePush, 'success');

state = markProductionDeployState(state, 'deployment-updated');
assert.strictEqual(state.status, 'deployment-updated');
assert.strictEqual(state.deploymentUpdate, 'success');
assert.strictEqual(state.currentProductionSha, shaA, 'deployment update makes the target SHA the currently published production commit');

state = markProductionDeployState(state, 'deployed');
assert.strictEqual(state.status, 'deployed');
assert.strictEqual(state.currentProductionSha, shaA);
assert.strictEqual(state.lastSuccessfulDeploymentSha, shaA);
assert.strictEqual(state.lastDeploymentWorkflowUrl, 'https://github.example/actions/runs/1');
assert.notStrictEqual(state.lastVerificationAt, 'unknown');
assert.strictEqual(state.lastVerificationWorkflowUrl, 'https://github.example/actions/runs/1');
assert.strictEqual(state.smokeTest, 'success');
assert.strictEqual(state.lastFailureStage, '');

const failed = failProductionDeployState(state, 'smoke-test', new Error('safe failure'));
assert.strictEqual(failed.status, 'failed');
assert.strictEqual(failed.lastFailureStage, 'smoke-test');
assert.match(failed.failureMessage, /safe failure/);
assert.strictEqual(failed.sourcePush, 'success');
assert.strictEqual(failed.deploymentUpdate, 'success');
assert.strictEqual(failed.smokeTest, 'failed');
assert.strictEqual(failed.currentProductionSha, shaA, 'smoke failure must retain the deployment-updated target SHA');
assert.strictEqual(failed.lastSuccessfulDeploymentSha, shaA, 'a previous successful deployment SHA must be preserved');

const partialSmokeFailure = failProductionDeployState(
  markProductionDeployState(
    markProductionDeployState(createInitialProductionDeployState({
      targetSha: shaA,
      currentProductionSha: shaB,
      previousProductionSha: shaB,
      lastSuccessfulDeploymentSha: shaB,
      lastSuccessfulDeploymentAt: '2026-07-14T00:00:00.000Z',
    }), 'source-pushed'),
    'deployment-updated',
  ),
  'smoke-test',
  new Error('smoke failed after deployment update'),
);
assert.strictEqual(partialSmokeFailure.status, 'failed');
assert.strictEqual(partialSmokeFailure.currentProductionSha, shaA);
assert.strictEqual(partialSmokeFailure.sourcePush, 'success');
assert.strictEqual(partialSmokeFailure.deploymentUpdate, 'success');
assert.strictEqual(partialSmokeFailure.smokeTest, 'failed');
assert.strictEqual(partialSmokeFailure.lastSuccessfulDeploymentSha, shaB, 'smoke failure must not advance the last successful deployment SHA');
assert.strictEqual(partialSmokeFailure.lastSuccessfulDeploymentAt, '2026-07-14T00:00:00.000Z');

const deploymentFailed = failProductionDeployState(
  markProductionDeployState(createInitialProductionDeployState({ targetSha: shaA }), 'source-pushed'),
  'deployment-update',
  new Error('deploy failed'),
);
assert.strictEqual(deploymentFailed.sourcePush, 'success');
assert.strictEqual(deploymentFailed.deploymentUpdate, 'failed');
assert.strictEqual(deploymentFailed.smokeTest, 'not-started');
assert.notStrictEqual(deploymentFailed.currentProductionSha, shaA, 'failed deployment update must not publish the target SHA');

const sourceFailed = failProductionDeployState(
  createInitialProductionDeployState({ targetSha: shaA }),
  'source-push',
  new Error('push failed'),
);
assert.strictEqual(sourceFailed.sourcePush, 'failed');
assert.strictEqual(sourceFailed.deploymentUpdate, 'not-started');
assert.strictEqual(sourceFailed.smokeTest, 'not-started');
assert.notStrictEqual(sourceFailed.currentProductionSha, shaA, 'failed source push must not publish the target SHA');

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
  `- 反映対象commit: \`${shaA}\``,
  `- 最新develop: \`${shaB}\``,
  '- developとの差分: `2 commits`',
  '- 最終本番反映 source push: `success`',
  '- 最終本番反映 deployment update: `success`',
  '- 最終本番反映 smoke test: `success`',
  `- 最終成功本番反映commit: \`${shaA}\``,
  '- 最終成功deployment日時: `2026-07-14T00:00:00.000Z`',
  '- 最終本番検証日時: `2026-07-14T01:00:00.000Z`',
  '- 最終本番検証workflow: https://github.example/actions/runs/12',
  '- 最終本番反映workflow: https://github.example/actions/runs/10',
  '- 最終status同期workflow: https://github.example/actions/runs/11',
  '- 最終失敗ステージ: `none`',
].join('\n'));
assert.strictEqual(parsed.productionStatus, 'deployed');
assert.strictEqual(parsed.currentProductionSha, shaA);
assert.strictEqual(parsed.targetSha, shaA);
assert.strictEqual(parsed.latestDevelopSha, shaB);
assert.strictEqual(parsed.commitsBehindDevelop, '2 commits');
assert.strictEqual(parsed.sourcePush, 'success');
assert.strictEqual(parsed.deploymentUpdate, 'success');
assert.strictEqual(parsed.smokeTest, 'success');
assert.strictEqual(parsed.lastSuccessfulDeploymentSha, shaA);
assert.strictEqual(parsed.lastSuccessfulDeploymentAt, '2026-07-14T00:00:00.000Z');
assert.strictEqual(parsed.lastVerificationAt, '2026-07-14T01:00:00.000Z');
assert.strictEqual(parsed.lastVerificationWorkflowUrl, 'https://github.example/actions/runs/12');
assert.strictEqual(parsed.lastDeploymentWorkflowUrl, 'https://github.example/actions/runs/10');
assert.strictEqual(parsed.lastStatusSyncWorkflowUrl, 'https://github.example/actions/runs/11');

const parsedSmokeFailure = parseProductionStatusIssue([
  '# 本番反映ステータス',
  '',
  '- 状態: `failed`',
  `- 本番commit: \`${shaA}\``,
  `- 反映対象commit: \`${shaA}\``,
  `- 最新develop: \`${shaA}\``,
  '- 最終本番反映 source push: `success`',
  '- 最終本番反映 deployment update: `success`',
  '- 最終本番反映 smoke test: `failed`',
  `- 最終成功本番反映commit: \`${shaB}\``,
  '- 最終成功deployment日時: `2026-07-14T00:00:00.000Z`',
  '- 最終本番検証日時: `2026-07-14T02:00:00.000Z`',
  '- 最終失敗ステージ: `smoke-test`',
].join('\n'));
assert.strictEqual(parsedSmokeFailure.productionStatus, 'failed');
assert.strictEqual(parsedSmokeFailure.currentProductionSha, shaA);
assert.strictEqual(parsedSmokeFailure.targetSha, shaA);
assert.strictEqual(parsedSmokeFailure.lastVerificationAt, '2026-07-14T02:00:00.000Z');
assert.strictEqual(parsedSmokeFailure.sourcePush, 'success');
assert.strictEqual(parsedSmokeFailure.deploymentUpdate, 'success');
assert.strictEqual(parsedSmokeFailure.smokeTest, 'failed');
assert.strictEqual(parsedSmokeFailure.lastSuccessfulDeploymentSha, shaB);
assert.strictEqual(parsedSmokeFailure.lastFailureStage, 'smoke-test');

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
