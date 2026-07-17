#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { PATH_RULES } = require('./gas-test-selection');
const { GAS_TEST_MANIFEST } = require('./gas-test-suite-manifest');
const { extractTestFunctionDefinitions } = require('./check-gas-test-manifest-sync');

const rootDir = path.resolve(__dirname, '..', '..');

function auditSelectedTestFileMappings({
  pathRules = PATH_RULES,
  manifest = GAS_TEST_MANIFEST,
  readSource = (filePath) => fs.readFileSync(path.join(rootDir, filePath), 'utf8'),
} = {}) {
  const manifestByName = new Map(manifest.map((definition) => [definition.name, definition]));
  return Object.entries(pathRules)
    .filter(([filePath, rule]) => filePath.startsWith('src/test/') && rule.kind === 'selected')
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
    .map(([filePath, rule]) => {
      let source;
      try {
        source = readSource(filePath);
      } catch {
        throw new Error(`selected test file cannot be read: ${filePath}`);
      }

      const definitions = extractTestFunctionDefinitions(source, filePath);
      if (definitions.length === 0) {
        throw new Error(`selected test file has no test function definitions: ${filePath}`);
      }

      const unregistered = definitions.filter((definition) => !manifestByName.has(definition.name));
      if (unregistered.length > 0) {
        throw new Error(`selected test file contains a source test not registered in manifest: ${unregistered.map(
          (definition) => `${definition.name} (${filePath}:${definition.line})`,
        ).join(', ')}`);
      }

      const actualAreas = [...new Set(
        definitions.map((definition) => manifestByName.get(definition.name).area),
      )].sort();
      const missingAreas = actualAreas.filter((area) => !rule.areas.includes(area));
      if (missingAreas.length > 0) {
        throw new Error(
          `selected test file PATH_RULES is missing manifest areas: ${filePath} ` +
          `(missing: ${missingAreas.join(', ')}; mapped: ${rule.areas.join(', ')})`,
        );
      }

      return {
        actualAreas,
        filePath,
        mappedAreas: [...rule.areas],
        testNames: definitions.map((definition) => definition.name).sort(),
      };
    });
}

function main() {
  try {
    const summaries = auditSelectedTestFileMappings();
    console.log(`GAS test file mappings cover all manifest areas (${summaries.length} files)`);
  } catch (error) {
    console.error(`GAS test file mapping audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { auditSelectedTestFileMappings };
