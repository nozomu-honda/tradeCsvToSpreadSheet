/**
 * 通常テスト用 固定スプレッドシート再利用ヘルパー
 *
 * 方針:
 * - まず Script Properties / 定数の固定IDを見る
 * - なければテスト用フォルダ内をファイル名で探す
 * - なければ自動作成して Script Properties に登録する
 * - フォルダ指定も固定IDもない場合だけ、一時 create にフォールバックする
 */

var __TEST_SUITE_TEMP_SPREADSHEET_ID__ = null;
var __TEST_SUITE_TEMP_SPREADSHEET_IS_FIXED__ = false;

const TEST_FIXED_SPREADSHEET_ID = '';
const TEST_RESOURCE_FOLDER_ID = '';
const TEST_ALLOW_CREATE_FALLBACK = true;
const TEST_FIXED_SPREADSHEET_NAME = '株管理ツール_TEST_SUITE_FIXED';

function getSuiteTempSpreadsheet_() {
  ensureManagedScriptPropertiesIfAvailable_();

  if (__TEST_SUITE_TEMP_SPREADSHEET_ID__) {
    return SpreadsheetApp.openById(__TEST_SUITE_TEMP_SPREADSHEET_ID__);
  }

  const managed = getOrCreateManagedTestSpreadsheet_(
    'TEST_FIXED_SPREADSHEET_ID',
    TEST_FIXED_SPREADSHEET_ID,
    TEST_FIXED_SPREADSHEET_NAME
  );

  __TEST_SUITE_TEMP_SPREADSHEET_ID__ = managed.ss.getId();
  __TEST_SUITE_TEMP_SPREADSHEET_IS_FIXED__ = managed.isManaged;
  return managed.ss;
}

function getOrCreateManagedTestSpreadsheet_(propertyKey, fallbackFixedId, fileName) {
  const props = PropertiesService.getScriptProperties();
  const savedId = text_(props.getProperty(propertyKey)) || text_(fallbackFixedId);

  if (savedId) {
    try {
      return {
        ss: SpreadsheetApp.openById(savedId),
        isManaged: true
      };
    } catch (e) {
      props.deleteProperty(propertyKey);
    }
  }

  const folderId = resolveTestResourceFolderId_();
  if (folderId) {
    const folder = DriveApp.getFolderById(folderId);
    const existing = findGoogleSheetInFolderByName_(folder, fileName);

    if (existing) {
      props.setProperty(propertyKey, existing.getId());
      return {
        ss: SpreadsheetApp.openById(existing.getId()),
        isManaged: true
      };
    }

    const created = SpreadsheetApp.create(fileName);
    DriveApp.getFileById(created.getId()).moveTo(folder);
    props.setProperty(propertyKey, created.getId());

    return {
      ss: created,
      isManaged: true
    };
  }

  if (!TEST_ALLOW_CREATE_FALLBACK) {
    throw new Error(
      '固定テスト用Spreadsheetが見つかりません。' +
      'TEST_FIXED_SPREADSHEET_ID または TEST_RESOURCE_FOLDER_ID を設定してください。'
    );
  }

  const ss = SpreadsheetApp.create('tmp_test_suite_' + new Date().getTime());
  return {
    ss: ss,
    isManaged: false
  };
}

function resolveTestResourceFolderId_() {
  const props = PropertiesService.getScriptProperties();
  return text_(props.getProperty('TEST_RESOURCE_FOLDER_ID')) || TEST_RESOURCE_FOLDER_ID || '';
}

function findGoogleSheetInFolderByName_(folder, fileName) {
  const files = folder.getFilesByName(fileName);
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return file;
    }
  }
  return null;
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

function ensureManagedScriptPropertiesIfAvailable_() {
  if (typeof ensureManagedScriptProperties_ === 'function') {
    ensureManagedScriptProperties_();
  }
}
