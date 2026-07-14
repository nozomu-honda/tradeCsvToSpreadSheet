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

async function fetchGitHubJson({ env, path }) {
  requireEnv(env, ['GITHUB_API_URL', 'GITHUB_REPOSITORY', 'GITHUB_TOKEN']);
  const url = `${env.GITHUB_API_URL.replace(/\/$/, '')}${path}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
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
  decideCheckExecution,
  hasSuccessfulCheckRun,
  isSameRepositoryPullRequest,
};
