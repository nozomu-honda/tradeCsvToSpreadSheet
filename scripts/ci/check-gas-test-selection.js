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
  extractTestFunctionDefinitions,
  listGasTestSourceFiles,
  resultTestNames,
  verifyGasTestManifestSync,
} = require('./check-gas-test-manifest-sync');
const { auditSelectedTestFileMappings } = require('./check-gas-test-file-mappings');
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
const REMOVED_LEGACY_TESTS = Object.freeze([
  'test_stockConversionBuy_updatesHoldingAndAvg_',
  'test_buildTradeRows_bookValue_foreignBuy_multipliesFeeTaxByRate_20260515_',
  'test_applyStagingManualHighlights_fundCashInAndReinvest_20260526_',
]);
const CURRENT_SUCCESSOR_TESTS = Object.freeze([
  'test_buildTradeRows_avgUnitPrice_updatesOnStockConversionBuy_20260526_',
  'test_buildTradeRows_bookValue_foreignBuy_minusFeeTaxOnly_20260529_',
  'test_applyStagingManualHighlights_fundBuyAndReinvest_20260529_',
  'test_applyStagingManualHighlights_fundSellBuyBuybackAndReinvest_20260529_',
]);

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
  assert.strictEqual(selection.testCount, 117);
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
    ['src/test/test_test_db_validation_bypass.gs'],
    ['database'],
    ['database-01', 'database-02', 'database-03'],
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
  assert.strictEqual(selectedTestCount, 117, 'selected suites must cover every full GAS test exactly once');
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

