'use strict';

const fs = require('fs');
const path = require('path');

const {
  calculateBehindDevelop,
  createInitialProductionDeployState,
  failProductionDeployState,
  isFullSha,
  markProductionDeployState,
  parseProductionStatusIssue,
  resolveTargetSha,
  shouldBlockDuplicateDeployment,
} = require('./production-deploy-state');
const {
  renderDryRunSummary,
  renderProductionStatusIssue,
} = require('./production-status-renderer');
const {
  parseAndValidateProductionStatusOutput,
} = require('./production-status-parser');

const STATUS_MARKER = '<!-- production-status:managed-by-github-actions -->';
const DEFAULT_REQUIRED_CHECKS = [
  'Push test GAS project and run tests',
];

function booleanFromEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function workflowRunUrl(env) {
  if (!env.GITHUB_SERVER_URL || !env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID) {
    return '';
  }
  return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}

function requiredConfigNames({ dryRun, dryRunMode }) {
  const base = [
    'GITHUB_TOKEN',
    'GITHUB_REPOSITORY',
  ];
  if (dryRun && dryRunMode === 'static') {
    return base;
  }
  return [
    ...base,
    'CLASP_PRODUCTION_CREDENTIALS',
    'PRODUCTION_SCRIPT_ID',
    'PRODUCTION_DEPLOYMENT_ID',
    'PRODUCTION_WEB_APP_URL',
    'PRODUCTION_STATUS_ISSUE_NUMBER',
  ];
}

function requireConfig(env, options) {
  const missing = requiredConfigNames(options).filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required production deploy configuration: ${missing.join(', ')}`);
  }
}

function requiredCheckNames(env) {
  const configuredChecks = String(env.PRODUCTION_REQUIRED_CHECKS || '')
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
  return Array.from(new Set([
    ...DEFAULT_REQUIRED_CHECKS,
    ...configuredChecks,
  ]));
}

function validateProductionIgnoreBoundary(cwd = process.cwd()) {
  const ignore = fs.readFileSync(path.join(cwd, '.clasp.productionignore'), 'utf8');
  const required = ['src/test/**', 'src/app/e2e_helpers.gs'];
  const missing = required.filter((entry) => !ignore.split(/\r?\n/).some((line) => line.trim() === entry));
  if (missing.length > 0) {
    throw new Error(`.clasp.productionignore is missing required entries: ${missing.join(', ')}`);
  }
}

function assertDevelopUnchanged(adapters, targetSha, message) {
  adapters.fetchDevelop();
  const headSha = adapters.getHeadSha();
  const originDevelopSha = adapters.getOriginDevelopSha();
  if (headSha !== targetSha || originDevelopSha !== targetSha) {
    throw new Error(message || 'develop advanced during production preflight. Deployment was aborted before any production mutation.');
  }
  return {
    headSha,
    originDevelopSha,
  };
}

function calculateCommitsBehind({ adapters, currentProductionSha, latestDevelopSha }) {
  return calculateBehindDevelop({
    currentProductionSha,
    latestDevelopSha,
    isAncestor: isFullSha(currentProductionSha)
      ? adapters.isAncestor(currentProductionSha, latestDevelopSha)
      : false,
    commitCount: isFullSha(currentProductionSha)
      ? adapters.commitCount(`${currentProductionSha}..${latestDevelopSha}`)
      : 0,
  });
}

async function findMergedPrForTargetSha({ adapters, repo, targetSha }) {
  const pulls = await adapters.githubRequest('GET', `/repos/${repo}/pulls?state=closed&base=develop&sort=updated&direction=desc&per_page=100`);
  return pulls.find((pull) => pull.merged_at && pull.merge_commit_sha === targetSha) || null;
}

function successfulCheckNamesFromRuns(checkRuns) {
  return new Set((checkRuns || [])
    .filter((run) => run.status === 'completed' && run.conclusion === 'success')
    .map((run) => run.name));
}

function successfulCheckNamesFromStatuses(statuses) {
  return new Set((statuses || [])
    .filter((status) => status.state === 'success')
    .map((status) => status.context));
}

async function validateRequiredChecks({ adapters, repo, targetSha, sourcePrNumber, requiredChecks }) {
  let pull = null;
  if (sourcePrNumber) {
    pull = await adapters.githubRequest('GET', `/repos/${repo}/pulls/${sourcePrNumber}`);
  } else {
    pull = await findMergedPrForTargetSha({ adapters, repo, targetSha });
  }

  if (!pull || !pull.merged_at || pull.merge_commit_sha !== targetSha) {
    throw new Error('Could not resolve a merged PR for the production target SHA.');
  }

  const checkSha = pull.head && pull.head.sha;
  if (!isFullSha(checkSha)) {
    throw new Error('Merged PR head SHA could not be resolved for required check validation.');
  }

  const checkRuns = await adapters.githubRequest('GET', `/repos/${repo}/commits/${checkSha}/check-runs?per_page=100`);
  const status = await adapters.githubRequest('GET', `/repos/${repo}/commits/${checkSha}/status`);
  const successfulChecks = successfulCheckNamesFromRuns(checkRuns.check_runs || []);
  const successfulStatuses = successfulCheckNamesFromStatuses(status.statuses || []);
  const missing = requiredChecks.filter((name) => !successfulChecks.has(name) && !successfulStatuses.has(name));

  if (missing.length > 0) {
    throw new Error(`Required checks are not successful for PR #${pull.number}: ${missing.join(', ')}`);
  }

  return {
    pullNumber: pull.number,
    checkedSha: checkSha,
    requiredChecks,
  };
}

