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

async function openPreparedWebApp(page) {
  const webAppUrl = readRequiredEnv('GAS_TEST_WEBAPP_URL');
  const token = readRequiredEnv('CI_E2E_TOKEN');

  await page.goto(webAppUrl, { waitUntil: 'domcontentloaded' });
  const app = await resolveAppFrame(page);
  const prepareResult = await callGoogleScript(app, 'prepareE2EWebAppRun', {
    targetDbKey: 'rakuten_test',
  }, token);

  expect(prepareResult.ok, prepareResult.error || JSON.stringify(prepareResult.value)).toBe(true);
  expect(prepareResult.value.ok, JSON.stringify(prepareResult.value || {})).toBe(true);

  await app.evaluate((ciToken) => {
    window.__CI_E2E_TOKEN__ = ciToken;
  }, token);

  return app;
}

async function uploadCsvAndReadResult(app, csvPath) {
  await expect(app.locator('[data-testid="csv-file-input"]')).toBeVisible();
  await app.locator('[data-testid="target-db-select"]').selectOption('nomura_test');
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
  const app = await openPreparedWebApp(page);
  const resultText = await uploadCsvAndReadResult(app, fixture.csvPath);
  const parsed = parseUploadResult(resultText);
  const cleanupPayload = {
    caseName: expected.caseName,
    targetDbKey: parsed.routedTargetDbKey,
    importId: parsed.importId,
    insertedCount: parsed.insertedCount,
  };

  if (parsed.importId && parsed.routedTargetDbKey && typeof registerCleanup === 'function') {
    registerCleanup(cleanupPayload);
  }

  expect(parsed.detectedSourceType).toBe(expected.sourceType);
  expect(parsed.requestedTargetDbKey).toBe('nomura_test');
  expect(parsed.routedTargetDbKey).toBe('rakuten_test');
  expect(parsed.routedTargetDbKind).toBe('楽天DB');
  expect(parsed.importId).toMatch(/^import_/);
  expect(parsed.rowCount).toBe(expected.rowCount);
  expect(parsed.insertedCount).toBe(expected.insertedCount);
  expect(parsed.skippedCount).toBe(0);

  expected.outputCounts.forEach(({ label, min }) => {
    const value = Number(extractResultValue(resultText, label));
    expect(value, `${label} should be at least ${min}`).toBeGreaterThanOrEqual(min);
  });

  await expect(app.locator('[data-testid="rollback-db-select"]')).toHaveValue('rakuten_test');
  await expect(app.locator('[data-testid="link-area"] a', { hasText: '作成したスプレッドシートを開く' })).toHaveAttribute(
    'href',
    /^https:\/\/docs\.google\.com\/spreadsheets\//
  );

  return {
    app,
    resultText,
    parsed,
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
  expect(cleanupResult.value.rollback.rolledBackCount).toBeGreaterThan(0);
  expect(cleanupResult.value.rollback.dbTargetKey).toBe('rakuten_test');
}

module.exports = {
  assertRequiredE2EEnv,
  buildCsvFixtureFromTemplate,
  buildUniqueRunId,
  cleanupUploadedImport,
  runCsvUploadCase,
};
