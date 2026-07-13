#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  inspectDbConfigSource,
  transformDbConfigSource,
  transformManifestSource,
} = require('./prepare-web-e2e-source');

const DB_CONFIG_FIXTURE = `
const DB_CONFIG = {
  DEFAULT_TARGET_DB_KEY: 'nomura_corp_a',
  DB_FOLDER_ID: 'FOLDER_ID_FOR_TEST_ONLY',
  TARGET_DBS: [
    {
      key: 'nomura_corp_a',
      label: 'corp A',
      spreadsheetId: 'CORP_A_SPREADSHEET_ID_FOR_TEST_ONLY',
      spreadsheetName: 'corp A DB',
      uiVisible: true,
    },
    {
      key: 'nomura_corp_b',
      label: 'corp B',
      spreadsheetId: 'CORP_B_SPREADSHEET_ID_FOR_TEST_ONLY',
      spreadsheetName: 'corp B DB',
      uiVisible: true,
    },
    {
      key: 'nomura_test',
      label: 'test',
      spreadsheetId: 'NOMURA_TEST_SPREADSHEET_ID_FOR_TEST_ONLY',
      spreadsheetName: 'nomura test DB',
      uiVisible: true,
    },
    {
      key: 'rakuten_test',
      label: 'rakuten test',
      spreadsheetId: '',
      spreadsheetName: 'rakuten test DB',
      uiVisible: false,
    }
  ],
  TEST_OUTPUT_SPREADSHEET: {
    spreadsheetId: 'OUTPUT_SPREADSHEET_ID_FOR_TEST_ONLY',
    spreadsheetName: 'test output',
  },
};
`;

function testTransformOnlyClearsExpectedStorageIds() {
  const transformed = transformDbConfigSource(DB_CONFIG_FIXTURE);
  const inspected = inspectDbConfigSource(transformed);

  assert.strictEqual(inspected.dbFolderId, '');
  assert.strictEqual(inspected.testOutputSpreadsheetId, '');
  assert.strictEqual(inspected.targets.nomura_test.spreadsheetId, '');
  assert.strictEqual(
    inspected.targets.nomura_corp_a.spreadsheetId,
    'CORP_A_SPREADSHEET_ID_FOR_TEST_ONLY'
  );
  assert.strictEqual(
    inspected.targets.nomura_corp_b.spreadsheetId,
    'CORP_B_SPREADSHEET_ID_FOR_TEST_ONLY'
  );
  assert.strictEqual(inspected.targets.rakuten_test.spreadsheetId, '');
}

function testMissingNomuraTestFails() {
  const source = DB_CONFIG_FIXTURE.replace("key: 'nomura_test'", "key: 'nomura_deleted'");
  assert.throws(
    () => transformDbConfigSource(source),
    /nomura_test target must exist exactly once/
  );
}

function testDuplicateNomuraTestFails() {
  const duplicated = DB_CONFIG_FIXTURE.replace(
    /(\s*\{\s*key: 'nomura_test'[\s\S]*?uiVisible: true,\s*\},)/,
    '$1$1'
  );
  assert.throws(
    () => transformDbConfigSource(duplicated),
    /nomura_test target must exist exactly once/
  );
}

function testDuplicateSpreadsheetIdInTargetFails() {
  const duplicatedProperty = DB_CONFIG_FIXTURE.replace(
    "spreadsheetId: 'NOMURA_TEST_SPREADSHEET_ID_FOR_TEST_ONLY',",
    "spreadsheetId: 'NOMURA_TEST_SPREADSHEET_ID_FOR_TEST_ONLY',\n      spreadsheetId: 'SECOND_TEST_ONLY_VALUE',"
  );
  assert.throws(
    () => transformDbConfigSource(duplicatedProperty),
    /nomura_test\.spreadsheetId must match exactly once/
  );
}

function testDuplicateDbFolderFails() {
  const duplicatedProperty = DB_CONFIG_FIXTURE.replace(
    "DB_FOLDER_ID: 'FOLDER_ID_FOR_TEST_ONLY',",
    "DB_FOLDER_ID: 'FOLDER_ID_FOR_TEST_ONLY',\n  DB_FOLDER_ID: 'SECOND_TEST_ONLY_VALUE',"
  );
  assert.throws(
    () => transformDbConfigSource(duplicatedProperty),
    /DB_CONFIG\.DB_FOLDER_ID must match exactly once/
  );
}

function testManifestTransform() {
  const transformed = JSON.parse(transformManifestSource(JSON.stringify({ timeZone: 'Asia/Tokyo' })));
  assert.deepStrictEqual(transformed.webapp, {
    access: 'ANYONE_ANONYMOUS',
    executeAs: 'USER_DEPLOYING',
  });
  assert.strictEqual(transformed.timeZone, 'Asia/Tokyo');
}

function testCliDoesNotPrintIds() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-web-e2e-source-'));
  const manifestPath = path.join(tempDir, 'appsscript.json');
  const dbConfigPath = path.join(tempDir, 'db_config.gs');
  fs.writeFileSync(manifestPath, JSON.stringify({ timeZone: 'Asia/Tokyo' }), 'utf8');
  fs.writeFileSync(dbConfigPath, DB_CONFIG_FIXTURE, 'utf8');

  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'prepare-web-e2e-source.js'), manifestPath, dbConfigPath],
    { encoding: 'utf8' }
  );

  assert.strictEqual(result.status, 0, result.stderr);
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  [
    'FOLDER_ID_FOR_TEST_ONLY',
    'CORP_A_SPREADSHEET_ID_FOR_TEST_ONLY',
    'CORP_B_SPREADSHEET_ID_FOR_TEST_ONLY',
    'NOMURA_TEST_SPREADSHEET_ID_FOR_TEST_ONLY',
    'OUTPUT_SPREADSHEET_ID_FOR_TEST_ONLY',
  ].forEach((value) => {
    assert(!combinedOutput.includes(value), `${value} should not be printed`);
  });

  const inspected = inspectDbConfigSource(fs.readFileSync(dbConfigPath, 'utf8'));
  assert.strictEqual(inspected.targets.nomura_test.spreadsheetId, '');
  assert.strictEqual(inspected.targets.nomura_corp_a.spreadsheetId, 'CORP_A_SPREADSHEET_ID_FOR_TEST_ONLY');
  assert.strictEqual(inspected.targets.nomura_corp_b.spreadsheetId, 'CORP_B_SPREADSHEET_ID_FOR_TEST_ONLY');
}

testTransformOnlyClearsExpectedStorageIds();
testMissingNomuraTestFails();
testDuplicateNomuraTestFails();
testDuplicateSpreadsheetIdInTargetFails();
testDuplicateDbFolderFails();
testManifestTransform();
testCliDoesNotPrintIds();

console.log('Web E2E CI source transform checks passed.');
