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

function buildRakutenUsStockDividendFixture() {
  const runId = buildUniqueRunId();
  const ticker = `E2DIV${runId.slice(-4)}`;
  const symbolName = `E2E DIVIDEND ${runId}`;
  const description = `E2E米国株配当${runId}`;

  const fixture = buildCsvFixtureFromTemplate({
    fixtureName: 'rakuten-dividend-us-stock-upload.csv',
    slug: 'rakuten-dividend-us-stock',
    replacements: {
      __E2E_RUN_ID__: runId,
      __E2E_TICKER__: ticker,
      __E2E_SYMBOL_NAME__: symbolName,
      __E2E_DESCRIPTION__: description,
    },
  });
  return { ...fixture, ticker, symbolName, description };
}

function buildRakutenFundDistributionFixture() {
  const runId = buildUniqueRunId();
  const fundName = `E2E楽天分配金投信${runId}`;
  const description = `E2E投信分配金${runId}`;

  const fixture = buildCsvFixtureFromTemplate({
    fixtureName: 'rakuten-distribution-fund-upload.csv',
    slug: 'rakuten-distribution-fund',
    replacements: {
      __E2E_RUN_ID__: runId,
      __E2E_FUND_NAME__: fundName,
      __E2E_DESCRIPTION__: description,
    },
  });
  return { ...fixture, fundName, description };
}

function buildRakutenPrincipalReturnFixtures() {
  const runId = buildUniqueRunId();
  const fundName = `E2E楽天元本払戻投信${runId}`;

  const buyFixture = buildCsvFixtureFromTemplate({
    fixtureName: 'rakuten-principal-return-fund-buy-upload.csv',
    slug: 'rakuten-principal-return-fund-buy',
    replacements: {
      __E2E_RUN_ID__: runId,
      __E2E_FUND_NAME__: fundName,
    },
  });
  const principalReturnFixture = buildCsvFixtureFromTemplate({
    fixtureName: 'rakuten-principal-return-upload.csv',
    slug: 'rakuten-principal-return',
    replacements: {
      __E2E_RUN_ID__: runId,
      __E2E_FUND_NAME__: fundName,
    },
  });

  return { buyFixture, principalReturnFixture, fundName };
}

