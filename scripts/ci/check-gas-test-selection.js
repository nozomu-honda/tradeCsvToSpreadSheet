#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  ALL_IMPACT_AREAS,
  FULL_SUITE_DEFINITIONS,
  PATH_RULES,
  SELECTED_SUITE_DEFINITIONS,
  selectGasTestsByChangedFiles,
  validateAndResolveGasTestSelection,
} = require('./gas-test-selection');
const {
  ALL_GAS_TEST_FUNCTIONS,
  GAS_TEST_MANIFEST,
} = require('./gas-test-suite-manifest');
const {
  assertSourceDefinitionsMatchManifest,
  assertGasRunnerMatchesManifest,
  collectTestFunctionDefinitions,
  listGasTestSourceFiles,
  resultTestNames,
  verifyGasTestManifestSync,
} = require('./check-gas-test-manifest-sync');
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
    ['parser-input', 'database', 'staging-import'],
    ['parser-input-01', 'parser-input-02', 'database-01', 'database-02', 'database-03', 'staging-import'],
  );
  assertSelected(
    ['src/app/db.gs'],
    ['database', 'output'],
    ['database-01', 'database-02', 'database-03', 'output-01', 'output-02'],
  );
  assertSelected(
    ['src/app/parser.gs', 'src/app/writer.gs'],
    ['parser-input', 'database', 'staging-import', 'output'],
    ['parser-input-01', 'parser-input-02', 'database-01', 'database-02', 'database-03', 'staging-import', 'output-01', 'output-02'],
  );
  assertSelected(
    ['docs/gas-ci.md', 'src/test/test_rakuten_phase1.gs'],
    ['broker-import'],
    ['broker-import-01', 'broker-import-02'],
  );

  assertFull(['src/app/utils.gs'], /shared utility changed/);
  assertFull(['src/app/e2e_helpers.gs'], /E2E helper spans/);
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
  assert.deepStrictEqual(
    SELECTED_SUITE_DEFINITIONS.flatMap((suite) => suite.tests).sort(),
    [...ALL_GAS_TEST_FUNCTIONS].sort(),
    'selected suites must cover the canonical manifest exactly once',
  );
  assert.deepStrictEqual(
    FULL_SUITE_DEFINITIONS.flatMap((suite) => suite.tests),
    ALL_GAS_TEST_FUNCTIONS,
    'full suites must preserve the canonical manifest order',
  );
}

function checkSelectedSourceAudit() {
  const expectedSelectedSources = {
    'src/app/parser.gs': ['parser-input', 'database', 'staging-import'],
    'src/app/db.gs': ['database', 'output'],
    'src/app/builder.gs': ['trade-calculation', 'output'],
    'src/app/writer.gs': ['output'],
    'src/app/reorder_output_sheets.gs': ['output'],
  };
  const actualSelectedSources = Object.entries(PATH_RULES)
    .filter(([filePath, rule]) => filePath.startsWith('src/app/') && rule.kind === 'selected')
    .map(([filePath]) => filePath)
    .sort();
  assert.deepStrictEqual(actualSelectedSources, Object.keys(expectedSelectedSources).sort());
  for (const [filePath, expectedAreas] of Object.entries(expectedSelectedSources)) {
    assert.deepStrictEqual(PATH_RULES[filePath].areas, expectedAreas, `${filePath} impact areas must match the audit`);
  }
  assert.strictEqual(PATH_RULES['src/app/e2e_helpers.gs'].kind, 'full');
  assert.ok(
    SELECTED_SUITE_DEFINITIONS
      .filter((definition) => definition.area === 'output')
      .flatMap((definition) => definition.tests)
      .includes('test_rakutenOutputCellComparison_fromRealLikeInputsThroughDb_20260709_'),
    'the DB-to-output integration test must remain in the output suites selected for db.gs',
  );
}

function cloneSelection(selection) {
  return JSON.parse(JSON.stringify(selection));
}

function assertSelectionRejected(selection, messagePattern) {
  assert.throws(
    () => validateAndResolveGasTestSelection(selection),
    messagePattern || /GAS test selection validation failed/,
  );
}

