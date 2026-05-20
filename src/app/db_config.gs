/**
 * DB化ブランチ用の設定
 *
 * 方針:
 * - 法人ごと / 口座グループごとにDBスプレッドシートを分ける
 * - Web UI からどのDBへ追加するかを選ぶ
 * - 誤って追加した場合は、取込単位(importId単位)でロールバックする
 * - test DB は赤セル必須入力バリデーションをスキップできる
 * - test DB は固定の確認用Spreadsheetへ出力する
 */
const DB_CONFIG = {
  DEFAULT_TARGET_DB_KEY: 'corp_a',

  TARGET_DBS: [
    {
      key: 'corp_a',
      label: '（株）本田土地建物',
      spreadsheetId: '1XqCr8PpcENcx_-krJV1jRKb5_yU9tVBVXvEtypCSLGY',
      spreadsheetName: '取引DB_法人A',
    },
    {
      key: 'corp_b',
      label: '（株）本田',
      spreadsheetId: '1i9pU8D8J-vRVP6uMfaIbMtX9lC4DFw3jw1AfbASCvlw',
      spreadsheetName: '取引DB_法人B',
    },
    {
      key: 'test',
      label: 'テスト用DB（赤セルバリデーション無視）',
      spreadsheetId: '1IEwnXis7WiFJ9jRl3E-llZanhjkwlyOafWqSXCxkI3M',
      spreadsheetName: '株管理ツール_TEST_DB',
    }
  ],

  /**
   * test DB 選択時の固定確認用Spreadsheet
   *
   * spreadsheetId を設定すると create を使わず openById だけで更新できる。
   * spreadsheetId が空欄かつ該当名のSpreadsheetが存在しない場合だけ、初回に create する。
   */
  TEST_OUTPUT_SPREADSHEET: {
    spreadsheetId: '1BvDhQ9Osd2ZLx3dINbM7v3-ulIW8PQHMAR2CysXf2JQ',
    spreadsheetName: '株管理ツール_TEST_OUTPUT',
  },

  SHEET_TRANSACTIONS: '取引DB',
  SHEET_IMPORT_LOGS: '取込履歴',
  MAX_RECENT_IMPORTS: 30,
};

const DB_HEADERS = [
  'recordId',
  'importId',
  'sourceName',
  'sourceRowNo',
  'rowHash',
  ...BASE_HEADERS,
  'createdAt',
  'updatedAt',
  'rolledBackAt',
  'isActive',
];

const IMPORT_LOG_HEADERS = [
  'importId',
  'importedAt',
  'targetDbKey',
  'targetDbLabel',
  'sourceName',
  'inputType',
  'normalizedUrl',
  'rowCount',
  'insertedCount',
  'skippedCount',
  'alertCount',
  'isRolledBack',
  'rolledBackAt',
  'rolledBackRecordCount',
];