test.describe('GAS Web app Rakuten CSV upload E2E', () => {
  let cleanupPayloads = [];

  test.beforeAll(() => {
    assertRequiredE2EEnv();
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (cleanupPayloads.length === 0) {
      return;
    }

    const payloads = cleanupPayloads.slice().reverse();
    cleanupPayloads = [];
    const cleanupErrors = [];
    for (const payload of payloads) {
      try {
        await cleanupUploadedImport({ page, cleanupPayload: payload, testInfo });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (cleanupErrors.length > 0) {
      throw new Error(cleanupErrors.map((error) => error.message || String(error)).join('\n'));
    }
  });

  test('uploads a Rakuten Japan stock CSV and rolls back the routed test import', async ({ page }) => {
    const fixture = buildRakutenJapanStockFixture();
    const result = await runCsvUploadCase({
      page,
      fixture,
      registerCleanup: (payload) => { cleanupPayloads.push(payload); },
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
          checks: [
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
      registerCleanup: (payload) => { cleanupPayloads.push(payload); },
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
          checks: [
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
      registerCleanup: (payload) => { cleanupPayloads.push(payload); },
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
          checks: [
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
      registerCleanup: (payload) => { cleanupPayloads.push(payload); },
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
          checks: [
            { sheetName: '金銭残高（円）', headerName: '内容', expectedValue: fixture.depositDescription },
            { sheetName: '金銭残高（円）', headerName: '内容', expectedValue: fixture.withdrawalDescription },
          ],
        },
      },
    });

    expect(result.resultText).toContain('金銭残高（円）:');
  });

  test('uploads a Rakuten US stock dividend CSV and verifies tax and settlement columns', async ({ page }) => {
    const fixture = buildRakutenUsStockDividendFixture();
    const result = await runCsvUploadCase({
      page,
      fixture,
      registerCleanup: (payload) => { cleanupPayloads.push(payload); },
      expected: {
        caseName: 'Rakuten US stock dividend CSV',
        sourceType: 'rakuten_dividend',
        rowCount: 1,
        insertedCount: 1,
        outputCounts: [
          { label: '米国株', min: 1 },
          { label: '金銭残高（ドル）', min: 1 },
        ],
        outputSpreadsheet: {
          requiredSheets: ['楽天米国株', '金銭残高（ドル）'],
          absentSheets: ['米国株'],
          checks: [
            { sheetName: '楽天米国株', headerName: 'ティッカー', expectedValue: fixture.ticker },
            { sheetName: '楽天米国株', headerName: '銘柄名', expectedValue: fixture.symbolName },
            { sheetName: '楽天米国株', headerName: '約定代金［USドル］', expectedValue: '6.00' },
            { sheetName: '楽天米国株', headerName: '税金［USドル］', expectedValue: '1.00' },
            { sheetName: '楽天米国株', headerName: '受渡金額［USドル］', expectedValue: '5.00' },
            { sheetName: '楽天米国株', headerName: '受渡金額［円］', expectedValue: '500' },
            { sheetName: '楽天米国株', headerName: '為替レート', expectedValue: '100.00' },
            { sheetName: '楽天米国株', headerName: '現地源泉税（円）', expectedValue: '50' },
            { sheetName: '楽天米国株', headerName: '国内源泉所得税（円）', expectedValue: '10' },
            { sheetName: '金銭残高（ドル）', headerName: '配当金・分配金受取金額［USドル］', expectedValue: '5.00' },
          ],
        },
      },
    });

    expect(result.resultText).toContain('米国株:');
    expect(result.resultText).toContain('金銭残高（ドル）:');
  });

  test('uploads a Rakuten fund distribution CSV and verifies distribution output and cash balance', async ({ page }) => {
    const fixture = buildRakutenFundDistributionFixture();
    const result = await runCsvUploadCase({
      page,
      fixture,
      registerCleanup: (payload) => { cleanupPayloads.push(payload); },
      expected: {
        caseName: 'Rakuten fund distribution CSV',
        sourceType: 'rakuten_dividend',
        rowCount: 1,
        insertedCount: 1,
        outputCounts: [
          { label: '投信', min: 1 },
          { label: '金銭残高（ドル）', min: 1 },
        ],
        outputSpreadsheet: {
          requiredSheets: ['楽天投資信託', '金銭残高（ドル）'],
          absentSheets: ['投信'],
          checks: [
            { sheetName: '楽天投資信託', headerName: 'ファンド名', expectedValue: fixture.fundName },
            { sheetName: '楽天投資信託', headerName: '分配金', expectedValue: '分配金' },
            { sheetName: '楽天投資信託', headerName: '受付金額', expectedValue: '6' },
            { sheetName: '楽天投資信託', headerName: '受渡金額', expectedValue: '5' },
            { sheetName: '楽天投資信託', headerName: '為替レート', expectedValue: '100.00' },
            { sheetName: '楽天投資信託', headerName: '国内源泉所得税（円）', expectedValue: '10' },
            { sheetName: '金銭残高（ドル）', headerName: '銘柄名', expectedValue: fixture.fundName },
            { sheetName: '金銭残高（ドル）', headerName: '配当金・分配金受取金額［USドル］', expectedValue: '5.00' },
            { sheetName: '金銭残高（ドル）', headerName: '配当金・分配金合計［USドル］', expectedValue: '6.00' },
            { sheetName: '金銭残高（ドル）', headerName: '税金［USドル］', expectedValue: '1.00' },
          ],
        },
      },
    });

    expect(result.resultText).toContain('投信:');
    expect(result.resultText).toContain('金銭残高（ドル）:');
  });

  test('uploads a Rakuten principal return after a fund buy and verifies book value is preserved', async ({ page }) => {
    const fixtures = buildRakutenPrincipalReturnFixtures();
    await runCsvUploadCase({
      page,
      fixture: fixtures.buyFixture,
      registerCleanup: (payload) => { cleanupPayloads.push(payload); },
      expected: {
        caseName: 'Rakuten fund buy before principal return CSV',
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
          checks: [
            { sheetName: '楽天投資信託', headerName: 'ファンド名', expectedValue: fixtures.fundName },
            { sheetName: '楽天投資信託', headerName: '平均取得単価', expectedValue: '900' },
            { sheetName: '楽天投資信託', headerName: '簿価', expectedValue: '900' },
          ],
        },
      },
    });

    const result = await runCsvUploadCase({
      page,
      fixture: fixtures.principalReturnFixture,
      registerCleanup: (payload) => { cleanupPayloads.push(payload); },
      expected: {
        caseName: 'Rakuten principal return CSV',
        sourceType: 'rakuten_dividend',
        rowCount: 1,
        insertedCount: 1,
        outputCounts: [
          { label: '投信', min: 2 },
          { label: '金銭残高（円）', min: 2 },
        ],
        outputSpreadsheet: {
          requiredSheets: ['楽天投資信託', '金銭残高（円）'],
          absentSheets: ['投信'],
          checks: [
            { sheetName: '楽天投資信託', headerName: 'ファンド名', expectedValue: fixtures.fundName },
            { sheetName: '楽天投資信託', headerName: '分配金', expectedValue: '分配金' },
            { sheetName: '楽天投資信託', headerName: '受付金額', expectedValue: '100' },
            { sheetName: '楽天投資信託', headerName: '受渡金額', expectedValue: '100' },
            { sheetName: '楽天投資信託', headerName: '元金払戻金', expectedValue: '1' },
            { sheetName: '楽天投資信託', headerName: '平均取得単価', expectedValue: '900' },
            { sheetName: '楽天投資信託', headerName: '簿価', expectedValue: '900' },
            { sheetName: '楽天投資信託', headerName: '銘柄ごとの残高', expectedValue: '900' },
            { sheetName: '金銭残高（円）', headerName: '銘柄名', expectedValue: fixtures.fundName },
            { sheetName: '金銭残高（円）', headerName: '投信受渡金額［円］', expectedValue: '100' },
          ],
        },
      },
    });

    expect(result.resultText).toContain('投信:');
    expect(result.resultText).toContain('金銭残高（円）:');
  });
});
