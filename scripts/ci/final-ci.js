#!/usr/bin/env node
'use strict';

const FINAL_CI_LABEL = 'run-final-ci';
const GAS_TESTS_CHECK_NAME = 'Push test GAS project and run tests';
const WEB_E2E_CHECK_NAME = 'Deploy test Web app and run Playwright E2E';

function isSameRepositoryPullRequest({ repository, headRepository }) {
  return Boolean(repository && headRepository && repository === headRepository);
}

function hasSuccessfulCheckRun(checkRuns, checkName) {
  return (checkRuns || []).some((checkRun) => (
    checkRun &&
    checkRun.name === checkName &&
    checkRun.conclusion === 'success'
  ));
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
  checkStatus,
  checkReason,
  checkDetailsUrl,
}) {
  if (!repository || !repository.includes('/')) {
    throw new Error('GITHUB_REPOSITORY must be owner/repo');
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
  currentHeadSha,
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

  if (hasSuccessfulCheckRun(checkRuns, checkName)) {
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
    const body = await response.text();
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }

  return response.json();
}

async function readPullRequest({ env }) {
  requireEnv(env, ['GITHUB_REPOSITORY', 'PR_NUMBER']);
  return fetchGitHubJson({
    env,
    path: `/repos/${env.GITHUB_REPOSITORY}/pulls/${encodeURIComponent(env.PR_NUMBER)}`,
  });
}

async function readCheckRuns({ env, headSha, checkName }) {
  requireEnv(env, ['GITHUB_REPOSITORY']);
  const encodedSha = encodeURIComponent(headSha);
  const encodedName = encodeURIComponent(checkName);
  const data = await fetchGitHubJson({
    env,
    path: `/repos/${env.GITHUB_REPOSITORY}/commits/${encodedSha}/check-runs?check_name=${encodedName}&per_page=100`,
  });
  return data.check_runs || [];
}

async function commandDecide(env = process.env) {
  requireEnv(env, [
    'CHECK_NAME',
    'CHECK_KIND',
    'EXPECTED_HEAD_SHA',
    'GITHUB_REPOSITORY',
    'LABEL_NAME',
    'PR_NUMBER',
  ]);

  const pullRequest = await readPullRequest({ env });
  const currentHeadSha = pullRequest.head && pullRequest.head.sha;
  const headRepository = pullRequest.head && pullRequest.head.repo && pullRequest.head.repo.full_name;
  const sameRepository = isSameRepositoryPullRequest({
    repository: env.GITHUB_REPOSITORY,
    headRepository,
  });
  const checkRuns = currentHeadSha === env.EXPECTED_HEAD_SHA
    ? await readCheckRuns({ env, headSha: env.EXPECTED_HEAD_SHA, checkName: env.CHECK_NAME })
    : [];

  const decision = decideCheckExecution({
    labelName: env.LABEL_NAME,
    sameRepository,
    expectedHeadSha: env.EXPECTED_HEAD_SHA,
    currentHeadSha,
    checkName: env.CHECK_NAME,
    checkRuns,
  });

  writeOutput('execute', decision.action === 'execute' ? 'true' : 'false', env);
  writeOutput('status', decision.status, env);
  writeOutput('reason', decision.reason, env);
  writeOutput('current_head_sha', currentHeadSha || '', env);
  writeOutput('same_repository', sameRepository ? 'true' : 'false', env);

  appendSummary([
    `### ${env.CHECK_KIND} decision`,
    '',
    `- PR: #${env.PR_NUMBER}`,
    `- Head SHA: \`${env.EXPECTED_HEAD_SHA}\``,
    `- Current PR head SHA: \`${currentHeadSha || 'unknown'}\``,
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
  requireEnv(env, ['EXPECTED_HEAD_SHA', 'GITHUB_REPOSITORY', 'PR_NUMBER']);
  const pullRequest = await readPullRequest({ env });
  const currentHeadSha = pullRequest.head && pullRequest.head.sha;

  if (currentHeadSha !== env.EXPECTED_HEAD_SHA) {
    throw new Error('PR head changed after final CI started. Stop this run and re-add run-final-ci for the new head SHA.');
  }

  appendSummary([
    '### Head SHA guard',
    '',
    `- PR: #${env.PR_NUMBER}`,
    `- Head SHA: \`${env.EXPECTED_HEAD_SHA}\``,
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
    'TARGET_HEAD_SHA',
  ]);

  const pullRequest = await readPullRequest({ env });
  const currentHeadSha = pullRequest.head && pullRequest.head.sha;
  const headRepository = pullRequest.head && pullRequest.head.repo && pullRequest.head.repo.full_name;
  const sameRepository = isSameRepositoryPullRequest({
    repository: env.GITHUB_REPOSITORY,
    headRepository,
  });

  if (!sameRepository) {
    throw new Error(`Refusing to publish ${env.CHECK_KIND} Check Run for fork or external PR`);
  }

  if (currentHeadSha !== env.TARGET_HEAD_SHA) {
    throw new Error(`PR head changed before publishing ${env.CHECK_KIND} Check Run. Expected ${env.TARGET_HEAD_SHA}, got ${currentHeadSha || 'unknown'}.`);
  }

  const request = buildCheckRunRequest({
    repository: env.GITHUB_REPOSITORY,
    checkName: env.CHECK_NAME,
    targetHeadSha: env.TARGET_HEAD_SHA,
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
    `- Status: \`${env.CHECK_STATUS}\``,
    `- Conclusion: \`${request.body.conclusion}\``,
    '',
  ].join('\n'), env);
}

async function main() {
  const command = process.argv[2];
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
  FINAL_CI_LABEL,
  GAS_TESTS_CHECK_NAME,
  WEB_E2E_CHECK_NAME,
  buildCheckRunRequest,
  decideCheckExecution,
  determineWebE2eStatus,
  getCheckConclusionForStatus,
  hasSuccessfulCheckRun,
  isSameRepositoryPullRequest,
};
