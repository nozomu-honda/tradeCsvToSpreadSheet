#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  FINAL_CI_LABEL,
  GAS_TESTS_CHECK_NAME,
  WEB_E2E_CHECK_NAME,
  buildCheckRunRequest,
  decideCheckExecution,
  determineWebE2eStatus,
  getCheckConclusionForStatus,
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
assert.ok(finalCiRunWorkflow.includes('checks: write'), 'final CI body must publish exact head-SHA check runs after reusable execution');
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
assert.ok(finalCiRunWorkflow.includes('CHECK_NAME: Push test GAS project and run tests'), 'GAS published check name must stay fixed');
assert.ok(finalCiRunWorkflow.includes('TARGET_HEAD_SHA: ${{ needs.final-ci-context.outputs.head_sha }}'), 'published GAS check must be attached to the requested PR head SHA');
assert.ok(finalCiRunWorkflow.includes('node scripts/ci/final-ci.js publish-check'), 'GAS job must use the shared check publisher');
assert.ok(finalCiRunWorkflow.includes('Publish Web E2E status check'), 'Web E2E job must publish a head-SHA check run');
assert.ok(finalCiRunWorkflow.includes('CHECK_NAME: Deploy test Web app and run Playwright E2E'), 'Web E2E published check name must stay fixed');
assert.ok(finalCiRunWorkflow.includes('node scripts/ci/final-ci.js record-web-status'), 'Web E2E job must compute a final status before publishing its check');
assert.ok(finalCiRunWorkflow.includes('id: cleanup_dynamic_webapp'), 'dynamic deployment cleanup step must expose its outcome');
assert.ok(finalCiRunWorkflow.includes('CLEANUP_OUTCOME: ${{ steps.cleanup_dynamic_webapp.outcome }}'), 'Web E2E result must include cleanup outcome');
assert.ok(finalCiRunWorkflow.includes('WEBAPP_PROBE: ${{ steps.deploy_webapp.outputs.webapp_probe }}'), 'Web E2E result must include protected/ready probe state');
assert.ok(finalCiRunWorkflow.includes('id: web_e2e_head_guard'), 'Web E2E must expose the pre-heavy head guard outcome');
assert.ok(finalCiRunWorkflow.includes('Fail Web E2E when status is not successful'), 'skipped or failed Web E2E status must fail the job after publishing a failure check');
assert.ok(finalCiRunWorkflow.includes('WEB_E2E_STATUS'), 'Web E2E failure gate must read the recorded status');
assert.ok(finalCiHelper.includes('currentHeadSha !== env.TARGET_HEAD_SHA'), 'check publisher must re-check PR head before creating a success or failure check run');
assert.ok(finalCiHelper.includes("method: 'POST'"), 'check publisher must fail closed if Check Run creation fails');

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
assert.strictEqual(
  hasSuccessfulCheckRun([{ name: WEB_E2E_CHECK_NAME, conclusion: 'neutral' }], WEB_E2E_CHECK_NAME),
  false,
  'neutral Web E2E checks must not be reused',
);
assert.strictEqual(
  hasSuccessfulCheckRun([{ name: WEB_E2E_CHECK_NAME, conclusion: 'skipped' }], WEB_E2E_CHECK_NAME),
  false,
  'skipped Web E2E checks must not be reused',
);
assert.strictEqual(
  hasSuccessfulCheckRun([{ name: 'other check', conclusion: 'success' }], WEB_E2E_CHECK_NAME),
  false,
  'different check names must not be reused',
);

assert.strictEqual(getCheckConclusionForStatus('executed'), 'success', 'executed status publishes success');
assert.strictEqual(getCheckConclusionForStatus('reused'), 'success', 'reused status publishes success');
assert.strictEqual(getCheckConclusionForStatus('failed'), 'failure', 'failed status publishes failure');
assert.strictEqual(getCheckConclusionForStatus('skipped'), 'failure', 'skipped status publishes failure');
assert.throws(
  () => getCheckConclusionForStatus('neutral'),
  /Unexpected final CI status/,
  'unexpected statuses must not publish a silent success check',
);

