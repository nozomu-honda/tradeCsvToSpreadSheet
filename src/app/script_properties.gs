/**
 * safer 版 Script Properties 同期用
 *
 * 目的:
 * - 固定テスト用Spreadsheet IDとテスト用フォルダIDをコード管理する
 * - 空欄で既存の Script Properties を上書きしない
 * - 必要に応じて安全に一括反映する
 *
 * 使い方:
 * 1. 必要な値だけ SCRIPT_PROPERTIES_SOURCE に入れる
 * 2. syncScriptProperties_() を実行する
 *    - 空欄は既存値を上書きしない
 * 3. showManagedScriptProperties_() で確認する
 *
 * 補足:
 * - 明示的に空欄へ戻したい場合は clearManagedScriptProperties_() を使う
 * - 強制上書きしたい場合は forceSyncScriptProperties_() を使う
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
 * 毎回安全に存在確認だけしたいときのエイリアス
 * - 実体は safe sync と同じ
 */
function ensureManagedScriptProperties_() {
  syncScriptProperties_();
}

/**
 * 強制同期
 * - 空欄も含めて source の内容で上書きする
 * - 既存の自動登録済みIDを消したいとき以外は通常使わない
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

  Logger.log('Managed Script Properties cleared.');
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
