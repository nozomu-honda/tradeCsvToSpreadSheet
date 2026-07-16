#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  CHANGE_CLASSIFICATIONS,
  FINAL_CI_LABEL,
  FINAL_CI_REVIEW_MARKER,
  GAS_TESTS_CHECK_NAME,
  SNAPSHOT_ACTIONS,
  WEB_E2E_CHECK_NAME,
  buildCheckRunRequest,
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
const finalCiHelper = read('scripts/ci/final-ci.js');
const gasTestsWorkflow = read('.github/workflows/gas-tests.yml');
const gasWebE2eWorkflow = read('.github/workflows/gas-web-e2e.yml');
const packageJson = JSON.parse(read('package.json'));
const HEAD_SHA = 'a'.repeat(40);
const OLD_HEAD_SHA = 'b'.repeat(40);
const REPOSITORY = 'nozomu-honda/tradeCsvToSpreadSheet';

async function main() {
  checkWorkflowStructure();
  checkPureGateRules();
  checkExistingResultRules();
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
  assert.ok(finalCiControllerWorkflow.includes('checks: write'), 'controller must grant the reusable workflow permission to publish exact checks');
  assert.ok(finalCiControllerWorkflow.includes(`github.event.label.name == '${FINAL_CI_LABEL}'`), 'controller must gate execution on run-final-ci');
  assert.ok(finalCiControllerWorkflow.includes('github.event.pull_request.head.repo.full_name == github.repository'), 'controller must call reusable final CI only for same-repository PRs');
  assert.ok(finalCiControllerWorkflow.includes('github.event.pull_request.head.repo.full_name != github.repository'), 'controller must fail closed for external PRs');
  assert.ok(finalCiControllerWorkflow.includes('uses: ./.github/workflows/final-ci-run.yml'), 'controller must call the reusable final CI body');
  assert.ok(finalCiControllerWorkflow.includes('base_sha: ${{ github.event.pull_request.base.sha }}'), 'controller must pin the trusted develop base SHA');
  assert.ok(finalCiControllerWorkflow.includes('head_sha: ${{ github.event.pull_request.head.sha }}'), 'controller must pin the requested head SHA');
  assert.ok(finalCiControllerWorkflow.includes('label_name: ${{ github.event.label.name }}'), 'controller must pass the label that caused the event');
  assert.ok(!finalCiControllerWorkflow.includes('actions: write'), 'controller must not need workflow dispatch permission');
  assert.ok(!finalCiControllerWorkflow.includes('actions/github-script'), 'controller must not dispatch another workflow');
  assert.ok(!finalCiControllerWorkflow.includes('actions/checkout'), 'controller must not checkout PR code');
  assert.ok(!finalCiControllerWorkflow.includes('secrets.'), 'controller must not directly read Google secrets');
  assert.ok(!finalCiControllerWorkflow.includes('pull_request_target'), 'final CI controller must not use pull_request_target');

  assert.ok(finalCiRunWorkflow.includes('workflow_call:'), 'final CI body must be called only by the run-final-ci controller');
  assert.ok(!finalCiRunWorkflow.includes('workflow_dispatch:'), 'final CI body must not rely on workflow_dispatch');
  assert.ok(!finalCiRunWorkflow.includes('pull_request_target'), 'final CI body must not use pull_request_target');
  assert.ok(finalCiRunWorkflow.includes('gas-shared-test-project'), 'final CI body must use the shared test Apps Script concurrency group');
  assert.ok(finalCiRunWorkflow.includes('cancel-in-progress: false'), 'shared GAS/Web runs must never cancel in progress');

  const gateJob = section(finalCiRunWorkflow, '  final-ci-gate:', '  gas-tests:');
  assert.ok(gateJob.includes('name: Final CI review gate'), 'a lightweight review gate job must run first');
  assert.ok(gateJob.includes('Load review gate from trusted develop base'), 'gate code must come from the trusted develop base');
  assert.ok(gateJob.includes('BASE_SHA: ${{ inputs.base_sha }}'), 'trusted gate code must be pinned to the event base SHA');
  assert.ok(gateJob.includes('node "${RUNNER_TEMP}/final-ci-gate.js" gate'), 'trusted helper must execute the review gate command');
  assert.ok(gateJob.includes('trusted review gate could not be loaded'), 'trusted gate load failure must leave a safe rejection summary');
  for (const forbidden of ['actions/checkout', 'actions/setup-node', 'npm ci', '@google/clasp', 'secrets.']) {
    assert.ok(!gateJob.includes(forbidden), `review gate must run before ${forbidden}`);
  }
  for (const outputName of ['allowed', 'classification', 'gas_action', 'web_action', 'current_head_sha']) {
    assert.ok(gateJob.includes(`${outputName}:`), `review gate must expose ${outputName}`);
  }

  const gasJob = section(finalCiRunWorkflow, '  gas-tests:', '  gas-web-e2e:');
  assert.ok(gasJob.includes(`name: ${GAS_TESTS_CHECK_NAME}`), 'required GAS check name must stay fixed');
  assert.ok(gasJob.includes("needs.final-ci-gate.outputs.gas_action == 'execute'"), 'GAS heavy work must require the gate execute decision');
  assert.ok(gasJob.includes('Checkout PR merge commit'), 'GAS Tests must preserve merge-commit integration coverage');
  assert.ok(gasJob.includes('node scripts/ci/final-ci.js assert-head'), 'GAS Tests must re-check the PR head before secrets are used');
  assert.ok(gasJob.includes('Publish required GAS status check'), 'executed GAS Tests must publish the required head check');
  assert.ok(gasJob.includes('TARGET_HEAD_SHA: ${{ inputs.head_sha }}'), 'GAS check must attach to the requested head SHA');

  const webJob = section(finalCiRunWorkflow, '  gas-web-e2e:', '  final-ci-summary:');
  assert.ok(webJob.includes(`name: ${WEB_E2E_CHECK_NAME}`), 'Web E2E check name must stay fixed');
  assert.ok(webJob.includes("needs.final-ci-gate.outputs.web_action == 'execute'"), 'Web E2E heavy work must require the gate execute decision');
  assert.ok(webJob.includes("needs.final-ci-gate.outputs.gas_action == 'reuse'"), 'Web E2E may follow an exact-head reused GAS success');
  assert.ok(webJob.includes("needs.gas-tests.result == 'success'"), 'Web E2E must follow successful executed GAS Tests');
  assert.ok(webJob.includes('id: cleanup_dynamic_webapp'), 'dynamic deployment cleanup outcome must be available');
  assert.ok(webJob.includes('CLEANUP_OUTCOME: ${{ steps.cleanup_dynamic_webapp.outcome }}'), 'cleanup failure must affect Web E2E status');
  assert.ok(webJob.includes('Reject protected Web app response'), 'HTTP 403 without Playwright must fail closed');
  assert.ok(webJob.includes('Publish Web E2E status check'), 'executed Web E2E must publish a head check');
  assert.ok(webJob.includes('TARGET_HEAD_SHA: ${{ inputs.head_sha }}'), 'Web E2E check must attach to the requested head SHA');

  assert.ok(finalCiHelper.includes('currentHeadSha !== env.TARGET_HEAD_SHA'), 'check publisher must re-check PR head before publication');
  assert.ok(finalCiHelper.includes("method: 'POST'"), 'Check Run creation failure must fail closed');
  assert.ok(finalCiHelper.includes('readPaginatedRestArray'), 'comments, reviews, and changed files must use pagination');
  assert.ok(finalCiHelper.includes('readReviewThreadState'), 'review threads must be read with GraphQL pagination');
  assert.ok(finalCiHelper.includes('Final CI gate pagination failed.'), 'pagination failures must have a safe fail-closed reason');

  assert.ok(!gasTestsWorkflow.includes('pull_request:'), 'legacy GAS Tests workflow must not run on PR labels');
  assert.ok(gasTestsWorkflow.includes('workflow_dispatch:'), 'legacy GAS Tests workflow remains manual fallback only');
  assert.ok(gasTestsWorkflow.includes('group: gas-shared-test-project'), 'legacy GAS Tests fallback must use shared concurrency');
  assert.ok(!gasWebE2eWorkflow.includes('pull_request:'), 'legacy Web E2E workflow must not run on PR labels');
  assert.ok(gasWebE2eWorkflow.includes('workflow_dispatch:'), 'legacy Web E2E workflow remains manual fallback only');
  assert.ok(gasWebE2eWorkflow.includes('group: gas-shared-test-project'), 'legacy Web E2E fallback must use shared concurrency');
}

