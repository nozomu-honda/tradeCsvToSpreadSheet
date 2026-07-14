#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'deploy-production.yml');
const controlWorkflowPath = path.join(repoRoot, '.github', 'workflows', 'production-deploy-control.yml');
const statusWorkflowPath = path.join(repoRoot, '.github', 'workflows', 'update-production-status.yml');
const orchestratorPath = path.join(repoRoot, 'scripts', 'ci', 'production-deploy-orchestrator.js');
const adaptersPath = path.join(repoRoot, 'scripts', 'ci', 'production-deploy-adapters.js');
const packagePath = path.join(repoRoot, 'package.json');

const workflow = fs.readFileSync(workflowPath, 'utf8');
const controlWorkflow = fs.readFileSync(controlWorkflowPath, 'utf8');
const statusWorkflow = fs.readFileSync(statusWorkflowPath, 'utf8');
const orchestrator = fs.readFileSync(orchestratorPath, 'utf8');
const adapters = fs.readFileSync(adaptersPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

function includes(text, pattern, message) {
  assert.ok(text.includes(pattern), message || `Expected to find: ${pattern}`);
}

function jobBlock(yaml, jobName) {
  const start = yaml.indexOf(`  ${jobName}:`);
  assert.ok(start >= 0, `workflow must define ${jobName}`);
  const rest = yaml.slice(start + 1);
  const next = rest.search(/\n  [a-zA-Z0-9_-]+:\n/);
  return next >= 0 ? rest.slice(0, next) : rest;
}

const preflightJob = jobBlock(workflow, 'production-preflight');
const deployJob = jobBlock(workflow, 'deploy-production');

includes(workflow, 'workflow_dispatch:', 'production workflow must be workflow_dispatch driven');
assert.ok(!workflow.includes('\n  issues:\n    types:'), 'develop deploy workflow must not use issues:labeled');
assert.ok(!workflow.includes('pull_request_target'), 'develop deploy workflow must not use pull_request_target');
assert.ok(!workflow.includes('pull_request:'), 'production workflow must not run from pull_request');
assert.ok(!workflow.includes('\n  push:'), 'production workflow must not run from push');

includes(workflow, 'dry_run_mode:', 'dry_run_mode input is required');
includes(workflow, 'target_sha:', 'target_sha input is required');
includes(workflow, 'source_pr_number:', 'source_pr_number input is required for PR traceability');
includes(workflow, 'required: true', 'target_sha must be required');
includes(workflow, 'group: production-state', 'workflow must serialize production state updates');
includes(workflow, 'cancel-in-progress: false', 'production deploy concurrency must not cancel in-progress runs');
assert.ok(!workflow.includes('deployments: write'), 'manual Deployment API permissions must not be requested');
assert.ok(!workflow.includes('actions: write'), 'develop deploy workflow must not dispatch other workflows');
includes(workflow, 'issues: write', 'workflow must be able to update the Status Issue');
includes(workflow, 'pull-requests: read', 'workflow must be able to validate merged PRs');
includes(workflow, 'checks: read', 'workflow must be able to read check runs');
includes(workflow, 'statuses: read', 'workflow must be able to read commit statuses');
includes(workflow, 'resolve-production-status-config:', 'workflow must read repository status issue configuration before entering the production Environment');
includes(workflow, 'production_status_issue_number: ${{ steps.status-config.outputs.production_status_issue_number }}', 'workflow must expose repository status issue variable as a job output');
includes(workflow, 'PRODUCTION_STATUS_ISSUE_NUMBER: ${{ needs.resolve-production-status-config.outputs.production_status_issue_number }}', 'deploy job must consume repository status issue variable via resolver output');
assert.strictEqual(
  (workflow.match(/PRODUCTION_STATUS_ISSUE_NUMBER: \$\{\{ vars\.PRODUCTION_STATUS_ISSUE_NUMBER \}\}/g) || []).length,
  1,
  'PRODUCTION_STATUS_ISSUE_NUMBER must be read only by the non-Environment resolver job',
);
assert.ok(!workflow.includes('resolve-production-target:'), 'target resolution must live in the default-branch control workflow');
includes(workflow, 'production-preflight:', 'workflow must have a production preflight job');
assert.ok(!workflow.includes('static-dry-run:'), 'static and authenticated dry-run must share the Environment-free preflight job');
includes(workflow, 'deploy-production:', 'workflow must have a production mutation job');
assert.ok(!preflightJob.includes('environment:'), 'production-preflight must not use the production Environment');
includes(deployJob, 'environment:', 'only the production mutation job must use the production Environment');
includes(deployJob, 'name: production', 'workflow Environment name must be production');
assert.strictEqual((workflow.match(/\n    environment:\n/g) || []).length, 1, 'only one job may enter the production Environment');
includes(preflightJob, 'PRODUCTION_DEPLOY_PHASE: preflight', 'preflight job must run the preflight phase');
includes(deployJob, 'PRODUCTION_DEPLOY_PHASE: mutation', 'deploy job must run the mutation phase');
includes(deployJob, 'inputs.dry_run == false', 'production Environment job must run only for dry_run=false');
includes(deployJob, "needs.production-preflight.result == 'success'", 'production Environment job must require preflight success');
includes(deployJob, "needs.production-preflight.outputs.should_deploy == 'true'", 'production Environment job must skip duplicate/dry-run preflight results');
includes(workflow, 'ref: develop', 'workflow must checkout trusted develop source');
includes(workflow, 'git checkout -B develop origin/develop', 'local branch must be pinned to origin/develop');
includes(workflow, 'TARGET_SHA: ${{ inputs.target_sha }}', 'deploy job must use dispatch target_sha');
includes(workflow, 'SOURCE_PR_NUMBER: ${{ inputs.source_pr_number }}', 'deploy job must preserve source PR number');
includes(workflow, 'node scripts/ci/run-production-deploy.js', 'workflow must call the production deploy orchestrator');
includes(workflow, 'PREFLIGHT_TARGET_SHA: ${{ needs.production-preflight.outputs.target_sha }}', 'deploy job must receive target_sha from preflight outputs');
includes(workflow, 'PREFLIGHT_REQUIRED_CHECKS_VERIFIED: ${{ needs.production-preflight.outputs.required_checks_verified }}', 'deploy job must receive required-check verification from preflight outputs');
includes(workflow, 'PREFLIGHT_BUNDLE_BOUNDARY_VERIFIED: ${{ needs.production-preflight.outputs.bundle_boundary_verified }}', 'deploy job must receive bundle-boundary verification from preflight outputs');
includes(preflightJob, 'tar -czf production-node-modules.tgz node_modules', 'preflight job must package validated dependencies outside the production Environment');
includes(preflightJob, 'actions/upload-artifact@v4', 'preflight job must upload validated dependencies for the production mutation job');
includes(deployJob, 'actions/download-artifact@v4', 'deploy job must restore dependencies from the preflight artifact');
includes(deployJob, 'tar -xzf production-node-modules.tgz', 'deploy job must unpack preflight dependencies');
assert.ok(!deployJob.includes('npm ci'), 'production Environment job must not run npm ci');

includes(controlWorkflow, 'pull_request_target:', 'default-branch control workflow must handle PR labels');
includes(controlWorkflow, '- labeled', 'control workflow must listen for labeled PR events');
assert.ok(!controlWorkflow.includes('actions/checkout'), 'control workflow must not checkout PR code');
includes(controlWorkflow, 'workflow_id: \'deploy-production.yml\'', 'control workflow must dispatch deploy-production.yml');
includes(controlWorkflow, "ref: 'develop'", 'control workflow must dispatch the develop ref so Environment SHA is develop');
includes(controlWorkflow, 'pull request is not merged', 'control workflow must reject unmerged PRs');
includes(controlWorkflow, 'pull request base is not develop', 'control workflow must reject non-develop base PRs');
includes(controlWorkflow, 'pull request is not from the same repository', 'control workflow must reject forks');
includes(controlWorkflow, 'pull request merge commit is not the latest develop HEAD', 'control workflow must require latest develop');
includes(controlWorkflow, 'removeLabel', 'control workflow must remove trigger labels for re-runability');
includes(controlWorkflow, 'target_sha: pr.merge_commit_sha', 'control workflow must pass the actual develop merge commit');
includes(controlWorkflow, 'source_pr_number: String(pr.number)', 'control workflow must pass source PR number');

includes(statusWorkflow, '\n  push:', 'status sync workflow must run on develop push');
includes(statusWorkflow, '- develop', 'status sync workflow must be scoped to develop');
includes(statusWorkflow, 'group: production-state', 'status sync workflow must share production-state concurrency with deploy workflow');
includes(statusWorkflow, 'cancel-in-progress: false', 'status sync workflow must not cancel deploy workflow');
includes(statusWorkflow, 'issues: write', 'status sync workflow must update the Status Issue');
assert.ok(!statusWorkflow.includes('environment:'), 'status sync workflow must not enter the production Environment');
assert.ok(!statusWorkflow.includes('CLASP_PRODUCTION_CREDENTIALS'), 'status sync workflow must not use production clasp secrets');
includes(statusWorkflow, 'node scripts/ci/sync-production-status.js', 'status sync workflow must call metadata-only sync');

[
  'CLASP_PRODUCTION_CREDENTIALS',
  'PRODUCTION_SCRIPT_ID',
  'PRODUCTION_DEPLOYMENT_ID',
  'PRODUCTION_WEB_APP_URL',
  'PRODUCTION_STATUS_ISSUE_NUMBER',
  'PRODUCTION_SMOKE_EXPECTED_MARKER',
].forEach((name) => includes(`${workflow}\n${orchestrator}`, name, `${name} must be wired into production deploy logic`));

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
  'test:production-deploy-control',
  'test:production-status-sync',
  'test:production-required-checks',
  'test:production-state-concurrency',
  'test:production-status-bootstrap',
].forEach((scriptName) => {
  assert.ok(packageJson.scripts[scriptName], `package.json must define ${scriptName}`);
});

console.log('production deploy workflow static checks passed');
