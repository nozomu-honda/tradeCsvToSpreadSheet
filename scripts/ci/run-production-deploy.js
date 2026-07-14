#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

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

const VALIDATION_SCRIPTS = [
  'test:gas-production-wrapper',
  'test:production-e2e-boundary',
  'test:production-deploy-workflow',
  'test:production-status-renderer',
  'test:production-deploy-state',
];

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function claspCommand() {
  const name = process.platform === 'win32' ? 'clasp.cmd' : 'clasp';
  return path.join(process.cwd(), 'node_modules', '.bin', name);
}

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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    input: options.input,
    encoding: 'utf8',
    stdio: options.capture ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
  });

  if (result.status !== 0) {
    const values = options.redactValues || [];
    const commandLine = redactText(`${command} ${args.join(' ')}`, values);
    const stderr = options.capture ? `\n${redactText(result.stderr || '', values)}` : '';
    throw new Error(`${commandLine} failed with exit code ${result.status}.${stderr}`);
  }
  return options.capture ? (result.stdout || '').trim() : '';
}

function git(args, options = {}) {
  return run('git', args, { ...options, capture: true });
}

function redactText(text, values) {
  let result = String(text || '');
  for (const value of values.filter(Boolean)) {
    result = result.split(String(value)).join('***');
  }
  return result;
}

function maskKnownValues(env) {
  if (env.GITHUB_ACTIONS !== 'true') {
    return;
  }
  [
    env.CLASP_PRODUCTION_CREDENTIALS,
    env.PRODUCTION_SCRIPT_ID,
    env.PRODUCTION_DEPLOYMENT_ID,
    env.PRODUCTION_WEB_APP_URL,
  ].filter(Boolean).forEach((value) => {
    process.stdout.write(`::add-mask::${value}\n`);
  });
}

