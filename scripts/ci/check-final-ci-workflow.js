#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  FINAL_CI_LABEL,
  GAS_TESTS_CHECK_NAME,
  WEB_E2E_CHECK_NAME,
  decideCheckExecution,
  hasSuccessfulCheckRun,
  isSameRepositoryPullRequest,
} = require('./final-ci');

const repoRoot = path.resolve(__dirname, '..', '..');
const finalCiControllerWorkflow = read('.github/workflows/final-ci.yml');
const finalCiRunWorkflow = read('.github/workflows/final-ci-run.yml');
const gasTestsWorkflow = read('.github/workflows/gas-tests.yml');
const gasWebE2eWorkflow = read('.github/workflows/gas-web-e2e.yml');
const packageJson = JSON.parse(read('package.json'));

assert.ok(finalCiControllerWorkflow.includes('name: Final CI controller'), 'final CI controller workflow must exist');
assert.ok(finalCiControllerWorkflow.includes('pull_request:'), 'final CI controller must listen for PR label events');
assert.ok(finalCiControllerWorkflow.includes('- labeled'), 'final CI controller must listen only to labeled PR events');
assert.ok(finalCiControllerWorkflow.includes('checks: write'), 'controller must grant the reusable workflow permission to publish the exact required check');
assert.ok(finalCiControllerWorkflow.includes(`github.event.label.name == '${FINAL_CI_LABEL}'`), 'controller must gate execution on run-final-ci');
assert.ok(finalCiControllerWorkflow.includes('github.event.pull_request.head.repo.full_name == github.repository'), 'controller must call reusable final CI only for same-repository PRs');
assert.ok(finalCiControllerWorkflow.includes('github.event.pull_request.head.repo.full_name != github.repository'), 'controller must fail closed for external PRs');
assert.ok(finalCiControllerWorkflow.includes('uses: ./.github/workflows/final-ci-run.yml'), 'controller must call the reusable final CI body');
assert.ok(finalCiControllerWorkflow.includes('secrets: inherit'), 'controller must pass secrets only to the same-repository reusable workflow call');
assert.ok(finalCiControllerWorkflow.includes('pr_number: ${{ github.event.pull_request.number }}'), 'controller must pass the source PR number');
assert.ok(finalCiControllerWorkflow.includes('head_sha: ${{ github.event.pull_request.head.sha }}'), 'controller must pin the requested head SHA');
assert.ok(!finalCiControllerWorkflow.includes('actions: write'), 'controller must not need workflow dispatch permission');
assert.ok(!finalCiControllerWorkflow.includes('actions/github-script'), 'controller must not call the GitHub API to dispatch another workflow');
assert.ok(!finalCiControllerWorkflow.includes('createWorkflowDispatch'), 'controller must not dispatch a default-branch-only workflow');
assert.ok(!finalCiControllerWorkflow.includes('actions/checkout'), 'controller must not checkout PR code');
assert.ok(!finalCiControllerWorkflow.includes('secrets.'), 'controller must not read Google secrets');
assert.ok(!finalCiControllerWorkflow.includes('pull_request_target'), 'final CI controller must not use pull_request_target');
assert.ok(!finalCiControllerWorkflow.includes(`name: ${GAS_TESTS_CHECK_NAME}`), 'controller must not create the required GAS check on ordinary label events');
assert.ok(!finalCiControllerWorkflow.includes(`name: ${WEB_E2E_CHECK_NAME}`), 'controller must not create the Web E2E check on ordinary label events');

assert.ok(finalCiRunWorkflow.includes('workflow_call:'), 'final CI body must be called only by the run-final-ci controller');
assert.ok(!finalCiRunWorkflow.includes('workflow_dispatch:'), 'final CI body must not rely on default-branch workflow_dispatch behavior');
assert.ok(!finalCiRunWorkflow.includes('pull_request:'), 'final CI body must not run on ordinary PR labels by itself');
assert.ok(!finalCiRunWorkflow.includes('pull_request_target'), 'final CI body must not use pull_request_target');
assert.ok(finalCiRunWorkflow.includes('pull-requests: read'), 'final CI body must read current PR head state');
assert.ok(finalCiRunWorkflow.includes('checks: write'), 'final CI body must publish the exact required GAS check name after reusable execution');
assert.ok(finalCiRunWorkflow.includes('gas-shared-test-project'), 'final CI body must use the shared test Apps Script concurrency group');
assert.ok(finalCiRunWorkflow.includes('cancel-in-progress: false'), 'final CI body must not cancel in-progress GAS/Web runs');

