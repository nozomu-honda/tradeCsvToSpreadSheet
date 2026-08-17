#!/usr/bin/env node
'use strict';

const {
  ALL_IMPACT_AREAS,
  FULL_SUITE_DEFINITIONS,
  SELECTED_SUITE_DEFINITIONS,
} = require('./gas-test-suite-manifest');

const SELECTION_FIELDS = Object.freeze([
  'changedFiles',
  'fullFallbackReason',
  'impactAreas',
  'mode',
  'omittedAreas',
  'schemaVersion',
  'suiteDetails',
  'suites',
  'testCount',
]);
const SUITE_DETAIL_FIELDS = Object.freeze(['area', 'entryPoint', 'name', 'testCount']);
const ALL_SUITE_DEFINITIONS = Object.freeze([
  ...SELECTED_SUITE_DEFINITIONS,
  ...FULL_SUITE_DEFINITIONS,
]);
const ALL_SUITE_NAMES = new Set(ALL_SUITE_DEFINITIONS.map((definition) => definition.name));
const ALL_ENTRY_POINTS = new Set(ALL_SUITE_DEFINITIONS.map((definition) => definition.entryPoint));

const PATH_RULES = Object.freeze({
  'src/app/parser.gs': selected('parser-input', 'database', 'staging-import'),
  'src/app/db.gs': selected('database', 'output'),
  'src/app/builder.gs': selected('trade-calculation', 'output'),
  'src/app/writer.gs': selected('output'),
  'src/app/reorder_output_sheets.gs': selected('output'),
  'src/app/e2e_helpers.gs': full('E2E helper spans E2E preparation, cleanup, output, and database state'),

  'src/test/test_input_reader.gs': selected('parser-input'),
  'src/test/test_db.gs': selected('database'),
  'src/test/test_staging_sheet.gs': selected('staging-import'),
  'src/test/test_test_db_validation_bypass.gs': selected('database'),
  'src/test/test_trade_rows.gs': selected('trade-calculation'),
  'src/test/test_trade_rows_distribution_fix.gs': selected('trade-calculation'),
  'src/test/test_output_split.gs': selected('output'),
  'src/test/test_rakuten_output_cell_comparison.gs': selected('output'),
  'src/test/test_writer.gs': selected('output'),
  'src/test/test_rakuten_phase1.gs': selected('broker-import'),
  'src/test/test_e2e_helpers.gs': selected('e2e-support'),
  'src/test/test_20260526_changes.gs': selected('trade-calculation'),
  'src/test/test_20260529_changes.gs': selected('trade-calculation', 'staging-import'),
  'src/test/test_20260529_highlight_fix.gs': selected('staging-import'),
  'src/test/test_date_shift_20260603.gs': selected('parser-input', 'database'),

  'src/app/config.gs': full('shared configuration changed'),
  'src/app/db_config.gs': full('shared database configuration changed'),
  'src/app/e2e_runtime_support.gs': full('shared runtime support changed'),
  'src/app/import.gs': full('shared import orchestration changed'),
  'src/app/script_properties.gs': full('shared script properties changed'),
  'src/app/source_routing_rakuten_phase1.gs': full('shared source routing changed'),
  'src/app/utils.gs': full('shared utility changed'),
  'src/app/web.gs': full('shared Web entry point changed'),
  'src/test/test_runner.gs': full('GAS test runner changed'),
  'src/test/test_support_helpers.gs': full('shared GAS test helper changed'),
  'src/test/test_temp_db_helpers.gs': full('shared temporary DB test helper changed'),
  'src/test/test_temp_spreadsheet_helpers.gs': full('shared temporary Spreadsheet test helper changed'),
});

const DOCS_EXACT_PATHS = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'src/app/README.md',
  'src/test/README.md',
]);

function selected(...areas) {
  return Object.freeze({ kind: 'selected', areas: Object.freeze(areas) });
}

function full(reason) {
  return Object.freeze({ kind: 'full', reason });
}

function normalizeRepositoryPath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('changed file path is invalid');
  }
  if (/[\u0000-\u001f\u007f]/.test(filePath)) {
    throw new Error('changed file path contains control characters');
  }
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    normalized.startsWith('/')
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized.includes('/../')
  ) {
    throw new Error('changed file path is invalid');
  }
  return normalized;
}

function isDocsPath(filePath) {
  return filePath.startsWith('docs/') || DOCS_EXACT_PATHS.has(filePath);
}

function classifyPath(filePath) {
  if (isDocsPath(filePath)) {
    return { kind: 'ignore' };
  }
  if (PATH_RULES[filePath]) {
    return PATH_RULES[filePath];
  }
  if (filePath.startsWith('src/app/')) {
    return full('unknown src/app file changed');
  }
  if (filePath.startsWith('src/test/')) {
    return full('unmapped src/test file changed');
  }
  if (
    filePath.startsWith('.github/workflows/')
    || filePath.startsWith('scripts/ci/')
    || filePath.startsWith('scripts/')
  ) {
    return full('workflow or CI script changed');
  }
  if (
    filePath === 'package.json'
    || filePath === 'package-lock.json'
    || filePath === 'appsscript.json'
    || filePath === 'Index.html'
    || filePath === 'playwright.config.js'
    || filePath.startsWith('.clasp')
    || filePath.startsWith('tests/e2e/')
  ) {
    return full('dependency, manifest, clasp, or Web E2E boundary changed');
  }
  return full('unclassified repository path changed');
}

