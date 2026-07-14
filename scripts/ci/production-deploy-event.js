#!/usr/bin/env node
'use strict';

const fs = require('fs');

const ALLOWED_DEPLOY_LABELS = {
  'deploy-production-dry-run': {
    dryRun: true,
    dryRunMode: 'authenticated',
    force: false,
  },
  'deploy-production': {
    dryRun: false,
    dryRunMode: 'authenticated',
    force: false,
  },
  'deploy-production-force': {
    dryRun: false,
    dryRunMode: 'authenticated',
    force: true,
  },
};

function booleanFromInput(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseEventPayload(eventPath) {
  if (!eventPath || !fs.existsSync(eventPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(eventPath, 'utf8'));
}

async function resolveProductionDeployEvent({
  env,
  adapters,
}) {
  const eventName = env.GITHUB_EVENT_NAME || '';
  const payload = parseEventPayload(env.GITHUB_EVENT_PATH);
  const latestDevelopSha = await adapters.getLatestDevelopSha();

  if (eventName === 'workflow_dispatch') {
    const targetSha = env.DISPATCH_TARGET_SHA || env.TARGET_SHA || latestDevelopSha;
    if (targetSha !== latestDevelopSha) {
      throw new Error('workflow_dispatch target_sha must match the latest origin/develop commit.');
    }
    const dryRun = booleanFromInput(env.DISPATCH_DRY_RUN || env.DRY_RUN, true);
    return {
      shouldRun: true,
      dryRun,
      dryRunMode: dryRun ? (env.DISPATCH_DRY_RUN_MODE || env.DRY_RUN_MODE || 'static') : 'authenticated',
      force: booleanFromInput(env.DISPATCH_FORCE || env.FORCE, false),
      targetSha,
      sourcePrNumber: '',
      triggerLabel: '',
      latestDevelopSha,
    };
  }

  if (eventName !== 'issues') {
    return {
      shouldRun: false,
      reason: `ignored event: ${eventName}`,
    };
  }

  const labelName = payload.label && payload.label.name;
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_DEPLOY_LABELS, labelName)) {
    return {
      shouldRun: false,
      reason: `ignored label: ${labelName || 'none'}`,
    };
  }

  const issueNumber = payload.issue && payload.issue.number;
  if (!issueNumber) {
    throw new Error('deploy label event did not include an issue number.');
  }

  try {
    await adapters.removeIssueLabel(issueNumber, labelName);
  } catch (error) {
    adapters.warn(`Failed to remove trigger label ${labelName}: ${error.message}`);
  }

  const issue = await adapters.getIssue(issueNumber);
  if (!issue.pull_request) {
    throw new Error('deploy label can only be used on a merged pull request.');
  }

  const pull = await adapters.getPullRequest(issueNumber);
  if (!pull.merged) {
    throw new Error('deploy label can only be used on a merged pull request.');
  }
  if (!pull.base || pull.base.ref !== 'develop') {
    throw new Error('deploy label can only be used on pull requests targeting develop.');
  }
  if (!pull.base.repo || !pull.head.repo || pull.base.repo.full_name !== pull.head.repo.full_name) {
    throw new Error('deploy label can only be used on same-repository pull requests.');
  }
  if (pull.merge_commit_sha !== latestDevelopSha) {
    throw new Error('merged PR commit must match the latest origin/develop commit.');
  }

  const labelConfig = ALLOWED_DEPLOY_LABELS[labelName];
  return {
    shouldRun: true,
    dryRun: labelConfig.dryRun,
    dryRunMode: labelConfig.dryRunMode,
    force: labelConfig.force,
    targetSha: pull.merge_commit_sha,
    sourcePrNumber: String(pull.number),
    triggerLabel: labelName,
    latestDevelopSha,
  };
}

function writeOutputs(outputs, outputPath) {
  if (!outputPath) {
    process.stdout.write(`${JSON.stringify(outputs, null, 2)}\n`);
    return;
  }
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  fs.appendFileSync(outputPath, `${lines.join('\n')}\n`);
}

function createGitHubAdapters(env) {
  async function request(method, apiPath, body) {
    const apiBase = env.GITHUB_API_URL || 'https://api.github.com';
    const response = await fetch(`${apiBase}${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'trade-csv-to-spreadsheet-production-deploy',
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
    warn(message) {
      process.stderr.write(`Warning: ${message}\n`);
    },
    async getLatestDevelopSha() {
      const branch = await request('GET', `/repos/${env.GITHUB_REPOSITORY}/branches/develop`);
      return branch.commit.sha;
    },
    getIssue(issueNumber) {
      return request('GET', `/repos/${env.GITHUB_REPOSITORY}/issues/${issueNumber}`);
    },
    getPullRequest(number) {
      return request('GET', `/repos/${env.GITHUB_REPOSITORY}/pulls/${number}`);
    },
    async removeIssueLabel(issueNumber, labelName) {
      await request('DELETE', `/repos/${env.GITHUB_REPOSITORY}/issues/${issueNumber}/labels/${encodeURIComponent(labelName)}`);
    },
  };
}

async function main() {
  const result = await resolveProductionDeployEvent({
    env: process.env,
    adapters: createGitHubAdapters(process.env),
  });
  writeOutputs({
    should_run: result.shouldRun ? 'true' : 'false',
    dry_run: result.dryRun ? 'true' : 'false',
    dry_run_mode: result.dryRunMode || 'static',
    force: result.force ? 'true' : 'false',
    target_sha: result.targetSha || '',
    source_pr_number: result.sourcePrNumber || '',
    trigger_label: result.triggerLabel || '',
    latest_develop_sha: result.latestDevelopSha || '',
  }, process.env.GITHUB_OUTPUT);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  ALLOWED_DEPLOY_LABELS,
  resolveProductionDeployEvent,
};
