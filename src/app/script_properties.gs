/**
 * Script Properties 同期用
 *
 * 目的:
 * - 固定テスト用Spreadsheet IDをコード管理する
 * - 必要に応じて Script Properties へ一括反映する
 *
 * 使い方:
 * 1. 各 ID を埋める
 * 2. syncScriptProperties_() を実行
 * 3. 確認したいときは showScriptProperties_() を実行
 *
 * 注意:
 * - 既存の Script Properties をこの定義で上書きします
 * - 空文字のキーもそのまま保存されます
 */

const SCRIPT_PROPERTIES_SOURCE = {
  TEST_FIXED_SPREADSHEET_ID: '',
  TEST_FIXED_DB_SPREADSHEET_ID_CORP_A: '',
  TEST_FIXED_DB_SPREADSHEET_ID_CORP_B: '',
  TEST_FIXED_DB_SPREADSHEET_ID_CORP_C: '',
  TEST_FIXED_DB_SPREADSHEET_ID_TEST: '',
};

function syncScriptProperties_() {
  const props = PropertiesService.getScriptProperties();

  Object.keys(SCRIPT_PROPERTIES_SOURCE).forEach(function(key) {
    props.setProperty(key, SCRIPT_PROPERTIES_SOURCE[key]);
  });

  Logger.log('Script Properties synced: ' + Object.keys(SCRIPT_PROPERTIES_SOURCE).join(', '));
}

function clearManagedScriptProperties_() {
  const props = PropertiesService.getScriptProperties();

  Object.keys(SCRIPT_PROPERTIES_SOURCE).forEach(function(key) {
    props.deleteProperty(key);
  });

  Logger.log('Managed Script Properties cleared.');
}

function showScriptProperties_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  Logger.log(JSON.stringify(props, null, 2));
}

function showManagedScriptProperties_() {
  const props = PropertiesService.getScriptProperties();
  const result = {};

  Object.keys(SCRIPT_PROPERTIES_SOURCE).forEach(function(key) {
    result[key] = props.getProperty(key) || '';
  });

  Logger.log(JSON.stringify(result, null, 2));
}