function selectGasTestsByChangedFiles(changedFiles, options = {}) {
  let normalizedFiles;
  try {
    if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
      return buildFullResult([], [], 'changed file list is missing or empty');
    }
    normalizedFiles = [...new Set(changedFiles.map(normalizeRepositoryPath))].sort();
  } catch (error) {
    return buildFullResult([], [], 'impact classification failed');
  }

  if (options.forceFull === true) {
    return buildFullResult(normalizedFiles, [], 'full test execution was explicitly requested');
  }

  const impactAreas = new Set();
  let fallbackReason = '';
  for (const filePath of normalizedFiles) {
    let rule;
    try {
      rule = classifyPath(filePath);
    } catch (error) {
      fallbackReason = 'impact classification failed';
      break;
    }
    if (rule.kind === 'selected') {
      rule.areas.forEach((area) => impactAreas.add(area));
    } else if (rule.kind === 'full') {
      fallbackReason = rule.reason;
      break;
    }
  }

  const orderedAreas = ALL_IMPACT_AREAS.filter((area) => impactAreas.has(area));
  if (fallbackReason) {
    return buildFullResult(normalizedFiles, orderedAreas, fallbackReason);
  }

  const selectedSuites = SELECTED_SUITE_DEFINITIONS.filter((definition) => impactAreas.has(definition.area));
  if (selectedSuites.length === 0) {
    return buildFullResult(normalizedFiles, orderedAreas, 'no GAS test suite was selected');
  }

  return buildResult({
    mode: 'selected',
    changedFiles: normalizedFiles,
    impactAreas: orderedAreas,
    suites: selectedSuites,
    omittedAreas: ALL_IMPACT_AREAS.filter((area) => !impactAreas.has(area)),
    fullFallbackReason: null,
  });
}

function buildFullResult(changedFiles, impactAreas, reason) {
  return buildResult({
    mode: 'full',
    changedFiles,
    impactAreas,
    suites: FULL_SUITE_DEFINITIONS,
    omittedAreas: [],
    fullFallbackReason: reason,
  });
}

function createFullGasTestSelection(changedFiles, reason) {
  let normalizedFiles = [];
  try {
    normalizedFiles = Array.isArray(changedFiles)
      ? [...new Set(changedFiles.map(normalizeRepositoryPath))].sort()
      : [];
  } catch (error) {
    normalizedFiles = [];
  }
  return buildFullResult(normalizedFiles, [], reason || 'full GAS Tests were requested');
}

function buildResult({ mode, changedFiles, impactAreas, suites, omittedAreas, fullFallbackReason }) {
  return {
    schemaVersion: 1,
    mode,
    changedFiles: [...changedFiles],
    impactAreas: [...impactAreas],
    suites: suites.map((definition) => definition.name),
    suiteDetails: suites.map((definition) => ({
      name: definition.name,
      area: definition.area,
      entryPoint: definition.entryPoint,
      testCount: definition.testCount,
    })),
    testCount: suites.reduce((total, definition) => total + definition.testCount, 0),
    omittedAreas: [...omittedAreas],
    fullFallbackReason,
  };
}

function selectionValidationError(reason) {
  return new Error(`GAS test selection validation failed: ${reason}`);
}

function assertExactObjectFields(value, expectedFields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw selectionValidationError(`${label} is invalid`);
  }
  const actualFields = Object.keys(value).sort();
  if (!arraysEqual(actualFields, expectedFields)) {
    throw selectionValidationError(`${label} fields are invalid`);
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw selectionValidationError(`${label} is invalid`);
  }
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw selectionValidationError(`${label} contains duplicates`);
  }
}

