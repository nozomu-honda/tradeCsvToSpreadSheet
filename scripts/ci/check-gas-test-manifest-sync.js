#!/usr/bin/env node
'use strict';

const assert = require('assert');
const acorn = require('acorn');
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
const defaultTestRoot = path.join(rootDir, 'src', 'test');
const TEST_FUNCTION_NAME_PATTERN = /^test_[A-Za-z0-9_]+$/;

function toRepositoryPath(repositoryRoot, filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join('/');
}

function extractTestFunctionDefinitions(source, filePath) {
  let program;
  try {
    program = acorn.parse(source, {
      ecmaVersion: 'latest',
      locations: true,
      sourceType: 'script',
    });
  } catch (error) {
    const location = error && error.loc ? `:${error.loc.line}:${error.loc.column + 1}` : '';
    throw new Error(`unable to parse GAS test source: ${filePath}${location}`);
  }

  const definitions = [];
  const pendingNodes = [program];
  while (pendingNodes.length > 0) {
    const node = pendingNodes.pop();
    if (
      (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') &&
      node.id &&
      node.id.type === 'Identifier' &&
      TEST_FUNCTION_NAME_PATTERN.test(node.id.name)
    ) {
      definitions.push({
        filePath,
        line: node.loc.start.line,
        name: node.id.name,
      });
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index -= 1) {
          if (value[index] && typeof value[index].type === 'string') pendingNodes.push(value[index]);
        }
      } else if (value && typeof value.type === 'string') {
        pendingNodes.push(value);
      }
    }
  }
  return definitions;
}

function listGasTestSourceFiles({ testRoot = defaultTestRoot, runnerPath = defaultRunnerPath } = {}) {
  const files = [];

  function visit(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.gs') &&
        path.resolve(entryPath) !== path.resolve(runnerPath)
      ) {
        files.push(entryPath);
      }
    }
  }

  visit(testRoot);
  return files;
}

function duplicateNames(names) {
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort();
}

function assertNoDuplicateSourceDefinitions(definitions) {
  const duplicates = duplicateNames(definitions.map((definition) => definition.name));
  if (duplicates.length === 0) return;
  const details = duplicates.map((name) => {
    const locations = definitions
      .filter((definition) => definition.name === name)
      .map((definition) => `${definition.filePath}:${definition.line}`);
    return `${name} (${locations.join(', ')})`;
  });
  throw new Error(`duplicate source test function definition: ${details.join('; ')}`);
}

function collectTestFunctionDefinitions({
  repositoryRoot = rootDir,
  runnerPath = path.join(repositoryRoot, 'src', 'test', 'test_runner.gs'),
  testRoot = path.join(repositoryRoot, 'src', 'test'),
} = {}) {
  const definitions = listGasTestSourceFiles({ testRoot, runnerPath })
    .flatMap((filePath) => extractTestFunctionDefinitions(
      fs.readFileSync(filePath, 'utf8'),
      toRepositoryPath(repositoryRoot, filePath),
    ))
    .sort((left, right) => (
      left.name.localeCompare(right.name) ||
      left.filePath.localeCompare(right.filePath) ||
      left.line - right.line
    ));
  assertNoDuplicateSourceDefinitions(definitions);
  return definitions;
}

function assertSourceDefinitionsMatchManifest(sourceDefinitions, manifestTestNames = ALL_GAS_TEST_FUNCTIONS) {
  assertNoDuplicateSourceDefinitions(sourceDefinitions);

  const manifestDuplicates = duplicateNames(manifestTestNames);
  if (manifestDuplicates.length > 0) {
    throw new Error(`duplicate manifest test function: ${manifestDuplicates.join(', ')}`);
  }

  const manifestNames = new Set(manifestTestNames);
  const sourceNames = new Set(sourceDefinitions.map((definition) => definition.name));
  const unregistered = sourceDefinitions.filter((definition) => !manifestNames.has(definition.name));
  if (unregistered.length > 0) {
    throw new Error(`source test function is not registered in manifest: ${unregistered.map(
      (definition) => `${definition.name} (${definition.filePath}:${definition.line})`,
    ).join(', ')}`);
  }

  const missing = [...manifestNames].filter((name) => !sourceNames.has(name)).sort();
  if (missing.length > 0) {
    throw new Error(`manifest test function has no source definition: ${missing.join(', ')}`);
  }

  return {
    manifestTestCount: manifestTestNames.length,
    sourceTestCount: sourceDefinitions.length,
  };
}

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

function verifyGasTestManifestSync({
  repositoryRoot = rootDir,
  runnerPath = path.join(repositoryRoot, 'src', 'test', 'test_runner.gs'),
  testRoot = path.join(repositoryRoot, 'src', 'test'),
} = {}) {
  const sourceDefinitions = collectTestFunctionDefinitions({ repositoryRoot, runnerPath, testRoot });
  const sourceManifestResult = assertSourceDefinitionsMatchManifest(sourceDefinitions);
  const runnerResult = assertGasRunnerMatchesManifest(fs.readFileSync(runnerPath, 'utf8'));
  return { ...runnerResult, ...sourceManifestResult, sourceDefinitions };
}

function main() {
  try {
    const result = verifyGasTestManifestSync();
    console.log(`GAS test sources, manifest, and test_runner.gs are synchronized (${result.sourceTestCount} tests)`);
  } catch (error) {
    console.error(`GAS test manifest sync failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  assertNoDuplicateSourceDefinitions,
  assertSourceDefinitionsMatchManifest,
  assertGasRunnerMatchesManifest,
  collectTestFunctionDefinitions,
  createGasRunnerContext,
  extractTestFunctionDefinitions,
  listGasTestSourceFiles,
  resultTestNames,
  verifyGasTestManifestSync,
};
