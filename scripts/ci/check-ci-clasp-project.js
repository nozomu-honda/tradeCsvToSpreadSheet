#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  listRepresentativePushFiles,
  resolveClaspSourceRoot,
} = require('./write-ci-clasp-config');

const rootDir = path.resolve(__dirname, '..', '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-clasp-project-'));
const projectPath = path.join(tempRoot, 'outside-repo', 'gas-ci-clasp-project.json');
const tempHome = path.join(tempRoot, 'home');
const tempCwd = path.join(tempRoot, 'cwd');
const rootClaspPath = path.join(rootDir, '.clasp.json');
const rootClaspExistedBefore = fs.existsSync(rootClaspPath);
const placeholderScriptId = 'TEST_CI_SCRIPT_ID_PLACEHOLDER';

try {
  fs.mkdirSync(tempHome, { recursive: true });
  fs.mkdirSync(tempCwd, { recursive: true });

  const result = spawnSync(
    process.execPath,
    [path.join(rootDir, 'scripts', 'ci', 'write-ci-clasp-config.js')],
    {
      cwd: tempCwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        GITHUB_WORKSPACE: rootDir,
        CLASP_PROJECT_PATH: projectPath,
        GAS_TEST_SCRIPT_ID: placeholderScriptId,
        CLASPRC_JSON: JSON.stringify({ placeholder: true }),
        CLASP_PROJECT_JSON: JSON.stringify({
          scriptId: 'SHOULD_BE_OVERWRITTEN',
          rootDir: '.',
          srcDir: 'relative-src-that-must-not-be-used',
          scriptExtensions: ['.gs'],
          htmlExtensions: ['.html'],
          jsonExtensions: ['.json'],
          filePushOrder: ['Index.html'],
          skipSubdirectories: false,
        }),
      },
    }
  );

  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status !== 0) {
    process.stderr.write(combinedOutput);
    fail(`write-ci-clasp-config exited with ${result.status}`);
  }
  if (combinedOutput.includes(placeholderScriptId)) {
    fail('script ID placeholder leaked to command output');
  }
  if (fs.existsSync(rootClaspPath) !== rootClaspExistedBefore) {
    fail('root .clasp.json state changed');
  }
  if (!fs.existsSync(projectPath)) {
    fail('CI clasp project file was not created');
  }
  if (path.relative(rootDir, projectPath).split(path.sep)[0] !== '..') {
    fail('test setup error: project file is not outside the repository');
  }

  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  assertEqual(project.scriptId, placeholderScriptId, 'scriptId must come from GAS_TEST_SCRIPT_ID');
  assertEqual(project.rootDir, rootDir, 'rootDir must be repository absolute path');
  if (!path.isAbsolute(project.rootDir)) {
    fail('rootDir is not absolute');
  }
  if (Object.prototype.hasOwnProperty.call(project, 'srcDir')) {
    fail('relative srcDir must be removed from CI project config');
  }

  const sourceRoot = resolveClaspSourceRoot(project, projectPath);
  assertEqual(sourceRoot, rootDir, 'resolved clasp source root');
  if (sourceRoot.startsWith(tempRoot)) {
    fail('resolved source root points to the temporary project directory');
  }

  const representativeFiles = listRepresentativePushFiles(project, projectPath)
    .map((item) => item.relativePath)
    .sort();

  for (const expected of ['Index.html', 'appsscript.json', 'src/app/web.gs']) {
    if (!representativeFiles.includes(expected)) {
      fail(`representative push file is missing: ${expected}`);
    }
  }

  for (const scriptPath of [
    'scripts/ci/run-gas-tests.sh',
    'scripts/ci/deploy-test-webapp.sh',
    'scripts/ci/delete-dynamic-webapp-deployment.sh',
  ]) {
    const source = fs.readFileSync(path.join(rootDir, scriptPath), 'utf8');
    if (!source.includes('node scripts/ci/write-ci-clasp-config.js')) {
      fail(`${scriptPath} does not use the shared CI clasp config writer`);
    }
    if (!source.includes('CLASP_IGNORE_PATH="${CI_REPO_ROOT}/.claspignore"')) {
      fail(`${scriptPath} does not resolve the repository .claspignore`);
    }
    if (!source.includes('--ignore "${CLASP_IGNORE_PATH}"')) {
      fail(`${scriptPath} does not pass --ignore to clasp`);
    }
    if (/rootDir:\s*['"]\.['"]/.test(source)) {
      fail(`${scriptPath} still generates rootDir "." inline`);
    }
  }

  const claspIgnore = fs.readFileSync(path.join(rootDir, '.claspignore'), 'utf8');
  if (!claspIgnore.split(/\r?\n/).some((line) => line.trim() === 'scripts/**')) {
    fail('.claspignore must exclude scripts/** from GAS push targets');
  }

  const gasTestsWorkflow = readWorkflow('.github/workflows/gas-tests.yml');
  const gasWebE2eWorkflow = readWorkflow('.github/workflows/gas-web-e2e.yml');
  const gasTestsGroup = extractConcurrencyGroupExpression(
    gasTestsWorkflow,
    '.github/workflows/gas-tests.yml'
  );
  const gasWebE2eGroup = extractConcurrencyGroupExpression(
    gasWebE2eWorkflow,
    '.github/workflows/gas-web-e2e.yml'
  );

  assertEqual(
    evaluateGitHubExpression(gasTestsGroup, pullRequestContext({
      label: 'run-gas-tests',
      prNumber: 72,
      runId: 1001,
    })),
    'gas-shared-test-project',
    'GAS Tests target label concurrency group'
  );
  assertEqual(
    evaluateGitHubExpression(gasWebE2eGroup, pullRequestContext({
      label: 'gas-web-e2e',
      prNumber: 72,
      runId: 1002,
    })),
    'gas-shared-test-project',
    'Web E2E target label concurrency group'
  );
  assertEqual(
    evaluateGitHubExpression(gasTestsGroup, pullRequestContext({
      label: 'run-gas-tests',
      prNumber: 73,
      runId: 1003,
    })),
    'gas-shared-test-project',
    'GAS Tests target label concurrency group for another PR'
  );
  assertEqual(
    evaluateGitHubExpression(gasWebE2eGroup, pullRequestContext({
      label: 'gas-web-e2e',
      prNumber: 73,
      runId: 1004,
    })),
    'gas-shared-test-project',
    'Web E2E target label concurrency group for another PR'
  );
  assertEqual(
    evaluateGitHubExpression(gasWebE2eGroup, workflowDispatchContext({ runId: 1005 })),
    'gas-shared-test-project',
    'Web E2E workflow_dispatch concurrency group'
  );

  const gasTestsNonTargetGroup = evaluateGitHubExpression(
    gasTestsGroup,
    pullRequestContext({ label: 'gas-web-e2e', prNumber: 72, runId: 2001 })
  );
  const gasWebE2eNonTargetGroup = evaluateGitHubExpression(
    gasWebE2eGroup,
    pullRequestContext({ label: 'run-gas-tests', prNumber: 72, runId: 2002 })
  );
  const gasTestsExternalGroup = evaluateGitHubExpression(
    gasTestsGroup,
    pullRequestContext({
      label: 'run-gas-tests',
      prNumber: 72,
      runId: 2003,
      headRepo: 'someone/fork',
    })
  );
  const gasWebE2eExternalGroup = evaluateGitHubExpression(
    gasWebE2eGroup,
    pullRequestContext({
      label: 'gas-web-e2e',
      prNumber: 72,
      runId: 2004,
      headRepo: 'someone/fork',
    })
  );

  assertEqual(gasTestsNonTargetGroup, 'gas-tests-skip-2001', 'GAS Tests non-target label group');
  assertEqual(gasWebE2eNonTargetGroup, 'gas-web-e2e-skip-2002', 'Web E2E non-target label group');
  assertEqual(gasTestsExternalGroup, 'gas-tests-skip-2003', 'GAS Tests external PR group');
  assertEqual(gasWebE2eExternalGroup, 'gas-web-e2e-skip-2004', 'Web E2E external PR group');

  for (const [workflowPath, workflowSource, workflowGroup] of [
    ['.github/workflows/gas-tests.yml', gasTestsWorkflow, gasTestsGroup],
    ['.github/workflows/gas-web-e2e.yml', gasWebE2eWorkflow, gasWebE2eGroup],
  ]) {
    if (!workflowSource.includes('cancel-in-progress: false')) {
      fail(`${workflowPath} must queue instead of canceling the paired GAS workflow`);
    }
    if (workflowGroup.includes('pull_request.number')) {
      fail(`${workflowPath} concurrency group must not depend on the PR number`);
    }
  }

  console.log('ci clasp project config ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label} mismatch\nexpected: ${expected}\nactual:   ${actual}`);
  }
}

