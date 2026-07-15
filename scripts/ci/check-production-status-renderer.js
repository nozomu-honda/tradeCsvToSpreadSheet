#!/usr/bin/env node
'use strict';

const assert = require('assert');

const {
  createInitialProductionDeployState,
  failProductionDeployState,
  markProductionDeployState,
} = require('./production-deploy-state');
const { renderDryRunSummary, renderProductionStatusIssue } = require('./production-status-renderer');

const shaA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const shaB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const preflight = createInitialProductionDeployState({
  targetSha: shaA,
  latestDevelopSha: shaB,
  dryRun: true,
  force: false,
  workflowRunUrl: 'https://github.example/nozomu-honda/tradeCsvToSpreadSheet/actions/runs/123',
  previousProductionSha: 'unknown',
  commitsBehindDevelop: 'unknown',
});

const preflightBody = renderProductionStatusIssue(preflight);
assert.ok(preflightBody.includes('# 本番反映ステータス'));
assert.ok(preflightBody.includes('- 状態: `preflight`'));
assert.ok(preflightBody.includes('- 本番commit: `unknown`'));
assert.ok(preflightBody.includes(`- 反映対象commit: \`${shaA}\``));
assert.ok(preflightBody.includes(`- 最新develop: \`${shaB}\``));
assert.ok(preflightBody.includes('- 最新develop反映: `unknown`'));
assert.ok(preflightBody.includes('- 最終本番反映 source push: `not-started`'));
assert.ok(preflightBody.includes('- 最終本番反映 deployment update: `not-started`'));
assert.ok(preflightBody.includes('- 最終本番反映 smoke test: `not-started`'));
assert.ok(preflightBody.includes('- 最終成功deployment日時: `unknown`'));
assert.ok(preflightBody.includes('- 最終本番検証日時: `unknown`'));
assert.ok(preflightBody.includes('- 最終本番反映workflow: unknown'));
assert.ok(preflightBody.includes('- 最終本番検証workflow: unknown'));
assert.ok(preflightBody.includes('- 最終status同期workflow: unknown'));
assert.ok(preflightBody.includes('- 現在のworkflow run: https://github.example/nozomu-honda/tradeCsvToSpreadSheet/actions/runs/123'));
assert.ok(preflightBody.includes('<!-- production-status:managed-by-github-actions -->'));
assert.ok(!preflightBody.includes('PRODUCTION_SCRIPT_ID'), 'status body must not expose config names as values');
assert.ok(!preflightBody.includes('PRODUCTION_DEPLOYMENT_ID'), 'status body must not expose config names as values');

const deployed = markProductionDeployState(preflight, 'deployed', {
  previousProductionSha: shaA,
  commitsBehindDevelop: '0 commits',
});
const deployedBody = renderProductionStatusIssue(deployed);
assert.ok(deployedBody.includes('- 状態: `deployed`'));
assert.ok(deployedBody.includes(`- 本番commit: \`${shaA}\``));
assert.ok(deployedBody.includes('- 最新develop反映: `pending`'), 'latest develop differs from production in this fixture');
assert.ok(deployedBody.includes('- 最終本番反映 source push: `success`'));
assert.ok(deployedBody.includes('- 最終本番反映 deployment update: `success`'));
assert.ok(deployedBody.includes('- 最終本番反映 smoke test: `success`'));
assert.ok(deployedBody.includes(`- 最終成功本番反映commit: \`${shaA}\``));
assert.ok(deployedBody.includes('- developとの差分: `0 commits`'));
assert.ok(deployedBody.includes('- 最終成功deployment日時: `'));
assert.ok(deployedBody.includes('- 最終本番検証日時: `'));
assert.ok(deployedBody.includes('- 最終本番検証workflow: https://github.example/nozomu-honda/tradeCsvToSpreadSheet/actions/runs/123'));
assert.ok(deployedBody.includes('- 最終失敗ステージ: `none`'));

const smokeFailed = failProductionDeployState(
  markProductionDeployState(
    markProductionDeployState(createInitialProductionDeployState({
      targetSha: shaA,
      latestDevelopSha: shaA,
      previousProductionSha: shaB,
      currentProductionSha: shaB,
      lastSuccessfulDeploymentSha: shaB,
      lastSuccessfulDeploymentAt: '2026-07-14T00:00:00.000Z',
    }), 'source-pushed'),
    'deployment-updated',
  ),
  'smoke-test',
  new Error('private login boundary mismatch'),
);
const smokeFailedBody = renderProductionStatusIssue(smokeFailed);
assert.ok(smokeFailedBody.includes('- 状態: `failed`'));
assert.ok(smokeFailedBody.includes(`- 本番commit: \`${shaA}\``));
assert.ok(smokeFailedBody.includes('- 最終本番反映 source push: `success`'));
assert.ok(smokeFailedBody.includes('- 最終本番反映 deployment update: `success`'));
assert.ok(smokeFailedBody.includes('- 最終本番反映 smoke test: `failed`'));
assert.ok(smokeFailedBody.includes(`- 最終成功本番反映commit: \`${shaB}\``));
assert.ok(smokeFailedBody.includes('- 最終失敗ステージ: `smoke-test`'));

const dryRunSummary = renderDryRunSummary(preflight);
assert.ok(dryRunSummary.includes('Production deploy dry-run summary'));
assert.ok(dryRunSummary.includes('skipped by dry_run'));
assert.ok(dryRunSummary.includes('dry-runでは本番Apps Scriptへのpush'));

console.log('production status renderer checks passed');