function checkSelectedTestFileMappingAudit() {
  const summaries = auditSelectedTestFileMappings();
  const expectedMappedTestFiles = Object.entries(PATH_RULES)
    .filter(([filePath, rule]) => filePath.startsWith('src/test/') && rule.kind === 'selected')
    .map(([filePath]) => filePath)
    .sort((leftPath, rightPath) => leftPath.localeCompare(rightPath));
  assert.deepStrictEqual(
    summaries.map((summary) => summary.filePath),
    expectedMappedTestFiles,
    'every selected src/test mapping must be audited exactly once',
  );
  const validationBypass = summaries.find(
    (summary) => summary.filePath === 'src/test/test_test_db_validation_bypass.gs',
  );
  assert.deepStrictEqual(validationBypass.actualAreas, ['database']);
  assert.deepStrictEqual(validationBypass.mappedAreas, ['database']);
  assert.deepStrictEqual(validationBypass.testNames, [
    'test_createSpreadsheetFromSourceSpreadsheetUsingDb_testDb_skipsManualValidation_',
    'test_shouldSkipRequiredManualValidationForTarget_normalDb_false_',
    'test_shouldSkipRequiredManualValidationForTarget_testDb_true_',
  ]);

  const fixturePath = 'src/test/test_mapping_audit_fixture.gs';
  const databaseTest = 'test_mapping_audit_database_fixture_';
  const stagingTest = 'test_mapping_audit_staging_fixture_';
  const fixtureManifest = [
    { name: databaseTest, area: 'database' },
    { name: stagingTest, area: 'staging-import' },
  ];
  const readFixture = (source) => () => source;

  assert.throws(
    () => auditSelectedTestFileMappings({
      pathRules: { [fixturePath]: { kind: 'selected', areas: ['staging-import'] } },
      manifest: fixtureManifest,
      readSource: readFixture(`function ${databaseTest}() {}`),
    }),
    /missing manifest areas: src\/test\/test_mapping_audit_fixture\.gs \(missing: database; mapped: staging-import\)/,
    'a database test mapped only to staging-import must fail the audit',
  );

  const multiAreaSource = [
    `function ${databaseTest}() {}`,
    `function ${stagingTest}() {}`,
  ].join('\n');
  assert.throws(
    () => auditSelectedTestFileMappings({
      pathRules: { [fixturePath]: { kind: 'selected', areas: ['database'] } },
      manifest: fixtureManifest,
      readSource: readFixture(multiAreaSource),
    }),
    /missing manifest areas: .*missing: staging-import; mapped: database/,
    'a multi-area test file with a missing mapped area must fail the audit',
  );
  assert.deepStrictEqual(
    auditSelectedTestFileMappings({
      pathRules: { [fixturePath]: { kind: 'selected', areas: ['database', 'staging-import'] } },
      manifest: fixtureManifest,
      readSource: readFixture(multiAreaSource),
    })[0].actualAreas,
    ['database', 'staging-import'],
    'a mapping that covers every manifest area must pass the audit',
  );
  const localHelpersSummary = auditSelectedTestFileMappings({
    pathRules: { [fixturePath]: { kind: 'selected', areas: ['database'] } },
    manifest: fixtureManifest,
    readSource: readFixture([
      `function ${databaseTest}() {`,
      '  function test_mapping_audit_nested_local_() {}',
      '}',
      'const callback = function test_mapping_audit_named_expression_local_() {};',
      'consume(function test_mapping_audit_callback_local_() {});',
    ].join('\n')),
  })[0];
  assert.deepStrictEqual(localHelpersSummary.actualAreas, ['database']);
  assert.deepStrictEqual(
    localHelpersSummary.testNames,
    [databaseTest],
    'mapped file areas must be derived only from top-level GAS test declarations',
  );
  assert.throws(
    () => auditSelectedTestFileMappings({
      pathRules: { [fixturePath]: { kind: 'selected', areas: ['database'] } },
      manifest: fixtureManifest,
      readSource: readFixture('// no test definitions\n'),
    }),
    /selected test file has no test function definitions/,
    'selected test mappings without real tests must fail closed',
  );
  assert.throws(
    () => auditSelectedTestFileMappings({
      pathRules: { [fixturePath]: { kind: 'selected', areas: ['database'] } },
      manifest: fixtureManifest,
      readSource: readFixture('function test_mapping_audit_unregistered_fixture_() {}'),
    }),
    /source test not registered in manifest/,
    'selected test files with unregistered source tests must fail closed',
  );
  assert.throws(
    () => auditSelectedTestFileMappings({
      pathRules: { [fixturePath]: { kind: 'selected', areas: ['database'] } },
      manifest: fixtureManifest,
      readSource() {
        throw new Error('fixture file missing');
      },
    }),
    /selected test file cannot be read: src\/test\/test_mapping_audit_fixture\.gs/,
    'missing selected test files must fail closed',
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

function checkTopLevelSourceDefinitionCollection() {
  const fixtureSource = [
    'function test_top_level_real_() {',
    '  function test_nested_local_() {}',
    '}',
    'const namedExpression = function test_named_expression_local_() {};',
    'consume(function test_callback_local_() {});',
    'const templateValue = `${(() => {',
    '  return function test_template_local_() {};',
    '})()}`;',
    'const fixture = {',
    '  test_object_method_() {},',
    '};',
    'class Fixture {',
    '  test_class_method_() {}',
    '}',
    'const test_arrow_local_ = () => {};',
    '',
  ].join('\n');

  assert.deepStrictEqual(
    extractTestFunctionDefinitions(fixtureSource, 'src/test/test_top_level_fixture.gs'),
    [{
      name: 'test_top_level_real_',
      filePath: 'src/test/test_top_level_fixture.gs',
      line: 1,
    }],
    'only top-level function test_* declarations can be GAS test entry points',
  );

  const helperFixtureSource = [
    'async function asyncHelper_() {}',
    'function* generatorHelper_() {}',
    'async function* asyncGeneratorHelper_() {}',
    'function test_sync_with_nested_helpers_() {',
    '  async function test_nested_async_local_() {}',
    '  function* test_nested_generator_local_() {}',
    '  async function* test_nested_async_generator_local_() {}',
    '}',
    '',
  ].join('\n');
  assert.deepStrictEqual(
    extractTestFunctionDefinitions(helperFixtureSource, 'src/test/test_helper_forms_fixture.gs'),
    [{
      name: 'test_sync_with_nested_helpers_',
      filePath: 'src/test/test_helper_forms_fixture.gs',
      line: 4,
    }],
    'non-test async/generator helpers and nested test-like helpers must be ignored',
  );

  for (const fixture of [
    {
      name: 'test_async_example_',
      source: 'async function test_async_example_() {}\n',
    },
    {
      name: 'test_generator_example_',
      source: 'function* test_generator_example_() {}\n',
    },
    {
      name: 'test_async_generator_example_',
      source: 'async function* test_async_generator_example_() {}\n',
    },
  ]) {
    assert.throws(
      () => extractTestFunctionDefinitions(fixture.source, 'src/test/test_unsupported_fixture.gs'),
      new RegExp(
        `unsupported GAS test declaration: ${fixture.name} ` +
        '\\(src/test/test_unsupported_fixture\\.gs:1\\): async/generator tests are not supported',
      ),
      `${fixture.name} must fail the GAS test source preflight`,
    );
  }
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
        { name: 'test_real_after_templates_fixture_', line: 24 },
      ],
      'template bodies and local function expressions must be ignored while later top-level declarations remain visible',
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

function checkRemovedLegacyTestsStayRemoved(runnerSource, sourceDefinitions) {
  const sourceNames = sourceDefinitions.map((definition) => definition.name);
  for (const successorTest of CURRENT_SUCCESSOR_TESTS) {
    assert.ok(sourceNames.includes(successorTest), `${successorTest} must remain defined in source`);
    assert.ok(ALL_GAS_TEST_FUNCTIONS.includes(successorTest), `${successorTest} must remain registered in manifest`);
    assert.ok(runnerSource.includes(successorTest), `${successorTest} must remain registered in test_runner.gs`);
  }

  for (const legacyTest of REMOVED_LEGACY_TESTS) {
    assert.ok(!sourceNames.includes(legacyTest), `${legacyTest} must not remain defined in source`);
    assert.ok(!ALL_GAS_TEST_FUNCTIONS.includes(legacyTest), `${legacyTest} must not remain registered in manifest`);
    assert.ok(!runnerSource.includes(legacyTest), `${legacyTest} must not remain registered in test_runner.gs`);

    withTestSourceFixture({
      'src/test/test_removed_legacy_fixture.gs': `function ${legacyTest}() {}\n`,
      'src/test/test_runner.gs': '',
    }, ({ repositoryRoot, runnerPath, testRoot }) => {
      const definitions = collectTestFunctionDefinitions({ repositoryRoot, runnerPath, testRoot });
      assert.throws(
        () => assertSourceDefinitionsMatchManifest(definitions, []),
        new RegExp(`source test function is not registered in manifest: ${legacyTest}`),
        `${legacyTest} reintroduced only in source must fail manifest sync`,
      );
    });

    assert.throws(
      () => assertSourceDefinitionsMatchManifest(sourceDefinitions, [
        ...ALL_GAS_TEST_FUNCTIONS,
        legacyTest,
      ]),
      new RegExp(`manifest test function has no source definition: ${legacyTest}`),
      `${legacyTest} reintroduced only in manifest must fail source sync`,
    );

    const runnerOnly = mutateRunnerArray(
      runnerSource,
      'CORE_TESTS_',
      (body) => `${body}  ${legacyTest},\n`,
    );
    assert.throws(
      () => assertGasRunnerMatchesManifest(runnerOnly),
      /GAS_TEST_METRICS testCount=117|runAllTests order must match the canonical manifest/,
      `${legacyTest} reintroduced only in the runner must fail manifest sync`,
    );

    const batchDeclaration = 'const GAS_TEST_BATCHES_ = buildGasTestBatches_(ALL_GAS_TESTS_, GAS_TEST_BATCH_SIZE_);';
    assert.ok(runnerSource.includes(batchDeclaration), 'full batch declaration must exist in test_runner.gs');
    const fullBatchOnly = runnerSource.replace(
      batchDeclaration,
      `${batchDeclaration}\nGAS_TEST_BATCHES_[GAS_TEST_BATCHES_.length - 1].tests.push(${legacyTest});`,
    );
    assert.throws(
      () => assertGasRunnerMatchesManifest(fullBatchOnly),
      /GASテストバッチ定義が不正/,
      `${legacyTest} reintroduced only in a full batch must fail batch validation`,
    );
  }
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
  assert.strictEqual(sourceTestCount, 117, 'the repository must define exactly 117 canonical GAS tests');
  assert.strictEqual(GAS_TEST_MANIFEST.length, 117, 'the canonical manifest test count must remain explicit');
  assert.deepStrictEqual(
    FULL_SUITE_DEFINITIONS.map((definition) => definition.testCount),
    [13, 13, 13, 13, 13, 13, 13, 13, 13],
    'the 117 canonical tests must remain split into nine non-empty full batches without reordering',
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

  assert.ok(!/\beval\s*\(/.test(runnerSource), 'GAS test selection must not use eval');
  checkRemovedLegacyTestsStayRemoved(runnerSource, sourceDefinitions);
  checkGasRunnerManifestTampering(runnerSource);
}

function checkWorkflowAndShellContract() {
  const workflow = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'final-ci-heavy.yml'), 'utf8');
  const runScript = fs.readFileSync(path.join(rootDir, 'scripts', 'ci', 'run-gas-tests.sh'), 'utf8');
  const gasJob = workflow.slice(workflow.indexOf('  gas-tests:'), workflow.indexOf('  gas-web-e2e:'));

  for (const expected of [
    'Verify GAS test source, manifest, and runner sync',
    'node scripts/ci/check-gas-test-manifest-sync.js',
    'Verify mapped GAS test file areas',
    'node scripts/ci/check-gas-test-file-mappings.js',
    'Install GAS CI dependencies',
    'npm ci --ignore-scripts',
    'node_modules/.bin:${PATH}',
    'MANIFEST_SYNC_OUTCOME: ${{ steps.gas_manifest_sync.outcome }}',
    'TEST_FILE_MAPPINGS_OUTCOME: ${{ steps.gas_test_file_mappings.outcome }}',
    'GAS test file mappings do not cover their manifest areas',
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
  const testFileMappingsIndex = gasJob.indexOf('id: gas_test_file_mappings');
  const selectionIndex = gasJob.indexOf('id: select_gas_tests');
  const runIndex = gasJob.indexOf('id: run_gas_tests');
  assert.ok(
    headGuardIndex < installIndex &&
      installIndex < manifestSyncIndex &&
      manifestSyncIndex < testFileMappingsIndex &&
      testFileMappingsIndex < selectionIndex &&
      testFileMappingsIndex < runIndex,
    'manifest and mapped test file preflights must run after the head guard and dependencies but before selection and push',
  );
  assert.ok(
    !runScript.includes('check-gas-test-manifest-sync.js'),
    'the GAS shell must not recursively invoke the workflow manifest sync preflight',
  );
  assert.ok(
    !runScript.includes('check-gas-test-file-mappings.js'),
    'the GAS shell must not recursively invoke the mapped test file preflight',
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
      'scripts/ci/check-gas-test-file-mappings.js',
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
    if (options.mutateSelectionSource) {
      const selectionSourcePath = path.join(tempRoot, 'scripts', 'ci', 'gas-test-selection.js');
      const selectionSource = fs.readFileSync(selectionSourcePath, 'utf8');
      const mutatedSource = options.mutateSelectionSource(selectionSource);
      assert.notStrictEqual(mutatedSource, selectionSource, 'selection source fixture mutation must change the file');
      fs.writeFileSync(selectionSourcePath, mutatedSource);
    }
    for (const [relativePath, source] of Object.entries(options.extraTestFiles || {})) {
      assert.match(relativePath, /^src[\\/]test[\\/].+\.gs$/, 'extra fixture files must stay under src/test');
      const targetPath = path.join(tempRoot, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, source);
    }
    fs.writeFileSync(path.join(tempRoot, 'selection.json'), `${JSON.stringify(selection, null, 2)}\n`);
    const fakeClaspPath = path.join(tempRoot, 'node_modules', '.bin', 'clasp');
    fs.mkdirSync(path.dirname(fakeClaspPath), { recursive: true });
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
node scripts/ci/check-gas-test-file-mappings.js
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
  assert.strictEqual(selected.testCount, 51, 'parser.gs must select 15 parser, 29 database, and 7 staging tests');
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

  const localHelpersResult = runGasShellSelectionFixture(selected, {
    extraTestFiles: {
      'src/test/test_local_helpers_fixture.gs': [
        'function localContainer_() {',
        '  function test_nested_local_fixture_() {}',
        '}',
        'const namedExpression = function test_named_expression_local_fixture_() {};',
        'consume(function test_callback_local_fixture_() {});',
        'const templateValue = `${(() => {',
        '  return function test_template_local_fixture_() {};',
        '})()}`;',
        '',
      ].join('\n'),
    },
  });
  assertSuccessfulShellFixture(localHelpersResult, 'selected with local test-like helpers');
  assert.deepStrictEqual(
    claspRunFunctions(localHelpersResult.calls),
    selected.suiteDetails.map((detail) => detail.entryPoint),
    'local test-like helpers must not change selected GAS entry points',
  );

  const validationBypassSelection = selectGasTestsByChangedFiles([
    'src/test/test_test_db_validation_bypass.gs',
  ]);
  assert.strictEqual(validationBypassSelection.mode, 'selected');
  assert.deepStrictEqual(validationBypassSelection.impactAreas, ['database']);
  assert.deepStrictEqual(
    validationBypassSelection.suites,
    ['database-01', 'database-02', 'database-03'],
  );
  assert.strictEqual(validationBypassSelection.testCount, 29);
  assert.ok(!validationBypassSelection.suites.includes('staging-import'));
  const validationBypassSelectedTests = SELECTED_SUITE_DEFINITIONS
    .filter((definition) => validationBypassSelection.suites.includes(definition.name))
    .flatMap((definition) => definition.tests);
  for (const expectedTest of [
    'test_shouldSkipRequiredManualValidationForTarget_testDb_true_',
    'test_shouldSkipRequiredManualValidationForTarget_normalDb_false_',
    'test_createSpreadsheetFromSourceSpreadsheetUsingDb_testDb_skipsManualValidation_',
  ]) {
    assert.ok(
      validationBypassSelectedTests.includes(expectedTest),
      `${expectedTest} must run when the validation bypass test file changes`,
    );
  }
  const validationBypassResult = runGasShellSelectionFixture(validationBypassSelection);
  assertSuccessfulShellFixture(validationBypassResult, 'validation bypass selected');
  const databaseEntryPoints = SELECTED_SUITE_DEFINITIONS
    .filter((definition) => definition.area === 'database')
    .map((definition) => definition.entryPoint);
  assert.deepStrictEqual(
    claspRunFunctions(validationBypassResult.calls),
    databaseEntryPoints,
    'the validation bypass test file must execute only the three database entry points',
  );
  assert.ok(
    !claspRunFunctions(validationBypassResult.calls).includes('runGasTestSuiteStagingImport'),
    'the validation bypass test file must not execute the staging-import entry point',
  );

  const areaMismatchResult = runGasShellSelectionFixture(validationBypassSelection, {
    mutateSelectionSource(source) {
      const expected = "'src/test/test_test_db_validation_bypass.gs': selected('database')";
      assert.ok(source.includes(expected), 'validation bypass mapping fixture must exist');
      return source.replace(expected, "'src/test/test_test_db_validation_bypass.gs': selected('staging-import')");
    },
  });
  assert.notStrictEqual(areaMismatchResult.status, 0, 'a mapped area mismatch must fail the preflight');
  assert.deepStrictEqual(areaMismatchResult.calls, [], 'a mapped area mismatch must cause zero clasp push and run calls');
  assert.match(areaMismatchResult.output, /GAS test file mapping audit failed/);
  assert.match(
    areaMismatchResult.output,
    /test_test_db_validation_bypass\.gs \(missing: database; mapped: staging-import\)/,
  );

  const multiAreaMismatchResult = runGasShellSelectionFixture(validationBypassSelection, {
    mutateSelectionSource(source) {
      const expected = "'src/test/test_20260529_changes.gs': selected('trade-calculation', 'staging-import')";
      assert.ok(source.includes(expected), 'multi-area mapping fixture must exist');
      return source.replace(expected, "'src/test/test_20260529_changes.gs': selected('trade-calculation')");
    },
  });
  assert.notStrictEqual(multiAreaMismatchResult.status, 0, 'a partial multi-area mapping must fail the preflight');
  assert.deepStrictEqual(
    multiAreaMismatchResult.calls,
    [],
    'a partial multi-area mapping must cause zero clasp push and run calls',
  );
  assert.match(multiAreaMismatchResult.output, /missing: staging-import; mapped: trade-calculation/);

  const zeroTestResult = runGasShellSelectionFixture(validationBypassSelection, {
    extraTestFiles: {
      'src/test/test_test_db_validation_bypass.gs': '// no test definitions\n',
    },
  });
  assert.notStrictEqual(zeroTestResult.status, 0, 'a mapped test file with zero tests must fail the preflight');
  assert.deepStrictEqual(zeroTestResult.calls, [], 'a zero-test file must cause zero clasp push and run calls');
  assert.match(zeroTestResult.output, /manifest test function has no source definition/);

  const full = selectGasTestsByChangedFiles(['scripts/ci/run-gas-tests.sh'], { forceFull: true });
  const fullResult = runGasShellSelectionFixture(full);
  assertSuccessfulShellFixture(fullResult, 'full');
  assert.deepStrictEqual(
    claspRunFunctions(fullResult.calls),
    FULL_SUITE_DEFINITIONS.map((definition) => definition.entryPoint),
    'full execution must run only canonical full batch entry points in order',
  );
  assert.match(fullResult.summary, /Mode: `full`/);
  assert.match(fullResult.summary, /Expected tests: `117`/);
  assert.match(fullResult.summary, /All selected GAS test functions passed \(117 tests/);
  assert.strictEqual(FULL_SUITE_DEFINITIONS.length, 9, 'full mode must retain nine batches');

  const legacySourceResult = runGasShellSelectionFixture(selected, {
    extraTestFiles: {
      'src/test/test_removed_legacy_shell_fixture.gs': REMOVED_LEGACY_TESTS
        .map((name) => `function ${name}() {}`)
        .join('\n'),
    },
  });
  assert.notStrictEqual(legacySourceResult.status, 0, 'reintroduced legacy source tests must fail preflight');
  assert.deepStrictEqual(
    legacySourceResult.calls,
    [],
    'reintroduced legacy source tests must cause zero clasp push and run calls',
  );
  for (const legacyTest of REMOVED_LEGACY_TESTS) {
    assert.match(legacySourceResult.output, new RegExp(legacyTest));
  }

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

  for (const unsupportedFixture of [
    {
      label: 'async',
      name: 'test_async_shell_fixture_',
      source: 'async function test_async_shell_fixture_() {}\n',
    },
    {
      label: 'generator',
      name: 'test_generator_shell_fixture_',
      source: 'function* test_generator_shell_fixture_() {}\n',
    },
    {
      label: 'async generator',
      name: 'test_async_generator_shell_fixture_',
      source: 'async function* test_async_generator_shell_fixture_() {}\n',
    },
  ]) {
    const unsupportedResult = runGasShellSelectionFixture(selected, {
      extraTestFiles: {
        [`src/test/test_${unsupportedFixture.label.replace(/ /g, '_')}_shell_fixture.gs`]: unsupportedFixture.source,
      },
    });
    assert.notStrictEqual(
      unsupportedResult.status,
      0,
      `${unsupportedFixture.label} GAS test declarations must fail the Final CI preflight`,
    );
    assert.deepStrictEqual(
      unsupportedResult.calls,
      [],
      `${unsupportedFixture.label} GAS test declarations must cause zero clasp push and run calls`,
    );
    assert.match(unsupportedResult.output, /unsupported GAS test declaration/);
    assert.match(unsupportedResult.output, new RegExp(unsupportedFixture.name));
    assert.match(unsupportedResult.output, /async\/generator tests are not supported/);
  }

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
checkSelectedTestFileMappingAudit();
checkSelectionPayloadValidation();
checkExactGitDiffInput();
checkSourceDefinitionCollection();
checkTopLevelSourceDefinitionCollection();
checkTemplateLiteralDefinitionCollection();
checkRegularExpressionAndDivisionDefinitionCollection();
checkSourceManifestMismatchFixtures();
checkGasRunnerContract();
checkWorkflowAndShellContract();
checkShellSelectionValidation();
checkFinalCiContracts();
console.log('gas test selection ok');
