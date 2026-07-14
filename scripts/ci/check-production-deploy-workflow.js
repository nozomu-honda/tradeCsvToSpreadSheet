#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'deploy-production.yml');
const runScriptPath = path.join(repoRoot, 'scripts', 'ci', 'run-production-deploy.js');
const statePath = path.join(repoRoot, 'scripts', 'ci', 'production-deploy-state.js');
const packagePath = path.join(repoRoot, 'package.json');

const workflow = fs.readFileSync(workflowPath, 'utf8');
const runScript = fs.readFileSync(runScriptPath, 'utf8');
const stateScript = fs.readFileSync(statePath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

function includes(text, pattern, message) {
  assert.ok(text.includes(pattern), message || `Expected to find: ${pattern}`);
}

includes(workflow, 'workflow_dispatch:', 'production workflow must be manual only');
assert.ok(!workflow.includes('pull_request_target'), 'production workflow must not use pull_request_target');
assert.ok(!workflow.includes('pull_request:'), 'production workflow must not run from pull_request');
assert.ok(!workflow.includes('push:'), 'production workflow must not run from push');

includes(workflow, 'dry_run:', 'dry_run input is required');
includes(workflow, 'default: true', 'dry_run must default to true');
includes(workflow, 'force:', 'force input is required');
includes(workflow, 'default: false', 'force must default to false');
includes(workflow, 'target_sha:', 'target_sha input is required');
includes(workflow, 'group: production-deploy', 'workflow must serialize production deploys');
includes(workflow, 'cancel-in-progress: false', 'production deploy concurrency must not cancel in-progress runs');
includes(workflow, 'deployments: write', 'workflow must be able to record GitHub Deployments');
includes(workflow, 'issues: write', 'workflow must be able to update the Production Status Issue');
includes(workflow, 'contents: read', 'workflow should not request broader contents permission');
includes(workflow, 'environment:', 'workflow must use the production Environment');
includes(workflow, 'name: production', 'workflow Environment name must be production');
includes(workflow, 'url: ${{ vars.PRODUCTION_WEB_APP_URL }}', 'Environment URL must come from variables');
includes(workflow, 'ref: develop', 'workflow must checkout develop');
includes(workflow, 'git checkout -B develop origin/develop', 'local branch must be pinned to origin/develop');
includes(workflow, 'node-version: 24', 'workflow must use Node 24');
includes(workflow, 'node scripts/ci/run-production-deploy.js', 'workflow must call the production deploy orchestrator');

[
  'CLASP_PRODUCTION_CREDENTIALS',
  'PRODUCTION_SCRIPT_ID',
  'PRODUCTION_DEPLOYMENT_ID',
  'PRODUCTION_WEB_APP_URL',
  'PRODUCTION_STATUS_ISSUE_NUMBER',
].forEach((name) => includes(workflow, name, `${name} must be wired into the workflow`));

assert.ok(!/[A-Za-z0-9_-]{35,}\.apps\.googleusercontent\.com/.test(workflow), 'workflow must not contain OAuth client IDs');
assert.ok(!/AKIA[0-9A-Z]{16}/.test(workflow), 'workflow must not contain access keys');

includes(runScript, 'dry_run=true: production push, deployment update, and status issue update were skipped.', 'dry-run path must explicitly skip mutations');
includes(runScript, 'runProductionSourcePush', 'orchestrator must contain the production source push stage');
includes(runScript, 'updateAppsScriptDeployment', 'orchestrator must update the existing Apps Script deployment');
includes(runScript, 'smokeTestProductionWebApp', 'orchestrator must include a smoke test stage');
includes(runScript, 'PRODUCTION PUSH', 'source push must use the existing production confirmation phrase');
includes(runScript, 'redactValues', 'orchestrator must redact sensitive values on captured command failures');
includes(runScript, '::add-mask::', 'orchestrator must mask production values in GitHub logs');
includes(stateScript, "'source-pushed'", 'state model should include the source-pushed stage');
includes(stateScript, "'deployment-updated'", 'state model should include the deployment-updated stage');

[
  'test:production-deploy-workflow',
  'test:production-status-renderer',
  'test:production-deploy-state',
].forEach((scriptName) => {
  assert.ok(packageJson.scripts[scriptName], `package.json must define ${scriptName}`);
});

console.log('production deploy workflow static checks passed');