function checkSelectionPayloadValidation() {
  const selected = selectGasTestsByChangedFiles(['src/app/parser.gs']);
  const full = selectGasTestsByChangedFiles(['scripts/ci/run-gas-tests.sh'], { forceFull: true });

  assert.deepStrictEqual(validateAndResolveGasTestSelection(selected), selected);
  assert.deepStrictEqual(validateAndResolveGasTestSelection(full), full);

  const selectedWithFullSuite = cloneSelection(selected);
  selectedWithFullSuite.suites[0] = full.suites[0];
  selectedWithFullSuite.suiteDetails[0] = { ...full.suiteDetails[0] };
  assertSelectionRejected(selectedWithFullSuite, /canonical definition/);

  const fullWithSelectedSuite = cloneSelection(full);
  fullWithSelectedSuite.suites[0] = selected.suites[0];
  fullWithSelectedSuite.suiteDetails[0] = { ...selected.suiteDetails[0] };
  assertSelectionRejected(fullWithSelectedSuite, /canonical definition/);

  const alteredEntryPoint = cloneSelection(selected);
  alteredEntryPoint.suiteDetails[0].entryPoint = SELECTED_SUITE_DEFINITIONS.find(
    (definition) => definition.area === 'output',
  ).entryPoint;
  assertSelectionRejected(alteredEntryPoint, /suite detail does not match/);

  const alteredSuiteCount = cloneSelection(selected);
  alteredSuiteCount.suiteDetails[0].testCount += 1;
  assertSelectionRejected(alteredSuiteCount, /suite detail does not match/);

  const alteredTotalCount = cloneSelection(selected);
  alteredTotalCount.testCount += 1;
  assertSelectionRejected(alteredTotalCount, /total test count/);

  const duplicateSuite = cloneSelection(selected);
  duplicateSuite.suites[1] = duplicateSuite.suites[0];
  duplicateSuite.suiteDetails[1] = { ...duplicateSuite.suiteDetails[0] };
  assertSelectionRejected(duplicateSuite, /suites contains duplicates/);

  const duplicateEntryPoint = cloneSelection(selected);
  duplicateEntryPoint.suiteDetails[1].entryPoint = duplicateEntryPoint.suiteDetails[0].entryPoint;
  assertSelectionRejected(duplicateEntryPoint, /entry points contains duplicates/);

  const unknownSuite = cloneSelection(selected);
  unknownSuite.suites[0] = 'unknown-suite';
  unknownSuite.suiteDetails[0].name = 'unknown-suite';
  assertSelectionRejected(unknownSuite, /unknown suite/);

  const unknownEntryPoint = cloneSelection(selected);
  unknownEntryPoint.suiteDetails[0].entryPoint = 'runUnknownGasTestSuite';
  assertSelectionRejected(unknownEntryPoint, /unknown entry point/);

  const reordered = cloneSelection(selected);
  reordered.suites.reverse();
  reordered.suiteDetails.reverse();
  assertSelectionRejected(reordered, /canonical definition/);

  const missingSuite = cloneSelection(selected);
  missingSuite.suites.pop();
  missingSuite.suiteDetails.pop();
  missingSuite.testCount = missingSuite.suiteDetails[0].testCount;
  assertSelectionRejected(missingSuite, /canonical definition/);
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

function mutateRunnerArray(runnerSource, arrayName, mutateBody) {
  const pattern = new RegExp(`(const ${arrayName} = \\[)([\\s\\S]*?)(\\n\\];)`);
  const match = runnerSource.match(pattern);
  assert.ok(match, `${arrayName} must exist in the GAS runner fixture`);
  const mutatedBody = mutateBody(match[2]);
  assert.notStrictEqual(mutatedBody, match[2], `${arrayName} fixture mutation must change the array`);
  return runnerSource.replace(pattern, `$1${mutatedBody}$3`);
}

function replaceArrayTest(body, before, after) {
  assert.ok(body.includes(before), `${before} must exist in the GAS runner fixture array`);
  return body.replace(before, after);
}

function checkGasRunnerManifestTampering(runnerSource) {
  const parserTest = 'test_collectInputAlerts_supportedForeignBond_';
  const secondParserTest = 'test_collectInputAlerts_supportedProductAndCurrency_doNothing_';
  const databaseTest = 'test_buildRowHash_sameRecord_sameHash_';

  let sameCountSwap = mutateRunnerArray(
    runnerSource,
    'PARSER_INPUT_TESTS_',
    (body) => replaceArrayTest(body, parserTest, databaseTest),
  );
  sameCountSwap = mutateRunnerArray(
    sameCountSwap,
    'DATABASE_TESTS_',
    (body) => replaceArrayTest(body, databaseTest, parserTest),
  );
  assert.throws(
    () => assertGasRunnerMatchesManifest(sameCountSwap),
    /canonical manifest/,
    'same-count parser/database swaps must fail canonical suite validation',
  );

  const missingTest = mutateRunnerArray(
    runnerSource,
    'PARSER_INPUT_TESTS_',
    (body) => replaceArrayTest(body, `  ${parserTest},\n`, ''),
  );
  assert.throws(
    () => assertGasRunnerMatchesManifest(missingTest),
    /GASテストスイート定義が不正|canonical manifest/,
    'missing suite tests must fail canonical suite validation',
  );

  const crossSuiteContamination = mutateRunnerArray(
    runnerSource,
    'PARSER_INPUT_TESTS_',
    (body) => replaceArrayTest(body, parserTest, databaseTest),
  );
  assert.throws(
    () => assertGasRunnerMatchesManifest(crossSuiteContamination),
    /GASテストスイート定義が不正|canonical manifest/,
    'tests copied from another suite must fail canonical suite validation',
  );

  const reordered = mutateRunnerArray(runnerSource, 'PARSER_INPUT_TESTS_', (body) => {
    let result = replaceArrayTest(body, parserTest, '__MANIFEST_ORDER_SWAP__');
    result = replaceArrayTest(result, secondParserTest, parserTest);
    return replaceArrayTest(result, '__MANIFEST_ORDER_SWAP__', secondParserTest);
  });
  assert.throws(
    () => assertGasRunnerMatchesManifest(reordered),
    /canonical manifest/,
    'suite test order changes must fail canonical suite validation',
  );
}

function withTestSourceFixture(files, callback) {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-test-source-fixture-'));
  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const filePath = path.join(repositoryRoot, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, source);
    }
    return callback({
      repositoryRoot,
      runnerPath: path.join(repositoryRoot, 'src', 'test', 'test_runner.gs'),
      testRoot: path.join(repositoryRoot, 'src', 'test'),
    });
  } finally {
    fs.rmSync(repositoryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function checkSourceDefinitionCollection() {
  withTestSourceFixture({
    'src/test/nested/test_real.gs': [
      '// function test_line_comment_fake_() {}',
      '/*',
      'function test_block_comment_fake_() {}',
      '*/',
      'const doubleQuoted = "function test_double_quote_fake_() {}";',
      "const singleQuoted = 'function test_single_quote_fake_() {}';",
      'const templated = `function test_template_fake_() {}`;',
      'const regexWithQuote = /"/;',
      'const regexWithFunctionText = /function test_regex_fake_\\(\\) \\{\\}/;',
      'const referenced = test_reference_fake_;',
      'function test_real_nested_fixture_() {}',
      '',
    ].join('\n'),
    'src/test/test_real_root.gs': 'function test_real_root_fixture_() {}\n',
    'src/test/test_runner.gs': 'function test_runner_must_be_excluded_() {}\n',
  }, ({ repositoryRoot, runnerPath, testRoot }) => {
    const definitions = collectTestFunctionDefinitions({ repositoryRoot, runnerPath, testRoot });
    assert.deepStrictEqual(
      definitions.map(({ name, filePath, line }) => ({ name, filePath, line })),
      [
        { name: 'test_real_nested_fixture_', filePath: 'src/test/nested/test_real.gs', line: 11 },
        { name: 'test_real_root_fixture_', filePath: 'src/test/test_real_root.gs', line: 1 },
      ],
      'only real test function declarations must be collected recursively in stable order',
    );
    assertSourceDefinitionsMatchManifest(definitions, [
      'test_real_root_fixture_',
      'test_real_nested_fixture_',
    ]);
  });
}

function checkTemplateLiteralDefinitionCollection() {
  const fixtureLines = [
    "const nestedBody = `outer ${`",
    'function test_nested_template_body_fake_() {}',
    "`}`;",
    "const templateExpression = `${",
    'function test_template_expression_fixture_() {}',
    "}`;",
    "const nestedExpression = `outer ${",
    "  `inner function test_nested_inner_body_fake_() {} ${",
    'function test_nested_template_expression_fixture_() {}',
    "  }`",
    "}`;",
    "const braceDepth = `${",
    '(() => {',
    '  const nested = { value: { enabled: true } };',
    '  const templated = `function test_nested_code_template_fake_() {}`;',
    '  const quoted = "function test_nested_code_string_fake_() {}";',
    '  const regex = /function test_nested_code_regex_fake_\\(\\) \\{\\}/;',
    '  return function test_template_brace_depth_fixture_() {};',
    '})()',
    "}`;",
    "const escapedBacktick = `body \\` function test_escaped_backtick_fake_() {}`;",
    "const escapedInterpolation = `body \\${function test_escaped_interpolation_fake_() {}}`;",
    "const escapedBackslash = `body \\\\${function test_escaped_backslash_expression_fixture_() {}}`;",
    'function test_real_after_templates_fixture_() {}',
    '',
  ];
  const fixtureSource = fixtureLines.join('\n');

  withTestSourceFixture({
    'src/test/test_template_lexer.gs': fixtureSource,
    'src/test/test_runner.gs': '',
  }, ({ repositoryRoot, runnerPath, testRoot }) => {
    const definitions = collectTestFunctionDefinitions({ repositoryRoot, runnerPath, testRoot });
    assert.deepStrictEqual(
      definitions.map(({ name, line }) => ({ name, line })),
      [
        { name: 'test_escaped_backslash_expression_fixture_', line: 23 },
        { name: 'test_nested_template_expression_fixture_', line: 9 },
        { name: 'test_real_after_templates_fixture_', line: 24 },
        { name: 'test_template_brace_depth_fixture_', line: 18 },
        { name: 'test_template_expression_fixture_', line: 5 },
      ],
      'template bodies must stay masked while real definitions in nested interpolation expressions remain visible',
    );
  });
}

function checkRegularExpressionAndDivisionDefinitionCollection() {
  const fixtureLines = [
    'if (enabled) /function test_if_regex_fake_() {}/.test(value);',
    'while (enabled) /function test_while_regex_fake_() {}/g.test(value);',
    'for (; enabled;) /function test_for_regex_fake_() {}/i.test(value);',
    'with (context) /function test_with_regex_fake_() {}/m.test(value);',
    'do {} while (enabled); /function test_do_while_regex_fake_\\(\\) \\{\\}/u.test(value);',
    'if (enabled) {}',
    '/function test_after_block_regex_fake_() {}/y.test(value);',
    'function regexFactory_() {',
    '  return /function test_return_regex_fake_() {}/;',
    '}',
    'function throwRegex_() {',
    '  throw /function test_throw_regex_fake_() {}/;',
    '}',
    'const assignedRegex = /function test_assignment_regex_fake_() {}/;',
    'const regexArray = [/function test_array_regex_fake_() {}/];',
    'consume(/function test_argument_regex_fake_() {}/);',
    'const conditionalRegex = enabled',
    '  ? /function test_ternary_true_regex_fake_() {}/',
    '  : /function test_ternary_false_regex_fake_() {}/;',
    'const escapedRegex = /[\\/]function\\s+test_character_class_regex_fake_\\(\\)\\s+\\{\\}/giu;',
    'const quotient = amount / divisor;',
    'amount /= divisor;',
    'const parenthesizedQuotient = (amount + fee) / divisor;',
    'call() / value;',
    'function test_real_after_division_fixture_() {}',
    '/function test_final_regex_fake_() {}/.test(value);',
    'function test_real_after_regex_fixture_() {}',
    '',
  ];

  withTestSourceFixture({
    'src/test/test_regex_and_division_parser.gs': fixtureLines.join('\n'),
    'src/test/test_runner.gs': '',
  }, ({ repositoryRoot, runnerPath, testRoot }) => {
    const definitions = collectTestFunctionDefinitions({ repositoryRoot, runnerPath, testRoot });
    assert.deepStrictEqual(
      definitions.map(({ name, filePath, line }) => ({ name, filePath, line })),
      [
        {
          name: 'test_real_after_division_fixture_',
          filePath: 'src/test/test_regex_and_division_parser.gs',
          line: 25,
        },
        {
          name: 'test_real_after_regex_fixture_',
          filePath: 'src/test/test_regex_and_division_parser.gs',
          line: 27,
        },
      ],
      'regex bodies must be ignored while real definitions after regex and division remain discoverable',
    );
  });
}

function checkSourceManifestMismatchFixtures() {
  withTestSourceFixture({
    'src/test/test_unregistered.gs': 'function test_unregistered_manifest_fixture_() {}\n',
    'src/test/test_runner.gs': '',
  }, ({ repositoryRoot, runnerPath, testRoot }) => {
    const definitions = collectTestFunctionDefinitions({ repositoryRoot, runnerPath, testRoot });
    assert.throws(
      () => assertSourceDefinitionsMatchManifest(definitions, []),
      /source test function is not registered in manifest: test_unregistered_manifest_fixture_ \(src\/test\/test_unregistered\.gs:1\)/,
    );
  });

  withTestSourceFixture({
    'src/test/test_existing.gs': 'function test_existing_manifest_fixture_() {}\n',
    'src/test/test_runner.gs': '',
  }, ({ repositoryRoot, runnerPath, testRoot }) => {
    const definitions = collectTestFunctionDefinitions({ repositoryRoot, runnerPath, testRoot });
    assert.throws(
      () => assertSourceDefinitionsMatchManifest(definitions, [
        'test_existing_manifest_fixture_',
        'test_manifest_only_fixture_',
      ]),
      /manifest test function has no source definition: test_manifest_only_fixture_/,
    );
    assert.throws(
      () => assertSourceDefinitionsMatchManifest(definitions, [
        'test_existing_manifest_fixture_',
        'test_existing_manifest_fixture_',
      ]),
      /duplicate manifest test function: test_existing_manifest_fixture_/,
    );
  });

  withTestSourceFixture({
    'src/test/test_duplicate_a.gs': 'function test_duplicate_source_fixture_() {}\n',
    'src/test/test_duplicate_b.gs': 'function test_duplicate_source_fixture_() {}\n',
    'src/test/test_runner.gs': '',
  }, ({ repositoryRoot, runnerPath, testRoot }) => {
    assert.throws(
      () => collectTestFunctionDefinitions({ repositoryRoot, runnerPath, testRoot }),
      /duplicate source test function definition: test_duplicate_source_fixture_ .*test_duplicate_a\.gs:1.*test_duplicate_b\.gs:1/,
    );
  });

  withTestSourceFixture({
    'src/test/test_duplicate_same_file.gs': [
      'function test_duplicate_same_file_fixture_() {}',
      'function test_duplicate_same_file_fixture_() {}',
      '',
    ].join('\n'),
    'src/test/test_runner.gs': '',
  }, ({ repositoryRoot, runnerPath, testRoot }) => {
    assert.throws(
      () => collectTestFunctionDefinitions({ repositoryRoot, runnerPath, testRoot }),
      /duplicate source test function definition: test_duplicate_same_file_fixture_ .*:1.*:2/,
    );
  });
}

function checkGasRunnerContract() {
  const runnerPath = path.join(rootDir, 'src', 'test', 'test_runner.gs');
  const runnerSource = fs.readFileSync(runnerPath, 'utf8');
  const { context, allTestsResult, sourceDefinitions, sourceTestCount } = verifyGasTestManifestSync();

  const sourceDefinedTests = sourceDefinitions.map((definition) => definition.name).sort();
  const registeredTests = resultTestNames(allTestsResult).sort();
  assert.deepStrictEqual(
    registeredTests,
    sourceDefinedTests,
    'every source-controlled GAS test function must be registered in runAllTests exactly once',
  );
  assert.deepStrictEqual(
    [...ALL_GAS_TEST_FUNCTIONS].sort(),
    sourceDefinedTests,
    'the canonical manifest must include every source-controlled GAS test exactly once',
  );
  assert.strictEqual(sourceTestCount, 116, 'the repository must define exactly 116 canonical GAS tests');
  assert.strictEqual(GAS_TEST_MANIFEST.length, 116, 'the canonical manifest test count must remain explicit');
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

  assert.ok(!/\beval\s*\(/.test(runnerSource), 'GAS test selection must not use eval');
  checkGasRunnerManifestTampering(runnerSource);
}

function checkWorkflowAndShellContract() {
  const workflow = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'final-ci-heavy.yml'), 'utf8');
  const runScript = fs.readFileSync(path.join(rootDir, 'scripts', 'ci', 'run-gas-tests.sh'), 'utf8');
  const gasJob = workflow.slice(workflow.indexOf('  gas-tests:'), workflow.indexOf('  gas-web-e2e:'));

  for (const expected of [
    'Verify GAS test source, manifest, and runner sync',
    'node scripts/ci/check-gas-test-manifest-sync.js',
    'Install GAS CI dependencies',
    'npm ci --ignore-scripts',
    'node_modules/.bin:${PATH}',
    'MANIFEST_SYNC_OUTCOME: ${{ steps.gas_manifest_sync.outcome }}',
    'GAS test sources, manifest, and test_runner.gs are not synchronized',
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
  assert.ok(!gasJob.includes('npm install --global @google/clasp'), 'GAS CI must not install clasp twice');
  const headGuardIndex = gasJob.indexOf('id: gas_head_guard');
  const installIndex = gasJob.indexOf('id: install_clasp');
  const manifestSyncIndex = gasJob.indexOf('id: gas_manifest_sync');
  const selectionIndex = gasJob.indexOf('id: select_gas_tests');
  const runIndex = gasJob.indexOf('id: run_gas_tests');
  assert.ok(
    headGuardIndex < installIndex &&
      installIndex < manifestSyncIndex &&
      manifestSyncIndex < selectionIndex &&
      manifestSyncIndex < runIndex,
    'dependencies and manifest sync must run after the head guard and before selection and push',
  );
  assert.ok(
    !runScript.includes('check-gas-test-manifest-sync.js'),
    'the GAS shell must not recursively invoke the workflow manifest sync preflight',
  );
  assert.strictEqual(
    (runScript.match(/run_clasp_step "clasp --project push" push --force/g) || []).length,
    1,
    'GAS CI must push to the test Apps Script project exactly once',
  );
  assert.ok(runScript.includes('selection_test_count'), 'GAS CI must verify the selected total test count');
  assert.ok(
    runScript.includes('validateAndResolveGasTestSelection'),
    'GAS CI must validate the untrusted selection against canonical definitions',
  );
  assert.ok(
    runScript.includes('RESOLVED_GAS_TEST_SELECTION_PATH'),
    'GAS CI must execute only the resolved canonical selection',
  );
  assert.ok(runScript.includes('GAS_TEST_METRICS'), 'GAS CI must require GAS runtime metrics');
  assert.ok(runScript.includes('Apps Script wait'), 'GAS CI summary must report Apps Script wait time');
  assert.ok(runScript.includes('Actual GAS tests'), 'GAS CI summary must report actual GAS test time');
}

function runGasShellSelectionFixture(selection, options = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-test-selection-shell-'));
  try {
    const sourceTestFiles = listGasTestSourceFiles({
      testRoot: path.join(rootDir, 'src', 'test'),
      runnerPath: path.join(rootDir, 'src', 'test', 'test_runner.gs'),
    }).map((filePath) => path.relative(rootDir, filePath));
    for (const relativePath of [
      '.claspignore',
      'appsscript.json',
      'scripts/ci/gas-test-selection.js',
      'scripts/ci/check-gas-test-manifest-sync.js',
      'scripts/ci/gas-test-suite-manifest.js',
      'scripts/ci/run-gas-tests.sh',
      'scripts/ci/write-ci-clasp-config.js',
      'src/test/test_runner.gs',
      ...sourceTestFiles,
    ]) {
      const targetPath = path.join(tempRoot, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(path.join(rootDir, relativePath), targetPath);
    }
    if (options.mutateRunnerSource) {
      const runnerPath = path.join(tempRoot, 'src', 'test', 'test_runner.gs');
      const runnerSource = fs.readFileSync(runnerPath, 'utf8');
      fs.writeFileSync(runnerPath, options.mutateRunnerSource(runnerSource));
    }
    for (const [relativePath, source] of Object.entries(options.extraTestFiles || {})) {
      assert.match(relativePath, /^src[\\/]test[\\/].+\.gs$/, 'extra fixture files must stay under src/test');
      const targetPath = path.join(tempRoot, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, source);
    }
    fs.writeFileSync(path.join(tempRoot, 'selection.json'), `${JSON.stringify(selection, null, 2)}\n`);
    const fakeBinDir = path.join(tempRoot, 'fake-bin');
    fs.mkdirSync(fakeBinDir, { recursive: true });
    const fakeClaspPath = path.join(fakeBinDir, 'clasp');
    const fakeRunCases = [...SELECTED_SUITE_DEFINITIONS, ...FULL_SUITE_DEFINITIONS]
      .map((definition) => `    ${definition.entryPoint}) count=${definition.testCount} ;;`);
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
      ...fakeRunCases,
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
node scripts/ci/check-gas-test-manifest-sync.js
source scripts/ci/run-gas-tests.sh
`;
    const windowsGitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
    const bashExecutable = process.platform === 'win32' && fs.existsSync(windowsGitBash)
      ? windowsGitBash
      : 'bash';
    const result = spawnSync(bashExecutable, ['-c', shellSource], {
      cwd: tempRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_PATH: [path.join(rootDir, 'node_modules'), process.env.NODE_PATH]
          .filter(Boolean)
          .join(path.delimiter),
      },
      maxBuffer: 16 * 1024 * 1024,
    });
    const logPath = path.join(tempRoot, 'fake-clasp.log');
    const summaryPath = path.join(tempRoot, 'summary.md');
    return {
      status: result.status,
      output: `${result.stdout || ''}\n${result.stderr || ''}`,
      calls: fs.existsSync(logPath)
        ? fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).filter(Boolean)
        : [],
      summary: fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf8') : '',
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function claspRunFunctions(calls) {
  return calls.flatMap((call) => {
    const match = call.match(/(?:^|\s)run\s+([A-Za-z][A-Za-z0-9]*)/);
    return match ? [match[1]] : [];
  });
}

function assertSuccessfulShellFixture(result, label) {
  if (result.status !== 0) {
    process.stderr.write(`${result.output}\n`);
    assert.fail(`${label} GAS shell execution failed with exit ${result.status}`);
  }
  assert.strictEqual(
    result.calls.filter((call) => call.includes(' push --force')).length,
    1,
    `${label} execution must push once`,
  );
}

function checkShellSelectionValidation() {
  const selected = selectGasTestsByChangedFiles(['src/app/parser.gs']);
  assert.deepStrictEqual(
    selected.suites,
    ['parser-input-01', 'parser-input-02', 'database-01', 'database-02', 'database-03', 'staging-import'],
  );
  assert.strictEqual(selected.testCount, 49, 'parser.gs must select 15 parser, 27 database, and 7 staging tests');
  assert.ok(!selected.impactAreas.includes('output'));
  assert.ok(!selected.impactAreas.includes('broker-import'));
  assert.ok(!selected.impactAreas.includes('e2e-support'));
  const selectedResult = runGasShellSelectionFixture(selected);
  assertSuccessfulShellFixture(selectedResult, 'selected');
  assert.deepStrictEqual(
    claspRunFunctions(selectedResult.calls),
    selected.suiteDetails.map((detail) => detail.entryPoint),
    'selected execution must run only canonical selected entry points in order',
  );
  assert.match(selectedResult.summary, /Mode: `selected`/);
  assert.match(selectedResult.summary, new RegExp('Expected tests: `' + selected.testCount + '`'));
  assert.match(
    selectedResult.summary,
    new RegExp(`All selected GAS test functions passed \\(${selected.testCount} tests`),
  );
  assert.match(selectedResult.summary, /Apps Script wait:/);
  assert.match(selectedResult.summary, /Actual GAS tests:/);

  const full = selectGasTestsByChangedFiles(['scripts/ci/run-gas-tests.sh'], { forceFull: true });
  const fullResult = runGasShellSelectionFixture(full);
  assertSuccessfulShellFixture(fullResult, 'full');
  assert.deepStrictEqual(
    claspRunFunctions(fullResult.calls),
    FULL_SUITE_DEFINITIONS.map((definition) => definition.entryPoint),
    'full execution must run only canonical full batch entry points in order',
  );
  assert.match(fullResult.summary, /Mode: `full`/);
  assert.match(fullResult.summary, /Expected tests: `116`/);
  assert.match(fullResult.summary, /All selected GAS test functions passed \(116 tests/);
  assert.strictEqual(FULL_SUITE_DEFINITIONS.length, 9, 'full mode must retain nine batches');

  const parserTest = 'test_collectInputAlerts_supportedForeignBond_';
  const databaseTest = 'test_buildRowHash_sameRecord_sameHash_';
  const manifestMismatchResult = runGasShellSelectionFixture(selected, {
    mutateRunnerSource(runnerSource) {
      let result = mutateRunnerArray(
        runnerSource,
        'PARSER_INPUT_TESTS_',
        (body) => replaceArrayTest(body, parserTest, databaseTest),
      );
      result = mutateRunnerArray(
        result,
        'DATABASE_TESTS_',
        (body) => replaceArrayTest(body, databaseTest, parserTest),
      );
      return result;
    },
  });
  assert.notStrictEqual(manifestMismatchResult.status, 0, 'manifest mismatch must fail before the GAS shell starts');
  assert.deepStrictEqual(manifestMismatchResult.calls, [], 'manifest mismatch must cause zero clasp push and run calls');
  assert.match(manifestMismatchResult.output, /GAS test manifest sync failed/);
  assert.match(manifestMismatchResult.output, /canonical manifest/);

  const unregisteredSourceResult = runGasShellSelectionFixture(selected, {
    extraTestFiles: {
      'src/test/test_unregistered_manifest_fixture.gs': 'function test_unregistered_manifest_fixture_() {}\n',
    },
  });
  assert.notStrictEqual(unregisteredSourceResult.status, 0, 'an unregistered source test must fail the Final CI preflight');
  assert.deepStrictEqual(unregisteredSourceResult.calls, [], 'an unregistered source test must cause zero clasp push and run calls');
  assert.match(unregisteredSourceResult.output, /source test function is not registered in manifest/);
  assert.match(unregisteredSourceResult.output, /test_unregistered_manifest_fixture_/);

  const tampered = cloneSelection(selected);
  tampered.suiteDetails[0].entryPoint = SELECTED_SUITE_DEFINITIONS.find(
    (definition) => definition.area === 'output',
  ).entryPoint;
  const tamperedResult = runGasShellSelectionFixture(tampered);
  assert.notStrictEqual(tamperedResult.status, 0, 'tampered selection JSON must fail');
  assert.deepStrictEqual(tamperedResult.calls, [], 'tampered selection JSON must fail before clasp push or run');
  assert.match(tamperedResult.output, /Invalid GAS test selection/);
  assert.match(tamperedResult.output, /suite detail does not match the canonical definition/);
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
checkSelectedSourceAudit();
checkSelectionPayloadValidation();
checkExactGitDiffInput();
checkSourceDefinitionCollection();
checkTemplateLiteralDefinitionCollection();
checkRegularExpressionAndDivisionDefinitionCollection();
checkSourceManifestMismatchFixtures();
checkGasRunnerContract();
checkWorkflowAndShellContract();
checkShellSelectionValidation();
checkFinalCiContracts();
console.log('gas test selection ok');
