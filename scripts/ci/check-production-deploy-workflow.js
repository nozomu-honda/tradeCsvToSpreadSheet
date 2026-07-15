#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'deploy-production.yml');
const controlWorkflowPath = path.join(repoRoot, '.github', 'workflows', 'production-deploy-control.yml');
const statusWorkflowPath = path.join(repoRoot, '.github', 'workflows', 'update-production-status.yml');
const orchestratorPath = path.join(repoRoot, 'scripts', 'ci', 'production-deploy-orchestrator.js');
const adaptersPath = path.join(repoRoot, 'scripts', 'ci', 'production-deploy-adapters.js');
const runtimeVerificationPath = path.join(repoRoot, 'scripts', 'ci', 'production-runtime-verification.js');
const webAppDeploymentPath = path.join(repoRoot, 'scripts', 'ci', 'production-web-app-deployment.js');
const packagePath = path.join(repoRoot, 'package.json');
const gasProductionPath = path.join(repoRoot, 'scripts', 'gas-production.js');
const gitignorePath = path.join(repoRoot, '.gitignore');

const workflow = fs.readFileSync(workflowPath, 'utf8');
const controlWorkflow = fs.readFileSync(controlWorkflowPath, 'utf8');
const statusWorkflow = fs.readFileSync(statusWorkflowPath, 'utf8');
const orchestrator = fs.readFileSync(orchestratorPath, 'utf8');
const adapters = fs.readFileSync(adaptersPath, 'utf8');
const runtimeVerification = fs.readFileSync(runtimeVerificationPath, 'utf8');
const webAppDeployment = fs.readFileSync(webAppDeploymentPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const gasProduction = fs.readFileSync(gasProductionPath, 'utf8');
const gitignore = fs.readFileSync(gitignorePath, 'utf8');

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

function assertDependencyArtifactCleanup(job, label) {
  const archive = '${RUNNER_TEMP}/production-dependencies/production-node-modules.tgz';
  const cleanup = 'rm -rf "${RUNNER_TEMP}/production-dependencies"';
  const cleanCheck = 'git status --porcelain=v1 --untracked-files=normal';

  includes(job, 'path: ${{ runner.temp }}/production-dependencies', `${label} must download the artifact outside the repository`);
  includes(job, `tar -xzf "${archive}"`, `${label} must unpack the artifact from the runner temporary directory`);
  includes(job, cleanup, `${label} must remove its downloaded archive after extraction`);
  includes(job, 'Verify clean working tree after dependency restore', `${label} must verify the working tree after artifact cleanup`);
  includes(job, cleanCheck, `${label} must retain the full clean working tree check`);

  const restoreIndex = job.indexOf(`tar -xzf "${archive}"`);
  const cleanupIndex = job.indexOf(cleanup);
  const cleanCheckIndex = job.indexOf(cleanCheck);
  const orchestratorIndex = job.indexOf('node scripts/ci/run-production-deploy.js');
  assert.ok(restoreIndex < cleanupIndex, `${label} must clean up after extracting the archive`);
  assert.ok(cleanupIndex < cleanCheckIndex, `${label} must remove the archive before checking the working tree`);
  assert.ok(cleanCheckIndex < orchestratorIndex, `${label} must verify a clean working tree before production logic runs`);
}

function runOrThrow(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.strictEqual(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\n${result.stdout || ''}${result.stderr || ''}`,
  );
  return result;
}

function verifyDependencyRestoreLeavesCleanWorkingTree() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'production-artifact-cleanup-'));
  const workspace = path.join(tempRoot, 'workspace');
  const artifactDirectory = path.join(tempRoot, 'runner-temp', 'production-dependencies');
  const archivePath = path.join(artifactDirectory, 'production-node-modules.tgz');

  try {
    fs.mkdirSync(path.join(workspace, 'node_modules', 'fixture-package'), { recursive: true });
    fs.mkdirSync(artifactDirectory, { recursive: true });
    fs.writeFileSync(path.join(workspace, '.gitignore'), 'node_modules/\n');
    fs.writeFileSync(path.join(workspace, 'tracked.txt'), 'tracked\n');
    fs.writeFileSync(path.join(workspace, 'node_modules', 'fixture-package', 'index.js'), 'module.exports = true;\n');

    runOrThrow('git', ['init'], workspace);
    runOrThrow('git', ['config', 'user.email', 'ci@example.invalid'], workspace);
    runOrThrow('git', ['config', 'user.name', 'CI Fixture'], workspace);
    runOrThrow('git', ['add', '.gitignore', 'tracked.txt'], workspace);
    runOrThrow('git', ['commit', '-m', 'fixture'], workspace);

    runOrThrow('tar', ['-czf', archivePath, 'node_modules'], workspace);
    fs.rmSync(path.join(workspace, 'node_modules'), { recursive: true, force: true });
    runOrThrow('tar', ['-xzf', archivePath], workspace);
    fs.rmSync(artifactDirectory, { recursive: true, force: true });

    assert.ok(!fs.existsSync(archivePath), 'restored dependency archive must be deleted');
    const status = runOrThrow('git', ['status', '--porcelain=v1', '--untracked-files=normal'], workspace);
    assert.strictEqual(status.stdout.trim(), '', 'dependency restore must leave the repository working tree clean');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const preflightJob = jobBlock(workflow, 'production-preflight');
const authenticatedDryRunJob = jobBlock(workflow, 'authenticated-production-dry-run');
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
includes(workflow, 'authenticated-production-dry-run:', 'workflow must have an authenticated dry-run Environment job');
assert.ok(!workflow.includes('static-dry-run:'), 'static dry-run must share the Environment-free preflight job');
includes(workflow, 'deploy-production:', 'workflow must have a production mutation job');
assert.ok(!preflightJob.includes('environment:'), 'production-preflight must not use the production Environment');
assert.ok(!preflightJob.includes('secrets.CLASP_PRODUCTION_CREDENTIALS'), 'Environment-free preflight must not read production credentials');
assert.ok(!preflightJob.includes('secrets.PRODUCTION_SCRIPT_ID'), 'Environment-free preflight must not read production Script ID');
assert.ok(!preflightJob.includes('secrets.PRODUCTION_DEPLOYMENT_ID'), 'Environment-free preflight must not read production Deployment ID');
assert.ok(!preflightJob.includes('PRODUCTION_WEB_APP_URL'), 'Environment-free preflight must not read production Web App URL');
assert.ok(!preflightJob.includes('PRODUCTION_SMOKE_MODE'), 'Environment-free preflight must not read production smoke mode');
assert.ok(!preflightJob.includes('PRODUCTION_SMOKE_EXPECTED_MARKER'), 'Environment-free preflight must not read production smoke marker');
assert.ok(!preflightJob.includes('PRODUCTION_REQUIRED_CHECKS'), 'Environment-free preflight must not read Environment-scoped required checks');
includes(authenticatedDryRunJob, 'environment:', 'authenticated dry-run must use a protected Environment');
includes(authenticatedDryRunJob, 'name: production-preflight', 'authenticated dry-run Environment name must be production-preflight');
assert.ok(!authenticatedDryRunJob.includes('url: ${{ vars.PRODUCTION_WEB_APP_URL }}'), 'authenticated dry-run must not publish the production Web App URL as an Environment URL');
includes(authenticatedDryRunJob, 'PRODUCTION_DEPLOY_PHASE: authenticated-dry-run', 'authenticated dry-run job must run the authenticated-dry-run phase');
includes(authenticatedDryRunJob, 'inputs.dry_run == true', 'authenticated dry-run job must run only for dry_run=true');
includes(authenticatedDryRunJob, "inputs.dry_run_mode == 'authenticated'", 'authenticated dry-run job must require authenticated mode');
includes(authenticatedDryRunJob, "needs.production-preflight.result == 'success'", 'authenticated dry-run job must require Environment-free preflight success');
includes(authenticatedDryRunJob, 'CLASP_PRODUCTION_CREDENTIALS: ${{ secrets.CLASP_PRODUCTION_CREDENTIALS }}', 'authenticated dry-run must read production credentials inside its Environment');
includes(authenticatedDryRunJob, 'PRODUCTION_SCRIPT_ID: ${{ secrets.PRODUCTION_SCRIPT_ID }}', 'authenticated dry-run must read production Script ID inside its Environment');
includes(authenticatedDryRunJob, 'PRODUCTION_DEPLOYMENT_ID: ${{ secrets.PRODUCTION_DEPLOYMENT_ID }}', 'authenticated dry-run must read production Deployment ID inside its Environment');
assert.ok(!authenticatedDryRunJob.includes('source-push'), 'authenticated dry-run job must not run source push steps');
assert.ok(!authenticatedDryRunJob.includes('deployment-update'), 'authenticated dry-run job must not run deployment update steps');
assert.ok(!authenticatedDryRunJob.includes('smoke-test'), 'authenticated dry-run job must not run smoke test steps');
includes(deployJob, 'environment:', 'production mutation job must use the production Environment');
includes(deployJob, 'name: production', 'workflow Environment name must be production');
includes(deployJob, 'url: ${{ vars.PRODUCTION_WEB_APP_URL }}', 'only the production mutation Environment may publish the production Web App URL');
assert.strictEqual(
  (workflow.match(/url: \$\{\{ vars\.PRODUCTION_WEB_APP_URL \}\}/g) || []).length,
  1,
  'only deploy-production may use PRODUCTION_WEB_APP_URL as an Environment URL',
);
assert.strictEqual((workflow.match(/\n    environment:\n/g) || []).length, 2, 'only authenticated dry-run and production mutation jobs may enter protected Environments');
includes(preflightJob, 'PRODUCTION_DEPLOY_PHASE: preflight', 'preflight job must run the preflight phase');
includes(deployJob, 'PRODUCTION_DEPLOY_PHASE: mutation', 'deploy job must run the mutation phase');
includes(deployJob, 'inputs.dry_run == false', 'production Environment job must run only for dry_run=false');
assert.ok(!deployJob.includes("inputs.dry_run == true"), 'production mutation job must skip dry_run=true');
includes(deployJob, "needs.production-preflight.result == 'success'", 'production Environment job must require preflight success');
includes(deployJob, "needs.production-preflight.outputs.should_deploy == 'true'", 'production Environment job must skip duplicate/dry-run preflight results');
includes(workflow, 'ref: develop', 'workflow must checkout trusted develop source');
includes(workflow, 'git checkout -B develop origin/develop', 'local branch must be pinned to origin/develop');
includes(workflow, 'TARGET_SHA: ${{ inputs.target_sha }}', 'deploy job must use dispatch target_sha');
includes(workflow, 'SOURCE_PR_NUMBER: ${{ inputs.source_pr_number }}', 'deploy job must preserve source PR number');
includes(workflow, 'node scripts/ci/run-production-deploy.js', 'workflow must call the production deploy orchestrator');
includes(workflow, 'PREFLIGHT_TARGET_SHA: ${{ needs.production-preflight.outputs.target_sha }}', 'deploy job must receive target_sha from preflight outputs');
includes(workflow, 'PREFLIGHT_REQUIRED_CHECKS_VERIFIED: ${{ needs.production-preflight.outputs.required_checks_verified }}', 'deploy job must receive required-check verification from preflight outputs');
includes(workflow, 'static_boundary_verified: ${{ steps.preflight.outputs.static_boundary_verified }}', 'preflight job must expose static boundary verification');
includes(workflow, 'PREFLIGHT_STATIC_BOUNDARY_VERIFIED: ${{ needs.production-preflight.outputs.static_boundary_verified }}', 'Environment jobs must receive static-boundary verification from preflight outputs');
includes(preflightJob, 'mkdir -p "${RUNNER_TEMP}/production-dependencies"', 'preflight job must create its artifact in the runner temporary directory');
includes(preflightJob, 'tar -czf "${RUNNER_TEMP}/production-dependencies/production-node-modules.tgz" node_modules', 'preflight job must package validated dependencies outside the repository and production Environment');
includes(preflightJob, 'actions/upload-artifact@v4', 'preflight job must upload validated dependencies for the production mutation job');
includes(preflightJob, 'path: ${{ runner.temp }}/production-dependencies/production-node-modules.tgz', 'preflight upload must read the archive from the runner temporary directory');
includes(authenticatedDryRunJob, 'actions/download-artifact@v4', 'authenticated dry-run job must restore dependencies from the preflight artifact');
includes(deployJob, 'actions/download-artifact@v4', 'deploy job must restore dependencies from the preflight artifact');
assertDependencyArtifactCleanup(authenticatedDryRunJob, 'authenticated dry-run job');
assertDependencyArtifactCleanup(deployJob, 'deploy job');
assert.throws(
  () => assertDependencyArtifactCleanup(
    authenticatedDryRunJob.replace('rm -rf "${RUNNER_TEMP}/production-dependencies"', 'cleanup intentionally missing'),
    'cleanup regression fixture',
  ),
  /remove its downloaded archive/,
  'workflow regression check must fail when artifact cleanup is missing',
);
assert.ok(!authenticatedDryRunJob.includes('npm ci'), 'authenticated dry-run Environment job must not run npm ci');
assert.ok(!deployJob.includes('npm ci'), 'production Environment job must not run npm ci');
includes(gasProduction, "git(['status', '--porcelain=v1', '--untracked-files=normal'])", 'production push must retain the full clean working tree check');
includes(gasProduction, "...(claspCommand === 'push' ? ['--force'] : [])", 'production push must force the non-interactive manifest overwrite after the explicit wrapper confirmation');
assert.ok(!gitignore.split(/\r?\n/).map((line) => line.trim()).includes('*.tgz'), '.gitignore must not hide dependency archives with a broad *.tgz rule');

[
  'CLASP_PRODUCTION_CREDENTIALS',
  'PRODUCTION_SCRIPT_ID',
  'PRODUCTION_DEPLOYMENT_ID',
].forEach((name) => {
  assert.strictEqual(
    (workflow.match(new RegExp(`${name}: \\\$\\{\\{ secrets\\.${name} \\}\\}`, 'g')) || []).length,
    2,
    `${name} must be read only by authenticated dry-run and production mutation Environment jobs`,
  );
});

[
  'PRODUCTION_WEB_APP_URL',
  'PRODUCTION_SMOKE_MODE',
  'PRODUCTION_SMOKE_EXPECTED_MARKER',
  'PRODUCTION_REQUIRED_CHECKS',
].forEach((name) => {
  assert.strictEqual(
    (workflow.match(new RegExp(`${name}: \\\$\\{\\{ vars\\.${name} \\}\\}`, 'g')) || []).length,
    2,
    `${name} must be read only by authenticated dry-run and production mutation Environment jobs`,
  );
});

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
  'PRODUCTION_SMOKE_MODE',
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
includes(adapters, 'mode: env.PRODUCTION_SMOKE_MODE', 'production smoke adapter must pass the Environment smoke mode');
includes(adapters, 'verifyRemoteProductionSource', 'production deploy must verify the remote Apps Script runtime source');
includes(adapters, 'createLocalProductionBundleManifest({ rootDir: cwd, trackedFiles })', 'local manifest must use clasp filesToPush from production status');
includes(runtimeVerification, "crypto.createHash('sha256')", 'production bundle manifest must hash normalized source content');
includes(runtimeVerification, 'compareProductionBundleManifests(expectedManifest, pulledManifest)', 'pulled source must be compared with the target production bundle before runtime checks');
includes(adapters, 'fetchProductionWebAppDeploymentSnapshot', 'production deploy must read the existing deployment before and after update');
includes(adapters, "'update-deployment'", 'production deploy must update the configured existing deployment explicitly');
assert.ok(
  adapters.indexOf("require('googleapis')") > adapters.indexOf('function createProductionAppsScriptApi'),
  'googleapis must be loaded lazily after the Environment-free preflight installs dependencies',
);
includes(orchestrator, 'validateProductionDeploymentConfiguration', 'orchestrator must verify Web App URL and Deployment ID consistency');
includes(orchestrator, 'validateProductionWebAppManifest', 'preflight must verify the production Web App manifest configuration');
includes(webAppDeployment, 'api.projects.deployments.get', 'deployment verification must use projects.deployments.get');
includes(webAppDeployment, 'api.projects.deployments.list', 'deployment verification must count deployments with projects.deployments.list');
includes(webAppDeployment, "entryPoint.entryPointType === 'WEB_APP'", 'deployment verification must require a WEB_APP entry point');
includes(webAppDeployment, 'webAppUrlFingerprint', 'deployment verification must compare a safe Web App URL fingerprint');
assert.ok(!webAppDeployment.includes('deployments.create'), 'Web App verification must not create a replacement deployment');
assert.ok(
  orchestrator.indexOf('adapters.runProductionSourcePush()') < orchestrator.indexOf('adapters.verifyRemoteProductionSource(localProductionBundleManifest)'),
  'remote source verification must run after source push',
);
assert.ok(
  orchestrator.indexOf('adapters.verifyRemoteProductionSource(localProductionBundleManifest)') < orchestrator.indexOf('adapters.updateAppsScriptDeployment(targetSha)'),
  'remote source verification must finish before deployment update',
);
assert.ok(
  orchestrator.indexOf('adapters.verifyProductionDeploymentUpdate') < orchestrator.indexOf('await adapters.runSmokeTest()'),
  'deployment verification must finish before Web access gate verification',
);

[
  'test:production-deploy-workflow',
  'test:production-status-renderer',
  'test:production-deploy-state',
  'test:production-deploy-orchestrator',
  'test:production-status-parser',
  'test:production-runtime-verification',
  'test:production-web-app-deployment',
  'test:production-smoke-test',
  'test:production-deploy-control',
  'test:production-status-sync',
  'test:production-required-checks',
  'test:production-state-concurrency',
  'test:production-status-bootstrap',
].forEach((scriptName) => {
  assert.ok(packageJson.scripts[scriptName], `package.json must define ${scriptName}`);
});

verifyDependencyRestoreLeavesCleanWorkingTree();

console.log('production deploy workflow static checks passed');