function checkPureGateRules() {
  assert.strictEqual(classifyChangedFiles(['docs/gas-ci.md']), CHANGE_CLASSIFICATIONS.DOCS_ONLY, 'docs-only classification');
  assert.strictEqual(classifyChangedFiles(['README.md']), CHANGE_CLASSIFICATIONS.DOCS_ONLY, 'README-only classification');
  assert.strictEqual(
    classifyChangedFiles(['docs/gas-ci.md', 'src/app/db.gs']),
    CHANGE_CLASSIFICATIONS.GAS_TESTS_ONLY,
    'docs plus backend GAS is not docs-only',
  );
  assert.strictEqual(classifyChangedFiles(['src/app/db.gs']), CHANGE_CLASSIFICATIONS.GAS_TESTS_ONLY, 'backend GAS only classification');
  assert.strictEqual(classifyChangedFiles(['Index.html']), CHANGE_CLASSIFICATIONS.GAS_TESTS_AND_WEB_E2E, 'UI changes require Web E2E');
  assert.strictEqual(classifyChangedFiles(['appsscript.json']), CHANGE_CLASSIFICATIONS.GAS_TESTS_AND_WEB_E2E, 'manifest changes require Web E2E');
  assert.strictEqual(
    classifyChangedFiles(['scripts/ci/production-web-app-deployment.js']),
    CHANGE_CLASSIFICATIONS.GAS_TESTS_AND_WEB_E2E,
    'Web App deployment changes require Web E2E',
  );
  assert.strictEqual(classifyChangedFiles(['new/ambiguous-file.js']), CHANGE_CLASSIFICATIONS.GAS_TESTS_AND_WEB_E2E, 'unknown paths fail safe to Web E2E');

  assertGateRejected({ changedFiles: ['docs/gas-ci.md'] }, 'docs-only changes must not start Final CI');
  assertGateRejected({ changedFiles: ['README.md'] }, 'docs-only changes must not start Final CI');
  assertGateRejected({ comments: [] }, 'review completion marker for the current head SHA is missing');
  assertGateRejected({ comments: [reviewMarker(OLD_HEAD_SHA)] }, 'review completion marker for the current head SHA is missing');
  assertGateRejected({
    comments: [{ ...reviewMarker(HEAD_SHA), author_association: 'NONE' }],
  }, 'review completion marker for the current head SHA is missing');
  assertGateRejected({ pullRequest: pullRequest({ draft: true }) }, 'pull request is still Draft');
  assertGateRejected({ pullRequest: pullRequest({ base: { ref: 'main' } }) }, 'pull request base branch is not develop');
  assertGateRejected({ unresolvedReviewThreadCount: 1 }, 'unresolved review threads remain');
  assertGateRejected({
    reviews: [{ user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-07-16T00:00:00Z' }],
    reviewDecision: 'CHANGES_REQUESTED',
  }, 'an active changes-requested review remains');
  assertGateRejected({ pullRequest: pullRequest({ head: { sha: HEAD_SHA, repo: { full_name: 'someone/fork' } } }) }, 'secret-backed final CI is disabled for fork or external PRs');

  const approvedAfterChanges = gate({
    reviews: [
      { user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-07-16T00:00:00Z' },
      { user: { login: 'reviewer' }, state: 'COMMENTED', submitted_at: '2026-07-16T00:30:00Z' },
      { user: { login: 'reviewer' }, state: 'APPROVED', submitted_at: '2026-07-16T01:00:00Z' },
    ],
    reviewDecision: 'APPROVED',
    changedFiles: ['src/app/db.gs'],
  });
  assert.strictEqual(approvedAfterChanges.allowed, true, 'same reviewer approval after changes requested clears the block');
  const gasOnly = gate({ changedFiles: ['src/app/db.gs'] });
  assert.strictEqual(gasOnly.allowed, true, 'backend GAS-only change passes the review gate');
  assert.strictEqual(gasOnly.classification, CHANGE_CLASSIFICATIONS.GAS_TESTS_ONLY, 'backend GAS-only classification');
  assert.strictEqual(gasOnly.gasAction, SNAPSHOT_ACTIONS.EXECUTE, 'backend GAS-only runs GAS Tests');
  assert.strictEqual(gasOnly.webAction, SNAPSHOT_ACTIONS.NOT_REQUIRED, 'backend GAS-only runs zero Web E2E jobs');

  const uiChange = gate({ changedFiles: ['Index.html'] });
  assert.strictEqual(uiChange.gasAction, SNAPSHOT_ACTIONS.EXECUTE, 'UI change runs GAS Tests first');
  assert.strictEqual(uiChange.webAction, SNAPSHOT_ACTIONS.EXECUTE, 'UI change runs Web E2E after GAS Tests');

  const gasReused = gate({
    changedFiles: ['src/app/db.gs'],
    gasCheckRuns: [{ name: GAS_TESTS_CHECK_NAME, conclusion: 'success', head_sha: HEAD_SHA }],
  });
  assert.strictEqual(gasReused.gasAction, SNAPSHOT_ACTIONS.REUSE, 'same-head GAS success avoids a heavy rerun');

  const staleGasSuccess = gate({
    changedFiles: ['src/app/db.gs'],
    gasCheckRuns: [{ name: GAS_TESTS_CHECK_NAME, conclusion: 'success', head_sha: OLD_HEAD_SHA }],
  });
  assert.strictEqual(staleGasSuccess.gasAction, SNAPSHOT_ACTIONS.EXECUTE, 'old-head GAS success is never reused');

  const bothReused = gate({
    changedFiles: ['Index.html'],
    gasCheckRuns: [{ name: GAS_TESTS_CHECK_NAME, conclusion: 'success', head_sha: HEAD_SHA }],
    webCheckRuns: [{ name: WEB_E2E_CHECK_NAME, conclusion: 'success', head_sha: HEAD_SHA }],
  });
  assert.strictEqual(bothReused.gasAction, SNAPSHOT_ACTIONS.REUSE, 'same-head GAS success is reused');
  assert.strictEqual(bothReused.webAction, SNAPSHOT_ACTIONS.REUSE, 'same-head Web E2E success is reused');

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
    hasSuccessfulCheckRun([{ name: GAS_TESTS_CHECK_NAME, conclusion: 'success', head_sha: HEAD_SHA }], GAS_TESTS_CHECK_NAME, HEAD_SHA),
    true,
    'successful exact-head check detection',
  );
  assert.strictEqual(
    hasSuccessfulCheckRun([{ name: GAS_TESTS_CHECK_NAME, conclusion: 'success', head_sha: OLD_HEAD_SHA }], GAS_TESTS_CHECK_NAME, HEAD_SHA),
    false,
    'stale-head checks must not be reused',
  );
  for (const conclusion of ['failure', 'neutral', 'cancelled', 'skipped']) {
    assert.strictEqual(
      hasSuccessfulCheckRun([{ name: WEB_E2E_CHECK_NAME, conclusion, head_sha: HEAD_SHA }], WEB_E2E_CHECK_NAME, HEAD_SHA),
      false,
      `${conclusion} Web E2E checks must not be reused`,
    );
  }

  assert.strictEqual(getCheckConclusionForStatus('executed'), 'success', 'executed status publishes success');
  assert.strictEqual(getCheckConclusionForStatus('reused'), 'success', 'reused status publishes success');
  assert.strictEqual(getCheckConclusionForStatus('failed'), 'failure', 'failed status publishes failure');
  assert.strictEqual(getCheckConclusionForStatus('skipped'), 'failure', 'skipped status publishes failure');
  assert.throws(() => getCheckConclusionForStatus('neutral'), /Unexpected final CI status/, 'unexpected status fails closed');

  const webCheckRequest = buildCheckRunRequest({
    repository: REPOSITORY,
    checkName: WEB_E2E_CHECK_NAME,
    targetHeadSha: HEAD_SHA,
    checkStatus: 'executed',
    checkReason: 'Web E2E executed successfully',
    checkDetailsUrl: 'https://example.invalid/actions/runs/1',
  });
  assert.strictEqual(webCheckRequest.body.name, WEB_E2E_CHECK_NAME, 'Web E2E check run name');
  assert.strictEqual(webCheckRequest.body.head_sha, HEAD_SHA, 'Web E2E check run head SHA');
  assert.strictEqual(webCheckRequest.body.conclusion, 'success', 'Web E2E check success conclusion');

  assertWebStatus('Web E2E initial success', {
    decisionStatus: 'executed', headGuardOutcome: 'success', secretsOutcome: 'success', installOutcome: 'success',
    deployOutcome: 'success', webappProbe: 'ready', playwrightOutcome: 'success', cleanupOutcome: 'success', dynamicDeploymentId: 'dynamic-id',
  }, 'executed');
  assertWebStatus('Web deploy failure', {
    decisionStatus: 'executed', headGuardOutcome: 'success', secretsOutcome: 'success', installOutcome: 'success', deployOutcome: 'failure',
  }, 'failed');
  assertWebStatus('Playwright failure', {
    decisionStatus: 'executed', headGuardOutcome: 'success', secretsOutcome: 'success', installOutcome: 'success', deployOutcome: 'success',
    webappProbe: 'ready', playwrightOutcome: 'failure', dynamicDeploymentId: 'dynamic-id', cleanupOutcome: 'success',
  }, 'failed');
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
      currentHeadSha: HEAD_SHA,
      checkName: GAS_TESTS_CHECK_NAME,
      checkRuns: [{ name: GAS_TESTS_CHECK_NAME, conclusion: 'success', head_sha: OLD_HEAD_SHA }],
    }).action,
    'execute',
    'the legacy decision helper also rejects stale-head success',
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
    'pagination failures fail closed without leaking raw API errors',
  );
  await assert.rejects(
    collectPaginatedItems({ pageSize: 1, maxPages: 2, fetchPage: async () => ['full'] }),
    /exceeded the safety limit/,
    'unbounded pagination fails closed',
  );
}

