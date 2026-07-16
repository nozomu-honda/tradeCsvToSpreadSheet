#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const {
  ALL_IMPACT_AREAS,
  FULL_SUITE_DEFINITIONS,
  SELECTED_SUITE_DEFINITIONS,
  selectGasTestsByChangedFiles,
} = require('./gas-test-selection');
const {
  CHANGE_CLASSIFICATIONS,
  FINAL_CI_CHECK_CONTEXT_MARKER,
  GAS_TESTS_CHECK_NAME,
  WEB_E2E_CHECK_NAME,
  classifyChangedFiles,
  hasSuccessfulCheckRun,
} = require('./final-ci');
const { readChangedFiles } = require('./select-gas-tests');

const rootDir = path.resolve(__dirname, '..', '..');
const HEAD_SHA = '1'.repeat(40);
const BASE_SHA = '2'.repeat(40);

function suiteNames(selection) {
  return selection.suites;
}

function assertSelected(changedFiles, expectedAreas, expectedSuites) {
  const selection = selectGasTestsByChangedFiles(changedFiles);
  assert.strictEqual(selection.mode, 'selected');
  assert.deepStrictEqual(selection.impactAreas, expectedAreas);
  assert.deepStrictEqual(selection.suites, expectedSuites);
  assert.strictEqual(selection.fullFallbackReason, null);
  return selection;
}

function assertFull(changedFiles, reasonPattern, options) {
  const selection = selectGasTestsByChangedFiles(changedFiles, options);
  assert.strictEqual(selection.mode, 'full');
  assert.deepStrictEqual(selection.suites, FULL_SUITE_DEFINITIONS.map((definition) => definition.name));
  assert.match(selection.fullFallbackReason, reasonPattern);
  assert.strictEqual(selection.testCount, 116);
  return selection;
}

function checkSelectionRules() {
  assertSelected(
    ['src/app/parser.gs'],
    ['parser-input'],
    ['parser-input-01', 'parser-input-02'],
  );
  assertSelected(
    ['src/app/db.gs'],
    ['database'],
    ['database-01', 'database-02', 'database-03'],
  );
  assertSelected(
    ['src/app/parser.gs', 'src/app/writer.gs'],
    ['parser-input', 'output'],
    ['parser-input-01', 'parser-input-02', 'output-01', 'output-02'],
  );
  assertSelected(
    ['docs/gas-ci.md', 'src/test/test_rakuten_phase1.gs'],
    ['broker-import'],
    ['broker-import-01', 'broker-import-02'],
  );

  assertFull(['src/app/utils.gs'], /shared utility changed/);
  assertFull(['src/app/new-implementation.gs'], /unknown src\/app file changed/);
  assertFull(['src/test/test_unknown_area.gs'], /unmapped src\/test file changed/);
  assertFull(['src/test/test_runner.gs'], /GAS test runner changed/);
  assertFull(['.github/workflows/final-ci-heavy.yml'], /workflow or CI script changed/);
  assertFull(['package.json'], /dependency, manifest, clasp, or Web E2E boundary changed/);
  assertFull(['docs/gas-ci.md'], /no GAS test suite was selected/);
  assertFull(['src/app/parser.gs'], /explicitly requested/, { forceFull: true });
  assertFull([], /missing or empty/);
  assertFull([null], /classification failed/);

  const selectedTestCount = SELECTED_SUITE_DEFINITIONS.reduce((total, suite) => total + suite.testCount, 0);
  assert.strictEqual(selectedTestCount, 116, 'selected suites must cover every full GAS test exactly once');
  assert.deepStrictEqual(
    [...new Set(SELECTED_SUITE_DEFINITIONS.map((suite) => suite.area))],
    ALL_IMPACT_AREAS,
    'every impact area must have selected suites',
  );
}

