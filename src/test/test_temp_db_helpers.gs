/**
 * DBテスト用 一時スプレッドシートヘルパー
 */

var __TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__ = {};

function getSuiteTempDbSpreadsheetByKey_(key) {
  if (__TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__[key]) {
    return SpreadsheetApp.openById(__TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__[key]);
  }

  const ss = SpreadsheetApp.create('tmp_' + key + '_' + Utilities.getUuid());
  __TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__[key] = ss.getId();
  return ss;
}

function resetTempDbSpreadsheet_(ss) {
  const sheets = ss.getSheets();
  for (var i = sheets.length - 1; i >= 1; i--) {
    ss.deleteSheet(sheets[i]);
  }

  var first = ss.getSheets()[0];
  first.clear();
  first.clearFormats();
  first.clearConditionalFormatRules();
  first.setName('Sheet1');

  if (first.getFilter()) {
    first.getFilter().remove();
  }
}

function createTempDbTargets_(keys) {
  const targets = keys.map(function(key) {
    const ss = getSuiteTempDbSpreadsheetByKey_(key);
    resetTempDbSpreadsheet_(ss);

    return {
      key: key,
      label: 'Temp ' + key,
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
    };
  });

  return {
    targets: targets,
    cleanup: function() {
      // runSelectedTests_ の finally でまとめて cleanup
    }
  };
}

function cleanupSuiteTempDbSpreadsheets_() {
  Object.keys(__TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__).forEach(function(key) {
    trashFileWithRetry_(__TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__[key], 'temp db cleanup failed');
  });
  __TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__ = {};
}

function withTempDbTargets_(targets, defaultKey, fn) {
  const originalTargets = JSON.parse(JSON.stringify(DB_CONFIG.TARGET_DBS || []));
  const originalDefault = DB_CONFIG.DEFAULT_TARGET_DB_KEY;

  DB_CONFIG.TARGET_DBS = JSON.parse(JSON.stringify(targets));
  DB_CONFIG.DEFAULT_TARGET_DB_KEY = defaultKey;

  try {
    fn();
  } finally {
    DB_CONFIG.TARGET_DBS = originalTargets;
    DB_CONFIG.DEFAULT_TARGET_DB_KEY = originalDefault;
  }
}

function countNonEmptyRowsByHeader_(sheet, headers, headerName) {
  const col = headers.indexOf(headerName) + 1;
  if (col <= 0) {
    throw new Error('ヘッダーが見つかりません: ' + headerName);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return 0;
  }

  const values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  return values.filter(function(row) {
    return text_(row[0]) !== '';
  }).length;
}

