/**
 * safer + once-per-execution 版 Script Properties 同期用
 *
 * 目的:
 * - 固定テスト用Spreadsheet IDとテスト用フォルダIDをコード管理する
 * - 空欄で既存の Script Properties を上書きしない
 * - ensureManagedScriptProperties_() を同一実行中に何度呼ばれても1回だけ同期する
 */

const SCRIPT_PROPERTIES_SOURCE = {
  TEST_RESOURCE_FOLDER_ID: '1A9JugQlxelX71TZSvyV42EsoMi5m_OCP',
  TEST_DB_RESOURCE_FOLDER_ID: '1VIe0SZtJHwAeNqAzRiXFIE_9bI2rSfOq',

  TEST_FIXED_SPREADSHEET_ID: '',
  TEST_FIXED_DB_SPREADSHEET_ID_CORP_A: '',
  TEST_FIXED_DB_SPREADSHEET_ID_CORP_B: '',
  TEST_FIXED_DB_SPREADSHEET_ID_CORP_C: '',
  TEST_FIXED_DB_SPREADSHEET_ID_TEST: '',
};

var __MANAGED_SCRIPT_PROPERTIES_ENSURED__ = false;

/**
 * 安全同期
 * - source 側が空欄のキーは既存値を保持
 * - source 側が非空欄のキーだけ setProperty する
 */
function syncScriptProperties_() {
  const props = PropertiesService.getScriptProperties();
  const updatedKeys = [];
  const keptKeys = [];

  Object.keys(SCRIPT_PROPERTIES_SOURCE).forEach(function(key) {
    const sourceValue = normalizeScriptPropertyValue_(SCRIPT_PROPERTIES_SOURCE[key]);

    if (sourceValue === '') {
      keptKeys.push(key);
      return;
    }

    props.setProperty(key, sourceValue);
    updatedKeys.push(key);
  });

  Logger.log(
    JSON.stringify({
      mode: 'safe_sync',
      updatedKeys: updatedKeys,
      keptKeys: keptKeys
    }, null, 2)
  );
}

/**
 * 毎回安全に存在確認したいとき用
 * - 同一実行中は1回だけ sync を実行
 * - 2回目以降は何もしない
 */
function ensureManagedScriptProperties_() {
  if (__MANAGED_SCRIPT_PROPERTIES_ENSURED__) {
    return;
  }

  __MANAGED_SCRIPT_PROPERTIES_ENSURED__ = true;
  syncScriptProperties_();
}

/**
 * 強制同期
 * - 空欄も含めて source の内容で上書きする
 */
function forceSyncScriptProperties_() {
  const props = PropertiesService.getScriptProperties();

  Object.keys(SCRIPT_PROPERTIES_SOURCE).forEach(function(key) {
    props.setProperty(key, normalizeScriptPropertyValue_(SCRIPT_PROPERTIES_SOURCE[key]));
  });

  Logger.log('Script Properties force synced: ' + Object.keys(SCRIPT_PROPERTIES_SOURCE).join(', '));
}

/**
 * 管理対象キーだけ削除
 */
function clearManagedScriptProperties_() {
  const props = PropertiesService.getScriptProperties();

  Object.keys(SCRIPT_PROPERTIES_SOURCE).forEach(function(key) {
    props.deleteProperty(key);
  });

  __MANAGED_SCRIPT_PROPERTIES_ENSURED__ = false;
  Logger.log('Managed Script Properties cleared.');
}

/**
 * 手動で再評価したいとき用
 */
function resetManagedScriptPropertiesEnsureFlag_() {
  __MANAGED_SCRIPT_PROPERTIES_ENSURED__ = false;
  Logger.log('Managed Script Properties ensure flag reset.');
}

/**
 * 全 Script Properties を表示
 */
function showScriptProperties_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  Logger.log(JSON.stringify(props, null, 2));
}

/**
 * 管理対象キーだけ表示
 */
function showManagedScriptProperties_() {
  const props = PropertiesService.getScriptProperties();
  const result = {};

  Object.keys(SCRIPT_PROPERTIES_SOURCE).forEach(function(key) {
    result[key] = props.getProperty(key) || '';
  });

  Logger.log(JSON.stringify(result, null, 2));
}

function normalizeScriptPropertyValue_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}