function assertExactArray(actual, expected, label) {
  if (!arraysEqual(actual, expected)) {
    throw selectionValidationError(`${label} does not match the canonical definition`);
  }
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateAndResolveGasTestSelection(selection) {
  assertExactObjectFields(selection, SELECTION_FIELDS, 'selection');
  if (selection.schemaVersion !== 1) {
    throw selectionValidationError('schema version is invalid');
  }
  if (!['selected', 'full'].includes(selection.mode)) {
    throw selectionValidationError('mode is invalid');
  }

  assertStringArray(selection.changedFiles, 'changed files');
  assertUnique(selection.changedFiles, 'changed files');
  const normalizedFiles = selection.changedFiles.map(normalizeRepositoryPath);
  assertExactArray(selection.changedFiles, [...normalizedFiles].sort(), 'changed files');

  assertStringArray(selection.impactAreas, 'impact areas');
  assertUnique(selection.impactAreas, 'impact areas');
  if (selection.impactAreas.some((area) => !ALL_IMPACT_AREAS.includes(area))) {
    throw selectionValidationError('impact areas contain an unknown area');
  }
  assertExactArray(
    selection.impactAreas,
    ALL_IMPACT_AREAS.filter((area) => selection.impactAreas.includes(area)),
    'impact areas',
  );

  assertStringArray(selection.suites, 'suites');
  assertUnique(selection.suites, 'suites');
  if (selection.suites.some((name) => !ALL_SUITE_NAMES.has(name))) {
    throw selectionValidationError('suites contain an unknown suite');
  }
  if (!Array.isArray(selection.suiteDetails) || selection.suiteDetails.length === 0) {
    throw selectionValidationError('suite details are invalid');
  }

  const detailNames = [];
  const detailEntryPoints = [];
  for (const detail of selection.suiteDetails) {
    assertExactObjectFields(detail, SUITE_DETAIL_FIELDS, 'suite detail');
    if (typeof detail.name !== 'string' || !detail.name) {
      throw selectionValidationError('suite detail name is invalid');
    }
    if (typeof detail.area !== 'string' || !detail.area) {
      throw selectionValidationError('suite detail area is invalid');
    }
    if (typeof detail.entryPoint !== 'string' || !detail.entryPoint) {
      throw selectionValidationError('suite detail entry point is invalid');
    }
    if (!Number.isInteger(detail.testCount) || detail.testCount <= 0) {
      throw selectionValidationError('suite detail test count is invalid');
    }
    if (!ALL_SUITE_NAMES.has(detail.name)) {
      throw selectionValidationError('suite details contain an unknown suite');
    }
    if (!ALL_ENTRY_POINTS.has(detail.entryPoint)) {
      throw selectionValidationError('suite details contain an unknown entry point');
    }
    detailNames.push(detail.name);
    detailEntryPoints.push(detail.entryPoint);
  }
  assertUnique(detailNames, 'suite detail names');
  assertUnique(detailEntryPoints, 'suite detail entry points');

  let expectedDefinitions;
  let resolved;
  if (selection.mode === 'selected') {
    if (selection.fullFallbackReason !== null) {
      throw selectionValidationError('selected mode fallback reason is invalid');
    }
    const selectedFromChangedFiles = selectGasTestsByChangedFiles(selection.changedFiles);
    if (selectedFromChangedFiles.mode !== 'selected') {
      throw selectionValidationError('selected mode does not match changed files');
    }
    assertExactArray(selection.impactAreas, selectedFromChangedFiles.impactAreas, 'selected impact areas');
    assertStringArray(selection.omittedAreas, 'omitted areas');
    assertUnique(selection.omittedAreas, 'omitted areas');
    assertExactArray(selection.omittedAreas, selectedFromChangedFiles.omittedAreas, 'omitted areas');
    expectedDefinitions = SELECTED_SUITE_DEFINITIONS.filter(
      (definition) => selection.impactAreas.includes(definition.area),
    );
    resolved = buildResult({
      mode: 'selected',
      changedFiles: normalizedFiles,
      impactAreas: selection.impactAreas,
      suites: expectedDefinitions,
      omittedAreas: selection.omittedAreas,
      fullFallbackReason: null,
    });
  } else {
    if (typeof selection.fullFallbackReason !== 'string' || !selection.fullFallbackReason.trim()) {
      throw selectionValidationError('full mode fallback reason is invalid');
    }
    assertStringArray(selection.omittedAreas, 'omitted areas');
    assertExactArray(selection.omittedAreas, [], 'omitted areas');
    expectedDefinitions = FULL_SUITE_DEFINITIONS;
    resolved = buildResult({
      mode: 'full',
      changedFiles: normalizedFiles,
      impactAreas: selection.impactAreas,
      suites: expectedDefinitions,
      omittedAreas: [],
      fullFallbackReason: selection.fullFallbackReason,
    });
  }

  const expectedNames = expectedDefinitions.map((definition) => definition.name);
  assertExactArray(selection.suites, expectedNames, 'suites');
  assertExactArray(detailNames, expectedNames, 'suite detail names');
  if (selection.suiteDetails.length !== expectedDefinitions.length) {
    throw selectionValidationError('suite detail count does not match the canonical definition');
  }
  selection.suiteDetails.forEach((detail, index) => {
    const expected = expectedDefinitions[index];
    if (
      detail.name !== expected.name
      || detail.area !== expected.area
      || detail.entryPoint !== expected.entryPoint
      || detail.testCount !== expected.testCount
    ) {
      throw selectionValidationError('suite detail does not match the canonical definition');
    }
  });
  if (!Number.isInteger(selection.testCount) || selection.testCount !== resolved.testCount) {
    throw selectionValidationError('total test count does not match the canonical definition');
  }

  return resolved;
}

module.exports = {
  ALL_IMPACT_AREAS,
  FULL_SUITE_DEFINITIONS,
  PATH_RULES,
  SELECTED_SUITE_DEFINITIONS,
  classifyPath,
  createFullGasTestSelection,
  normalizeRepositoryPath,
  selectGasTestsByChangedFiles,
  validateAndResolveGasTestSelection,
};
