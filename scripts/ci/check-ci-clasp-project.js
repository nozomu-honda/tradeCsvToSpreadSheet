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

  console.log('ci clasp project config ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label} mismatch\nexpected: ${expected}\nactual:   ${actual}`);
  }
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
