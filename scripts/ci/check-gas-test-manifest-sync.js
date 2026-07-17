#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  ALL_GAS_TEST_FUNCTIONS,
  CORE_GAS_TEST_FUNCTIONS,
  FULL_SUITE_DEFINITIONS,
  SELECTED_SUITE_DEFINITIONS,
} = require('./gas-test-suite-manifest');

const rootDir = path.resolve(__dirname, '..', '..');
const defaultRunnerPath = path.join(rootDir, 'src', 'test', 'test_runner.gs');

function createGasRunnerContext(runnerSource) {
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
  return context;
}

function resultTestNames(result) {
  return [...result.matchAll(/^OK\s+(test_[A-Za-z0-9_]+)/gm)].map((match) => match[1]);
}

function assertEntryPointMatches(context, definition, label) {
  assert.strictEqual(typeof context[definition.entryPoint], 'function', `${definition.entryPoint} must remain public`);
  const result = context[definition.entryPoint]();
  assert.match(
    result,
    new RegExp(`GAS_TEST_METRICS testCount=${definition.testCount} durationMs=\\d+`),
    `${label} must report its exact test count`,
  );
  assert.deepStrictEqual(
    resultTestNames(result),
    definition.tests,
    `${label} test functions and order must match the canonical manifest`,
  );
}

function assertGasRunnerMatchesManifest(runnerSource) {
  const context = createGasRunnerContext(runnerSource);

  assert.strictEqual(typeof context.runSmokeTests, 'function', 'runSmokeTests must remain available');
  assert.strictEqual(typeof context.runAllTests, 'function', 'runAllTests must remain available');

  const allTestsResult = context.runAllTests();
  assert.match(
    allTestsResult,
    new RegExp(`GAS_TEST_METRICS testCount=${ALL_GAS_TEST_FUNCTIONS.length} durationMs=\\d+`),
  );
  assert.deepStrictEqual(
    resultTestNames(allTestsResult),
    ALL_GAS_TEST_FUNCTIONS,
    'runAllTests order must match the canonical manifest',
  );

  const smokeTestsResult = context.runSmokeTests();
  assert.match(
    smokeTestsResult,
    new RegExp(`GAS_TEST_METRICS testCount=${CORE_GAS_TEST_FUNCTIONS.length} durationMs=\\d+`),
  );
  assert.deepStrictEqual(
    resultTestNames(smokeTestsResult),
    CORE_GAS_TEST_FUNCTIONS,
    'runSmokeTests order must match the canonical manifest',
  );

  for (const definition of SELECTED_SUITE_DEFINITIONS) {
    assertEntryPointMatches(context, definition, definition.name);
  }
  for (const definition of FULL_SUITE_DEFINITIONS) {
    assertEntryPointMatches(context, definition, definition.name);
  }

  return { context, allTestsResult };
}

function verifyGasTestManifestSync(runnerPath = defaultRunnerPath) {
  return assertGasRunnerMatchesManifest(fs.readFileSync(runnerPath, 'utf8'));
}

function main() {
  try {
    verifyGasTestManifestSync();
    console.log('GAS test manifest and test_runner.gs are synchronized');
  } catch (error) {
    console.error(`GAS test manifest sync failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  assertGasRunnerMatchesManifest,
  createGasRunnerContext,
  resultTestNames,
  verifyGasTestManifestSync,
};
