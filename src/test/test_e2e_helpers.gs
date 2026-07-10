function test_inspectE2EOutputSpreadsheet_rejectsInvalidPayload_20260710_() {
  withCiE2eTokenForTest_(function(token) {
    assertThrowsContains_(function() {
      inspectE2EOutputSpreadsheetFromWebApp({
        ciE2eToken: token,
        targetDbKey: 'rakuten_test',
        spreadsheetId: 'dummy',
        requiredSheets: CONFIG.RAKUTEN_OUTPUT_JAPAN_STOCK
      });
    }, 'requiredSheets must be an array.', 'requiredSheetsの型不正を拒否');

    assertThrowsContains_(function() {
      inspectE2EOutputSpreadsheetFromWebApp({
        ciE2eToken: token,
        targetDbKey: 'rakuten_test',
        spreadsheetId: 'dummy',
        checks: {}
      });
    }, 'checks must be an array.', 'checksの型不正を拒否');

    assertThrowsContains_(function() {
      inspectE2EOutputSpreadsheetFromWebApp({
        ciE2eToken: token,
        targetDbKey: 'rakuten_test',
        spreadsheetId: 'dummy',
        checks: [{
          sheetName: CONFIG.RAKUTEN_OUTPUT_JAPAN_STOCK,
          headerName: '銘柄コード',
          expectedValue: 1234
        }]
      });
    }, 'checks[0].expectedValue must be a string.', 'expectedValueの型不正を拒否');
  });
}

function test_inspectE2EOutputSpreadsheet_rejectsUnsafeTargetsAndSheets_20260710_() {
  withCiE2eTokenForTest_(function(token) {
    assertThrowsContains_(function() {
      inspectE2EOutputSpreadsheetFromWebApp({
        ciE2eToken: token,
        targetDbKey: 'nomura_corp_a',
        spreadsheetId: 'dummy'
      });
    }, 'limited to test DB targets', 'test DB以外を拒否');

    assertThrowsContains_(function() {
      inspectE2EOutputSpreadsheetFromWebApp({
        ciE2eToken: token,
        targetDbKey: 'rakuten_test',
        spreadsheetId: 'dummy',
        requiredSheets: ['秘密シート']
      });
    }, 'cannot read sheet', 'allowlist外シートを拒否');

    withCreatedSpreadsheetForE2EInspectionTest_('tmp_not_e2e_output', function(ss) {
      assertThrowsContains_(function() {
        inspectE2EOutputSpreadsheetFromWebApp({
          ciE2eToken: token,
          targetDbKey: 'rakuten_test',
          spreadsheetId: ss.getId()
        });
      }, 'limited to the E2E test output spreadsheet', 'E2E出力名以外を拒否');
    });
  });
}

function test_inspectE2EOutputSpreadsheet_findsValuesBeyondDefaultRange_20260710_() {
  withCiE2eTokenForTest_(function(token) {
    withCreatedSpreadsheetForE2EInspectionTest_('株管理ツール_E2E_TEST_OUTPUT', function(ss) {
      const sheet = ss.getSheets()[0];
      sheet.setName(CONFIG.RAKUTEN_OUTPUT_JAPAN_STOCK);
      sheet.getRange(1, 1, 1, 2).setValues([['銘柄コード', '銘柄名']]);
      sheet.getRange(30, 1, 1, 2).setValues([['E2E_ROW30_CODE', 'E2E_ROW30_NAME']]);
      SpreadsheetApp.flush();

      const result = inspectE2EOutputSpreadsheetFromWebApp({
        ciE2eToken: token,
        targetDbKey: 'rakuten_test',
        spreadsheetId: ss.getId(),
        requiredSheets: [CONFIG.RAKUTEN_OUTPUT_JAPAN_STOCK],
        absentSheets: [CONFIG.OUTPUT_JAPAN_STOCK],
        checks: [
          {
            sheetName: CONFIG.RAKUTEN_OUTPUT_JAPAN_STOCK,
            headerName: '銘柄コード',
            expectedValue: 'E2E_ROW30_CODE'
          },
          {
            sheetName: CONFIG.RAKUTEN_OUTPUT_JAPAN_STOCK,
            headerName: '銘柄名',
            expectedValue: 'E2E_ROW30_NAME'
          }
        ]
      });

      assertEquals_(true, result.ok, '検査成功');
      assertEquals_(true, result.requiredSheetResults[0].exists, 'required sheet存在');
      assertEquals_(true, result.absentSheetResults[0].absent, 'absent sheet不存在');
      assertEquals_(true, result.checkResults[0].found, '25行目より後の値を検出');
      assertEquals_(1, result.checkResults[0].headerColumn, 'ヘッダー列番号');
      assertEquals_(30, result.checkResults[0].rowNumber, '検出行番号');
      assertEquals_(true, result.checkResults[1].found, '2件目の値も検出');
      assertEquals_(2, result.checkResults[1].headerColumn, '2件目のヘッダー列番号');
      assertEquals_(30, result.checkResults[1].rowNumber, '2件目の検出行番号');
    });
  });
}