const webCheckRequest = buildCheckRunRequest({
  repository: 'nozomu-honda/tradeCsvToSpreadSheet',
  checkName: WEB_E2E_CHECK_NAME,
  targetHeadSha: 'head',
  checkStatus: 'executed',
  checkReason: 'Web E2E executed successfully',
  checkDetailsUrl: 'https://example.invalid/actions/runs/1',
});
assert.strictEqual(webCheckRequest.path, '/repos/nozomu-honda/tradeCsvToSpreadSheet/check-runs', 'check run API path');
assert.strictEqual(webCheckRequest.body.name, WEB_E2E_CHECK_NAME, 'Web E2E check run name');
assert.strictEqual(webCheckRequest.body.head_sha, 'head', 'Web E2E check run head SHA');
assert.strictEqual(webCheckRequest.body.conclusion, 'success', 'Web E2E check run success conclusion');

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

assertWebStatus({
  name: 'Web E2E initial success',
  input: {
    decisionStatus: 'executed',
    headGuardOutcome: 'success',
    secretsOutcome: 'success',
    installOutcome: 'success',
    deployOutcome: 'success',
    webappProbe: 'ready',
    playwrightOutcome: 'success',
    cleanupOutcome: 'success',
    dynamicDeploymentId: 'dynamic-id',
  },
  expectedStatus: 'executed',
});
assertWebStatus({
  name: 'Web E2E reused success',
  input: {
    decisionStatus: 'reused',
    decisionReason: 'successful Web E2E check already exists for this head SHA',
  },
  expectedStatus: 'reused',
});
assertWebStatus({
  name: 'Web deploy failure',
  input: {
    decisionStatus: 'executed',
    headGuardOutcome: 'success',
    secretsOutcome: 'success',
    installOutcome: 'success',
    deployOutcome: 'failure',
  },
  expectedStatus: 'failed',
});
assertWebStatus({
  name: 'Playwright failure',
  input: {
    decisionStatus: 'executed',
    headGuardOutcome: 'success',
    secretsOutcome: 'success',
    installOutcome: 'success',
    deployOutcome: 'success',
    webappProbe: 'ready',
    playwrightOutcome: 'failure',
    dynamicDeploymentId: 'dynamic-id',
    cleanupOutcome: 'success',
  },
  expectedStatus: 'failed',
});
assertWebStatus({
  name: 'cleanup failure',
  input: {
    decisionStatus: 'executed',
    headGuardOutcome: 'success',
    secretsOutcome: 'success',
    installOutcome: 'success',
    deployOutcome: 'success',
    webappProbe: 'ready',
    playwrightOutcome: 'success',
    dynamicDeploymentId: 'dynamic-id',
    cleanupOutcome: 'failure',
  },
  expectedStatus: 'failed',
});
assertWebStatus({
  name: 'protected Web app skip',
  input: {
    decisionStatus: 'executed',
    headGuardOutcome: 'success',
    secretsOutcome: 'success',
    installOutcome: 'success',
    deployOutcome: 'success',
    webappProbe: 'protected',
  },
  expectedStatus: 'skipped',
});
assertWebStatus({
  name: 'protected Web app with cleanup failure',
  input: {
    decisionStatus: 'executed',
    headGuardOutcome: 'success',
    secretsOutcome: 'success',
    installOutcome: 'success',
    deployOutcome: 'success',
    webappProbe: 'protected',
    dynamicDeploymentId: 'dynamic-id',
    cleanupOutcome: 'failure',
  },
  expectedStatus: 'failed',
});
assertWebStatus({
  name: 'head guard failure',
  input: {
    decisionStatus: 'executed',
    headGuardOutcome: 'failure',
  },
  expectedStatus: 'failed',
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

function assertWebStatus({ name, input, expectedStatus }) {
  const result = determineWebE2eStatus(input);
  assert.strictEqual(result.status, expectedStatus, `${name}: status`);
  if (expectedStatus === 'skipped') {
    assert.strictEqual(
      getCheckConclusionForStatus(result.status),
      'failure',
      `${name}: skipped status must not publish reusable success`,
    );
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}
