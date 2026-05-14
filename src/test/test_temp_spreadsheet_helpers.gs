/**
 * 通常テスト用 一時スプレッドシートヘルパー
 */

var __TEST_SUITE_TEMP_SPREADSHEET_ID__ = null;

function getSuiteTempSpreadsheet_() {
  if (__TEST_SUITE_TEMP_SPREADSHEET_ID__) {
    return SpreadsheetApp.openById(__TEST_SUITE_TEMP_SPREADSHEET_ID__);
  }

  const ss = SpreadsheetApp.create('tmp_test_suite_' + new Date().getTime());
  __TEST_SUITE_TEMP_SPREADSHEET_ID__ = ss.getId();
  return ss;
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

  trashFileWithRetry_(__TEST_SUITE_TEMP_SPREADSHEET_ID__, 'temp spreadsheet cleanup failed');
  __TEST_SUITE_TEMP_SPREADSHEET_ID__ = null;
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

