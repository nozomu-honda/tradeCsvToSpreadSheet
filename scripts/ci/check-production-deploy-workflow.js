#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveProductionDeployEvent } = require('./production-deploy-event');

const repoRoot = path.resolve(__dirname, '..', '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'deploy-production.yml');
const orchestratorPath = path.join(repoRoot, 'scripts', 'ci', 'production-deploy-orchestrator.js');
const adaptersPath = path.join(repoRoot, 'scripts', 'ci', 'production-deploy-adapters.js');
const eventPath = path.join(repoRoot, 'scripts', 'ci', 'production-deploy-event.js');
const packagePath = path.join(repoRoot, 'package.json');

const workflow = fs.readFileSync(workflowPath, 'utf8');
const orchestrator = fs.readFileSync(orchestratorPath, 'utf8');
const adapters = fs.readFileSync(adaptersPath, 'utf8');
const eventResolver = fs.readFileSync(eventPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

function includes(text, pattern, message) {
  assert.ok(text.includes(pattern), message || `Expected to find: ${pattern}`);
}

includes(workflow, 'workflow_dispatch:', 'production workflow must keep workflow_dispatch');
includes(workflow, 'issues:', 'production workflow must support label-triggered issue events');
includes(workflow, '- labeled', 'production workflow must listen for labeled issues');
assert.ok(!workflow.includes('pull_request_target'), 'production workflow must not use pull_request_target');
assert.ok(!workflow.includes('pull_request:'), 'production workflow must not run from pull_request');
assert.ok(!workflow.includes('\n  push:'), 'production workflow must not run from push');

includes(workflow, 'dry_run_mode:', 'dry_run_mode input is required');
includes(workflow, 'default: static', 'static dry-run must be the workflow_dispatch default');
includes(workflow, 'group: production-deploy', 'workflow must serialize production deploys');
includes(workflow, 'cancel-in-progress: false', 'production deploy concurrency must not cancel in-progress runs');
assert.ok(!workflow.includes('deployments: write'), 'manual Deployment API permissions must not be requested');
includes(workflow, 'issues: write', 'workflow must be able to remove trigger labels and update the Status Issue');
includes(workflow, 'pull-requests: read', 'workflow must be able to validate merged PRs');
includes(workflow, 'checks: read', 'workflow must be able to read check runs');
includes(workflow, 'statuses: read', 'workflow must be able to read commit statuses');
includes(workflow, 'resolve-production-target:', 'workflow must resolve labels before entering production Environment');
includes(workflow, 'static-dry-run:', 'workflow must have a no-secrets static dry-run job');
includes(workflow, 'deploy-production:', 'workflow must have an authenticated production job');
includes(workflow, 'environment:', 'authenticated job must use the production Environment');
includes(workflow, 'name: production', 'workflow Environment name must be production');
includes(workflow, 'ref: develop', 'workflow must checkout trusted develop source');
includes(workflow, 'git checkout -B develop origin/develop', 'local branch must be pinned to origin/develop');
includes(workflow, 'node scripts/ci/production-deploy-event.js', 'workflow must resolve label or dispatch targets');
includes(workflow, 'node scripts/ci/run-production-deploy.js', 'workflow must call the production deploy orchestrator');

[
  'deploy-production-dry-run',
  'deploy-production',
  'deploy-production-force',
  'CLASP_PRODUCTION_CREDENTIALS',
  'PRODUCTION_SCRIPT_ID',
  'PRODUCTION_DEPLOYMENT_ID',
  'PRODUCTION_WEB_APP_URL',
  'PRODUCTION_STATUS_ISSUE_NUMBER',
  'PRODUCTION_SMOKE_EXPECTED_MARKER',
].forEach((name) => includes(`${workflow}\n${orchestrator}\n${eventResolver}`, name, `${name} must be wired into production deploy logic`));

assert.ok(!/[A-Za-z0-9_-]{35,}\.apps\.googleusercontent\.com/.test(workflow), 'workflow must not contain OAuth client IDs');
assert.ok(!/AKIA[0-9A-Z]{16}/.test(workflow), 'workflow must not contain access keys');

includes(orchestrator, 'validateRequiredChecks', 'orchestrator must validate required checks');
includes(orchestrator, 'assertDevelopUnchanged', 'orchestrator must re-check develop before production mutation');
includes(orchestrator, 'STATUS_MARKER', 'orchestrator must require the Status Issue marker');
assert.ok(!orchestrator.includes('createGitHubDeployment'), 'orchestrator must not create duplicate GitHub Deployments');
includes(adapters, 'gas:production:status', 'adapters must run the production status wrapper');
includes(adapters, "'--json'", 'production status must use clasp JSON output');
includes(adapters, 'collectJsonLeafValues', 'adapters must mask JSON leaf values, not raw multiline secrets');

[
  'test:production-deploy-workflow',
  'test:production-status-renderer',
  'test:production-deploy-state',
  'test:production-deploy-orchestrator',
  'test:production-status-parser',
  'test:production-smoke-test',
].forEach((scriptName) => {
  assert.ok(packageJson.scripts[scriptName], `package.json must define ${scriptName}`);
});

function writeEventPayload(payload) {
  const filePath = path.join(os.tmpdir(), `production-event-${process.pid}-${Math.random()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload));
  return filePath;
}

function fakeEventAdapters(options = {}) {
  const calls = [];
  return {
    calls,
    warn(message) {
      calls.push(`warn:${message}`);
    },
    async getLatestDevelopSha() {
      return 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    },
    async removeIssueLabel(issueNumber, labelName) {
      calls.push(`remove:${issueNumber}:${labelName}`);
    },
    async getIssue(issueNumber) {
      return options.notPr
        ? { number: issueNumber }
        : { number: issueNumber, pull_request: { url: 'https://api.example/pulls/10' } };
    },
    async getPullRequest(number) {
      return {
        number,
        merged: options.unmerged ? false : true,
        merge_commit_sha: options.oldMergeSha
          ? 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
          : 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        base: { ref: options.badBase ? 'main' : 'develop', repo: { full_name: 'owner/repo' } },
        head: { repo: { full_name: options.fork ? 'fork/repo' : 'owner/repo' } },
      };
    },
  };
}

(async () => {
  const eventPath = writeEventPayload({
    label: { name: 'deploy-production-dry-run' },
    issue: { number: 10 },
  });
  const adaptersForValidLabel = fakeEventAdapters();
  const labelResult = await resolveProductionDeployEvent({
    env: {
      GITHUB_EVENT_NAME: 'issues',
      GITHUB_EVENT_PATH: eventPath,
    },
    adapters: adaptersForValidLabel,
  });
  assert.strictEqual(labelResult.shouldRun, true);
  assert.strictEqual(labelResult.dryRun, true);
  assert.strictEqual(labelResult.dryRunMode, 'authenticated');
  assert.strictEqual(labelResult.targetSha, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.ok(adaptersForValidLabel.calls.includes('remove:10:deploy-production-dry-run'));

  const ignored = await resolveProductionDeployEvent({
    env: {
      GITHUB_EVENT_NAME: 'issues',
      GITHUB_EVENT_PATH: writeEventPayload({ label: { name: 'unrelated' }, issue: { number: 10 } }),
    },
    adapters: fakeEventAdapters(),
  });
  assert.strictEqual(ignored.shouldRun, false);

  await assert.rejects(() => resolveProductionDeployEvent({
    env: {
      GITHUB_EVENT_NAME: 'issues',
      GITHUB_EVENT_PATH: eventPath,
    },
    adapters: fakeEventAdapters({ unmerged: true }),
  }), /merged pull request/);

  await assert.rejects(() => resolveProductionDeployEvent({
    env: {
      GITHUB_EVENT_NAME: 'issues',
      GITHUB_EVENT_PATH: eventPath,
    },
    adapters: fakeEventAdapters({ badBase: true }),
  }), /targeting develop/);

  await assert.rejects(() => resolveProductionDeployEvent({
    env: {
      GITHUB_EVENT_NAME: 'issues',
      GITHUB_EVENT_PATH: eventPath,
    },
    adapters: fakeEventAdapters({ fork: true }),
  }), /same-repository/);

  await assert.rejects(() => resolveProductionDeployEvent({
    env: {
      GITHUB_EVENT_NAME: 'issues',
      GITHUB_EVENT_PATH: eventPath,
    },
    adapters: fakeEventAdapters({ oldMergeSha: true }),
  }), /latest origin\/develop/);

  console.log('production deploy workflow static checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
