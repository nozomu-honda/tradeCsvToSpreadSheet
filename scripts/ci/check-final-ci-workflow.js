#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  CHANGE_CLASSIFICATIONS,
  FINAL_CI_CHECK_CONTEXT_MARKER,
  FINAL_CI_LABEL,
  FINAL_CI_REVIEW_MARKER,
  GAS_TESTS_CHECK_NAME,
  SNAPSHOT_ACTIONS,
  WEB_E2E_CHECK_NAME,
  buildCheckRunRequest,
  buildCheckRunsPath,
  buildFinalCiExecutionPlan,
  classifyChangedFiles,
  collectPaginatedItems,
  decideCheckExecution,
  determineWebE2eStatus,
  evaluateFinalCiGate,
  getCheckConclusionForStatus,
  hasActiveChangesRequested,
  hasSuccessfulCheckRun,
  isSameRepositoryPullRequest,
} = require('./final-ci');

const repoRoot = path.resolve(__dirname, '..', '..');
const finalCiControllerWorkflow = read('.github/workflows/final-ci.yml');
const finalCiRunWorkflow = read('.github/workflows/final-ci-run.yml');
const finalCiHeavyWorkflow = read('.github/workflows/final-ci-heavy.yml');
const finalCiHelper = read('scripts/ci/final-ci.js');
const gasTestsWorkflow = read('.github/workflows/gas-tests.yml');
const gasWebE2eWorkflow = read('.github/workflows/gas-web-e2e.yml');
const packageJson = JSON.parse(read('package.json'));
const HEAD_SHA = 'a'.repeat(40);
const OLD_HEAD_SHA = 'b'.repeat(40);
const BASE_SHA = 'c'.repeat(40);
const OLD_BASE_SHA = 'd'.repeat(40);
const REPOSITORY = 'nozomu-honda/tradeCsvToSpreadSheet';

async function main() {
  checkWorkflowStructure();
  checkPureGateRules();
  checkExistingResultRules();
  checkRunnerPlanRules();
  await checkPaginationRules();
  assert.ok(packageJson.scripts['test:final-ci-workflow'], 'package.json must expose test:final-ci-workflow');
  console.log('final CI workflow checks passed');
}

