const { test, expect } = require('@playwright/test');

const REQUIRED_ENV = [
  'GAS_TEST_WEBAPP_URL',
  'E2E_INPUT_SPREADSHEET_URL',
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
  const selector = '[data-testid="source-spreadsheet-url"]';

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

async function callGoogleScript(frame, functionName, payload) {
  return frame.evaluate(({ fn, data }) => new Promise((resolve) => {
    if (!window.google || !window.google.script || !window.google.script.run) {
      resolve({ ok: false, error: 'google.script.run is unavailable.' });
      return;
    }

    const payloadWithToken = {
      ...data,
      ciE2eToken: window.__CI_E2E_TOKEN__ || '',
    };

    window.google.script.run
      .withSuccessHandler((value) => resolve({ ok: true, value }))
      .withFailureHandler((error) => resolve({
        ok: false,
        error: error && error.message ? error.message : String(error),
      }))
      [fn](payloadWithToken);
  }), { fn: functionName, data: payload });
}

test.describe('GAS Web app E2E', () => {
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

    const frame = await resolveAppFrame(page).catch(() => null);
    if (!frame) {
      await testInfo.attach('e2e-cleanup', {
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'app frame unavailable' }, null, 2),
      });
      throw new Error('E2E cleanup could not run because the app frame was unavailable.');
    }

    const cleanupResult = await callGoogleScript(frame, 'cleanupE2EImportFromWebApp', payload);
    await testInfo.attach('e2e-cleanup', {
      contentType: 'application/json',
      body: JSON.stringify(cleanupResult, null, 2),
    });

    expect(cleanupResult.ok, cleanupResult.error || JSON.stringify(cleanupResult.value)).toBe(true);
    expect(cleanupResult.value.ok, JSON.stringify(cleanupResult.value.errors || [])).toBe(true);
  });

  test('imports Rakuten dividend spreadsheet and verifies the main result', async ({ page }) => {
    const webAppUrl = readRequiredEnv('GAS_TEST_WEBAPP_URL');
    const sourceSpreadsheetUrl = readRequiredEnv('E2E_INPUT_SPREADSHEET_URL');
    const ciToken = readRequiredEnv('CI_E2E_TOKEN');

    await page.addInitScript((token) => {
      window.__CI_E2E_TOKEN__ = token;
    }, ciToken);

    await page.goto(webAppUrl, { waitUntil: 'domcontentloaded' });
    const app = await resolveAppFrame(page);

    await expect(app.locator('[data-testid="source-spreadsheet-url"]')).toBeVisible();
    await app.locator('[data-testid="target-db-select"]').selectOption('nomura_test');
    await app.locator('[data-testid="source-spreadsheet-url"]').fill(sourceSpreadsheetUrl);
    await app.locator('[data-testid="run-button"]').click();

    await expect(app.locator('[data-testid="completion-dialog"]')).toContainText('完了しました。', {
      timeout: 150000,
    });

    await expect(app.locator('[data-testid="detected-source-type"]')).toHaveText('rakuten_dividend');
    await expect(app.locator('[data-testid="routed-target-db-key"]')).toHaveText('rakuten_test');
    await expect(app.locator('[data-testid="db-row-count"]')).toHaveText('7');
    await expect(app.locator('[data-testid="us-stock-count"]')).toHaveText('7');
    await expect(app.locator('[data-testid="alert-count"]')).toHaveText('2');
    await expect(app.locator('[data-testid="output-sheet-link"]')).toHaveAttribute(
      'href',
      /^https:\/\/docs\.google\.com\/spreadsheets\//
    );

    const mainResult = await app.evaluate(() => window.__lastMainResult);
    expect(mainResult).toBeTruthy();

    cleanupPayload = {
      targetDbKey: mainResult.routedTargetDbKey,
      importId: mainResult.db.importId,
      insertedCount: Number(mainResult.db.insertedCount || 0),
      outputSpreadsheetId: mainResult.spreadsheetId,
      outputSpreadsheetMode: mainResult.outputSpreadsheetMode || '',
    };

    expect(mainResult.detectedSourceType).toBe('rakuten_dividend');
    expect(mainResult.routedTargetDbKey).toBe('rakuten_test');
    expect(mainResult.db.rowCount).toBe(7);
    expect(mainResult.counts.usStocks).toBe(7);
    expect(mainResult.alerts).toHaveLength(2);
    expect(mainResult.alerts.join('\n')).toContain('現地源泉税［円］が未入力');
    expect(mainResult.alerts.join('\n')).toContain('国内源泉税［円］が未入力');
    expect(mainResult.spreadsheetUrl).toMatch(/^https:\/\/docs\.google\.com\/spreadsheets\//);

    const inserted = Number(mainResult.db.insertedCount || 0);
    const skipped = Number(mainResult.db.skippedCount || 0);
    expect(inserted + skipped).toBe(7);
  });
});