assert.ok(finalCiRunWorkflow.includes(`name: ${GAS_TESTS_CHECK_NAME}`), 'required GAS check name must stay fixed');
assert.ok(finalCiRunWorkflow.includes(`name: ${WEB_E2E_CHECK_NAME}`), 'Web E2E job name must stay fixed');
assert.ok(!finalCiRunWorkflow.includes('Ignore non-GAS label'), 'final CI body must not use dynamic ignore check names');
assert.ok(finalCiRunWorkflow.includes('- gas-tests'), 'Web E2E must depend on GAS Tests');
assert.ok(finalCiRunWorkflow.includes("needs.gas-tests.result == 'success'"), 'Web E2E must wait for successful GAS Tests');
assert.ok(finalCiRunWorkflow.includes('node scripts/ci/final-ci.js decide'), 'final CI body must use the duplicate-run decision helper');
assert.ok(finalCiRunWorkflow.includes('node scripts/ci/final-ci.js assert-head'), 'final CI body must re-check PR head before heavy processing');
assert.ok(finalCiRunWorkflow.includes('steps.gas_decision.outputs.execute == \'true\''), 'GAS heavy step must be gated by the decision helper');
assert.ok(finalCiRunWorkflow.includes('steps.web_e2e_decision.outputs.execute == \'true\''), 'Web E2E heavy step must be gated by the decision helper');
assert.ok(finalCiRunWorkflow.includes("needs.final-ci-context.outputs.same_repository == 'true'"), 'secret-backed steps must require same-repository PRs');
assert.ok(finalCiRunWorkflow.includes('Publish required GAS status check'), 'GAS job must publish the exact required check name even when heavy work is reused');
assert.ok(finalCiRunWorkflow.includes('github.rest.checks.create'), 'GAS job must create an explicit required check run for the requested head SHA');
assert.ok(finalCiRunWorkflow.includes('head_sha: process.env.TARGET_HEAD_SHA'), 'explicit required check must be attached to the requested PR head SHA');

for (const secretName of ['CLASPRC_JSON', 'GAS_TEST_SCRIPT_ID', 'CI_E2E_TOKEN']) {
  assert.ok(finalCiRunWorkflow.includes(`secrets.${secretName}`), `final CI body must wire ${secretName} only in heavy same-repository steps`);
}

assert.ok(!gasTestsWorkflow.includes('pull_request:'), 'legacy GAS Tests workflow must not run on PR labels');
assert.ok(!gasTestsWorkflow.includes("github.event.label.name == 'run-gas-tests'"), 'legacy GAS Tests workflow must not use the old final label as a trigger');
assert.ok(!gasTestsWorkflow.includes('Ignore non-GAS label'), 'legacy GAS Tests workflow must not create ignore check runs');
assert.ok(gasTestsWorkflow.includes('workflow_dispatch:'), 'legacy GAS Tests workflow may remain as manual fallback');
assert.ok(gasTestsWorkflow.includes(`name: ${GAS_TESTS_CHECK_NAME}`), 'legacy GAS Tests manual fallback must keep the required check name');
assert.ok(gasTestsWorkflow.includes('group: gas-shared-test-project'), 'legacy GAS Tests manual fallback must use the shared concurrency group');

assert.ok(!gasWebE2eWorkflow.includes('pull_request:'), 'legacy Web E2E workflow must not run on PR labels');
assert.ok(!gasWebE2eWorkflow.includes("github.event.label.name == 'gas-web-e2e'"), 'legacy Web E2E workflow must not use the old PR label as a trigger');
assert.ok(gasWebE2eWorkflow.includes('workflow_dispatch:'), 'legacy Web E2E workflow may remain as manual fallback');
assert.ok(gasWebE2eWorkflow.includes('group: gas-shared-test-project'), 'legacy Web E2E manual fallback must use the shared concurrency group');
assert.ok(!gasWebE2eWorkflow.includes('External PR guard'), 'legacy Web E2E no longer needs PR-label fork guard because it has no PR label trigger');

assert.strictEqual(
  isSameRepositoryPullRequest({
    repository: 'nozomu-honda/tradeCsvToSpreadSheet',
    headRepository: 'nozomu-honda/tradeCsvToSpreadSheet',
  }),
  true,
  'same repository detection',
);
assert.strictEqual(
  isSameRepositoryPullRequest({
    repository: 'nozomu-honda/tradeCsvToSpreadSheet',
    headRepository: 'someone/fork',
  }),
  false,
  'fork repository detection',
);