function checkWorkflowStructure() {
  assert.ok(finalCiControllerWorkflow.includes('name: Final CI controller'), 'final CI controller workflow must exist');
  assert.ok(finalCiControllerWorkflow.includes('pull_request:'), 'final CI controller must listen for PR label events');
  assert.ok(finalCiControllerWorkflow.includes('- labeled'), 'final CI controller must listen only to labeled PR events');
  for (const ignoredPath of ["'docs/**'", "'README.md'", "'AGENTS.md'"]) {
    assert.ok(finalCiControllerWorkflow.includes(ignoredPath), `controller must exclude ${ignoredPath} before a run is created`);
  }
  assert.ok(finalCiControllerWorkflow.includes(`github.event.label.name == '${FINAL_CI_LABEL}'`), 'controller must gate execution on run-final-ci');
  assert.ok(finalCiControllerWorkflow.includes('github.event.pull_request.head.repo.full_name == github.repository'), 'controller must call reusable final CI only for same-repository PRs');
  assert.ok(finalCiControllerWorkflow.includes('github.event.pull_request.head.repo.full_name != github.repository'), 'controller must fail closed for external PRs');
  assert.ok(finalCiControllerWorkflow.includes('base_sha: ${{ github.event.pull_request.base.sha }}'), 'controller must pin the event base SHA');
  assert.ok(finalCiControllerWorkflow.includes('head_sha: ${{ github.event.pull_request.head.sha }}'), 'controller must pin the event head SHA');
  assert.ok(!finalCiControllerWorkflow.includes('pull_request_target'), 'controller must not use pull_request_target');
  assert.ok(!finalCiControllerWorkflow.includes('secrets.'), 'controller must not directly read Google secrets');

  assert.ok(finalCiRunWorkflow.includes('workflow_call:'), 'gate workflow must be reusable');
  assert.ok(!finalCiRunWorkflow.includes('workflow_dispatch:'), 'gate workflow must not rely on workflow_dispatch');
  assert.ok(!finalCiRunWorkflow.includes('pull_request_target'), 'gate workflow must not use pull_request_target');
  assert.ok(!finalCiRunWorkflow.includes('gas-shared-test-project'), 'lightweight gate must not wait for the shared GAS project');
  assert.ok(!finalCiRunWorkflow.includes('final-ci-summary:'), 'a dedicated Final CI summary runner must not exist');
  assert.ok(finalCiRunWorkflow.includes('uses: ./.github/workflows/final-ci-heavy.yml'), 'heavy checks must be delegated to the shared-lock workflow');
  assert.ok(finalCiRunWorkflow.includes("needs.final-ci-gate.outputs.should_run_heavy == 'true'"), 'heavy workflow must be skipped for rejection and full reuse');

  const gateJob = section(finalCiRunWorkflow, '  final-ci-gate:', '  final-ci-heavy:');
  assert.ok(gateJob.includes('name: Final CI review gate'), 'a lightweight review gate job must run first');
  assert.ok(gateJob.includes('group: final-ci-gate-pr-${{ inputs.pr_number }}'), 'gate concurrency must be scoped to one PR');
  assert.ok(gateJob.includes('cancel-in-progress: true'), 'an older gate for the same PR must be cancelable');
  assert.ok(!gateJob.includes('queue: max'), 'the cancelable lightweight gate must not use the shared queue policy');
  assert.ok(gateJob.includes('Load review gate from trusted develop base'), 'gate code must come from the trusted event base');
  assert.ok(gateJob.includes('BASE_SHA: ${{ inputs.base_sha }}'), 'trusted gate code must be pinned to the event base SHA');
  assert.ok(gateJob.includes('EXPECTED_BASE_SHA: ${{ inputs.base_sha }}'), 'gate must compare event and current base SHA');
  assert.ok(gateJob.includes('node "${RUNNER_TEMP}/final-ci-gate.js" gate'), 'trusted helper must execute the review gate command');
  for (const forbidden of ['actions/checkout', 'actions/setup-node', 'npm ci', '@google/clasp', 'secrets.']) {
    assert.ok(!gateJob.includes(forbidden), `review gate must run before ${forbidden}`);
  }
  for (const outputName of ['allowed', 'classification', 'gas_action', 'web_action', 'current_head_sha', 'current_base_sha', 'should_run_heavy']) {
    assert.ok(gateJob.includes(`${outputName}:`), `review gate must expose ${outputName}`);
  }

  assert.ok(finalCiHeavyWorkflow.includes('workflow_call:'), 'heavy workflow must be reusable only');
  assert.ok(!finalCiHeavyWorkflow.includes('pull_request_target'), 'heavy workflow must not use pull_request_target');
  assert.ok(finalCiHeavyWorkflow.includes('gas-shared-test-project'), 'GAS, Web deploy, E2E, and cleanup must share one project lock');
  assert.ok(finalCiHeavyWorkflow.includes('queue: max'), 'shared project work must retain every pending PR run');
  assert.ok(finalCiHeavyWorkflow.includes('cancel-in-progress: false'), 'shared project work and cleanup must never be auto-cancelled');
  assert.ok(!finalCiHeavyWorkflow.includes('final-ci-summary:'), 'heavy workflow must not add a summary-only runner');

  const gasJob = section(finalCiHeavyWorkflow, '  gas-tests:', '  gas-web-e2e:');
  assert.ok(gasJob.includes(`name: ${GAS_TESTS_CHECK_NAME}`), 'required GAS check name must stay fixed');
  assert.ok(gasJob.includes("if: ${{ inputs.gas_action == 'execute' }}"), 'GAS runner starts only for an execute decision');
  assert.ok(gasJob.includes('EXPECTED_BASE_SHA: ${{ inputs.base_sha }}'), 'GAS Tests must re-check the base SHA before secrets are used');
  assert.ok(gasJob.includes('id: gas_manifest_sync'), 'GAS Tests must verify the manifest and test runner before clasp push');
  assert.ok(gasJob.includes('node scripts/ci/check-gas-test-manifest-sync.js'), 'GAS Tests must run the dedicated manifest sync preflight');
  assert.ok(gasJob.includes('MANIFEST_SYNC_OUTCOME: ${{ steps.gas_manifest_sync.outcome }}'), 'manifest sync failure must affect the GAS result');
  const gasHeadGuardIndex = gasJob.indexOf('id: gas_head_guard');
  const gasManifestSyncIndex = gasJob.indexOf('id: gas_manifest_sync');
  const gasSelectionIndex = gasJob.indexOf('id: select_gas_tests');
  const claspInstallIndex = gasJob.indexOf('id: install_clasp');
  const claspPushIndex = gasJob.indexOf('id: run_gas_tests');
  assert.ok(
    gasHeadGuardIndex < gasManifestSyncIndex &&
      gasManifestSyncIndex < gasSelectionIndex &&
      gasManifestSyncIndex < claspInstallIndex &&
      gasManifestSyncIndex < claspPushIndex,
    'manifest sync must run after the head guard and before selection, clasp installation, and clasp push',
  );
  assert.ok(gasJob.includes('TARGET_BASE_SHA: ${{ inputs.base_sha }}'), 'GAS check publication must bind the base SHA');
  assert.ok(gasJob.includes('TARGET_HEAD_SHA: ${{ inputs.head_sha }}'), 'GAS check publication must bind the head SHA');
  assert.ok(gasJob.includes('Summarize Final CI when Web E2E will not run'), 'GAS-only final status must be summarized in the GAS runner');

  const webJob = finalCiHeavyWorkflow.slice(finalCiHeavyWorkflow.indexOf('  gas-web-e2e:'));
  assert.ok(webJob.includes(`name: ${WEB_E2E_CHECK_NAME}`), 'Web E2E check name must stay fixed');
  assert.ok(webJob.includes("inputs.web_action == 'execute'"), 'Web E2E runner starts only for an execute decision');
  assert.ok(webJob.includes("inputs.gas_action == 'reuse'"), 'Web E2E may follow an exact-context reused GAS success');
  assert.ok(webJob.includes("needs.gas-tests.result == 'success'"), 'Web E2E must follow successful executed GAS Tests');
  assert.ok(webJob.includes('id: cleanup_dynamic_webapp'), 'dynamic deployment cleanup outcome must be recorded');
  assert.ok(webJob.includes('CLEANUP_OUTCOME: ${{ steps.cleanup_dynamic_webapp.outcome }}'), 'cleanup failure must affect Web E2E status');
  assert.ok(webJob.includes('TARGET_BASE_SHA: ${{ inputs.base_sha }}'), 'Web E2E check publication must bind the base SHA');
  assert.ok(webJob.includes('TARGET_HEAD_SHA: ${{ inputs.head_sha }}'), 'Web E2E check publication must bind the head SHA');
  assert.ok(webJob.includes('Summarize Final CI with Web E2E result'), 'Web path final status must be summarized in the Web runner');

  assert.ok(finalCiHelper.includes('currentHeadSha !== env.TARGET_HEAD_SHA'), 'check publisher must re-check PR head before publication');
  assert.ok(finalCiHelper.includes('currentBaseSha !== env.TARGET_BASE_SHA'), 'check publisher must re-check PR base before publication');
  assert.ok(finalCiHelper.includes("method: 'POST'"), 'Check Run creation failure must fail closed');
  assert.ok(finalCiHelper.includes('readPaginatedRestArray'), 'comments, reviews, and changed files must use pagination');
  assert.ok(finalCiHelper.includes('readReviewThreadState'), 'review threads must be read with GraphQL pagination');
  assert.ok(finalCiHelper.includes('path: buildCheckRunsPath({'), 'Check Run pagination must use the filter=all request builder');

  assert.ok(!gasTestsWorkflow.includes('pull_request:'), 'legacy GAS Tests workflow must not run on PR labels');
  assert.ok(gasTestsWorkflow.includes('workflow_dispatch:'), 'legacy GAS Tests workflow remains manual fallback only');
  assert.ok(gasTestsWorkflow.includes('group: gas-shared-test-project'), 'legacy GAS Tests fallback must use shared concurrency');
  assert.ok(gasTestsWorkflow.includes('queue: max'), 'legacy GAS Tests fallback must retain pending shared-project runs');
  assert.ok(gasTestsWorkflow.includes('cancel-in-progress: false'), 'legacy GAS cleanup must not be auto-cancelled');
  assert.ok(!gasWebE2eWorkflow.includes('pull_request:'), 'legacy Web E2E workflow must not run on PR labels');
  assert.ok(gasWebE2eWorkflow.includes('workflow_dispatch:'), 'legacy Web E2E workflow remains manual fallback only');
  assert.ok(gasWebE2eWorkflow.includes('group: gas-shared-test-project'), 'legacy Web E2E fallback must use shared concurrency');
  assert.ok(gasWebE2eWorkflow.includes('queue: max'), 'legacy Web E2E fallback must retain pending shared-project runs');
  assert.ok(gasWebE2eWorkflow.includes('cancel-in-progress: false'), 'legacy Web cleanup must not be auto-cancelled');
}

