#!/usr/bin/env node
'use strict';

const assert = require('assert');

const {
  parseAndValidateProductionStatusOutput,
} = require('./production-status-parser');

function statusOutput(filesToPush, untrackedFiles = []) {
  return [
    '> gas:production:status',
    '> node scripts/gas-production.js status --json',
    JSON.stringify({ filesToPush, untrackedFiles }),
  ].join('\n');
}

const valid = parseAndValidateProductionStatusOutput(statusOutput([
  'appsscript.json',
  'Index.html',
  'src/app/import.gs',
  'src/app/e2e_runtime_support.gs',
], [
  'src/app/e2e_helpers.gs',
  'src/test/test_runner.gs',
]));
assert.strictEqual(valid.trackedCount, 4);
assert.ok(valid.untrackedFiles.includes('src/app/e2e_helpers.gs'));

assert.throws(
  () => parseAndValidateProductionStatusOutput(statusOutput([
    'appsscript.json',
    'src/app/e2e_helpers.gs',
    'src/app/e2e_runtime_support.gs',
  ])),
  /forbidden tracked file/,
);

assert.throws(
  () => parseAndValidateProductionStatusOutput(statusOutput([
    'appsscript.json',
    'src/test/test_runner.gs',
    'src/app/e2e_runtime_support.gs',
  ])),
  /forbidden tracked test file/,
);

assert.throws(
  () => parseAndValidateProductionStatusOutput(statusOutput([
    'appsscript.json',
    'Index.html',
  ])),
  /missing required tracked file/,
);

assert.throws(
  () => parseAndValidateProductionStatusOutput(statusOutput([])),
  /tracked file list was empty/,
);

assert.throws(
  () => parseAndValidateProductionStatusOutput('fake file status'),
  /did not contain clasp JSON/,
);

assert.throws(
  () => parseAndValidateProductionStatusOutput(''),
  /empty/,
);

assert.throws(
  () => parseAndValidateProductionStatusOutput(`${statusOutput([
    'appsscript.json',
    'src/app/e2e_runtime_support.gs',
  ])}\n{"refresh_token":"secret"}`),
  /sensitive data/,
);

assert.throws(
  () => parseAndValidateProductionStatusOutput('ERROR: No credentials found.'),
  /error or placeholder/,
);

console.log('production status parser checks passed');
