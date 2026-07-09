const { test, expect } = require('@playwright/test');
const {
  assertRequiredE2EEnv,
  buildCsvFixtureFromTemplate,
  buildUniqueRunId,
  cleanupUploadedImport,
  runCsvUploadCase,
} = require('./helpers/gas-web-app');

function buildRakutenJapanStockFixture() {
  const runId = buildUniqueRunId();
  const symbolCode = `E2${runId.slice(-4)}`;
  const symbolName = `E2Eテスト銘柄${runId}`;

  return buildCsvFixtureFromTemplate({
    fixtureName: 'rakuten-japan-stock-upload.csv',
    slug: 'rakuten-japan-stock',
    replacements: {
      __E2E_RUN_ID__: runId,
      __E2E_SYMBOL_CODE__: symbolCode,
      __E2E_SYMBOL_NAME__: symbolName,
    },
  });
}

function buildRakutenUsStockFixture() {
  const runId = buildUniqueRunId();
  const ticker = `E2US${runId.slice(-4)}`;
  const symbolName = `E2E US STOCK ${runId}`;

  return buildCsvFixtureFromTemplate({
    fixtureName: 'rakuten-us-stock-upload.csv',
    slug: 'rakuten-us-stock',
    replacements: {
      __E2E_RUN_ID__: runId,
      __E2E_TICKER__: ticker,
      __E2E_SYMBOL_NAME__: symbolName,
    },
  });
}

function buildRakutenFundFixture() {
  const runId = buildUniqueRunId();
  const fundName = `E2E楽天投信${runId}`;

  return buildCsvFixtureFromTemplate({
    fixtureName: 'rakuten-fund-upload.csv',
    slug: 'rakuten-fund',
    replacements: {
      __E2E_RUN_ID__: runId,
      __E2E_FUND_NAME__: fundName,
    },
  });
}

function buildRakutenCashFixture() {
  const runId = buildUniqueRunId();

  return buildCsvFixtureFromTemplate({
    fixtureName: 'rakuten-cash-upload.csv',
    slug: 'rakuten-cash',
    replacements: {
      __E2E_RUN_ID__: runId,
      __E2E_DEPOSIT_DESCRIPTION__: `E2E通常振込入金${runId}`,
      __E2E_WITHDRAWAL_DESCRIPTION__: `E2E通常出金${runId}`,
    },
  });
}

test.describe('GAS Web app Rakuten CSV upload E2E', () => {
  let cleanupPayload = null;

  test.beforeAll(() => {
    assertRequiredE2EEnv();
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (!cleanupPayload) {
      return;
    }

    const payload = cleanupPayload;
    cleanupPayload = null;
    await cleanupUploadedImport({ page, cleanupPayload: payload, testInfo });
  });

  test('uploads a Rakuten Japan stock CSV and rolls back the routed test import', async ({ page }) => {
    const result = await runCsvUploadCase({
      page,
      fixture: buildRakutenJapanStockFixture(),
      registerCleanup: (payload) => { cleanupPayload = payload; },
      expected: {
        caseName: 'Rakuten Japan stock CSV',
        sourceType: 'rakuten_jp_stock',
        rowCount: 1,
        insertedCount: 1,
        outputCounts: [
          { label: '日本株', min: 1 },
        ],
      },
    });

    expect(result.resultText).toContain('日本株:');
  });

  test('uploads a Rakuten US stock CSV and rolls back the routed test import', async ({ page }) => {
    const result = await runCsvUploadCase({
      page,
      fixture: buildRakutenUsStockFixture(),
      registerCleanup: (payload) => { cleanupPayload = payload; },
      expected: {
        caseName: 'Rakuten US stock CSV',
        sourceType: 'rakuten_us_stock',
        rowCount: 1,
        insertedCount: 1,
        outputCounts: [
          { label: '米国株', min: 1 },
          { label: '金銭残高（ドル）', min: 1 },
        ],
      },
    });

    expect(result.resultText).toContain('米国株:');
  });

  test('uploads a Rakuten fund CSV and rolls back the routed test import', async ({ page }) => {
    const result = await runCsvUploadCase({
      page,
      fixture: buildRakutenFundFixture(),
      registerCleanup: (payload) => { cleanupPayload = payload; },
      expected: {
        caseName: 'Rakuten fund CSV',
        sourceType: 'rakuten_fund',
        rowCount: 1,
        insertedCount: 1,
        outputCounts: [
          { label: '投信', min: 1 },
          { label: '金銭残高（円）', min: 1 },
        ],
      },
    });

    expect(result.resultText).toContain('投信:');
  });

  test('uploads a Rakuten cash CSV and rolls back the routed test import', async ({ page }) => {
    const result = await runCsvUploadCase({
      page,
      fixture: buildRakutenCashFixture(),
      registerCleanup: (payload) => { cleanupPayload = payload; },
      expected: {
        caseName: 'Rakuten cash CSV',
        sourceType: 'rakuten_cash',
        rowCount: 2,
        insertedCount: 2,
        outputCounts: [
          { label: '金銭残高（円）', min: 2 },
        ],
      },
    });

    expect(result.resultText).toContain('金銭残高（円）:');
  });
});
