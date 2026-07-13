const { test, expect } = require('@playwright/test');
const {
  assertRequiredE2EEnv,
  buildCsvFixtureFromTemplate,
  buildUniqueRunId,
  cleanupUploadedImport,
  runCsvUploadCase,
} = require('./helpers/gas-web-app');

const NOMURA_ROUTING_EXPECTATIONS = {
  prepareTargetDbKey: 'nomura_test',
  selectedTargetDbKey: 'nomura_test',
  routedTargetDbKey: 'nomura_test',
  routedTargetDbKind: '野村DB',
  outputInspectionTargetDbKey: 'nomura_test',
  cleanupTargetDbKey: 'nomura_test',
  rollbackDbSelectValue: 'nomura_test',
  skippedCount: 0,
};

function buildNomuraJapanStockFixture() {
  const runId = buildUniqueRunId();
  const symbolCode = `N2E${runId.slice(-5)}`;
  const symbolName = `E2E野村日本株${runId}`;

  const fixture = buildCsvFixtureFromTemplate({
    fixtureName: 'nomura-japan-stock-upload.csv',
    slug: 'nomura-japan-stock',
    replacements: {
      __E2E_RUN_ID__: runId,
      __E2E_SYMBOL_CODE__: symbolCode,
      __E2E_SYMBOL_NAME__: symbolName,
    },
  });
  return { ...fixture, symbolCode, symbolName };
}

test.describe('GAS Web app Nomura CSV upload E2E', () => {
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

  test('uploads a Nomura common Japan stock CSV and rolls back the test import', async ({ page }) => {
    const fixture = buildNomuraJapanStockFixture();
    const result = await runCsvUploadCase({
      page,
      fixture,
      registerCleanup: (payload) => { cleanupPayloads.push(payload); },
      expected: {
        ...NOMURA_ROUTING_EXPECTATIONS,
        caseName: 'Nomura common Japan stock CSV',
        sourceType: 'nomura_common',
        rowCount: 1,
        insertedCount: 1,
        outputCounts: [
          { label: '日本株', min: 1 },
        ],
        outputSpreadsheet: {
          requiredSheets: ['日本株'],
          absentSheets: ['楽天日本株'],
          checks: [
            { sheetName: '日本株', headerName: '銘柄コード', expectedValue: fixture.symbolCode },
            { sheetName: '日本株', headerName: '銘柄名', expectedValue: fixture.symbolName },
          ],
        },
      },
    });

    expect(result.resultText).toContain('日本株:');
  });
});
