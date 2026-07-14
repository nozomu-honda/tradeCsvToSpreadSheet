#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');

const {
  calculateBehindDevelop,
  createInitialProductionDeployState,
  isFullSha,
  parseProductionStatusIssue,
} = require('./production-deploy-state');
const { renderProductionStatusIssue } = require('./production-status-renderer');
const {
  STATUS_MARKER,
  validateManagedStatusIssue,
} = require('./production-deploy-orchestrator');

const IN_PROGRESS_STATES = [
  'preflight',
  'source-pushed',
  'deployment-updated',
  'verifying',
];

function workflowRunUrl(env) {
  if (!env.GITHUB_SERVER_URL || !env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID) {
    return '';
  }
  return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}

function requireStatusSyncConfig(env) {
  const missing = [
    'GITHUB_TOKEN',
    'GITHUB_REPOSITORY',
  ].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required production status sync configuration: ${missing.join(', ')}`);
  }
}

function resolveStatusIssueNumber(env) {
  const raw = env.PRODUCTION_STATUS_ISSUE_NUMBER;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return {
      configured: false,
      reason: 'PRODUCTION_STATUS_ISSUE_NUMBER is not configured',
    };
  }
  const issueNumber = Number(raw);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('PRODUCTION_STATUS_ISSUE_NUMBER must be a positive issue number.');
  }
  return {
    configured: true,
    issueNumber,
  };
}

function resolveNextStatus({ parsed, latestDevelopSha }) {
  const currentProductionSha = parsed.currentProductionSha || 'unknown';
  if (parsed.productionStatus === 'failed') {
    return 'failed';
  }
  if (!isFullSha(currentProductionSha)) {
    return 'unknown';
  }
  if (
    currentProductionSha === latestDevelopSha
    && parsed.sourcePush === 'success'
    && parsed.deploymentUpdate === 'success'
    && parsed.smokeTest === 'success'
  ) {
    return 'deployed';
  }
  if (currentProductionSha !== latestDevelopSha) {
    return 'not-deployed';
  }
  return 'unknown';
}

function writeSkippedSummary(adapters, reason) {
  adapters.writeStepSummary([
    '## Production Status sync',
    '',
    '- status: `skipped`',
    `- reason: ${reason}`,
  ].join('\n'));
}

function shouldSkipForDeployInProgress(parsed) {
  return IN_PROGRESS_STATES.includes(parsed.productionStatus);
}

async function runProductionStatusSync({ env, adapters }) {
  const issueNumberConfig = resolveStatusIssueNumber(env);
  if (!issueNumberConfig.configured) {
    writeSkippedSummary(adapters, issueNumberConfig.reason);
    return {
      skipped: true,
      status: 'skipped',
      reason: issueNumberConfig.reason,
    };
  }
  requireStatusSyncConfig(env);
  adapters.fetchDevelop();

  const latestDevelopSha = adapters.getHeadSha();
  if (!isFullSha(latestDevelopSha)) {
    throw new Error('latest develop SHA must be a full git SHA.');
  }

  const { issueNumber } = issueNumberConfig;

  const issue = await adapters.githubRequest('GET', `/repos/${env.GITHUB_REPOSITORY}/issues/${issueNumber}`);
  validateManagedStatusIssue(issue);
  const parsed = parseProductionStatusIssue(issue.body || '');
  if (shouldSkipForDeployInProgress(parsed)) {
    writeSkippedSummary(adapters, 'Production deploy is in progress. Status sync skipped.');
    return {
      skipped: true,
      status: 'skipped',
      reason: 'deploy-in-progress',
      parsed,
    };
  }
  const currentProductionSha = parsed.currentProductionSha || 'unknown';
  const commitsBehindDevelop = calculateBehindDevelop({
    currentProductionSha,
    latestDevelopSha,
    isAncestor: isFullSha(currentProductionSha)
      ? adapters.isAncestor(currentProductionSha, latestDevelopSha)
      : false,
    commitCount: isFullSha(currentProductionSha)
      ? adapters.commitCount(`${currentProductionSha}..${latestDevelopSha}`)
      : 0,
  });
  const status = resolveNextStatus({ parsed, latestDevelopSha });
  const nextState = createInitialProductionDeployState({
    targetSha: latestDevelopSha,
    latestDevelopSha,
    previousProductionSha: currentProductionSha,
    currentProductionSha,
    commitsBehindDevelop,
    lastSuccessfulDeploymentSha: parsed.lastSuccessfulDeploymentSha || 'unknown',
    lastSuccessfulDeploymentAt: parsed.lastSuccessfulDeploymentAt || 'unknown',
    dryRun: true,
    force: false,
    workflowRunUrl: workflowRunUrl(env),
    lastDeploymentWorkflowUrl: parsed.lastDeploymentWorkflowUrl || 'unknown',
    lastStatusSyncWorkflowUrl: workflowRunUrl(env),
    status,
  });

  nextState.sourcePush = parsed.sourcePush || 'not-started';
  nextState.deploymentUpdate = parsed.deploymentUpdate || 'not-started';
  nextState.smokeTest = parsed.smokeTest || 'not-started';
  nextState.lastFailureStage = parsed.lastFailureStage || '';
  nextState.failureMessage = parsed.failureMessage || '';

  const body = renderProductionStatusIssue(nextState);
  if (!body.includes(STATUS_MARKER)) {
    throw new Error('Rendered Production Status Issue body is missing the managed marker.');
  }

  const latestIssue = await adapters.githubRequest('GET', `/repos/${env.GITHUB_REPOSITORY}/issues/${issueNumber}`);
  validateManagedStatusIssue(latestIssue);
  const latestParsed = parseProductionStatusIssue(latestIssue.body || '');
  if (shouldSkipForDeployInProgress(latestParsed)) {
    writeSkippedSummary(adapters, 'Production deploy is in progress. Status sync skipped.');
    return {
      skipped: true,
      status: 'skipped',
      reason: 'deploy-in-progress',
      parsed: latestParsed,
    };
  }

  await adapters.githubRequest('PATCH', `/repos/${env.GITHUB_REPOSITORY}/issues/${issueNumber}`, { body });
  adapters.writeStepSummary([
    '## Production Status sync',
    '',
    `- status: \`${nextState.status}\``,
    `- current production: \`${nextState.currentProductionSha}\``,
    `- latest develop: \`${nextState.latestDevelopSha}\``,
    `- behind: \`${nextState.commitsBehindDevelop}\``,
  ].join('\n'));
  return nextState;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: options.capture ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.`);
  }
  return options.capture ? (result.stdout || '').trim() : '';
}

function createNodeStatusSyncAdapters(env = process.env) {
  async function githubRequest(method, apiPath, body) {
    const apiBase = env.GITHUB_API_URL || 'https://api.github.com';
    const response = await fetch(`${apiBase}${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'trade-csv-to-spreadsheet-production-status-sync',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GitHub API ${method} ${apiPath} failed with ${response.status}: ${text}`);
    }
    return text ? JSON.parse(text) : {};
  }

  return {
    fetchDevelop() {
      run('git', ['fetch', '--no-tags', 'origin', 'develop']);
    },
    getHeadSha() {
      return run('git', ['rev-parse', 'HEAD'], { capture: true });
    },
    isAncestor(ancestor, descendant) {
      const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
        cwd: process.cwd(),
        env,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (result.status === 0) {
        return true;
      }
      if (result.status === 1) {
        return false;
      }
      throw new Error('git merge-base --is-ancestor failed.');
    },
    commitCount(range) {
      return Number(run('git', ['rev-list', '--count', range], { capture: true }));
    },
    githubRequest,
    writeStepSummary(markdown) {
      if (env.GITHUB_STEP_SUMMARY) {
        require('fs').appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
      } else {
        process.stdout.write(`${markdown}\n`);
      }
    },
  };
}

async function main() {
  await runProductionStatusSync({
    env: process.env,
    adapters: createNodeStatusSyncAdapters(process.env),
  });
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  IN_PROGRESS_STATES,
  createNodeStatusSyncAdapters,
  requireStatusSyncConfig,
  resolveStatusIssueNumber,
  resolveNextStatus,
  runProductionStatusSync,
};
