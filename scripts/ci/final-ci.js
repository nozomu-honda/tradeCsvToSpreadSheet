#!/usr/bin/env node
'use strict';

const FINAL_CI_LABEL = 'run-final-ci';
const GAS_TESTS_CHECK_NAME = 'Push test GAS project and run tests';
const WEB_E2E_CHECK_NAME = 'Deploy test Web app and run Playwright E2E';
const FINAL_CI_REVIEW_MARKER = '<!-- final-ci-review-complete:v1 -->';
const FINAL_CI_CHECK_CONTEXT_MARKER = '<!-- final-ci-check-context:v1 -->';
const CHANGE_CLASSIFICATIONS = Object.freeze({
  DOCS_ONLY: 'docs-only',
  GAS_TESTS_ONLY: 'gas-tests-only',
  GAS_TESTS_AND_WEB_E2E: 'gas-tests-and-web-e2e',
});
const SNAPSHOT_ACTIONS = Object.freeze({
  EXECUTE: 'execute',
  REUSE: 'reuse',
  NOT_REQUIRED: 'not-required',
});
const TRUSTED_MARKER_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const DOCS_ONLY_EXACT_PATHS = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'src/app/README.md',
  'src/test/README.md',
]);
const WEB_E2E_EXACT_PATHS = new Set([
  '.clasp.example.json',
  '.claspignore',
  '.github/workflows/final-ci-heavy.yml',
  '.github/workflows/final-ci-run.yml',
  '.github/workflows/final-ci.yml',
  '.github/workflows/gas-web-e2e.yml',
  '.github/workflows/deploy-production.yml',
  '.github/workflows/production-deploy-control.yml',
  'Index.html',
  'appsscript.json',
  'package-lock.json',
  'package.json',
  'playwright.config.js',
  'scripts/ci/check-final-ci-workflow.js',
  'scripts/ci/check-web-e2e-output-reset.js',
  'scripts/ci/check-web-e2e-source-transform.js',
  'scripts/ci/delete-dynamic-webapp-deployment.sh',
  'scripts/ci/deploy-test-webapp.sh',
  'scripts/ci/final-ci.js',
  'scripts/ci/prepare-web-e2e-source.js',
  'scripts/ci/production-deploy-adapters.js',
  'scripts/ci/production-deploy-orchestrator.js',
  'scripts/ci/production-runtime-verification.js',
  'scripts/ci/production-smoke-test.js',
  'scripts/ci/production-web-app-deployment.js',
  'scripts/ci/run-production-deploy.js',
  'scripts/ci/write-ci-clasp-config.js',
  'src/app/config.gs',
  'src/app/db_config.gs',
  'src/app/e2e_helpers.gs',
  'src/app/e2e_runtime_support.gs',
  'src/app/script_properties.gs',
  'src/app/web.gs',
]);
const KNOWN_GAS_ONLY_EXACT_PATHS = new Set([
  '.clasp.production.example.json',
  '.clasp.productionignore',
  '.github/workflows/gas-tests.yml',
  '.github/workflows/update-production-status.yml',
  'scripts/ci/check-ci-clasp-project.js',
  'scripts/ci/run-gas-tests.sh',
  'scripts/gas-production.js',
  'scripts/ci/production-deploy-state.js',
  'scripts/ci/production-status-parser.js',
  'scripts/ci/production-status-renderer.js',
  'scripts/ci/production-status-sync.js',
  'scripts/ci/sync-production-status.js',
  'src/app/builder.gs',
  'src/app/db.gs',
  'src/app/import.gs',
  'src/app/parser.gs',
  'src/app/reorder_output_sheets.gs',
  'src/app/source_routing_rakuten_phase1.gs',
  'src/app/utils.gs',
  'src/app/writer.gs',
]);

function normalizeRepositoryPath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Final CI changed file path is invalid.');
  }
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('Final CI changed file path is invalid.');
  }
  return normalized;
}

function isDocsOnlyPath(filePath) {
  const normalized = normalizeRepositoryPath(filePath);
  return normalized.startsWith('docs/') || DOCS_ONLY_EXACT_PATHS.has(normalized);
}

function isWebE2eAffectedPath(filePath) {
  const normalized = normalizeRepositoryPath(filePath);
  return WEB_E2E_EXACT_PATHS.has(normalized) || normalized.startsWith('tests/e2e/');
}

function isKnownGasOnlyPath(filePath) {
  const normalized = normalizeRepositoryPath(filePath);
  return KNOWN_GAS_ONLY_EXACT_PATHS.has(normalized)
    || normalized.startsWith('src/test/')
    || normalized.startsWith('scripts/ci/check-production-');
}

function classifyChangedFiles(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    throw new Error('Final CI changed file list is missing or empty.');
  }
  const normalized = filePaths.map(normalizeRepositoryPath);
  if (normalized.every(isDocsOnlyPath)) {
    return CHANGE_CLASSIFICATIONS.DOCS_ONLY;
  }
  if (normalized.some(isWebE2eAffectedPath)) {
    return CHANGE_CLASSIFICATIONS.GAS_TESTS_AND_WEB_E2E;
  }
  if (normalized.every((filePath) => isDocsOnlyPath(filePath) || isKnownGasOnlyPath(filePath))) {
    return CHANGE_CLASSIFICATIONS.GAS_TESTS_ONLY;
  }
  return CHANGE_CLASSIFICATIONS.GAS_TESTS_AND_WEB_E2E;
}