function gate(overrides = {}) {
  return evaluateFinalCiGate({
    repository: REPOSITORY,
    expectedHeadSha: HEAD_SHA,
    expectedBaseBranch: 'develop',
    labelName: FINAL_CI_LABEL,
    pullRequest: pullRequest(),
    comments: [reviewMarker(HEAD_SHA)],
    reviews: [],
    reviewDecision: 'APPROVED',
    unresolvedReviewThreadCount: 0,
    changedFiles: ['src/app/db.gs'],
    gasCheckRuns: [],
    webCheckRuns: [],
    ...overrides,
  });
}

function pullRequest(overrides = {}) {
  return {
    state: 'open',
    draft: false,
    labels: [{ name: FINAL_CI_LABEL }],
    base: { ref: 'develop' },
    head: { sha: HEAD_SHA, repo: { full_name: REPOSITORY } },
    ...overrides,
  };
}

function reviewMarker(headSha) {
  return {
    author_association: 'OWNER',
    body: `${FINAL_CI_REVIEW_MARKER}\nhead_sha: ${headSha}`,
  };
}

function assertGateRejected(overrides, expectedReason) {
  const result = gate(overrides);
  assert.strictEqual(result.allowed, false, expectedReason);
  assert.strictEqual(result.reason, expectedReason, expectedReason);
  assert.strictEqual(result.gasAction, SNAPSHOT_ACTIONS.NOT_REQUIRED, `${expectedReason}: GAS heavy work must be zero`);
  assert.strictEqual(result.webAction, SNAPSHOT_ACTIONS.NOT_REQUIRED, `${expectedReason}: Web heavy work must be zero`);
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