function validateManagedStatusIssue(issue) {
  if (!issue || issue.pull_request) {
    throw new Error('Production Status Issue must be a normal Issue, not a Pull Request.');
  }
  if (issue.state && issue.state !== 'open') {
    throw new Error('Production Status Issue must be open.');
  }
  if (!/Production Status|本番反映ステータス/.test(issue.title || '')) {
    throw new Error('Production Status Issue title did not match the expected title.');
  }
  if (!String(issue.body || '').includes(STATUS_MARKER)) {
    throw new Error('Production Status Issue does not contain the managed marker.');
  }
}

async function readManagedProductionStatusIssue({ adapters, env }) {
  const issueNumber = Number(env.PRODUCTION_STATUS_ISSUE_NUMBER);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('PRODUCTION_STATUS_ISSUE_NUMBER must be a positive issue number.');
  }
  const issue = await adapters.githubRequest('GET', `/repos/${env.GITHUB_REPOSITORY}/issues/${issueNumber}`);
  validateManagedStatusIssue(issue);
  return {
    issue,
    parsed: parseProductionStatusIssue(issue.body || ''),
  };
}

function hydrateStateFromProductionStatusIssue(state, parsed) {
  return {
    ...state,
    previousProductionSha: parsed.currentProductionSha || 'unknown',
    currentProductionSha: parsed.currentProductionSha || 'unknown',
    commitsBehindDevelop: parsed.commitsBehindDevelop || state.commitsBehindDevelop || 'unknown',
    lastSuccessfulDeploymentSha: parsed.lastSuccessfulDeploymentSha || 'unknown',
    lastSuccessfulDeploymentAt: parsed.lastSuccessfulDeploymentAt || 'unknown',
    lastDeploymentWorkflowUrl: parsed.lastDeploymentWorkflowUrl || 'unknown',
    lastStatusSyncWorkflowUrl: parsed.lastStatusSyncWorkflowUrl || 'unknown',
    sourcePush: parsed.sourcePush || state.sourcePush,
    deploymentUpdate: parsed.deploymentUpdate || state.deploymentUpdate,
    smokeTest: parsed.smokeTest || state.smokeTest,
  };
}

async function updateManagedProductionStatusIssue({ adapters, env, state }) {
  const issueNumber = Number(env.PRODUCTION_STATUS_ISSUE_NUMBER);
  const issue = await adapters.githubRequest('GET', `/repos/${env.GITHUB_REPOSITORY}/issues/${issueNumber}`);
  validateManagedStatusIssue(issue);
  await adapters.githubRequest('PATCH', `/repos/${env.GITHUB_REPOSITORY}/issues/${issueNumber}`, {
    body: renderProductionStatusIssue(state),
  });
}

