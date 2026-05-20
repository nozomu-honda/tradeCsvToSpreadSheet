/**
 * DBテスト用 固定スプレッドシート再利用ヘルパー
 *
 * 方針:
 * - key ごとの固定IDを Script Properties / 定数から見る
 * - なければ DB用テストフォルダ内を名前で探す
 * - なければ自動作成して Script Properties に登録する
 * - フォルダ指定も固定IDもない場合だけ、一時 create にフォールバックする
 */

var __TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__ = {};
var __TEST_SUITE_TEMP_DB_SPREADSHEET_IS_FIXED_BY_KEY__ = {};

const TEST_FIXED_DB_SPREADSHEET_IDS_BY_KEY = {
  corp_a: '',
  corp_b: '',
  corp_c: '',
  test: '',
};

const TEST_FIXED_DB_SPREADSHEET_FILE_NAMES_BY_KEY = {
  corp_a: '株管理ツール_TEST_DB_CORP_A',
  corp_b: '株管理ツール_TEST_DB_CORP_B',
  corp_c: '株管理ツール_TEST_DB_CORP_C',
  test: '株管理ツール_TEST_DB_TEST',
};

const TEST_DB_RESOURCE_FOLDER_ID = '';
const TEST_ALLOW_DB_CREATE_FALLBACK = true;

function getSuiteTempDbSpreadsheetByKey_(key) {
  ensureManagedScriptPropertiesIfAvailable_();

  if (__TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__[key]) {
    return SpreadsheetApp.openById(__TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__[key]);
  }

  const managed = getOrCreateManagedTestDbSpreadsheet_(key);
  __TEST_SUITE_TEMP_DB_SPREADSHEET_IDS_BY_KEY__[key] = managed.ss.getId();
  __TEST_SUITE_TEMP_DB_SPREADSHEET_IS_FIXED_BY_KEY__[key] = managed.isManaged;
  return managed.ss;
}

function getOrCreateManagedTestDbSpreadsheet_(key) {
  const props = PropertiesService.getScriptProperties();
  const propertyKey = getTestDbPropertyKey_(key);
  const savedId =
    text_(props.getProperty(propertyKey)) ||
    text_(TEST_FIXED_DB_SPREADSHEET_IDS_BY_KEY[key]);

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

  const folderId = resolveTestDbResourceFolderId_();
  const fileName = getTestDbFileName_(key);

  if (folderId) {
    const folder = DriveApp.getFolderById(folderId);
    const existing = findGoogleSheetInDbFolderByName_(folder, fileName);

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

  if (!TEST_ALLOW_DB_CREATE_FALLBACK) {
    throw new Error(
      '固定DBテスト用Spreadsheetが見つかりません。' +
      'key=' + key +
      ' / ' + propertyKey +
      ' または TEST_DB_RESOURCE_FOLDER_ID / TEST_RESOURCE_FOLDER_ID を設定してください。'
    );
  }

  const ss = SpreadsheetApp.create('tmp_' + key + '_' + Utilities.getUuid());
  return {
    ss: ss,
    isManaged: false
  };
}

function getTestDbPropertyKey_(key) {
  return 'TEST_FIXED_DB_SPREADSHEET_ID_' + String(key).toUpperCase();
}

function getTestDbFileName_(key) {
  return TEST_FIXED_DB_SPREADSHEET_FILE_NAMES_BY_KEY[key] || ('株管理ツール_TEST_DB_' + String(key).toUpperCase());
}

function resolveTestDbResourceFolderId_() {
  const props = PropertiesService.getScriptProperties();
  return (
    text_(props.getProperty('TEST_DB_RESOURCE_FOLDER_ID')) ||
    TEST_DB_RESOURCE_FOLDER_ID ||
    text_(props.getProperty('TEST_RESOURCE_FOLDER_ID')) ||
    ''
  );
}

function findGoogleSheetInDbFolderByName_(folder, fileName) {
  const files = folder.getFilesByName(fileName);
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return file;
    }
  }
  return null;
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

function ensureManagedScriptPropertiesIfAvailable_() {
  if (typeof ensureManagedScriptProperties_ === 'function') {
    ensureManagedScriptProperties_();
  }
}