assert.strictEqual(
  hasSuccessfulCheckRun([{ name: GAS_TESTS_CHECK_NAME, conclusion: 'success' }], GAS_TESTS_CHECK_NAME),
  true,
  'successful check detection',
);
assert.strictEqual(
  hasSuccessfulCheckRun([{ name: GAS_TESTS_CHECK_NAME, conclusion: 'failure' }], GAS_TESTS_CHECK_NAME),
  false,
  'failed checks must not be reused',
);

assertPlan({
  name: 'both checks missing',
  gasRuns: [],
  webRuns: [],
  expectedGas: 'execute',
  expectedWeb: 'execute',
});
assertPlan({
  name: 'GAS already succeeded',
  gasRuns: [{ name: GAS_TESTS_CHECK_NAME, conclusion: 'success' }],
  webRuns: [],
  expectedGas: 'reuse',
  expectedWeb: 'execute',
});
assertPlan({
  name: 'Web E2E already succeeded',
  gasRuns: [],
  webRuns: [{ name: WEB_E2E_CHECK_NAME, conclusion: 'success' }],
  expectedGas: 'execute',
  expectedWeb: 'reuse',
});
assertPlan({
  name: 'both checks already succeeded',
  gasRuns: [{ name: GAS_TESTS_CHECK_NAME, conclusion: 'success' }],
  webRuns: [{ name: WEB_E2E_CHECK_NAME, conclusion: 'success' }],
  expectedGas: 'reuse',
  expectedWeb: 'reuse',
});

assert.strictEqual(
  decideCheckExecution({
    labelName: FINAL_CI_LABEL,
    sameRepository: true,
    expectedHeadSha: 'new-head',
    currentHeadSha: 'new-head',
    checkName: GAS_TESTS_CHECK_NAME,
    checkRuns: [{ name: GAS_TESTS_CHECK_NAME, conclusion: 'success', head_sha: 'old-head' }],
  }).action,
  'reuse',
  'GitHub API is queried by head SHA before this decision, so same-head success can be reused',
);
assert.strictEqual(
  decideCheckExecution({
    labelName: FINAL_CI_LABEL,
    sameRepository: true,
    expectedHeadSha: 'new-head',
    currentHeadSha: 'newer-head',
    checkName: GAS_TESTS_CHECK_NAME,
    checkRuns: [{ name: GAS_TESTS_CHECK_NAME, conclusion: 'success' }],
  }).action,
  'fail',
  'head changes must stop final CI before heavy processing',
);
assert.strictEqual(
  decideCheckExecution({
    labelName: FINAL_CI_LABEL,
    sameRepository: false,
    expectedHeadSha: 'head',
    currentHeadSha: 'head',
    checkName: GAS_TESTS_CHECK_NAME,
    checkRuns: [],
  }).action,
  'fail',
  'fork PRs must fail closed before secret-backed jobs',
);
assert.strictEqual(
  decideCheckExecution({
    labelName: 'docs',
    sameRepository: true,
    expectedHeadSha: 'head',
    currentHeadSha: 'head',
    checkName: GAS_TESTS_CHECK_NAME,
    checkRuns: [],
  }).action,
  'skip',
  'normal labels must not start final CI',
);

assert.ok(packageJson.scripts['test:final-ci-workflow'], 'package.json must expose test:final-ci-workflow');

console.log('final CI workflow checks passed');

function assertPlan({ name, gasRuns, webRuns, expectedGas, expectedWeb }) {
  const gasDecision = decideCheckExecution({
    labelName: FINAL_CI_LABEL,
    sameRepository: true,
    expectedHeadSha: 'head',
    currentHeadSha: 'head',
    checkName: GAS_TESTS_CHECK_NAME,
    checkRuns: gasRuns,
  });
  const webDecision = decideCheckExecution({
    labelName: FINAL_CI_LABEL,
    sameRepository: true,
    expectedHeadSha: 'head',
    currentHeadSha: 'head',
    checkName: WEB_E2E_CHECK_NAME,
    checkRuns: webRuns,
  });

  assert.strictEqual(gasDecision.action, expectedGas, `${name}: GAS decision`);
  assert.strictEqual(webDecision.action, expectedWeb, `${name}: Web E2E decision`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}