async function safelyRecordFailure({ adapters, env, state }) {
  if (!env.PRODUCTION_STATUS_ISSUE_NUMBER) {
    return;
  }
  try {
    await updateManagedProductionStatusIssue({ adapters, env, state });
  } catch (error) {
    adapters.warn(`Failed to update Production Status Issue: ${error.message}`);
  }
  try {
    if (typeof adapters.recordEnvironmentFailure === 'function') {
      await adapters.recordEnvironmentFailure(state);
    }
  } catch (error) {
    adapters.warn(`Failed to record Environment deployment failure: ${error.message}`);
  }
}

async function safeUpdateStatusIssue({ adapters, env, state }) {
  try {
    await updateManagedProductionStatusIssue({ adapters, env, state });
  } catch (error) {
    adapters.warn(`Failed to update Production Status Issue: ${error.message}`);
  }
}

async function runProductionDeploy({ env, adapters, cwd = process.cwd() }) {
  const dryRun = booleanFromEnv(env.DRY_RUN, true);
  const dryRunMode = dryRun ? (env.DRY_RUN_MODE || 'static') : 'authenticated';
  const staticDryRun = dryRun && dryRunMode === 'static';
  const force = booleanFromEnv(env.FORCE, false);
  const sourcePrNumber = env.SOURCE_PR_NUMBER || '';
  let state;
  let currentStage = 'preflight';
  let claspFiles;
  let sourcePushSucceeded = false;
  let statusIssueReadSucceeded = false;

  try {
    adapters.addMasksFromEnv();
    requireConfig(env, { dryRun, dryRunMode });

    adapters.fetchDevelop();
    const latestDevelopSha = adapters.getOriginDevelopSha();
    if (!env.TARGET_SHA || !env.TARGET_SHA.trim()) {
      throw new Error('TARGET_SHA must be provided by workflow_dispatch and match the latest origin/develop commit.');
    }
    const targetSha = resolveTargetSha({
      targetSha: env.TARGET_SHA,
      latestDevelopSha,
    });
    const headSha = adapters.getHeadSha();
    if (headSha !== targetSha) {
      throw new Error('Checked-out HEAD must match the production target SHA.');
    }

    state = createInitialProductionDeployState({
      targetSha,
      latestDevelopSha,
      dryRun,
      force,
      workflowRunUrl: workflowRunUrl(env),
      status: 'preflight',
    });

    if (!staticDryRun) {
      currentStage = 'status-issue-read';
      const managedIssue = await readManagedProductionStatusIssue({ adapters, env });
      statusIssueReadSucceeded = true;
      state = hydrateStateFromProductionStatusIssue(state, managedIssue.parsed);

      const duplicate = shouldBlockDuplicateDeployment({
        currentProductionSha: managedIssue.parsed.currentProductionSha,
        productionStatus: managedIssue.parsed.productionStatus,
        targetSha,
        force,
      });
      if (duplicate.blocked) {
        throw new Error(duplicate.reason);
      }
      state.duplicateGuard = 'passed';
    }

    currentStage = 'required-checks';
    const requiredCheckResult = await validateRequiredChecks({
      adapters,
      repo: env.GITHUB_REPOSITORY,
      targetSha,
      sourcePrNumber,
      requiredChecks: requiredCheckNames(env),
    });

    currentStage = 'local-validation';
    validateProductionIgnoreBoundary(cwd);
    adapters.runNpmCi();
    for (const script of adapters.validationScripts) {
      adapters.runValidationScript(script);
    }

    if (staticDryRun) {
      state.duplicateGuard = 'skipped-static-dry-run';
      adapters.writeStepSummary([
        renderDryRunSummary(state),
        '',
        `- required checks source PR: #${requiredCheckResult.pullNumber}`,
        `- required checks SHA: \`${requiredCheckResult.checkedSha}\``,
        '- dry_run_mode: `static`',
      ].join('\n'));
      return state;
    }

    currentStage = 'production-status';
    claspFiles = adapters.writeProductionClaspFiles();
    const rawStatus = adapters.runProductionStatusCheck();
    const parsedStatus = parseAndValidateProductionStatusOutput(rawStatus);

    const preflightSummary = dryRun
      ? renderDryRunSummary(state)
      : [
        '## Production deploy preflight summary',
        '',
        `- target_sha: \`${state.targetSha}\``,
        `- latest develop: \`${state.latestDevelopSha}\``,
        `- previous production: \`${state.previousProductionSha}\``,
        '- production mutation: `enabled`',
      ].join('\n');

    adapters.writeStepSummary([
      preflightSummary,
      '',
      `- required checks source PR: #${requiredCheckResult.pullNumber}`,
      `- required checks SHA: \`${requiredCheckResult.checkedSha}\``,
      `- production tracked files: \`${parsedStatus.trackedCount}\``,
      `- production untracked files: \`${parsedStatus.untrackedCount}\``,
      `- dry_run_mode: \`${dryRunMode}\``,
    ].join('\n'));

    if (dryRun) {
      adapters.log('dry_run=true: production push, deployment update, smoke test, and status issue update were skipped.');
      return state;
    }

    currentStage = 'status-recording';
    await updateManagedProductionStatusIssue({ adapters, env, state });

    currentStage = 'source-push';
    assertDevelopUnchanged(adapters, targetSha);
    adapters.runProductionSourcePush();
    sourcePushSucceeded = true;
    state = markProductionDeployState(state, 'source-pushed');
    await safeUpdateStatusIssue({ adapters, env, state });

    currentStage = 'deployment-update';
    try {
      assertDevelopUnchanged(adapters, targetSha, 'develop advanced after source push. Continuing deployment update for the already pushed target SHA.');
    } catch (error) {
      state.developAdvancedAfterSourcePush = true;
      adapters.warn(error.message);
    }
    adapters.updateAppsScriptDeployment(targetSha);
    state = markProductionDeployState(state, 'deployment-updated');
    await safeUpdateStatusIssue({ adapters, env, state });

    currentStage = 'smoke-test';
    state = markProductionDeployState(state, 'verifying');
    await safeUpdateStatusIssue({ adapters, env, state });
    await adapters.runSmokeTest();

    currentStage = 'post-smoke-develop-check';
    adapters.fetchDevelop();
    const latestDevelopShaAfterDeploy = adapters.getOriginDevelopSha();
    const completedAt = new Date().toISOString();
    const finalPatch = {
      currentProductionSha: targetSha,
      latestDevelopSha: latestDevelopShaAfterDeploy,
      lastSuccessfulDeploymentSha: targetSha,
      lastSuccessfulDeploymentAt: completedAt,
      lastDeploymentWorkflowUrl: workflowRunUrl(env),
      sourcePush: 'success',
      deploymentUpdate: 'success',
      smokeTest: 'success',
      lastFailureStage: '',
      failureMessage: '',
      updatedAt: completedAt,
    };
    if (latestDevelopShaAfterDeploy === targetSha) {
      state = markProductionDeployState(state, 'deployed', {
        ...finalPatch,
        commitsBehindDevelop: '0 commits',
      });
    } else {
      state = markProductionDeployState(state, 'not-deployed', {
        ...finalPatch,
        developAdvancedAfterSourcePush: true,
        commitsBehindDevelop: calculateCommitsBehind({
          adapters,
          currentProductionSha: targetSha,
          latestDevelopSha: latestDevelopShaAfterDeploy,
        }),
      });
    }
    currentStage = 'status-recording';
    await updateManagedProductionStatusIssue({ adapters, env, state });
    return state;
  } catch (error) {
    const failedState = failProductionDeployState(state || createInitialProductionDeployState({
      dryRun,
      force,
      workflowRunUrl: workflowRunUrl(env),
    }), currentStage, error);
    if (sourcePushSucceeded && currentStage !== 'source-push') {
      failedState.sourcePush = 'success';
    }
    adapters.writeStepSummary(renderProductionStatusIssue(failedState));
    if (!dryRun && statusIssueReadSucceeded) {
      await safelyRecordFailure({ adapters, env, state: failedState });
    }
    throw error;
  } finally {
    adapters.cleanupProductionClaspFiles(claspFiles);
  }
}

module.exports = {
  DEFAULT_REQUIRED_CHECKS,
  STATUS_MARKER,
  assertDevelopUnchanged,
  hydrateStateFromProductionStatusIssue,
  readManagedProductionStatusIssue,
  requiredCheckNames,
  runProductionDeploy,
  safelyRecordFailure,
  safeUpdateStatusIssue,
  validateManagedStatusIssue,
  validateRequiredChecks,
};