function checkPureGateRules() {
  assert.strictEqual(classifyChangedFiles(['docs/gas-ci.md']), CHANGE_CLASSIFICATIONS.DOCS_ONLY, 'docs-only classification');
  assert.strictEqual(classifyChangedFiles(['README.md']), CHANGE_CLASSIFICATIONS.DOCS_ONLY, 'README-only classification');
  assert.strictEqual(classifyChangedFiles(['src/app/db.gs']), CHANGE_CLASSIFICATIONS.GAS_TESTS_ONLY, 'backend GAS only classification');
  assert.strictEqual(classifyChangedFiles(['Index.html']), CHANGE_CLASSIFICATIONS.GAS_TESTS_AND_WEB_E2E, 'UI changes require Web E2E');
  assert.strictEqual(classifyChangedFiles(['appsscript.json']), CHANGE_CLASSIFICATIONS.GAS_TESTS_AND_WEB_E2E, 'manifest changes require Web E2E');
  assert.strictEqual(classifyChangedFiles(['new/ambiguous-file.js']), CHANGE_CLASSIFICATIONS.GAS_TESTS_AND_WEB_E2E, 'unknown paths fail safe to Web E2E');

  assertGateRejected({ changedFiles: ['docs/gas-ci.md'] }, 'docs-only changes must not start Final CI');
  assertGateRejected({ comments: [] }, 'review completion marker for the current head and base SHA is missing');
  assertGateRejected({ comments: [reviewMarker(HEAD_SHA, OLD_BASE_SHA)] }, 'review completion marker for the current head and base SHA is missing');
  assertGateRejected({ comments: [reviewMarker(OLD_HEAD_SHA, BASE_SHA)] }, 'review completion marker for the current head and base SHA is missing');
  assertGateRejected({ expectedBaseSha: OLD_BASE_SHA }, 'PR base changed after final CI was requested');
  assertGateRejected({ pullRequest: pullRequest({ baseSha: OLD_BASE_SHA }) }, 'PR base changed after final CI was requested');
  assertGateRejected({
    comments: [{ ...reviewMarker(HEAD_SHA, BASE_SHA), author_association: 'NONE' }],
  }, 'review completion marker for the current head and base SHA is missing');
  assertGateRejected({ pullRequest: pullRequest({ draft: true }) }, 'pull request is still Draft');
  assertGateRejected({ pullRequest: pullRequest({ baseRef: 'main' }) }, 'pull request base branch is not develop');
  assertGateRejected({ unresolvedReviewThreadCount: 1 }, 'unresolved review threads remain');
  assertGateRejected({
    reviews: [{ user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-07-16T00:00:00Z' }],
    reviewDecision: 'CHANGES_REQUESTED',
  }, 'an active changes-requested review remains');
  assertGateRejected({ pullRequest: pullRequest({ headRepository: 'someone/fork' }) }, 'secret-backed final CI is disabled for fork or external PRs');

  const approvedAfterChanges = gate({
    reviews: [
      { user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-07-16T00:00:00Z' },
      { user: { login: 'reviewer' }, state: 'APPROVED', submitted_at: '2026-07-16T01:00:00Z' },
    ],
    reviewDecision: 'APPROVED',
  });
  assert.strictEqual(approvedAfterChanges.allowed, true, 'same reviewer approval after changes requested clears the block');

  const gasOnly = gate({ changedFiles: ['src/app/db.gs'] });
  assert.strictEqual(gasOnly.classification, CHANGE_CLASSIFICATIONS.GAS_TESTS_ONLY, 'backend GAS-only classification');
  assert.strictEqual(gasOnly.gasAction, SNAPSHOT_ACTIONS.EXECUTE, 'backend GAS-only runs GAS Tests');
  assert.strictEqual(gasOnly.webAction, SNAPSHOT_ACTIONS.NOT_REQUIRED, 'backend GAS-only runs zero Web E2E jobs');

  const uiChange = gate({ changedFiles: ['Index.html'] });
  assert.strictEqual(uiChange.gasAction, SNAPSHOT_ACTIONS.EXECUTE, 'UI change runs GAS Tests first');
  assert.strictEqual(uiChange.webAction, SNAPSHOT_ACTIONS.EXECUTE, 'UI change runs Web E2E after GAS Tests');

  const gasReused = gate({
    gasCheckRuns: [successfulCheck(GAS_TESTS_CHECK_NAME, HEAD_SHA, BASE_SHA)],
  });
  assert.strictEqual(gasReused.gasAction, SNAPSHOT_ACTIONS.REUSE, 'same head and base GAS success avoids a heavy rerun');

  const oldBaseGasSuccess = gate({
    gasCheckRuns: [successfulCheck(GAS_TESTS_CHECK_NAME, HEAD_SHA, OLD_BASE_SHA)],
  });
  assert.strictEqual(oldBaseGasSuccess.gasAction, SNAPSHOT_ACTIONS.EXECUTE, 'same-head old-base GAS success is never reused');

  const bothReused = gate({
    changedFiles: ['Index.html'],
    gasCheckRuns: [successfulCheck(GAS_TESTS_CHECK_NAME, HEAD_SHA, BASE_SHA)],
    webCheckRuns: [successfulCheck(WEB_E2E_CHECK_NAME, HEAD_SHA, BASE_SHA)],
  });
  assert.strictEqual(bothReused.gasAction, SNAPSHOT_ACTIONS.REUSE, 'same-context GAS success is reused');
  assert.strictEqual(bothReused.webAction, SNAPSHOT_ACTIONS.REUSE, 'same-context Web E2E success is reused');

  assert.strictEqual(
    hasActiveChangesRequested([
      { user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-07-16T00:00:00Z' },
      { user: { login: 'reviewer' }, state: 'APPROVED', submitted_at: '2026-07-16T01:00:00Z' },
    ]),
    false,
    'latest approval by the same reviewer clears an earlier changes request',
  );
}

function checkExistingResultRules() {
  assert.strictEqual(isSameRepositoryPullRequest({ repository: REPOSITORY, headRepository: REPOSITORY }), true, 'same repository detection');
  assert.strictEqual(isSameRepositoryPullRequest({ repository: REPOSITORY, headRepository: 'someone/fork' }), false, 'fork detection');
  assert.strictEqual(
    hasSuccessfulCheckRun([successfulCheck(GAS_TESTS_CHECK_NAME, HEAD_SHA, BASE_SHA)], GAS_TESTS_CHECK_NAME, HEAD_SHA, BASE_SHA),
    true,
    'successful exact head and base check detection',
  );
  assert.strictEqual(
    hasSuccessfulCheckRun([
      { name: GAS_TESTS_CHECK_NAME, conclusion: 'success', head_sha: HEAD_SHA, output: { summary: 'automatic job check without Final CI context' } },
      successfulCheck(GAS_TESTS_CHECK_NAME, HEAD_SHA, BASE_SHA),
    ], GAS_TESTS_CHECK_NAME, HEAD_SHA, BASE_SHA),
    true,
    'an older context-bound success remains reusable when a newer same-name automatic check exists',
  );
  assert.strictEqual(
    hasSuccessfulCheckRun([successfulCheck(GAS_TESTS_CHECK_NAME, HEAD_SHA, OLD_BASE_SHA)], GAS_TESTS_CHECK_NAME, HEAD_SHA, BASE_SHA),
    false,
    'old-base checks must not be reused',
  );
  assert.strictEqual(
    hasSuccessfulCheckRun([successfulCheck(GAS_TESTS_CHECK_NAME, OLD_HEAD_SHA, BASE_SHA)], GAS_TESTS_CHECK_NAME, HEAD_SHA, BASE_SHA),
    false,
    'old-head checks must not be reused',
  );
  assert.strictEqual(
    hasSuccessfulCheckRun([successfulCheck(`${GAS_TESTS_CHECK_NAME} automatic`, HEAD_SHA, BASE_SHA)], GAS_TESTS_CHECK_NAME, HEAD_SHA, BASE_SHA),
    false,
    'similar but non-exact check names must not be reused',
  );
  assert.strictEqual(
    hasSuccessfulCheckRun([{ name: GAS_TESTS_CHECK_NAME, conclusion: 'success', head_sha: HEAD_SHA }], GAS_TESTS_CHECK_NAME, HEAD_SHA, BASE_SHA),
    false,
    'legacy checks without a base marker must not be reused',
  );
  for (const conclusion of ['failure', 'neutral', 'cancelled', 'skipped']) {
    const check = successfulCheck(WEB_E2E_CHECK_NAME, HEAD_SHA, BASE_SHA);
    check.conclusion = conclusion;
    assert.strictEqual(
      hasSuccessfulCheckRun([check], WEB_E2E_CHECK_NAME, HEAD_SHA, BASE_SHA),
      false,
      `${conclusion} Web E2E checks must not be reused`,
    );
  }

  const checkRunsPath = buildCheckRunsPath({
    repository: REPOSITORY,
    headSha: HEAD_SHA,
    checkName: GAS_TESTS_CHECK_NAME,
    page: 3,
    pageSize: 100,
  });
  assert.ok(checkRunsPath.includes('filter=all'), 'Check Runs requests must search all matching history');
  assert.ok(checkRunsPath.includes('per_page=100&page=3'), 'Check Runs requests must preserve pagination');
  assert.ok(checkRunsPath.includes(`check_name=${encodeURIComponent(GAS_TESTS_CHECK_NAME)}`), 'Check Runs requests must keep the exact encoded check name');

  assert.strictEqual(getCheckConclusionForStatus('executed'), 'success', 'executed status publishes success');
  assert.strictEqual(getCheckConclusionForStatus('reused'), 'success', 'reused status publishes success');
  assert.strictEqual(getCheckConclusionForStatus('failed'), 'failure', 'failed status publishes failure');
  assert.strictEqual(getCheckConclusionForStatus('skipped'), 'failure', 'skipped status publishes failure');

  const webCheckRequest = buildCheckRunRequest({
    repository: REPOSITORY,
    checkName: WEB_E2E_CHECK_NAME,
    targetHeadSha: HEAD_SHA,
    targetBaseSha: BASE_SHA,
    checkStatus: 'executed',
    checkReason: 'Web E2E executed successfully',
    checkDetailsUrl: 'https://example.invalid/actions/runs/1',
  });
  assert.strictEqual(webCheckRequest.body.head_sha, HEAD_SHA, 'Web E2E check run head SHA');
  assert.ok(webCheckRequest.body.output.summary.includes(`base_sha: ${BASE_SHA}`), 'Check Run stores the reviewed base SHA');
  assert.ok(webCheckRequest.body.output.summary.includes(FINAL_CI_CHECK_CONTEXT_MARKER), 'Check Run stores a versioned context marker');

  assertWebStatus('Web E2E initial success', {
    decisionStatus: 'executed', headGuardOutcome: 'success', secretsOutcome: 'success', installOutcome: 'success',
    deployOutcome: 'success', webappProbe: 'ready', playwrightOutcome: 'success', cleanupOutcome: 'success', dynamicDeploymentId: 'dynamic-id',
  }, 'executed');
  assertWebStatus('cleanup failure', {
    decisionStatus: 'executed', headGuardOutcome: 'success', secretsOutcome: 'success', installOutcome: 'success', deployOutcome: 'success',
    webappProbe: 'ready', playwrightOutcome: 'success', dynamicDeploymentId: 'dynamic-id', cleanupOutcome: 'failure',
  }, 'failed');
  assertWebStatus('HTTP 403 skip', {
    decisionStatus: 'executed', headGuardOutcome: 'success', secretsOutcome: 'success', installOutcome: 'success', deployOutcome: 'success', webappProbe: 'protected',
  }, 'skipped');

  assert.strictEqual(
    decideCheckExecution({
      labelName: FINAL_CI_LABEL,
      sameRepository: true,
      expectedHeadSha: HEAD_SHA,
      expectedBaseSha: BASE_SHA,
      currentHeadSha: HEAD_SHA,
      currentBaseSha: BASE_SHA,
      checkName: GAS_TESTS_CHECK_NAME,
      checkRuns: [successfulCheck(GAS_TESTS_CHECK_NAME, HEAD_SHA, OLD_BASE_SHA)],
    }).action,
    'execute',
    'the decision helper rejects old-base success',
  );
  assert.strictEqual(
    decideCheckExecution({
      labelName: FINAL_CI_LABEL,
      sameRepository: true,
      expectedHeadSha: HEAD_SHA,
      expectedBaseSha: BASE_SHA,
      currentHeadSha: HEAD_SHA,
      currentBaseSha: OLD_BASE_SHA,
      checkName: GAS_TESTS_CHECK_NAME,
      checkRuns: [],
    }).action,
    'fail',
    'the decision helper rejects an event/current base mismatch',
  );
}

function checkRunnerPlanRules() {
  assert.deepStrictEqual(
    buildFinalCiExecutionPlan({ gasAction: SNAPSHOT_ACTIONS.NOT_REQUIRED, webAction: SNAPSHOT_ACTIONS.NOT_REQUIRED }),
    [],
    'rejection uses only the gate runner',
  );
  assert.deepStrictEqual(
    buildFinalCiExecutionPlan({ gasAction: SNAPSHOT_ACTIONS.REUSE, webAction: SNAPSHOT_ACTIONS.REUSE }),
    [],
    'full reuse uses only the gate runner',
  );
  assert.deepStrictEqual(
    buildFinalCiExecutionPlan({ gasAction: SNAPSHOT_ACTIONS.EXECUTE, webAction: SNAPSHOT_ACTIONS.NOT_REQUIRED }),
    ['gas-tests'],
    'GAS-only uses gate plus GAS runner',
  );
  assert.deepStrictEqual(
    buildFinalCiExecutionPlan({ gasAction: SNAPSHOT_ACTIONS.EXECUTE, webAction: SNAPSHOT_ACTIONS.EXECUTE }),
    ['gas-tests', 'gas-web-e2e'],
    'Web path uses gate, GAS, and Web runners in order',
  );
  assert.deepStrictEqual(
    buildFinalCiExecutionPlan({ gasAction: SNAPSHOT_ACTIONS.REUSE, webAction: SNAPSHOT_ACTIONS.EXECUTE }),
    ['gas-web-e2e'],
    'reused GAS plus Web execution starts only the Web heavy runner',
  );
  assert.throws(
    () => buildFinalCiExecutionPlan({ gasAction: SNAPSHOT_ACTIONS.NOT_REQUIRED, webAction: SNAPSHOT_ACTIONS.EXECUTE }),
    /cannot execute without a GAS Tests result/,
    'invalid Web-only execution plans fail closed',
  );
}

async function checkPaginationRules() {
  const pages = [];
  const items = await collectPaginatedItems({
    pageSize: 2,
    fetchPage: async ({ page }) => {
      pages.push(page);
      return page === 1 ? ['a', 'b'] : ['c'];
    },
  });
  assert.deepStrictEqual(items, ['a', 'b', 'c'], 'all API pages are collected');
  assert.deepStrictEqual(pages, [1, 2], 'pagination continues until a short page');
  await assert.rejects(
    collectPaginatedItems({ fetchPage: async () => { throw new Error('private API details'); } }),
    (error) => error.message === 'Final CI gate pagination failed.' && !error.message.includes('private API details'),
    'API failure rejects the gate without leaking details or starting heavy work',
  );
}

function gate(overrides = {}) {
  return evaluateFinalCiGate({
    repository: REPOSITORY,
    expectedHeadSha: HEAD_SHA,
    expectedBaseSha: BASE_SHA,
    expectedBaseBranch: 'develop',
    labelName: FINAL_CI_LABEL,
    pullRequest: pullRequest(),
    comments: [reviewMarker(HEAD_SHA, BASE_SHA)],
    reviews: [],
    reviewDecision: 'APPROVED',
    unresolvedReviewThreadCount: 0,
    changedFiles: ['src/app/db.gs'],
    gasCheckRuns: [],
    webCheckRuns: [],
    ...overrides,
  });
}

function pullRequest({ draft = false, baseRef = 'develop', baseSha = BASE_SHA, headSha = HEAD_SHA, headRepository = REPOSITORY } = {}) {
  return {
    state: 'open',
    draft,
    labels: [{ name: FINAL_CI_LABEL }],
    base: { ref: baseRef, sha: baseSha },
    head: { sha: headSha, repo: { full_name: headRepository } },
  };
}

function reviewMarker(headSha, baseSha) {
  return {
    author_association: 'OWNER',
    body: `${FINAL_CI_REVIEW_MARKER}\nhead_sha: ${headSha}\nbase_sha: ${baseSha}`,
  };
}

function successfulCheck(name, headSha, baseSha) {
  return {
    name,
    conclusion: 'success',
    head_sha: headSha,
    output: {
      summary: `${FINAL_CI_CHECK_CONTEXT_MARKER}\nhead_sha: ${headSha}\nbase_sha: ${baseSha}\n\nStatus: executed`,
    },
  };
}

function assertGateRejected(overrides, expectedReason) {
  const result = gate(overrides);
  assert.strictEqual(result.allowed, false, expectedReason);
  assert.strictEqual(result.reason, expectedReason, expectedReason);
  assert.strictEqual(result.gasAction, SNAPSHOT_ACTIONS.NOT_REQUIRED, `${expectedReason}: GAS heavy work must be zero`);
  assert.strictEqual(result.webAction, SNAPSHOT_ACTIONS.NOT_REQUIRED, `${expectedReason}: Web heavy work must be zero`);
  assert.deepStrictEqual(buildFinalCiExecutionPlan({ gasAction: result.gasAction, webAction: result.webAction }), [], `${expectedReason}: heavy runner count`);
}

function assertWebStatus(name, input, expectedStatus) {
  const result = determineWebE2eStatus(input);
  assert.strictEqual(result.status, expectedStatus, `${name}: status`);
  if (expectedStatus === 'skipped') {
    assert.strictEqual(getCheckConclusionForStatus(result.status), 'failure', `${name}: skipped is not reusable success`);
  }
}

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `workflow section ${startMarker.trim()} must exist`);
  return source.slice(start, end);
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