function checkExactGitDiffInput() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-test-selection-git-'));
  const originalCwd = process.cwd();
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: tempRoot, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
    return (result.stdout || '').trim();
  };
  try {
    git('init', '--quiet');
    git('config', 'user.name', 'CI Test');
    git('config', 'user.email', 'ci-test@example.invalid');
    fs.mkdirSync(path.join(tempRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'docs', 'note.md'), 'base\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'base');
    const baseSha = git('rev-parse', 'HEAD');

    fs.mkdirSync(path.join(tempRoot, 'src', 'app'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'src', 'app', 'parser.gs'), 'function parserFixture_() {}\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'head');
    const headSha = git('rev-parse', 'HEAD');

    process.chdir(tempRoot);
    assert.deepStrictEqual(readChangedFiles(baseSha, headSha), ['src/app/parser.gs']);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function checkGasRunnerContract() {
  const runnerPath = path.join(rootDir, 'src', 'test', 'test_runner.gs');
  const runnerSource = fs.readFileSync(runnerPath, 'utf8');
  const testFunctionNames = [...new Set(
    [...runnerSource.matchAll(/\b(test_[A-Za-z0-9_]+)\b/g)].map((match) => match[1]),
  )];
  const context = {
    Logger: { log() {} },
    cleanupSuiteTempSpreadsheet_() {},
    cleanupSuiteTempDbSpreadsheets_() {},
  };
  for (const name of testFunctionNames) context[name] = { [name]: function() {} }[name];
  vm.createContext(context);
  vm.runInContext(runnerSource, context, { filename: 'src/test/test_runner.gs' });

  assert.strictEqual(typeof context.runSmokeTests, 'function', 'runSmokeTests must remain available');
  assert.strictEqual(typeof context.runAllTests, 'function', 'runAllTests must remain available');
  const allTestsResult = context.runAllTests();
  assert.match(allTestsResult, /GAS_TEST_METRICS testCount=116 durationMs=\d+/);
  assert.match(context.runSmokeTests(), /GAS_TEST_METRICS testCount=110 durationMs=\d+/);

  const sourceDefinedTests = fs.readdirSync(path.join(rootDir, 'src', 'test'))
    .filter((fileName) => fileName.endsWith('.gs') && fileName !== 'test_runner.gs')
    .flatMap((fileName) => {
      const source = fs.readFileSync(path.join(rootDir, 'src', 'test', fileName), 'utf8');
      return [...source.matchAll(/^function\s+(test_[A-Za-z0-9_]+)\s*\(/gm)].map((match) => match[1]);
    })
    .sort();
  const registeredTests = [...allTestsResult.matchAll(/^OK\s+(test_[A-Za-z0-9_]+)/gm)]
    .map((match) => match[1])
    .sort();
  assert.deepStrictEqual(
    registeredTests,
    sourceDefinedTests,
    'every source-controlled GAS test function must be registered in runAllTests exactly once',
  );
  assert.throws(
    () => context.runGasTestSuiteByName('unknown-suite'),
    /許可されていないGASテストスイート/,
    'unknown GAS suite names must fail closed',
  );
  assert.throws(
    () => context.runGasTestSuitesByName_([]),
    /GASテストスイートが選択されていません/,
    'empty GAS suite selections must fail closed',
  );

  for (const definition of SELECTED_SUITE_DEFINITIONS) {
    assert.strictEqual(typeof context[definition.entryPoint], 'function', `${definition.entryPoint} must be public`);
    assert.match(
      context[definition.entryPoint](),
      new RegExp(`GAS_TEST_METRICS testCount=${definition.testCount} durationMs=\\d+`),
      `${definition.name} must report its exact test count`,
    );
  }
  for (const definition of FULL_SUITE_DEFINITIONS) {
    assert.strictEqual(typeof context[definition.entryPoint], 'function', `${definition.entryPoint} must remain public`);
    assert.match(
      context[definition.entryPoint](),
      new RegExp(`GAS_TEST_METRICS testCount=${definition.testCount} durationMs=\\d+`),
      `${definition.name} must report its exact full-batch test count`,
    );
  }

  assert.ok(!/\beval\s*\(/.test(runnerSource), 'GAS test selection must not use eval');
}

function checkWorkflowAndShellContract() {
  const workflow = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'final-ci-heavy.yml'), 'utf8');
  const runScript = fs.readFileSync(path.join(rootDir, 'scripts', 'ci', 'run-gas-tests.sh'), 'utf8');
  const gasJob = workflow.slice(workflow.indexOf('  gas-tests:'), workflow.indexOf('  gas-web-e2e:'));

  for (const expected of [
    'Select GAS Tests from exact PR diff',
    'node scripts/ci/select-gas-tests.js',
    'GAS_TEST_BASE_SHA: ${{ inputs.base_sha }}',
    'GAS_TEST_HEAD_SHA: ${{ inputs.head_sha }}',
    'GAS_TEST_SELECTION_PATH: ${{ runner.temp }}/gas-test-selection.json',
    'GAS_CI_CHECKOUT_SECONDS:',
    'GAS_CI_SETUP_SECONDS:',
  ]) {
    assert.ok(gasJob.includes(expected), `Final CI GAS job must include ${expected}`);
  }
  assert.strictEqual(
    (runScript.match(/run_clasp_step "clasp --project push" push --force/g) || []).length,
    1,
    'GAS CI must push to the test Apps Script project exactly once',
  );
  assert.ok(runScript.includes('selection_test_count'), 'GAS CI must verify the selected total test count');
  assert.ok(runScript.includes('GAS_TEST_METRICS'), 'GAS CI must require GAS runtime metrics');
  assert.ok(runScript.includes('Apps Script wait'), 'GAS CI summary must report Apps Script wait time');
  assert.ok(runScript.includes('Actual GAS tests'), 'GAS CI summary must report actual GAS test time');
}

function checkSelectedShellExecution() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-test-selection-shell-'));
  try {
    for (const relativePath of [
      '.claspignore',
      'appsscript.json',
      'scripts/ci/gas-test-selection.js',
      'scripts/ci/run-gas-tests.sh',
      'scripts/ci/write-ci-clasp-config.js',
      'src/test/test_runner.gs',
    ]) {
      const targetPath = path.join(tempRoot, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(path.join(rootDir, relativePath), targetPath);
    }
    const selection = selectGasTestsByChangedFiles(['src/app/parser.gs']);
    fs.writeFileSync(path.join(tempRoot, 'selection.json'), `${JSON.stringify(selection, null, 2)}\n`);
    const fakeBinDir = path.join(tempRoot, 'fake-bin');
    fs.mkdirSync(fakeBinDir, { recursive: true });
    const fakeClaspPath = path.join(fakeBinDir, 'clasp');
    fs.writeFileSync(fakeClaspPath, [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'printf \'%s\\n\' "$*" >> "$(pwd)/fake-clasp.log"',
      'previous=""',
      'function_name=""',
      'has_push=0',
      'for argument in "$@"; do',
      '  if [[ "${previous}" == "run" ]]; then function_name="${argument}"; fi',
      '  if [[ "${argument}" == "push" ]]; then has_push=1; fi',
      '  previous="${argument}"',
      'done',
      'if [[ -n "${function_name}" ]]; then',
      '  case "${function_name}" in',
      '    runGasTestSuiteParserInput01) count=13 ;;',
      '    runGasTestSuiteParserInput02) count=2 ;;',
      '    *) echo "Script function not found"; exit 1 ;;',
      '  esac',
      '  echo "Result: GAS_TEST_METRICS testCount=${count} durationMs=5"',
      '  exit 0',
      'fi',
      'if [[ "${has_push}" == "1" ]]; then',
      '  echo "fake clasp push"',
      '  exit 0',
      'fi',
      'echo "unexpected fake clasp command: argc=$# args=$*"',
      'exit 2',
      '',
    ].join('\n'), { mode: 0o755 });

    const shellSource = `
set -euo pipefail
mkdir -p home runner-temp
export PATH="$(pwd)/fake-bin:$PATH"
export HOME="$(pwd)/home"
export RUNNER_TEMP="$(pwd)/runner-temp"
export GITHUB_WORKSPACE="$(pwd)"
export GITHUB_STEP_SUMMARY="$(pwd)/summary.md"
export GAS_TEST_SELECTION_PATH="$(pwd)/selection.json"
export CLASPRC_JSON='{"placeholder":true}'
export GAS_TEST_SCRIPT_ID='TEST_SCRIPT_ID_PLACEHOLDER'
source scripts/ci/run-gas-tests.sh
`;
    const windowsGitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
    const bashExecutable = process.platform === 'win32' && fs.existsSync(windowsGitBash)
      ? windowsGitBash
      : 'bash';
    const result = spawnSync(bashExecutable, ['-c', shellSource], {
      cwd: tempRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status !== 0) {
      process.stderr.write(`${result.stdout || ''}\n${result.stderr || ''}\n`);
      assert.fail(`selected GAS shell execution failed with exit ${result.status}`);
    }

    const calls = fs.readFileSync(path.join(tempRoot, 'fake-clasp.log'), 'utf8')
      .trim().split(/\r?\n/);
    assert.strictEqual(calls.filter((call) => call.includes(' push --force')).length, 1, 'selected execution must push once');
    assert.strictEqual(calls.filter((call) => call.includes(' run runGasTestSuiteParserInput01')).length, 1);
    assert.strictEqual(calls.filter((call) => call.includes(' run runGasTestSuiteParserInput02')).length, 1);
    assert.strictEqual(calls.filter((call) => / run runGasTestBatch\d+/.test(call)).length, 0, 'selected execution must skip full batches');

    const summary = fs.readFileSync(path.join(tempRoot, 'summary.md'), 'utf8');
    assert.match(summary, /Mode: `selected`/);
    assert.match(summary, /Expected tests: `15`/);
    assert.match(summary, /All selected GAS test functions passed \(15 tests/);
    assert.match(summary, /Apps Script wait:/);
    assert.match(summary, /Actual GAS tests:/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function checkFinalCiContracts() {
  assert.strictEqual(classifyChangedFiles(['docs/gas-ci.md']), CHANGE_CLASSIFICATIONS.DOCS_ONLY);
  assert.strictEqual(classifyChangedFiles(['src/app/db.gs']), CHANGE_CLASSIFICATIONS.GAS_TESTS_ONLY);
  assert.strictEqual(classifyChangedFiles(['Index.html']), CHANGE_CLASSIFICATIONS.GAS_TESTS_AND_WEB_E2E);
  assert.strictEqual(classifyChangedFiles(['src/app/e2e_helpers.gs']), CHANGE_CLASSIFICATIONS.GAS_TESTS_AND_WEB_E2E);

  const successfulGasCheck = {
    name: GAS_TESTS_CHECK_NAME,
    conclusion: 'success',
    head_sha: HEAD_SHA,
    output: { summary: `${FINAL_CI_CHECK_CONTEXT_MARKER}\nhead_sha: ${HEAD_SHA}\nbase_sha: ${BASE_SHA}` },
  };
  assert.strictEqual(
    hasSuccessfulCheckRun([successfulGasCheck], GAS_TESTS_CHECK_NAME, HEAD_SHA, BASE_SHA),
    true,
    'successful GAS Check Run reuse must remain unchanged',
  );
  assert.strictEqual(
    hasSuccessfulCheckRun([successfulGasCheck], WEB_E2E_CHECK_NAME, HEAD_SHA, BASE_SHA),
    false,
    'different check names must not be reused',
  );
}

checkSelectionRules();
checkExactGitDiffInput();
checkGasRunnerContract();
checkWorkflowAndShellContract();
checkSelectedShellExecution();
checkFinalCiContracts();
console.log('gas test selection ok');