function test_inspectE2EOutputSpreadsheet_returnsMinimalResults_20260710_() {
  withCiE2eTokenForTest_(function(token) {
    withCreatedSpreadsheetForE2EInspectionTest_('株管理ツール_E2E_TEST_OUTPUT', function(ss) {
      const sheet = ss.getSheets()[0];
      sheet.setName(CONFIG.OUTPUT_CASH_JPY);
      sheet.getRange(1, 1, 1, 2).setValues([['内容', '残高']]);
      sheet.getRange(2, 1, 1, 2).setValues([['E2E入金', '1000']]);
      SpreadsheetApp.flush();

      const result = inspectE2EOutputSpreadsheetFromWebApp({
        ciE2eToken: token,
        targetDbKey: 'nomura_test',
        spreadsheetId: ss.getId(),
        requiredSheets: [CONFIG.OUTPUT_CASH_JPY],
        checks: [
          {
            sheetName: CONFIG.OUTPUT_CASH_JPY,
            headerName: '内容',
            expectedValue: 'E2E入金'
          },
          {
            sheetName: CONFIG.OUTPUT_CASH_JPY,
            headerName: '内容',
            expectedValue: 'E2E未存在'
          },
          {
            sheetName: CONFIG.OUTPUT_CASH_JPY,
            headerName: '存在しないヘッダー',
            expectedValue: 'E2E入金'
          }
        ]
      });

      assertTrue_(!('sheets' in result), 'raw sheet配列を返さない');
      assertEquals_(true, result.checkResults[0].found, '期待値完全一致を検出');
      assertEquals_(false, result.checkResults[1].found, '期待値がなければfound false');
      assertEquals_(true, result.checkResults[1].headerFound, '値なしでもヘッダーは検出');
      assertEquals_(null, result.checkResults[1].rowNumber, '値なしなら行番号なし');
      assertEquals_(false, result.checkResults[2].found, 'ヘッダーがなければfound false');
      assertEquals_(false, result.checkResults[2].headerFound, 'ヘッダー完全一致で判定');
      assertEquals_(null, result.checkResults[2].headerColumn, 'ヘッダーがなければ列番号なし');
    });
  });
}

function withCiE2eTokenForTest_(fn) {
  const props = PropertiesService.getScriptProperties();
  const previousToken = props.getProperty('CI_E2E_TOKEN');
  const previousRootMode = props.getProperty('CI_E2E_DISABLE_DB_FOLDER');
  const token = 'test-ci-e2e-token';

  props.setProperty('CI_E2E_TOKEN', token);
  props.deleteProperty('CI_E2E_DISABLE_DB_FOLDER');

  try {
    return fn(token);
  } finally {
    restoreScriptPropertyForTest_('CI_E2E_TOKEN', previousToken);
    restoreScriptPropertyForTest_('CI_E2E_DISABLE_DB_FOLDER', previousRootMode);
  }
}

function restoreScriptPropertyForTest_(key, previousValue) {
  const props = PropertiesService.getScriptProperties();
  if (previousValue === null || previousValue === undefined) {
    props.deleteProperty(key);
  } else {
    props.setProperty(key, previousValue);
  }
}

function withCreatedSpreadsheetForE2EInspectionTest_(name, fn) {
  const ss = SpreadsheetApp.create(name);
  try {
    return fn(ss);
  } finally {
    trashFileWithRetry_(ss.getId(), 'e2e output inspection test spreadsheet cleanup failed');
  }
}
