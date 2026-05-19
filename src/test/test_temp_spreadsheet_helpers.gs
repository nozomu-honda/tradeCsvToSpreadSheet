/**
 * 通常テスト用 固定スプレッドシート再利用ヘルパー
 *
 * 使い方:
 * 1. 手動でテスト専用Spreadsheetを1冊作る
 * 2. そのIDを以下の定数か Script Properties に設定する
 *
 * Script Properties を使う場合:
 *   TEST_FIXED_SPREADSHEET_ID = <spreadsheet id>
 *
 * 定数を使う場合:
 *   TEST_FIXED_SPREADSHEET_ID に直接入れる
 *
 * 固定IDが未設定のときだけ、必要に応じて create にフォールバックします。
 */

var __TEST_SUITE_TEMP_SPREADSHEET_ID__ = null;
var __TEST_SUITE_TEMP_SPREADSHEET_IS_FIXED__ = false;

const TEST_FIXED_SPREADSHEET_ID = '';
const TEST_ALLOW_CREATE_FALLBACK = true;

function getSuiteTempSpreadsheet_() {
  if (__TEST_SUITE_TEMP_SPREADSHEET_ID__) {
    return SpreadsheetApp.openById(__TEST_SUITE_TEMP_SPREADSHEET_ID__);
  }

  const fixedId = resolveFixedTestSpreadsheetId_();
  if (fixedId) {
    __TEST_SUITE_TEMP_SPREADSHEET_ID__ = fixedId;
    __TEST_SUITE_TEMP_SPREADSHEET_IS_FIXED__ = true;
    return SpreadsheetApp.openById(fixedId);
  }

  if (!TEST_ALLOW_CREATE_FALLBACK) {
    throw new Error(
      '固定テスト用Spreadsheet IDが未設定です。' +
      'Script Properties の TEST_FIXED_SPREADSHEET_ID または test_temp_spreadsheet_helpers.gs の TEST_FIXED_SPREADSHEET_ID を設定してください。'
    );
  }

  const ss = SpreadsheetApp.create('tmp_test_suite_' + new Date().getTime());
  __TEST_SUITE_TEMP_SPREADSHEET_ID__ = ss.getId();
  __TEST_SUITE_TEMP_SPREADSHEET_IS_FIXED__ = false;
  return ss;
}

function resolveFixedTestSpreadsheetId_() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('TEST_FIXED_SPREADSHEET_ID') || TEST_FIXED_SPREADSHEET_ID || '';
}

function resetTempSpreadsheet_(ss) {
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

  const maxRows = first.getMaxRows();
  const maxCols = first.getMaxColumns();

  if (maxRows > 200) {
    first.deleteRows(201, maxRows - 200);
  } else if (maxRows < 200) {
    first.insertRowsAfter(maxRows, 200 - maxRows);
  }

  if (maxCols > 40) {
    first.deleteColumns(41, maxCols - 40);
  } else if (maxCols < 40) {
    first.insertColumnsAfter(maxCols, 40 - maxCols);
  }

  first.getRange(1, 1).setValue('');
}

function withTempSpreadsheet_(fn) {
  const ss = getSuiteTempSpreadsheet_();
  resetTempSpreadsheet_(ss);
  return fn(ss);
}

function cleanupSuiteTempSpreadsheet_() {
  if (!__TEST_SUITE_TEMP_SPREADSHEET_ID__) {
    return;
  }

  if (!__TEST_SUITE_TEMP_SPREADSHEET_IS_FIXED__) {
    trashFileWithRetry_(__TEST_SUITE_TEMP_SPREADSHEET_ID__, 'temp spreadsheet cleanup failed');
  }

  __TEST_SUITE_TEMP_SPREADSHEET_ID__ = null;
  __TEST_SUITE_TEMP_SPREADSHEET_IS_FIXED__ = false;
}

function trashFileWithRetry_(fileId, logPrefix) {
  let lastError = null;

  for (let i = 0; i < 3; i++) {
    try {
      DriveApp.getFileById(fileId).setTrashed(true);
      return;
    } catch (e) {
      lastError = e;
      Utilities.sleep(1000 * (i + 1));
    }
  }

  if (lastError) {
    Logger.log((logPrefix || 'temp cleanup failed') + ': ' + lastError.message);
  }
}
