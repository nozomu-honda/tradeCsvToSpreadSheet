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

  const fixture = buildCsvFixtureFromTemplate({
    fixtureName: 'rakuten-japan-stock-upload.csv',
    slug: 'rakuten-japan-stock',
    replacements: {
      __E2E_RUN_ID__: runId,
      __E2E_SYMBOL_CODE__: symbolCode,
      __E2E_SYMBOL_NAME__: symbolName,
    },
  });
  return { ...fixture, symbolCode, symbolName };
}

function buildRakutenUsStockFixture() {
  const runId = buildUniqueRunId();
  const ticker = `E2US${runId.slice(-4)}`;
  const symbolName = `E2E US STOCK ${runId}`;

  const fixture = buildCsvFixtureFromTemplate({
    fixtureName: 'rakuten-us-stock-upload.csv',
    slug: 'rakuten-us-stock',
    replacements: {
      __E2E_RUN_ID__: runId,
      __E2E_TICKER__: ticker,
      __E2E_SYMBOL_NAME__: symbolName,
    },
  });
  return { ...fixture, ticker, symbolName };
}

function buildRakutenFundFixture() {
  const runId = buildUniqueRunId();
  const fundName = `E2E楽天投信${runId}`;

  const fixture = buildCsvFixtureFromTemplate({
    fixtureName: 'rakuten-fund-upload.csv',
    slug: 'rakuten-fund',
    replacements: {
      __E2E_RUN_ID__: runId,
      __E2E_FUND_NAME__: fundName,
    },
  });
  return { ...fixture, fundName };
}

function buildRakutenCashFixture() {
  const runId = buildUniqueRunId();
  const amountOffset = Number(runId.slice(-5));
  const depositDescription = `E2E通常振込入金${runId}`;
  const withdrawalDescription = `E2E通常出金${runId}`;

  const fixture = buildCsvFixtureFromTemplate({
    fixtureName: 'rakuten-cash-upload.csv',
    slug: 'rakuten-cash',
    replacements: {
      __E2E_RUN_ID__: runId,
      __E2E_DEPOSIT_AMOUNT__: String(50000 + amountOffset),
      __E2E_WITHDRAWAL_AMOUNT__: String(12000 + (amountOffset % 7000)),
      __E2E_DEPOSIT_DESCRIPTION__: depositDescription,
      __E2E_WITHDRAWAL_DESCRIPTION__: withdrawalDescription,
    },
  });
  return { ...fixture, depositDescription, withdrawalDescription };
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
    const fixture = buildRakutenJapanStockFixture();
    const result = await runCsvUploadCase({
      page,
      fixture,
      registerCleanup: (payload) => { cleanupPayload = payload; },
      expected: {
        caseName: 'Rakuten Japan stock CSV',
        sourceType: 'rakuten_jp_stock',
        rowCount: 1,
        insertedCount: 1,
        outputCounts: [
          { label: '日本株', min: 1 },
        ],
        outputSpreadsheet: {
          requiredSheets: ['楽天日本株'],
          absentSheets: ['日本株'],
          valueChecks: [
            { sheetName: '楽天日本株', headerName: '銘柄コード', expectedValue: fixture.symbolCode },
            { sheetName: '楽天日本株', headerName: '銘柄名', expectedValue: fixture.symbolName },
          ],
        },
      },
    });

    expect(result.resultText).toContain('日本株:');
  });

  test('uploads a Rakuten US stock CSV and rolls back the routed test import', async ({ page }) => {
    const fixture = buildRakutenUsStockFixture();
    const result = await runCsvUploadCase({
      page,
      fixture,
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
        outputSpreadsheet: {
          requiredSheets: ['楽天米国株', '金銭残高（ドル）'],
          absentSheets: ['米国株'],
          valueChecks: [
            { sheetName: '楽天米国株', headerName: 'ティッカー', expectedValue: fixture.ticker },
            { sheetName: '楽天米国株', headerName: '銘柄名', expectedValue: fixture.symbolName },
            { sheetName: '金銭残高（ドル）', headerName: '銘柄コード', expectedValue: fixture.ticker },
          ],
        },
      },
    });

    expect(result.resultText).toContain('米国株:');
  });

  test('uploads a Rakuten fund CSV and rolls back the routed test import', async ({ page }) => {
    const fixture = buildRakutenFundFixture();
    const result = await runCsvUploadCase({
      page,
      fixture,
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
        outputSpreadsheet: {
          requiredSheets: ['楽天投資信託', '金銭残高（円）'],
          absentSheets: ['投信'],
          valueChecks: [
            { sheetName: '楽天投資信託', headerName: 'ファンド名', expectedValue: fixture.fundName },
            { sheetName: '金銭残高（円）', headerName: '銘柄名', expectedValue: fixture.fundName },
          ],
        },
      },
    });

    expect(result.resultText).toContain('投信:');
  });

  test('uploads a Rakuten cash CSV and rolls back the routed test import', async ({ page }) => {
    const fixture = buildRakutenCashFixture();
    const result = await runCsvUploadCase({
      page,
      fixture,
      registerCleanup: (payload) => { cleanupPayload = payload; },
      expected: {
        caseName: 'Rakuten cash CSV',
        sourceType: 'rakuten_cash',
        rowCount: 2,
        insertedCount: 2,
        outputCounts: [
          { label: '金銭残高（円）', min: 2 },
        ],
        outputSpreadsheet: {
          requiredSheets: ['金銭残高（円）'],
          valueChecks: [
            { sheetName: '金銭残高（円）', headerName: '内容', expectedValue: fixture.depositDescription },
            { sheetName: '金銭残高（円）', headerName: '内容', expectedValue: fixture.withdrawalDescription },
          ],
        },
      },
    });

    expect(result.resultText).toContain('金銭残高（円）:');
  });
});