function readWorkflow(workflowPath) {
  return fs.readFileSync(path.join(rootDir, workflowPath), 'utf8');
}

function extractConcurrencyGroupExpression(source, workflowPath) {
  const lines = source.split(/\r?\n/);
  const concurrencyIndex = lines.findIndex((line) => line.trim() === 'concurrency:');
  if (concurrencyIndex === -1) {
    fail(`${workflowPath} has no workflow-level concurrency section`);
  }

  for (let index = concurrencyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line) && line.trim() !== '') {
      break;
    }
    if (line.trim() === 'group: >-') {
      const expressionLines = [];
      for (let expressionIndex = index + 1; expressionIndex < lines.length; expressionIndex += 1) {
        const expressionLine = lines[expressionIndex];
        if (/^  [A-Za-z0-9_-]+:/.test(expressionLine)) {
          break;
        }
        expressionLines.push(expressionLine.trim());
      }
      const expression = expressionLines.join(' ').replace(/\s+/g, ' ').trim();
      if (!expression) {
        fail(`${workflowPath} has an empty concurrency group expression`);
      }
      return expression;
    }
  }

  fail(`${workflowPath} must use a folded workflow-level concurrency group expression`);
}

function evaluateGitHubExpression(expression, context) {
  const match = expression.match(/^\$\{\{\s*(.*)\s*\}\}$/);
  if (!match) {
    fail(`invalid GitHub expression: ${expression}`);
  }

  const body = match[1];
  const format = (template, ...values) => template.replace(/\{(\d+)\}/g, (_, index) => {
    const value = values[Number(index)];
    return value === undefined ? '' : String(value);
  });
  const evaluator = new Function('github', 'format', `return (${body});`);
  return evaluator(context.github, format);
}

function pullRequestContext({ label, prNumber, runId, headRepo = 'nozomu-honda/tradeCsvToSpreadSheet' }) {
  return {
    github: {
      event_name: 'pull_request',
      event: {
        label: { name: label },
        pull_request: {
          number: prNumber,
          head: {
            repo: {
              full_name: headRepo,
            },
          },
        },
      },
      repository: 'nozomu-honda/tradeCsvToSpreadSheet',
      run_id: runId,
    },
  };
}

function workflowDispatchContext({ runId }) {
  return {
    github: {
      event_name: 'workflow_dispatch',
      event: {},
      repository: 'nozomu-honda/tradeCsvToSpreadSheet',
      run_id: runId,
    },
  };
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
