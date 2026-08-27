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
const projectPath = path.join(rootDir, '.clasp.ci.json');
const tempHome = path.join(tempRoot, 'home');
const tempCwd = path.join(tempRoot, 'cwd');
const rootClaspPath = path.join(rootDir, '.clasp.json');
const rootClaspExistedBefore = fs.existsSync(rootClaspPath);
const ciProjectExistedBefore = fs.existsSync(projectPath);
const ciProjectContentsBefore = ciProjectExistedBefore
  ? fs.readFileSync(projectPath)
  : null;
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
  if (path.relative(rootDir, projectPath).split(path.sep)[0] === '..') {
    fail('test setup error: project file is outside the repository');
  }

  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  assertEqual(project.scriptId, placeholderScriptId, 'scriptId must come from GAS_TEST_SCRIPT_ID');
  assertEqual(project.rootDir, '.', 'rootDir must be repository-relative');
  if (path.isAbsolute(project.rootDir)) {
    fail('rootDir must not be absolute');
  }
  if (Object.prototype.hasOwnProperty.call(project, 'srcDir')) {
    fail('relative srcDir must be removed from CI project config');
  }

  const sourceRoot = resolveClaspSourceRoot(project, projectPath);
  assertEqual(sourceRoot, rootDir, 'resolved clasp source root');
  if (sourceRoot.startsWith(tempRoot)) {
    fail('resolved source root points to the temporary project directory');
  }

  const unsafeResult = spawnSync(
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
        CLASP_PROJECT_PATH: path.join(tempRoot, 'outside-repo', 'gas-ci-clasp-project.json'),
        GAS_TEST_SCRIPT_ID: placeholderScriptId,
        CLASPRC_JSON: JSON.stringify({ placeholder: true }),
        CLASP_PROJECT_JSON: '{}',
      },
    }
  );
  if (unsafeResult.status === 0) {
    fail('CI clasp project config outside the repository was accepted');
  }
  const unsafeOutput = `${unsafeResult.stdout || ''}\n${unsafeResult.stderr || ''}`;
  if (unsafeOutput.includes(placeholderScriptId)) {
    fail('script ID placeholder leaked from rejected project config');
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
    if (!source.includes('CLASP_PROJECT_PATH="${CI_REPO_ROOT}/.clasp.ci.json"')) {
      fail(`${scriptPath} must place the CI project config in the repository workspace`);
    }
    if (source.includes('CLASP_PROJECT_PATH="${RUNNER_TEMP')) {
      fail(`${scriptPath} must not place the CI project config outside the repository`);
    }
    if (!source.includes('CLASP_BIN="${CI_REPO_ROOT}/node_modules/.bin/clasp"')) {
      fail(`${scriptPath} must use the lockfile-pinned clasp binary`);
    }
    if (source.includes('clasp_command=(clasp ')) {
      fail(`${scriptPath} must not use a PATH-dependent clasp binary`);
    }
    if (/rootDir:\s*['"]\.['"]/.test(source)) {
      fail(`${scriptPath} still generates rootDir "." inline`);
    }
  }

  const claspIgnore = fs.readFileSync(path.join(rootDir, '.claspignore'), 'utf8');
  if (!claspIgnore.split(/\r?\n/).some((line) => line.trim() === 'scripts/**')) {
    fail('.claspignore must exclude scripts/** from GAS push targets');
  }

  const finalCiWorkflow = readWorkflow('.github/workflows/final-ci.yml');
  const finalCiRunWorkflow = readWorkflow('.github/workflows/final-ci-run.yml');
  const finalCiHeavyWorkflow = readWorkflow('.github/workflows/final-ci-heavy.yml');
  const gasTestsWorkflow = readWorkflow('.github/workflows/gas-tests.yml');
  const gasWebE2eWorkflow = readWorkflow('.github/workflows/gas-web-e2e.yml');
  const workflowDirectory = path.join(rootDir, '.github', 'workflows');
  const sharedGasWorkflowPaths = fs.readdirSync(workflowDirectory)
    .filter((fileName) => /\.ya?ml$/i.test(fileName))
    .map((fileName) => `.github/workflows/${fileName}`)
    .filter((workflowPath) => readWorkflow(workflowPath).includes('gas-shared-test-project'));
  const finalCiGroup = extractConcurrencyGroupExpression(
    finalCiHeavyWorkflow,
    '.github/workflows/final-ci-heavy.yml'
  );

  assertEqual(
    evaluateGitHubExpression(finalCiGroup, pullRequestContext({
      label: 'run-final-ci',
      prNumber: 72,
      runId: 1001,
    })),
    'gas-shared-test-project',
    'Final CI target label concurrency group'
  );
  assertEqual(
    evaluateGitHubExpression(finalCiGroup, pullRequestContext({
      label: 'run-final-ci',
      prNumber: 73,
      runId: 1003,
    })),
    'gas-shared-test-project',
    'Final CI target label concurrency group for another PR'
  );

  if (!finalCiWorkflow.includes("github.event.label.name == 'run-final-ci'")) {
    fail('.github/workflows/final-ci.yml must call the reusable final CI body only for run-final-ci');
  }
  if (!finalCiWorkflow.includes('github.event.pull_request.head.repo.full_name == github.repository')) {
    fail('.github/workflows/final-ci.yml must call the reusable final CI body only for same-repository PRs');
  }
  if (!finalCiWorkflow.includes('github.event.pull_request.head.repo.full_name != github.repository')) {
    fail('.github/workflows/final-ci.yml must fail closed for external PRs');
  }

  for (const expectedWorkflowPath of [
    '.github/workflows/final-ci-heavy.yml',
    '.github/workflows/gas-tests.yml',
    '.github/workflows/gas-web-e2e.yml',
  ]) {
    if (!sharedGasWorkflowPaths.includes(expectedWorkflowPath)) {
      fail(`${expectedWorkflowPath} must use the shared GAS test project concurrency group`);
    }
  }

  for (const workflowPath of sharedGasWorkflowPaths) {
    const workflowSource = readWorkflow(workflowPath);
    if (!workflowSource.includes('queue: max')) {
      fail(`${workflowPath} must retain all pending shared GAS project runs with queue: max`);
    }
    if (!workflowSource.includes('cancel-in-progress: false')) {
      fail(`${workflowPath} must queue instead of canceling the paired GAS workflow`);
    }
    if (workflowPath === '.github/workflows/final-ci-heavy.yml' && finalCiGroup.includes('pull_request.number')) {
      fail(`${workflowPath} concurrency group must not depend on the PR number`);
    }
  }

  if (!finalCiWorkflow.includes('uses: ./.github/workflows/final-ci-run.yml')) {
    fail('.github/workflows/final-ci.yml must call final-ci-run.yml as the reusable final CI body');
  }
  if (!finalCiRunWorkflow.includes('uses: ./.github/workflows/final-ci-heavy.yml')) {
    fail('.github/workflows/final-ci-run.yml must call final-ci-heavy.yml after the lightweight gate');
  }
  if (finalCiRunWorkflow.includes('gas-shared-test-project')) {
    fail('.github/workflows/final-ci-run.yml lightweight gate must not wait for the shared GAS project');
  }
  const gateStart = finalCiRunWorkflow.indexOf('  final-ci-gate:');
  const heavyStart = finalCiRunWorkflow.indexOf('  final-ci-heavy:');
  const gateSection = gateStart >= 0 && heavyStart > gateStart
    ? finalCiRunWorkflow.slice(gateStart, heavyStart)
    : '';
  if (!gateSection.includes('cancel-in-progress: true') || gateSection.includes('queue: max')) {
    fail('.github/workflows/final-ci-run.yml lightweight gate must stay PR-scoped, cancelable, and outside queue: max');
  }
  if (!finalCiWorkflow.includes('secrets: inherit')) {
    fail('.github/workflows/final-ci.yml must pass secrets only through the same-repository reusable workflow call');
  }
  if (finalCiWorkflow.includes('createWorkflowDispatch') || finalCiWorkflow.includes('actions: write')) {
    fail('.github/workflows/final-ci.yml must not dispatch final-ci-run.yml through a default-branch workflow_dispatch run');
  }

  for (const [workflowPath, workflowSource] of [
    ['.github/workflows/gas-tests.yml', gasTestsWorkflow],
    ['.github/workflows/gas-web-e2e.yml', gasWebE2eWorkflow],
  ]) {
    if (workflowSource.includes('pull_request:')) {
      fail(`${workflowPath} must not run from PR label events`);
    }
    if (!workflowSource.includes('workflow_dispatch:')) {
      fail(`${workflowPath} must remain available as a manual fallback`);
    }
    if (!workflowSource.includes('group: gas-shared-test-project')) {
      fail(`${workflowPath} manual fallback must use the shared GAS test project concurrency group`);
    }
    // Shared queue and cancellation behavior are checked for every matching workflow above.
  }

  console.log('ci clasp project config ok');
} finally {
  if (ciProjectExistedBefore) {
    fs.writeFileSync(projectPath, ciProjectContentsBefore);
  } else {
    fs.rmSync(projectPath, { force: true });
  }
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

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