function requireConfig(env) {
  const names = [
    'CLASP_PRODUCTION_CREDENTIALS',
    'PRODUCTION_SCRIPT_ID',
    'PRODUCTION_DEPLOYMENT_ID',
    'PRODUCTION_WEB_APP_URL',
    'PRODUCTION_STATUS_ISSUE_NUMBER',
    'GITHUB_TOKEN',
    'GITHUB_REPOSITORY',
  ];
  const missing = names.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required production deploy configuration: ${missing.join(', ')}`);
  }
}

function assertTrustedWorkflowRef(env) {
  if (env.GITHUB_REF && env.GITHUB_REF !== 'refs/heads/develop') {
    throw new Error('Production deploy workflow must be run from refs/heads/develop.');
  }
}

function writeProductionClaspFiles(env) {
  JSON.parse(env.CLASP_PRODUCTION_CREDENTIALS);
  if (!isFullSha(env.PRODUCTION_SCRIPT_ID) && !/^[A-Za-z0-9_-]{20,}$/.test(env.PRODUCTION_SCRIPT_ID)) {
    throw new Error('PRODUCTION_SCRIPT_ID is not in the expected Script ID format.');
  }

  const rcPath = path.join(os.homedir(), '.clasprc.json');
  const projectPath = path.join(process.cwd(), '.clasp.production.json');
  fs.writeFileSync(rcPath, env.CLASP_PRODUCTION_CREDENTIALS, { mode: 0o600 });
  fs.writeFileSync(projectPath, `${JSON.stringify({
    scriptId: env.PRODUCTION_SCRIPT_ID,
    rootDir: '.',
  }, null, 2)}\n`, { mode: 0o600 });
  return { rcPath, projectPath };
}

function cleanupProductionClaspFiles(paths) {
  for (const filePath of [paths && paths.rcPath, paths && paths.projectPath].filter(Boolean)) {
    try {
      fs.rmSync(filePath, { force: true });
    } catch (error) {
      process.stderr.write(`Warning: failed to remove temporary production clasp file: ${error.message}\n`);
    }
  }
}

async function githubRequest(env, method, apiPath, body) {
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

async function readProductionStatus(env) {
  const issueNumber = Number(env.PRODUCTION_STATUS_ISSUE_NUMBER);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('PRODUCTION_STATUS_ISSUE_NUMBER must be a positive issue number.');
  }
  const issue = await githubRequest(env, 'GET', `/repos/${env.GITHUB_REPOSITORY}/issues/${issueNumber}`);
  return parseProductionStatusIssue(issue.body || '');
}

async function updateProductionStatusIssue(env, state) {
  const issueNumber = Number(env.PRODUCTION_STATUS_ISSUE_NUMBER);
  await githubRequest(env, 'PATCH', `/repos/${env.GITHUB_REPOSITORY}/issues/${issueNumber}`, {
    body: renderProductionStatusIssue(state),
  });
}

async function createGitHubDeployment(env, targetSha) {
  return githubRequest(env, 'POST', `/repos/${env.GITHUB_REPOSITORY}/deployments`, {
    ref: targetSha,
    environment: 'production',
    auto_merge: false,
    required_contexts: [],
    description: '本番Apps Script/Webアプリ反映',
    payload: {
      source: 'deploy-production workflow',
      workflowRunUrl: workflowRunUrl(env),
    },
  });
}

async function updateGitHubDeploymentStatus(env, deploymentId, state, logUrl) {
  if (!deploymentId) {
    return;
  }
  await githubRequest(env, 'POST', `/repos/${env.GITHUB_REPOSITORY}/deployments/${deploymentId}/statuses`, {
    state,
    environment: 'production',
    log_url: logUrl || workflowRunUrl(env),
    description: state === 'success' ? '本番反映が完了しました。' : '本番反映で失敗しました。',
  });
}

function writeStepSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  } else {
    process.stdout.write(`${markdown}\n`);
  }
}

function validateProductionIgnoreBoundary() {
  const ignore = fs.readFileSync(path.join(process.cwd(), '.clasp.productionignore'), 'utf8');
  const required = ['src/test/**', 'src/app/e2e_helpers.gs'];
  const missing = required.filter((entry) => !ignore.split(/\r?\n/).some((line) => line.trim() === entry));
  if (missing.length > 0) {
    throw new Error(`.clasp.productionignore is missing required entries: ${missing.join(', ')}`);
  }
}

function runValidationCommands() {
  run(npmCommand(), ['ci']);
  for (const script of VALIDATION_SCRIPTS) {
    run(npmCommand(), ['run', script]);
  }
}

function runProductionStatusCheck(env) {
  const secrets = [
    env.CLASP_PRODUCTION_CREDENTIALS,
    env.PRODUCTION_SCRIPT_ID,
    env.PRODUCTION_DEPLOYMENT_ID,
    env.PRODUCTION_WEB_APP_URL,
  ];
  const output = run(npmCommand(), ['run', 'gas:production:status'], {
    capture: true,
    redactValues: secrets,
  });
  process.stdout.write(`${redactText(output, secrets)}\n`);
}

function runProductionSourcePush(env) {
  const output = run(npmCommand(), ['run', 'gas:production:push'], {
    input: 'PRODUCTION PUSH\n',
    capture: true,
    redactValues: [
      env.CLASP_PRODUCTION_CREDENTIALS,
      env.PRODUCTION_SCRIPT_ID,
    ],
  });
  process.stdout.write(`${redactText(output, [
    env.CLASP_PRODUCTION_CREDENTIALS,
    env.PRODUCTION_SCRIPT_ID,
  ])}\n`);
}

function updateAppsScriptDeployment(env, targetSha) {
  const output = run(claspCommand(), [
    '--user',
    'production',
    '--project',
    '.clasp.production.json',
    '--ignore',
    '.clasp.productionignore',
    'deploy',
    '--deploymentId',
    env.PRODUCTION_DEPLOYMENT_ID,
    '--description',
    `production ${targetSha.slice(0, 12)} ${new Date().toISOString()}`,
  ], {
    capture: true,
    redactValues: [
      env.CLASP_PRODUCTION_CREDENTIALS,
      env.PRODUCTION_SCRIPT_ID,
      env.PRODUCTION_DEPLOYMENT_ID,
    ],
  });
  process.stdout.write(`${redactText(output, [
    env.CLASP_PRODUCTION_CREDENTIALS,
    env.PRODUCTION_SCRIPT_ID,
    env.PRODUCTION_DEPLOYMENT_ID,
  ])}\n`);
}

async function smokeTestProductionWebApp(env) {
  const response = await fetch(env.PRODUCTION_WEB_APP_URL, { redirect: 'follow' });
  const text = await response.text();
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`Production smoke test failed with HTTP ${response.status}.`);
  }
  if (/ReferenceError|Script function not found|Exception:/i.test(text)) {
    throw new Error('Production smoke test response contains an Apps Script error marker.');
  }
  if (!text || text.trim().length === 0) {
    throw new Error('Production smoke test response was empty.');
  }
}

function latestDevelopBehind(previousProductionSha, latestDevelopSha) {
  if (!isFullSha(previousProductionSha) || !isFullSha(latestDevelopSha)) {
    return 'unknown';
  }
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', previousProductionSha, latestDevelopSha], {
    cwd: process.cwd(),
    stdio: 'ignore',
  }).status === 0;
  let count = 0;
  if (ancestor) {
    count = Number(git(['rev-list', '--count', `${previousProductionSha}..${latestDevelopSha}`]));
  }
  return calculateBehindDevelop({
    currentProductionSha: previousProductionSha,
    latestDevelopSha,
    isAncestor: ancestor,
    commitCount: count,
  });
}

async function main() {
  const env = process.env;
  const dryRun = booleanFromEnv(env.DRY_RUN, true);
  const force = booleanFromEnv(env.FORCE, false);
  let state;
  let deploymentId = '';
  let claspFiles;
  let currentStage = 'preflight';

  try {
    maskKnownValues(env);
    assertTrustedWorkflowRef(env);
    requireConfig(env);

    git(['fetch', '--no-tags', 'origin', 'develop']);
    const latestDevelopSha = git(['rev-parse', 'origin/develop']);
    const targetSha = resolveTargetSha({
      targetSha: env.TARGET_SHA || '',
      latestDevelopSha,
    });
    const headSha = git(['rev-parse', 'HEAD']);
    if (headSha !== targetSha) {
      throw new Error('Checked-out HEAD must match the production target SHA.');
    }

    const previous = await readProductionStatus(env);
    const duplicate = shouldBlockDuplicateDeployment({
      currentProductionSha: previous.currentProductionSha,
      productionStatus: previous.productionStatus,
      targetSha,
      force,
    });

    state = createInitialProductionDeployState({
      targetSha,
      latestDevelopSha,
      dryRun,
      force,
      workflowRunUrl: workflowRunUrl(env),
      previousProductionSha: previous.currentProductionSha,
      commitsBehindDevelop: latestDevelopBehind(previous.currentProductionSha, latestDevelopSha),
      status: 'preflight',
    });

    if (duplicate.blocked) {
      throw new Error(duplicate.reason);
    }
    state.duplicateGuard = 'passed';

    currentStage = 'local-validation';
    validateProductionIgnoreBoundary();
    runValidationCommands();
    currentStage = 'production-status';
    claspFiles = writeProductionClaspFiles(env);
    runProductionStatusCheck(env);

    if (dryRun) {
      writeStepSummary(renderDryRunSummary(state));
      process.stdout.write('dry_run=true: production push, deployment update, and status issue update were skipped.\n');
      return;
    }
    writeStepSummary([
      '## Production deploy preflight passed',
      '',
      `- target_sha: \`${targetSha}\``,
      '- 本番push、既存deployment更新、Status Issue更新へ進みます。',
    ].join('\n'));

    const deployment = await createGitHubDeployment(env, targetSha);
    deploymentId = deployment.id;
    await updateGitHubDeploymentStatus(env, deploymentId, 'in_progress');
    await updateProductionStatusIssue(env, state);

    currentStage = 'source-push';
    runProductionSourcePush(env);
    state = markProductionDeployState(state, 'source-pushed');
    await updateProductionStatusIssue(env, state);

    currentStage = 'deployment-update';
    updateAppsScriptDeployment(env, targetSha);
    state = markProductionDeployState(state, 'deployment-updated');
    await updateProductionStatusIssue(env, state);

    state = markProductionDeployState(state, 'verifying');
    await updateProductionStatusIssue(env, state);
    currentStage = 'smoke-test';
    await smokeTestProductionWebApp(env);

    state = markProductionDeployState(state, 'deployed', {
      previousProductionSha: state.previousProductionSha,
      commitsBehindDevelop: '0 commits',
    });
    await updateProductionStatusIssue(env, state);
    await updateGitHubDeploymentStatus(env, deploymentId, 'success');
  } catch (error) {
    const failedState = failProductionDeployState(state || createInitialProductionDeployState({
      dryRun,
      force,
      workflowRunUrl: workflowRunUrl(process.env),
    }), currentStage, error);
    writeStepSummary(renderProductionStatusIssue(failedState));
    if (!dryRun) {
      try {
        await updateProductionStatusIssue(process.env, failedState);
        await updateGitHubDeploymentStatus(process.env, deploymentId, 'failure');
      } catch (updateError) {
        process.stderr.write(`Failed to record production deploy failure: ${updateError.message}\n`);
      }
    }
    throw error;
  } finally {
    cleanupProductionClaspFiles(claspFiles);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
