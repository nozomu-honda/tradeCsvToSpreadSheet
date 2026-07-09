const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');

const REQUIRED_ENV = [
  'GAS_TEST_WEBAPP_URL',
  'CI_E2E_TOKEN',
];

function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for GAS Web app E2E.`);
  }
  return value;
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

function buildUniqueRakutenJapanStockCsv() {
  const fixturePath = path.join(__dirname, 'fixtures', 'rakuten-japan-stock-upload.csv');
  const template = fs.readFileSync(fixturePath, 'utf8');
  const runId = `${Date.now()}${process.pid}`.slice(-8);
  const symbolCode = `E2${runId.slice(-4)}`;
  const symbolName = `E2Eテスト銘柄${runId}`;
  const csvText = template
    .replace(/__E2E_SYMBOL_CODE__/g, symbolCode)
    .replace(/__E2E_SYMBOL_NAME__/g, symbolName);

  const csvPath = path.join(os.tmpdir(), `rakuten-japan-stock-${runId}.csv`);
  fs.writeFileSync(csvPath, csvText, 'utf8');

  return {
    csvPath,
    symbolCode,
    symbolName,
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

test.describe('GAS Web app minimal E2E', () => {
  let cleanupPayload = null;

  test.beforeAll(() => {
    REQUIRED_ENV.forEach(readRequiredEnv);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (!cleanupPayload) {
      return;
    }

    const payload = cleanupPayload;
    cleanupPayload = null;
    const token = readRequiredEnv('CI_E2E_TOKEN');
    const frame = await resolveAppFrame(page).catch(() => null);

    if (!frame) {
      await testInfo.attach('e2e-cleanup', {
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'app frame unavailable' }, null, 2),
      });
      throw new Error('E2E cleanup could not run because the app frame was unavailable.');
    }

    const cleanupResult = await callGoogleScript(frame, 'cleanupE2EImportFromWebApp', payload, token);
    await testInfo.attach('e2e-cleanup', {
      contentType: 'application/json',
      body: JSON.stringify(cleanupResult, null, 2),
    });

    const rollback = cleanupResult && cleanupResult.value ? cleanupResult.value.rollback : null;
    appendStepSummary([
      '### E2E import cleanup',
      `- Result: ${cleanupResult.ok && cleanupResult.value && cleanupResult.value.ok ? 'PASS' : 'FAIL'}`,
      `- Target DB: ${rollback && rollback.dbTargetKey ? rollback.dbTargetKey : payload.targetDbKey}`,
      `- Rolled back count: ${rollback && typeof rollback.rolledBackCount !== 'undefined' ? rollback.rolledBackCount : 0}`,
      '',
    ]);

    expect(cleanupResult.ok, cleanupResult.error || JSON.stringify(cleanupResult.value)).toBe(true);
    expect(cleanupResult.value.ok, JSON.stringify(cleanupResult.value.errors || [])).toBe(true);
    expect(cleanupResult.value.rollback.rolledBackCount).toBeGreaterThan(0);
    expect(cleanupResult.value.rollback.dbTargetKey).toBe('rakuten_test');
  });

  test('uploads a Rakuten Japan stock CSV and rolls back the routed test import', async ({ page }) => {
    const webAppUrl = readRequiredEnv('GAS_TEST_WEBAPP_URL');
    const token = readRequiredEnv('CI_E2E_TOKEN');
    const fixture = buildUniqueRakutenJapanStockCsv();

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

    await expect(app.locator('[data-testid="csv-file-input"]')).toBeVisible();
    await app.locator('[data-testid="target-db-select"]').selectOption('nomura_test');
    await app.locator('[data-testid="csv-url-input"]').fill('');
    await app.locator('[data-testid="source-spreadsheet-url"]').fill('');
    await app.locator('[data-testid="csv-file-input"]').setInputFiles(fixture.csvPath);
    await app.locator('[data-testid="run-button"]').click();

    const result = app.locator('[data-testid="result"]');
    await expect(result).toContainText('完了しました。', { timeout: 150000 });

    const resultText = await result.textContent();
    const detectedSourceType = extractResultValue(resultText, '検出形式');
    const requestedTargetDbKey = extractResultValue(resultText, '選択DBキー');
    const routedTargetDbKey = extractResultValue(resultText, '実際の追加先DBキー');
    const routedTargetDbKind = extractResultValue(resultText, '実際の追加先DB種別');
    const importId = extractResultValue(resultText, '取込ID');
    const rowCount = Number(extractResultValue(resultText, '読込件数'));
    const insertedCount = Number(extractResultValue(resultText, '追加件数'));
    const skippedCount = Number(extractResultValue(resultText, 'スキップ件数'));

    expect(detectedSourceType).toBe('rakuten_jp_stock');
    expect(requestedTargetDbKey).toBe('nomura_test');
    expect(routedTargetDbKey).toBe('rakuten_test');
    expect(routedTargetDbKind).toBe('楽天DB');
    expect(importId).toMatch(/^import_/);
    expect(rowCount).toBe(1);
    expect(insertedCount).toBe(1);
    expect(skippedCount).toBe(0);
    expect(resultText).toContain('日本株:');

    await expect(app.locator('[data-testid="rollback-db-select"]')).toHaveValue('rakuten_test');
    await expect(app.locator('[data-testid="link-area"] a', { hasText: '作成したスプレッドシートを開く' })).toHaveAttribute(
      'href',
      /^https:\/\/docs\.google\.com\/spreadsheets\//
    );

    cleanupPayload = {
      targetDbKey: routedTargetDbKey,
      importId,
      insertedCount,
    };
  });
});
