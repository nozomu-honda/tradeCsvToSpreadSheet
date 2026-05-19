/**
 * DBテスト用 固定スプレッドシート再利用ヘルパー
 *
 * 使い方:
 * 1. key ごとにテスト専用Spreadsheetを手動で作る
 * 2. IDを以下の定数か Script Properties に設定する
 *
 * Script Properties の例:
 *   TEST_FIXED_DB_SPREADSHEET_ID_CORP_A = <spreadsheet id>
 *   TEST_FIXED_DB_SPREADSHEET_ID_CORP_B = <spreadsheet id>
 *   TEST_FIXED_DB_SPREADSHEET_ID_TEST = <spreadsheet id>
 *
 * 定数を使う場合:
 *   TEST_FIXED_DB_SPREADSHEET_IDS_BY_KEY に直接入れる
 *
 * 固定IDが未設定のときだけ、必要に応じて create にフォールバックします。
 */

var __TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__ = {};
var __TEST_SUITE_TEMP_DB_SPREADSHEET_IS_FIXED_BY_KEY__ = {};

const TEST_FIXED_DB_SPREADSHEET_IDS_BY_KEY = {
  corp_a: '',
  corp_b: '',
  corp_c: '',
  test: '',
};

const TEST_ALLOW_DB_CREATE_FALLBACK = true;

function getSuiteTempDbSpreadsheetByKey_(key) {
  if (__TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__[key]) {
    return SpreadsheetApp.openById(__TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__[key]);
  }

  const fixedId = resolveFixedTestDbSpreadsheetId_(key);
  if (fixedId) {
    __TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__[key] = fixedId;
    __TEST_SUITE_TEMP_DB_SPREADSHEET_IS_FIXED_BY_KEY__[key] = true;
    return SpreadsheetApp.openById(fixedId);
  }

  if (!TEST_ALLOW_DB_CREATE_FALLBACK) {
    throw new Error(
      '固定DBテスト用Spreadsheet IDが未設定です。' +
      'key=' + key +
      ' / Script Properties の TEST_FIXED_DB_SPREADSHEET_ID_' + key.toUpperCase() +
      ' または test_temp_db_helpers.gs の TEST_FIXED_DB_SPREADSHEET_IDS_BY_KEY を設定してください。'
    );
  }

  const ss = SpreadsheetApp.create('tmp_' + key + '_' + Utilities.getUuid());
  __TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__[key] = ss.getId();
  __TEST_SUITE_TEMP_DB_SPREADSHEET_IS_FIXED_BY_KEY__[key] = false;
  return ss;
}

function resolveFixedTestDbSpreadsheetId_(key) {
  const props = PropertiesService.getScriptProperties();
  const propKey = 'TEST_FIXED_DB_SPREADSHEET_ID_' + String(key).toUpperCase();
  return props.getProperty(propKey) || TEST_FIXED_DB_SPREADSHEET_IDS_BY_KEY[key] || '';
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
    if (!__TEST_SUITE_TEMP_DB_SPREADSHEET_IS_FIXED_BY_KEY__[key]) {
      trashFileWithRetry_(__TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__[key], 'temp db cleanup failed');
    }
  });

  __TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__ = {};
  __TEST_SUITE_TEMP_DB_SPREADSHEET_IS_FIXED_BY_KEY__ = {};
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