function commentHasReviewMarkerForContext(comment, headSha, baseSha) {
  if (
    !comment
    || !TRUSTED_MARKER_ASSOCIATIONS.has(String(comment.author_association || '').toUpperCase())
    || typeof comment.body !== 'string'
    || !/^[0-9a-f]{40}$/i.test(headSha || '')
    || !/^[0-9a-f]{40}$/i.test(baseSha || '')
  ) {
    return false;
  }
  const markerPattern = new RegExp(
    `${FINAL_CI_REVIEW_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*\\r?\\n[ \\t]*head_sha:[ \\t]*([0-9a-f]{40})[ \\t]*\\r?\\n[ \\t]*base_sha:[ \\t]*([0-9a-f]{40})[ \\t]*(?:\\r?\\n|$)`,
    'ig',
  );
  return [...comment.body.matchAll(markerPattern)].some((match) => (
    match[1] === headSha
    && match[2] === baseSha
  ));
}

function hasReviewCompletionMarker(comments, headSha, baseSha) {
  return Array.isArray(comments) && comments.some((comment) => commentHasReviewMarkerForContext(comment, headSha, baseSha));
}

function hasActiveChangesRequested(reviews) {
  if (!Array.isArray(reviews)) {
    throw new Error('Final CI review list is invalid.');
  }
  const decisiveStates = new Set(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED']);
  const latestByReviewer = new Map();
  reviews.forEach((review, index) => {
    const login = review && review.user && review.user.login;
    const state = String(review && review.state || '').toUpperCase();
    if (!login || !decisiveStates.has(state)) {
      return;
    }
    const timestamp = Date.parse(review.submitted_at || review.submittedAt || '') || 0;
    const candidate = { state, timestamp, index };
    const reviewerKey = login.toLowerCase();
    const current = latestByReviewer.get(reviewerKey);
    if (!current || candidate.timestamp > current.timestamp || (
      candidate.timestamp === current.timestamp && candidate.index > current.index
    )) {
      latestByReviewer.set(reviewerKey, candidate);
    }
  });
  return [...latestByReviewer.values()].some((review) => review.state === 'CHANGES_REQUESTED');
}

function currentPullRequestLabels(pullRequest) {
  if (!pullRequest || !Array.isArray(pullRequest.labels)) {
    return [];
  }
  return pullRequest.labels.map((label) => typeof label === 'string' ? label : label && label.name).filter(Boolean);
}

function evaluateFinalCiGate({
  repository,
  expectedHeadSha,
  expectedBaseSha,
  expectedBaseBranch,
  labelName,
  pullRequest,
  comments,
  reviews,
  reviewDecision,
  unresolvedReviewThreadCount,
  changedFiles,
  gasCheckRuns = [],
  webCheckRuns = [],
}) {
  const currentHeadSha = pullRequest && pullRequest.head && pullRequest.head.sha;
  const headRepository = pullRequest && pullRequest.head && pullRequest.head.repo && pullRequest.head.repo.full_name;
  const baseBranch = pullRequest && pullRequest.base && pullRequest.base.ref;
  const currentBaseSha = pullRequest && pullRequest.base && pullRequest.base.sha;
  const reject = (reason) => ({
    allowed: false,
    reason,
    classification: '',
    gasAction: SNAPSHOT_ACTIONS.NOT_REQUIRED,
    webAction: SNAPSHOT_ACTIONS.NOT_REQUIRED,
    currentHeadSha: currentHeadSha || '',
    currentBaseSha: currentBaseSha || '',
  });

  if (labelName !== FINAL_CI_LABEL || !currentPullRequestLabels(pullRequest).includes(FINAL_CI_LABEL)) {
    return reject(`current PR does not have the ${FINAL_CI_LABEL} label`);
  }
  if (!pullRequest || pullRequest.state !== 'open') {
    return reject('pull request is not open');
  }
  if (pullRequest.draft) {
    return reject('pull request is still Draft');
  }
  if (expectedBaseBranch !== 'develop' || baseBranch !== 'develop') {
    return reject('pull request base branch is not develop');
  }
  if (!isSameRepositoryPullRequest({ repository, headRepository })) {
    return reject('secret-backed final CI is disabled for fork or external PRs');
  }
  if (!/^[0-9a-f]{40}$/i.test(expectedHeadSha || '') || currentHeadSha !== expectedHeadSha) {
    return reject('PR head changed after final CI was requested');
  }
  if (!/^[0-9a-f]{40}$/i.test(expectedBaseSha || '') || currentBaseSha !== expectedBaseSha) {
    return reject('PR base changed after final CI was requested');
  }
  if (!hasReviewCompletionMarker(comments, currentHeadSha, currentBaseSha)) {
    return reject('review completion marker for the current head and base SHA is missing');
  }
  if (!Number.isInteger(unresolvedReviewThreadCount) || unresolvedReviewThreadCount < 0) {
    return reject('unresolved review thread state could not be verified');
  }
  if (unresolvedReviewThreadCount > 0) {
    return reject('unresolved review threads remain');
  }
  if (String(reviewDecision || '').toUpperCase() === 'CHANGES_REQUESTED' || hasActiveChangesRequested(reviews)) {
    return reject('an active changes-requested review remains');
  }

  let classification;
  try {
    classification = classifyChangedFiles(changedFiles);
  } catch (error) {
    return reject(error.message);
  }
  if (classification === CHANGE_CLASSIFICATIONS.DOCS_ONLY) {
    return reject('docs-only changes must not start Final CI');
  }

  const gasAction = hasSuccessfulCheckRun(gasCheckRuns, GAS_TESTS_CHECK_NAME, currentHeadSha, currentBaseSha)
    ? SNAPSHOT_ACTIONS.REUSE
    : SNAPSHOT_ACTIONS.EXECUTE;
  const webRequired = classification === CHANGE_CLASSIFICATIONS.GAS_TESTS_AND_WEB_E2E;
  const webAction = !webRequired
    ? SNAPSHOT_ACTIONS.NOT_REQUIRED
    : hasSuccessfulCheckRun(webCheckRuns, WEB_E2E_CHECK_NAME, currentHeadSha, currentBaseSha)
      ? SNAPSHOT_ACTIONS.REUSE
      : SNAPSHOT_ACTIONS.EXECUTE;
  return {
    allowed: true,
    reason: 'review completion gate passed for the current head and base SHA',
    classification,
    gasAction,
    webAction,
    currentHeadSha,
    currentBaseSha,
  };
}

function isSameRepositoryPullRequest({ repository, headRepository }) {
  return Boolean(repository && headRepository && repository === headRepository);
}

function checkRunHasContext(checkRun, expectedHeadSha, expectedBaseSha) {
  const summary = checkRun && checkRun.output && checkRun.output.summary;
  if (typeof summary !== 'string') {
    return false;
  }
  const markerPattern = new RegExp(
    `${FINAL_CI_CHECK_CONTEXT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*\\r?\\n[ \\t]*head_sha:[ \\t]*([0-9a-f]{40})[ \\t]*\\r?\\n[ \\t]*base_sha:[ \\t]*([0-9a-f]{40})[ \\t]*(?:\\r?\\n|$)`,
    'ig',
  );
  return [...summary.matchAll(markerPattern)].some((match) => (
    match[1] === expectedHeadSha
    && match[2] === expectedBaseSha
  ));
}

function hasSuccessfulCheckRun(checkRuns, checkName, expectedHeadSha = '', expectedBaseSha = '') {
  if (!/^[0-9a-f]{40}$/i.test(expectedHeadSha) || !/^[0-9a-f]{40}$/i.test(expectedBaseSha)) {
    return false;
  }
  return (checkRuns || []).some((checkRun) => (
    checkRun &&
    checkRun.name === checkName &&
    checkRun.conclusion === 'success' &&
    checkRun.head_sha === expectedHeadSha &&
    checkRunHasContext(checkRun, expectedHeadSha, expectedBaseSha)
  ));
}

function buildFinalCiExecutionPlan({ gasAction, webAction }) {
  const validActions = new Set(Object.values(SNAPSHOT_ACTIONS));
  if (!validActions.has(gasAction) || !validActions.has(webAction)) {
    throw new Error('Final CI execution plan contains an invalid action.');
  }
  if (webAction === SNAPSHOT_ACTIONS.EXECUTE && gasAction === SNAPSHOT_ACTIONS.NOT_REQUIRED) {
    throw new Error('Final CI Web E2E cannot execute without a GAS Tests result.');
  }
  if (webAction === SNAPSHOT_ACTIONS.EXECUTE) {
    return gasAction === SNAPSHOT_ACTIONS.EXECUTE
      ? ['gas-tests', 'gas-web-e2e']
      : ['gas-web-e2e'];
  }
  return gasAction === SNAPSHOT_ACTIONS.EXECUTE ? ['gas-tests'] : [];
}

function getCheckConclusionForStatus(status) {
  if (status === 'executed' || status === 'reused') {
    return 'success';
  }
  if (status === 'failed' || status === 'skipped') {
    return 'failure';
  }
  throw new Error(`Unexpected final CI status for Check Run publication: ${status || '(missing)'}`);
}

function determineWebE2eStatus({
  decisionStatus,
  decisionReason,
  headGuardOutcome,
  secretsOutcome,
  installOutcome,
  deployOutcome,
  webappProbe,
  playwrightOutcome,
  cleanupOutcome,
  dynamicDeploymentId,
}) {
  if (decisionStatus === 'reused') {
    return {
      status: 'reused',
      reason: decisionReason || 'successful Web E2E check already exists for this head SHA',
    };
  }

  if (decisionStatus === 'failed') {
    return {
      status: 'failed',
      reason: decisionReason || 'Web E2E decision failed',
    };
  }

  if (decisionStatus === 'skipped') {
    return {
      status: 'skipped',
      reason: decisionReason || 'Web E2E was skipped',
    };
  }

  if (decisionStatus !== 'executed') {
    return {
      status: 'failed',
      reason: `Unexpected Web E2E decision status: ${decisionStatus || '(missing)'}`,
    };
  }

  if (headGuardOutcome === 'failure') {
    return {
      status: 'failed',
      reason: 'PR head changed before Web E2E started',
    };
  }

  if (secretsOutcome === 'failure') {
    return {
      status: 'failed',
      reason: 'Required Web E2E secrets are missing',
    };
  }

  if (installOutcome === 'failure') {
    return {
      status: 'failed',
      reason: 'Web E2E dependency installation failed',
    };
  }

  if (deployOutcome === 'failure') {
    return {
      status: 'failed',
      reason: 'Web app deployment preparation failed',
    };
  }

  if (dynamicDeploymentId && cleanupOutcome !== 'success') {
    return {
      status: 'failed',
      reason: cleanupOutcome === 'failure'
        ? 'Dynamic Web app deployment cleanup failed'
        : 'Dynamic Web app deployment cleanup did not complete',
    };
  }

  if (webappProbe === 'protected') {
    return {
      status: 'skipped',
      reason: 'Web app URL returned HTTP 403; Playwright E2E was not executed',
    };
  }

  if (webappProbe !== 'ready') {
    return {
      status: 'failed',
      reason: 'Web app did not become ready for Playwright E2E',
    };
  }

  if (playwrightOutcome === 'failure') {
    return {
      status: 'failed',
      reason: 'Playwright E2E failed',
    };
  }

  if (playwrightOutcome !== 'success') {
    return {
      status: 'skipped',
      reason: 'Playwright E2E was not executed',
    };
  }

  return {
    status: 'executed',
    reason: 'Web E2E executed successfully',
  };
}

function buildCheckRunRequest({
  repository,
  checkName,
  targetHeadSha,
  targetBaseSha,
  checkStatus,
  checkReason,
  checkDetailsUrl,
}) {
  if (!repository || !repository.includes('/')) {
    throw new Error('GITHUB_REPOSITORY must be owner/repo');
  }
  if (!/^[0-9a-f]{40}$/.test(targetHeadSha || '') || !/^[0-9a-f]{40}$/.test(targetBaseSha || '')) {
    throw new Error('Final CI Check Run context is invalid.');
  }
  const conclusion = getCheckConclusionForStatus(checkStatus);
  return {
    path: `/repos/${repository}/check-runs`,
    body: {
      name: checkName,
      head_sha: targetHeadSha,
      status: 'completed',
      conclusion,
      details_url: checkDetailsUrl || undefined,
      output: {
        title: checkName,
        summary: [
          FINAL_CI_CHECK_CONTEXT_MARKER,
          `head_sha: ${targetHeadSha}`,
          `base_sha: ${targetBaseSha}`,
          '',
          `Status: ${checkStatus}`,
          `Reason: ${checkReason || '(none)'}`,
          `Head SHA: ${targetHeadSha}`,
        ].join('\n'),
      },
    },
  };
}

function decideCheckExecution({
  labelName,
  sameRepository,
  expectedHeadSha,
  expectedBaseSha,
  currentHeadSha,
  currentBaseSha,
  checkName,
  checkRuns,
}) {
  if (labelName !== FINAL_CI_LABEL) {
    return {
      action: 'skip',
      status: 'skipped',
      reason: `label is not ${FINAL_CI_LABEL}`,
    };
  }

  if (!sameRepository) {
    return {
      action: 'fail',
      status: 'failed',
      reason: 'secret-backed final CI is disabled for fork or external PRs',
    };
  }

  if (!expectedHeadSha) {
    return {
      action: 'fail',
      status: 'failed',
      reason: 'expected head SHA is missing',
    };
  }

  if (!currentHeadSha) {
    return {
      action: 'fail',
      status: 'failed',
      reason: 'current PR head SHA could not be resolved',
    };
  }

  if (currentHeadSha !== expectedHeadSha) {
    return {
      action: 'fail',
      status: 'failed',
      reason: 'PR head changed after run-final-ci was requested; remove and re-add the label',
    };
  }

  if (!/^[0-9a-f]{40}$/.test(expectedBaseSha || '')) {
    return {
      action: 'fail',
      status: 'failed',
      reason: 'expected base SHA is missing',
    };
  }

  if (!currentBaseSha) {
    return {
      action: 'fail',
      status: 'failed',
      reason: 'current PR base SHA could not be resolved',
    };
  }

  if (currentBaseSha !== expectedBaseSha) {
    return {
      action: 'fail',
      status: 'failed',
      reason: 'PR base changed after run-final-ci was requested; review the new base and re-add the label',
    };
  }

  if (hasSuccessfulCheckRun(checkRuns, checkName, expectedHeadSha, expectedBaseSha)) {
    return {
      action: 'reuse',
      status: 'reused',
      reason: `successful ${checkName} check already exists for this head SHA`,
    };
  }

  return {
    action: 'execute',
    status: 'executed',
    reason: `no successful ${checkName} check exists for this head SHA`,
  };
}

function requireEnv(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function writeOutput(name, value, env = process.env) {
  if (!env.GITHUB_OUTPUT) {
    return;
  }
  const fs = require('fs');
  fs.appendFileSync(env.GITHUB_OUTPUT, `${name}=${String(value)}\n`);
}

function appendSummary(markdown, env = process.env) {
  if (!env.GITHUB_STEP_SUMMARY) {
    return;
  }
  const fs = require('fs');
  fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

async function fetchGitHubJson({ env, path, method = 'GET', body }) {
  requireEnv(env, ['GITHUB_API_URL', 'GITHUB_REPOSITORY', 'GITHUB_TOKEN']);
  const url = `${env.GITHUB_API_URL.replace(/\/$/, '')}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'X-GitHub-Api-Version': '2022-11-28',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed with HTTP ${response.status}.`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error('GitHub API returned invalid JSON.');
  }
}

async function collectPaginatedItems({ fetchPage, pageSize = 100, maxPages = 100 }) {
  if (typeof fetchPage !== 'function' || !Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error('Final CI gate pagination configuration is invalid.');
  }
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    let pageItems;
    try {
      pageItems = await fetchPage({ page, pageSize });
    } catch (error) {
      throw new Error('Final CI gate pagination failed.');
    }
    if (!Array.isArray(pageItems)) {
      throw new Error('Final CI gate pagination response is invalid.');
    }
    items.push(...pageItems);
    if (pageItems.length < pageSize) {
      return items;
    }
  }
  throw new Error('Final CI gate pagination exceeded the safety limit.');
}

async function readPaginatedRestArray({ env, path, pageSize = 100 }) {
  return collectPaginatedItems({
    pageSize,
    fetchPage: async ({ page }) => {
      const separator = path.includes('?') ? '&' : '?';
      const data = await fetchGitHubJson({
        env,
        path: `${path}${separator}per_page=${pageSize}&page=${page}`,
      });
      if (!Array.isArray(data)) {
        throw new Error('GitHub REST pagination response is invalid.');
      }
      return data;
    },
  });
}

async function fetchGitHubGraphql({ env, query, variables }) {
  const data = await fetchGitHubJson({
    env,
    path: '/graphql',
    method: 'POST',
    body: { query, variables },
  });
  if (!data || typeof data !== 'object' || (Array.isArray(data.errors) && data.errors.length > 0)) {
    throw new Error('GitHub GraphQL request failed.');
  }
  return data.data;
}

async function readReviewThreadState({ env }) {
  requireEnv(env, ['GITHUB_REPOSITORY', 'PR_NUMBER']);
  const [owner, name] = env.GITHUB_REPOSITORY.split('/');
  if (!owner || !name || !/^\d+$/.test(env.PR_NUMBER)) {
    throw new Error('Final CI pull request context is invalid.');
  }
  const query = `
    query FinalCiReviewThreads($owner: String!, $name: String!, $number: Int!, $cursor: String) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          reviewDecision
          reviewThreads(first: 100, after: $cursor) {
            nodes { isResolved }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  `;
  const seenCursors = new Set();
  let cursor = null;
  let reviewDecision = '';
  let unresolvedReviewThreadCount = 0;
  for (let page = 0; page < 100; page += 1) {
    let data;
    try {
      data = await fetchGitHubGraphql({
        env,
        query,
        variables: { owner, name, number: Number(env.PR_NUMBER), cursor },
      });
    } catch (error) {
      throw new Error('Final CI review thread pagination failed.');
    }
    const pullRequest = data && data.repository && data.repository.pullRequest;
    const threads = pullRequest && pullRequest.reviewThreads;
    if (!pullRequest || !threads || !Array.isArray(threads.nodes) || !threads.pageInfo) {
      throw new Error('Final CI review thread response is invalid.');
    }
    reviewDecision = pullRequest.reviewDecision || '';
    unresolvedReviewThreadCount += threads.nodes.filter((thread) => !thread || thread.isResolved !== true).length;
    if (!threads.pageInfo.hasNextPage) {
      return { reviewDecision, unresolvedReviewThreadCount };
    }
    const nextCursor = threads.pageInfo.endCursor;
    if (typeof nextCursor !== 'string' || !nextCursor || seenCursors.has(nextCursor)) {
      throw new Error('Final CI review thread pagination cursor is invalid.');
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  throw new Error('Final CI review thread pagination exceeded the safety limit.');
}

async function readPullRequest({ env }) {
  requireEnv(env, ['GITHUB_REPOSITORY', 'PR_NUMBER']);
  return fetchGitHubJson({
    env,
    path: `/repos/${env.GITHUB_REPOSITORY}/pulls/${encodeURIComponent(env.PR_NUMBER)}`,
  });
}

function buildCheckRunsPath({ repository, headSha, checkName, page, pageSize }) {
  if (
    typeof repository !== 'string'
    || !repository.includes('/')
    || !/^[0-9a-f]{40}$/.test(headSha || '')
    || typeof checkName !== 'string'
    || !checkName
    || !Number.isInteger(page)
    || page < 1
    || !Number.isInteger(pageSize)
    || pageSize < 1
  ) {
    throw new Error('Final CI Check Runs request context is invalid.');
  }
  return `/repos/${repository}/commits/${encodeURIComponent(headSha)}/check-runs?check_name=${encodeURIComponent(checkName)}&filter=all&per_page=${pageSize}&page=${page}`;
}

async function readCheckRuns({ env, headSha, checkName }) {
  requireEnv(env, ['GITHUB_REPOSITORY']);
  return collectPaginatedItems({
    fetchPage: async ({ page, pageSize }) => {
      const data = await fetchGitHubJson({
        env,
        path: buildCheckRunsPath({
          repository: env.GITHUB_REPOSITORY,
          headSha,
          checkName,
          page,
          pageSize,
        }),
      });
      if (!data || !Array.isArray(data.check_runs)) {
        throw new Error('GitHub Check Runs response is invalid.');
      }
      return data.check_runs;
    },
  });
}

async function commandGate(env = process.env) {
  requireEnv(env, [
    'EXPECTED_BASE_BRANCH',
    'EXPECTED_BASE_SHA',
    'EXPECTED_HEAD_SHA',
    'GITHUB_REPOSITORY',
    'LABEL_NAME',
    'PR_NUMBER',
  ]);
  const writeGateOutputs = (result) => {
    writeOutput('allowed', result.allowed ? 'true' : 'false', env);
    writeOutput('reason', result.reason, env);
    writeOutput('classification', result.classification || '', env);
    writeOutput('gas_action', result.gasAction, env);
    writeOutput('web_action', result.webAction, env);
    writeOutput('current_head_sha', result.currentHeadSha || '', env);
    writeOutput('current_base_sha', result.currentBaseSha || '', env);
    const executionPlan = result.allowed
      ? buildFinalCiExecutionPlan({ gasAction: result.gasAction, webAction: result.webAction })
      : [];
    writeOutput('heavy_job_count', executionPlan.length, env);
    writeOutput('heavy_jobs', executionPlan.join(','), env);
    writeOutput('should_run_heavy', executionPlan.length > 0 ? 'true' : 'false', env);
  };
  let result;
  try {
    const pullRequest = await readPullRequest({ env });
    const [comments, reviews, changedFileRecords, reviewThreadState] = await Promise.all([
      readPaginatedRestArray({
        env,
        path: `/repos/${env.GITHUB_REPOSITORY}/issues/${encodeURIComponent(env.PR_NUMBER)}/comments`,
      }),
      readPaginatedRestArray({
        env,
        path: `/repos/${env.GITHUB_REPOSITORY}/pulls/${encodeURIComponent(env.PR_NUMBER)}/reviews`,
      }),
      readPaginatedRestArray({
        env,
        path: `/repos/${env.GITHUB_REPOSITORY}/pulls/${encodeURIComponent(env.PR_NUMBER)}/files`,
      }),
      readReviewThreadState({ env }),
    ]);
    if (changedFileRecords.some((file) => !file || typeof file.filename !== 'string')) {
      throw new Error('Final CI changed file response is invalid.');
    }
    const currentHeadSha = pullRequest && pullRequest.head && pullRequest.head.sha;
    const currentBaseSha = pullRequest && pullRequest.base && pullRequest.base.sha;
    const [gasCheckRuns, webCheckRuns] = (
      currentHeadSha === env.EXPECTED_HEAD_SHA
      && currentBaseSha === env.EXPECTED_BASE_SHA
    )
      ? await Promise.all([
        readCheckRuns({ env, headSha: currentHeadSha, checkName: GAS_TESTS_CHECK_NAME }),
        readCheckRuns({ env, headSha: currentHeadSha, checkName: WEB_E2E_CHECK_NAME }),
      ])
      : [[], []];
    result = evaluateFinalCiGate({
      repository: env.GITHUB_REPOSITORY,
      expectedHeadSha: env.EXPECTED_HEAD_SHA,
      expectedBaseSha: env.EXPECTED_BASE_SHA,
      expectedBaseBranch: env.EXPECTED_BASE_BRANCH,
      labelName: env.LABEL_NAME,
      pullRequest,
      comments,
      reviews,
      reviewDecision: reviewThreadState.reviewDecision,
      unresolvedReviewThreadCount: reviewThreadState.unresolvedReviewThreadCount,
      changedFiles: changedFileRecords.map((file) => file.filename),
      gasCheckRuns,
      webCheckRuns,
    });
  } catch (error) {
    result = {
      allowed: false,
      reason: error && error.message ? error.message : 'Final CI gate verification failed.',
      classification: '',
      gasAction: SNAPSHOT_ACTIONS.NOT_REQUIRED,
      webAction: SNAPSHOT_ACTIONS.NOT_REQUIRED,
      currentHeadSha: '',
      currentBaseSha: '',
    };
  }

  writeGateOutputs(result);
  appendSummary([
    '## Final CI review gate',
    '',
    `- PR: #${env.PR_NUMBER}`,
    `- Requested head SHA: \`${env.EXPECTED_HEAD_SHA}\``,
    `- Current head SHA: \`${result.currentHeadSha || 'unknown'}\``,
    `- Requested base SHA: \`${env.EXPECTED_BASE_SHA}\``,
    `- Current base SHA: \`${result.currentBaseSha || 'unknown'}\``,
    `- Result: \`${result.allowed ? 'accepted' : 'rejected'}\``,
    `- Reason: ${result.reason}`,
    `- Change classification: \`${result.classification || 'not-classified'}\``,
    `- GAS Tests: \`${result.gasAction}\``,
    `- Web E2E: \`${result.webAction}\``,
    `- Heavy runners: \`${result.allowed ? buildFinalCiExecutionPlan({ gasAction: result.gasAction, webAction: result.webAction }).join(',') || 'none' : 'none'}\``,
    '',
  ].join('\n'), env);
  if (!result.allowed) {
    throw new Error(result.reason);
  }
  return result;
}

async function commandDecide(env = process.env) {
  requireEnv(env, [
    'CHECK_NAME',
    'CHECK_KIND',
    'EXPECTED_BASE_SHA',
    'EXPECTED_HEAD_SHA',
    'GITHUB_REPOSITORY',
    'LABEL_NAME',
    'PR_NUMBER',
  ]);

  const pullRequest = await readPullRequest({ env });
  const currentHeadSha = pullRequest.head && pullRequest.head.sha;
  const currentBaseSha = pullRequest.base && pullRequest.base.sha;
  const headRepository = pullRequest.head && pullRequest.head.repo && pullRequest.head.repo.full_name;
  const sameRepository = isSameRepositoryPullRequest({
    repository: env.GITHUB_REPOSITORY,
    headRepository,
  });
  const checkRuns = currentHeadSha === env.EXPECTED_HEAD_SHA && currentBaseSha === env.EXPECTED_BASE_SHA
    ? await readCheckRuns({ env, headSha: env.EXPECTED_HEAD_SHA, checkName: env.CHECK_NAME })
    : [];

  const decision = decideCheckExecution({
    labelName: env.LABEL_NAME,
    sameRepository,
    expectedHeadSha: env.EXPECTED_HEAD_SHA,
    expectedBaseSha: env.EXPECTED_BASE_SHA,
    currentHeadSha,
    currentBaseSha,
    checkName: env.CHECK_NAME,
    checkRuns,
  });

  writeOutput('execute', decision.action === 'execute' ? 'true' : 'false', env);
  writeOutput('status', decision.status, env);
  writeOutput('reason', decision.reason, env);
  writeOutput('current_head_sha', currentHeadSha || '', env);
  writeOutput('current_base_sha', currentBaseSha || '', env);
  writeOutput('same_repository', sameRepository ? 'true' : 'false', env);

  appendSummary([
    `### ${env.CHECK_KIND} decision`,
    '',
    `- PR: #${env.PR_NUMBER}`,
    `- Head SHA: \`${env.EXPECTED_HEAD_SHA}\``,
    `- Current PR head SHA: \`${currentHeadSha || 'unknown'}\``,
    `- Base SHA: \`${env.EXPECTED_BASE_SHA}\``,
    `- Current PR base SHA: \`${currentBaseSha || 'unknown'}\``,
    `- Same repository PR: \`${sameRepository ? 'true' : 'false'}\``,
    `- Check name: \`${env.CHECK_NAME}\``,
    `- Decision: \`${decision.status}\``,
    `- Reason: ${decision.reason}`,
    '',
  ].join('\n'), env);

  if (decision.action === 'fail') {
    throw new Error(decision.reason);
  }

  return decision;
}

async function commandAssertHead(env = process.env) {
  requireEnv(env, ['EXPECTED_BASE_SHA', 'EXPECTED_HEAD_SHA', 'GITHUB_REPOSITORY', 'PR_NUMBER']);
  const pullRequest = await readPullRequest({ env });
  const currentHeadSha = pullRequest.head && pullRequest.head.sha;
  const currentBaseSha = pullRequest.base && pullRequest.base.sha;

  if (currentHeadSha !== env.EXPECTED_HEAD_SHA) {
    throw new Error('PR head changed after final CI started. Stop this run and re-add run-final-ci for the new head SHA.');
  }

  if (currentBaseSha !== env.EXPECTED_BASE_SHA) {
    throw new Error('PR base changed after final CI started. Stop this run, review the new base, and re-add run-final-ci.');
  }

  appendSummary([
    '### PR head/base guard',
    '',
    `- PR: #${env.PR_NUMBER}`,
    `- Head SHA: \`${env.EXPECTED_HEAD_SHA}\``,
    `- Base SHA: \`${env.EXPECTED_BASE_SHA}\``,
    '- Result: unchanged',
    '',
  ].join('\n'), env);
}

function commandRecordWebStatus(env = process.env) {
  const result = determineWebE2eStatus({
    decisionStatus: env.DECISION_STATUS || '',
    decisionReason: env.DECISION_REASON || '',
    headGuardOutcome: env.HEAD_GUARD_OUTCOME || '',
    secretsOutcome: env.SECRETS_OUTCOME || '',
    installOutcome: env.INSTALL_OUTCOME || '',
    deployOutcome: env.DEPLOY_OUTCOME || '',
    webappProbe: env.WEBAPP_PROBE || '',
    playwrightOutcome: env.PLAYWRIGHT_OUTCOME || '',
    cleanupOutcome: env.CLEANUP_OUTCOME || '',
    dynamicDeploymentId: env.DYNAMIC_DEPLOYMENT_ID || '',
  });

  writeOutput('status', result.status, env);
  writeOutput('reason', result.reason, env);

  appendSummary([
    '### Web E2E result',
    '',
    `- Status: \`${result.status}\``,
    `- Reason: ${result.reason}`,
    '',
  ].join('\n'), env);

  return result;
}

async function commandPublishCheck(env = process.env) {
  requireEnv(env, [
    'CHECK_NAME',
    'CHECK_KIND',
    'CHECK_REASON',
    'CHECK_STATUS',
    'GITHUB_REPOSITORY',
    'PR_NUMBER',
    'TARGET_BASE_SHA',
    'TARGET_HEAD_SHA',
  ]);

  const pullRequest = await readPullRequest({ env });
  const currentHeadSha = pullRequest.head && pullRequest.head.sha;
  const currentBaseSha = pullRequest.base && pullRequest.base.sha;
  const headRepository = pullRequest.head && pullRequest.head.repo && pullRequest.head.repo.full_name;
  const sameRepository = isSameRepositoryPullRequest({
    repository: env.GITHUB_REPOSITORY,
    headRepository,
  });

  if (!sameRepository) {
    throw new Error(`Refusing to publish ${env.CHECK_KIND} Check Run for fork or external PR`);
  }

  if (currentHeadSha !== env.TARGET_HEAD_SHA) {
    throw new Error(`PR head changed before publishing ${env.CHECK_KIND} Check Run.`);
  }

  if (currentBaseSha !== env.TARGET_BASE_SHA) {
    throw new Error(`PR base changed before publishing ${env.CHECK_KIND} Check Run.`);
  }

  const request = buildCheckRunRequest({
    repository: env.GITHUB_REPOSITORY,
    checkName: env.CHECK_NAME,
    targetHeadSha: env.TARGET_HEAD_SHA,
    targetBaseSha: env.TARGET_BASE_SHA,
    checkStatus: env.CHECK_STATUS,
    checkReason: env.CHECK_REASON,
    checkDetailsUrl: env.CHECK_DETAILS_URL || '',
  });

  const checkRun = await fetchGitHubJson({
    env,
    path: request.path,
    method: 'POST',
    body: request.body,
  });

  writeOutput('check_run_id', checkRun.id || '', env);
  writeOutput('conclusion', request.body.conclusion, env);

  appendSummary([
    `### ${env.CHECK_KIND} Check Run`,
    '',
    `- Name: \`${env.CHECK_NAME}\``,
    `- Head SHA: \`${env.TARGET_HEAD_SHA}\``,
    `- Base SHA: \`${env.TARGET_BASE_SHA}\``,
    `- Status: \`${env.CHECK_STATUS}\``,
    `- Conclusion: \`${request.body.conclusion}\``,
    '',
  ].join('\n'), env);
}

async function main() {
  const command = process.argv[2];
  if (command === 'gate') {
    await commandGate();
    return;
  }
  if (command === 'decide') {
    await commandDecide();
    return;
  }
  if (command === 'assert-head') {
    await commandAssertHead();
    return;
  }
  if (command === 'record-web-status') {
    commandRecordWebStatus();
    return;
  }
  if (command === 'publish-check') {
    await commandPublishCheck();
    return;
  }

  throw new Error(`Unknown final CI command: ${command || '(missing)'}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  CHANGE_CLASSIFICATIONS,
  FINAL_CI_CHECK_CONTEXT_MARKER,
  FINAL_CI_LABEL,
  FINAL_CI_REVIEW_MARKER,
  GAS_TESTS_CHECK_NAME,
  SNAPSHOT_ACTIONS,
  WEB_E2E_CHECK_NAME,
  buildCheckRunsPath,
  buildFinalCiExecutionPlan,
  buildCheckRunRequest,
  classifyChangedFiles,
  collectPaginatedItems,
  checkRunHasContext,
  commentHasReviewMarkerForContext,
  decideCheckExecution,
  determineWebE2eStatus,
  evaluateFinalCiGate,
  getCheckConclusionForStatus,
  hasActiveChangesRequested,
  hasReviewCompletionMarker,
  hasSuccessfulCheckRun,
  isSameRepositoryPullRequest,
};
