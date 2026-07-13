const fs = require('fs');
const os = require('os');
const path = require('path');
const { expect } = require('@playwright/test');

const REQUIRED_ENV = [
  'GAS_TEST_WEBAPP_URL',
  'CI_E2E_TOKEN',
];

let uniqueCounter = 0;

function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for GAS Web app E2E.`);
  }
  return value;
}

function assertRequiredE2EEnv() {
  REQUIRED_ENV.forEach(readRequiredEnv);
}

async function resolveAppFrame(page) {
  const selector = '[data-testid="csv-file-input"]';

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await page.locator(selector).count()) {
      return page;
    }

    for (const frame of page.frames()) {
      const count = await frame.locator(selector).count().catch(() => 0);
      if (count > 0) {
        return frame;
      }
    }

    await page.waitForTimeout(1000);
  }

  throw new Error('GAS Web app frame did not expose the expected E2E selectors.');
}

function buildUniqueRunId() {
  uniqueCounter += 1;
  return `${Date.now()}${process.pid}${uniqueCounter}`.slice(-12);
}

function buildCsvFixtureFromTemplate({ fixtureName, slug, replacements }) {
  const fixturePath = path.join(__dirname, '..', 'fixtures', fixtureName);
  let csvText = fs.readFileSync(fixturePath, 'utf8');

  Object.keys(replacements).forEach((key) => {
    csvText = csvText.replace(new RegExp(key, 'g'), replacements[key]);
  });

  const runId = replacements.__E2E_RUN_ID__ || buildUniqueRunId();
  const csvPath = path.join(os.tmpdir(), `${slug}-${runId}.csv`);
  fs.writeFileSync(csvPath, csvText, 'utf8');

  return {
    csvPath,
    runId,
  };
}

function extractResultValue(resultText, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = resultText.match(new RegExp(`${escaped}:\\s*([^\\n]+)`));
  return match ? match[1].trim() : '';
}

function extractSpreadsheetIdFromUrl(url) {
  const match = String(url || '').match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (!match) {
    throw new Error('Could not extract spreadsheetId from output link.');
  }
  return match[1];
}

function appendStepSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

async function callGoogleScript(frame, functionName, payload, token) {
  return frame.evaluate(({ fn, data, ciToken }) => new Promise((resolve) => {
    if (!window.google || !window.google.script || !window.google.script.run) {
      resolve({ ok: false, error: 'google.script.run is unavailable.' });
      return;
    }

    window.google.script.run
      .withSuccessHandler((value) => resolve({ ok: true, value }))
      .withFailureHandler((error) => resolve({
        ok: false,
        error: error && error.message ? error.message : String(error),
      }))
      [fn]({
        ...data,
        ciE2eToken: ciToken,
      });
  }), { fn: functionName, data: payload, ciToken: token });
}

function assertOutputInspection(inspection, expected) {
  if (!expected) {
    return;
  }

  expect(inspection.sheets, 'inspection should not return raw sheet cell arrays').toBeUndefined();

  (expected.requiredSheets || []).forEach((sheetName) => {
    const result = (inspection.requiredSheetResults || []).find((item) => item.sheetName === sheetName);
    expect(result, `${sheetName} should have a required sheet result`).toBeTruthy();
    expect(result.exists, `${sheetName} should exist`).toBe(true);
  });

  (expected.absentSheets || []).forEach((sheetName) => {
    const result = (inspection.absentSheetResults || []).find((item) => item.sheetName === sheetName);
    expect(result, `${sheetName} should have an absent sheet result`).toBeTruthy();
    expect(result.absent, `${sheetName} should not remain`).toBe(true);
  });

  (expected.checks || []).forEach(({ sheetName, headerName, expectedValue }, index) => {
    const result = (inspection.checkResults || [])[index];
    expect(result, `${sheetName}.${headerName} should have a check result`).toBeTruthy();
    expect(result.sheetName).toBe(sheetName);
    expect(result.headerName).toBe(headerName);
    expect(result.sheetExists, `${sheetName} should exist`).toBe(true);
    expect(result.headerFound, `${sheetName}.${headerName} header should exist`).toBe(true);
    expect(result.headerColumn, `${sheetName}.${headerName} header column`).toBeGreaterThan(0);
    expect(result.found, `${sheetName}.${headerName} should contain ${expectedValue}`).toBe(true);
    expect(result.rowNumber, `${sheetName}.${headerName} row number`).toBeGreaterThan(1);
  });

  (expected.rowChecks || []).forEach(({ sheetName, anchor, checks }, index) => {
    const result = (inspection.rowCheckResults || [])[index];
    expect(result, `${sheetName} row check should have a result`).toBeTruthy();
    expect(result.sheetName).toBe(sheetName);
    expect(result.sheetExists, `${sheetName} should exist`).toBe(true);
    expect(result.anchor.headerName).toBe(anchor.headerName);
    expect(result.anchor.headerFound, `${sheetName}.${anchor.headerName} anchor header should exist`).toBe(true);
    expect(result.anchor.headerColumn, `${sheetName}.${anchor.headerName} anchor header column`).toBeGreaterThan(0);
    expect(result.anchor.found, `${sheetName}.${anchor.headerName} should contain ${anchor.expectedValue}`).toBe(true);
    expect(result.found, `${sheetName} row check should match one row`).toBe(true);
    expect(result.rowNumber, `${sheetName} row check row number`).toBeGreaterThan(1);

    checks.forEach(({ headerName, expectedValue }, checkIndex) => {
      const checkResult = (result.checks || [])[checkIndex];
      expect(checkResult, `${sheetName}.${headerName} should have a row check result`).toBeTruthy();
      expect(checkResult.headerName).toBe(headerName);
      expect(checkResult.headerFound, `${sheetName}.${headerName} row header should exist`).toBe(true);
      expect(checkResult.headerColumn, `${sheetName}.${headerName} row header column`).toBeGreaterThan(0);
      expect(checkResult.matched, `${sheetName}.${headerName} should equal ${expectedValue} on row ${result.rowNumber}`).toBe(true);
    });
  });
}

function requireExpectedString(expected, fieldName) {
  const value = expected && expected[fieldName];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`expected.${fieldName} is required for GAS Web app E2E.`);
  }
  return value;
}

function normalizeUploadExpectations(expected) {
  return {
    ...expected,
    caseName: requireExpectedString(expected, 'caseName'),
    sourceType: requireExpectedString(expected, 'sourceType'),
    prepareTargetDbKey: requireExpectedString(expected, 'prepareTargetDbKey'),
    selectedTargetDbKey: requireExpectedString(expected, 'selectedTargetDbKey'),
    routedTargetDbKey: requireExpectedString(expected, 'routedTargetDbKey'),
    routedTargetDbKind: requireExpectedString(expected, 'routedTargetDbKind'),
    outputInspectionTargetDbKey: requireExpectedString(expected, 'outputInspectionTargetDbKey'),
    cleanupTargetDbKey: requireExpectedString(expected, 'cleanupTargetDbKey'),
    rollbackDbSelectValue: requireExpectedString(expected, 'rollbackDbSelectValue'),
    skippedCount: expected && typeof expected.skippedCount === 'number' ? expected.skippedCount : 0,
    outputCounts: expected && Array.isArray(expected.outputCounts) ? expected.outputCounts : [],
  };
}

async function openPreparedWebApp(page, { prepareTargetDbKey }) {
  const webAppUrl = readRequiredEnv('GAS_TEST_WEBAPP_URL');
  const token = readRequiredEnv('CI_E2E_TOKEN');

  await page.goto(webAppUrl, { waitUntil: 'domcontentloaded' });
  const app = await resolveAppFrame(page);
  const prepareResult = await callGoogleScript(app, 'prepareE2EWebAppRun', {
    targetDbKey: prepareTargetDbKey,
  }, token);

  expect(prepareResult.ok, prepareResult.error || JSON.stringify(prepareResult.value)).toBe(true);
  expect(prepareResult.value.ok, JSON.stringify(prepareResult.value || {})).toBe(true);
  expect(prepareResult.value.targetDbKey).toBe(prepareTargetDbKey);

  await app.evaluate((ciToken) => {
    window.__CI_E2E_TOKEN__ = ciToken;
  }, token);

  return app;
}

async function uploadCsvAndReadResult(app, csvPath, { selectedTargetDbKey }) {
  await expect(app.locator('[data-testid="csv-file-input"]')).toBeVisible();
  await app.locator('[data-testid="target-db-select"]').selectOption(selectedTargetDbKey);
  await expect(app.locator('[data-testid="target-db-select"]')).toHaveValue(selectedTargetDbKey);
  await app.locator('[data-testid="csv-url-input"]').fill('');
  await app.locator('[data-testid="source-spreadsheet-url"]').fill('');
  await app.locator('[data-testid="csv-file-input"]').setInputFiles(csvPath);
  await app.locator('[data-testid="run-button"]').click();

  const result = app.locator('[data-testid="result"]');
  await expect(result).toContainText('完了しました。', { timeout: 150000 });

  return result.textContent();
}

function parseUploadResult(resultText) {
  return {
    detectedSourceType: extractResultValue(resultText, '検出形式'),
    requestedTargetDbKey: extractResultValue(resultText, '選択DBキー'),
    routedTargetDbKey: extractResultValue(resultText, '実際の追加先DBキー'),
    routedTargetDbKind: extractResultValue(resultText, '実際の追加先DB種別'),
    importId: extractResultValue(resultText, '取込ID'),
    rowCount: Number(extractResultValue(resultText, '読込件数')),
    insertedCount: Number(extractResultValue(resultText, '追加件数')),
    skippedCount: Number(extractResultValue(resultText, 'スキップ件数')),
  };
}

async function runCsvUploadCase({ page, fixture, expected, registerCleanup }) {
  const expectations = normalizeUploadExpectations(expected);
  const app = await openPreparedWebApp(page, {
    prepareTargetDbKey: expectations.prepareTargetDbKey,
  });
  const resultText = await uploadCsvAndReadResult(app, fixture.csvPath, {
    selectedTargetDbKey: expectations.selectedTargetDbKey,
  });
  const parsed = parseUploadResult(resultText);
  const cleanupPayload = {
    caseName: expectations.caseName,
    targetDbKey: parsed.routedTargetDbKey,
    expectedTargetDbKey: expectations.cleanupTargetDbKey,
    importId: parsed.importId,
    insertedCount: parsed.insertedCount,
  };

  if (parsed.importId && parsed.routedTargetDbKey && typeof registerCleanup === 'function') {
    registerCleanup(cleanupPayload);
  }

  expect(parsed.detectedSourceType).toBe(expectations.sourceType);
  expect(parsed.requestedTargetDbKey).toBe(expectations.selectedTargetDbKey);
  expect(parsed.routedTargetDbKey).toBe(expectations.routedTargetDbKey);
  expect(parsed.routedTargetDbKind).toBe(expectations.routedTargetDbKind);
  expect(parsed.importId).toMatch(/^import_/);
  expect(parsed.rowCount).toBe(expectations.rowCount);
  expect(parsed.insertedCount).toBe(expectations.insertedCount);
  expect(parsed.skippedCount).toBe(expectations.skippedCount);

  expectations.outputCounts.forEach(({ label, min }) => {
    const value = Number(extractResultValue(resultText, label));
    expect(value, `${label} should be at least ${min}`).toBeGreaterThanOrEqual(min);
  });

  await expect(app.locator('[data-testid="rollback-db-select"]')).toHaveValue(expectations.rollbackDbSelectValue);
  const outputLink = app.locator('[data-testid="link-area"] a', { hasText: '作成したスプレッドシートを開く' });
  await expect(outputLink).toHaveAttribute('href', /^https:\/\/docs\.google\.com\/spreadsheets\//);

  const outputSpreadsheetUrl = await outputLink.getAttribute('href');
  const outputSpreadsheetId = extractSpreadsheetIdFromUrl(outputSpreadsheetUrl);
  let outputInspection = null;

  if (expectations.outputSpreadsheet) {
    const token = readRequiredEnv('CI_E2E_TOKEN');
    const inspectionResult = await callGoogleScript(app, 'inspectE2EOutputSpreadsheetFromWebApp', {
      targetDbKey: expectations.outputInspectionTargetDbKey,
      spreadsheetId: outputSpreadsheetId,
      requiredSheets: expectations.outputSpreadsheet.requiredSheets || [],
      absentSheets: expectations.outputSpreadsheet.absentSheets || [],
      checks: expectations.outputSpreadsheet.checks || [],
      rowChecks: expectations.outputSpreadsheet.rowChecks || [],
    }, token);

    expect(inspectionResult.ok, inspectionResult.error || JSON.stringify(inspectionResult.value)).toBe(true);
    expect(inspectionResult.value.ok, JSON.stringify(inspectionResult.value || {})).toBe(true);
    outputInspection = inspectionResult.value;
    assertOutputInspection(outputInspection, expectations.outputSpreadsheet);
  }

  return {
    app,
    resultText,
    parsed,
    outputSpreadsheetId,
    outputInspection,
    cleanupPayload,
  };
}

async function cleanupUploadedImport({ page, cleanupPayload, testInfo }) {
  const token = readRequiredEnv('CI_E2E_TOKEN');
  const frame = await resolveAppFrame(page).catch(() => null);

  if (!frame) {
    await testInfo.attach('e2e-cleanup', {
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'app frame unavailable' }, null, 2),
    });
    throw new Error('E2E cleanup could not run because the app frame was unavailable.');
  }

  const cleanupResult = await callGoogleScript(frame, 'cleanupE2EImportFromWebApp', cleanupPayload, token);
  await testInfo.attach('e2e-cleanup', {
    contentType: 'application/json',
    body: JSON.stringify(cleanupResult, null, 2),
  });

  const rollback = cleanupResult && cleanupResult.value ? cleanupResult.value.rollback : null;
  appendStepSummary([
    '### E2E import cleanup',
    `- Case: ${cleanupPayload.caseName || ''}`,
    `- Result: ${cleanupResult.ok && cleanupResult.value && cleanupResult.value.ok ? 'PASS' : 'FAIL'}`,
    `- Target DB: ${rollback && rollback.dbTargetKey ? rollback.dbTargetKey : cleanupPayload.targetDbKey}`,
    `- Rolled back count: ${rollback && typeof rollback.rolledBackCount !== 'undefined' ? rollback.rolledBackCount : 0}`,
    '',
  ]);

  expect(cleanupResult.ok, cleanupResult.error || JSON.stringify(cleanupResult.value)).toBe(true);
  expect(cleanupResult.value.ok, JSON.stringify(cleanupResult.value.errors || [])).toBe(true);

  if (cleanupPayload.insertedCount > 0) {
    expect(cleanupResult.value.rollback.rolledBackCount).toBeGreaterThan(0);
    expect(cleanupResult.value.rollback.dbTargetKey).toBe(
      cleanupPayload.expectedTargetDbKey || cleanupPayload.targetDbKey
    );
  } else {
    expect(cleanupResult.value.rollback.skipped).toBe(true);
  }
}

module.exports = {
  assertRequiredE2EEnv,
  buildCsvFixtureFromTemplate,
  buildUniqueRunId,
  cleanupUploadedImport,
  runCsvUploadCase,
};
