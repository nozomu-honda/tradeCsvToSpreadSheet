/**
 * DB化ブランチ用の設定
 *
 * 方針:
 * - 法人ごと / 口座グループごとにDBスプレッドシートを分ける
 * - Web UI では従来どおり 法人A / 法人B / test を選ぶ
 * - 入力ヘッダーを見て 野村 / 楽天 を自動判定し、対応するDBへ振り分ける
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
      uiVisible: true,
    },
    {
      key: 'corp_b',
      label: '（株）本田',
      spreadsheetId: '1i9pU8D8J-vRVP6uMfaIbMtX9lC4DFw3jw1AfbASCvlw',
      spreadsheetName: '取引DB_法人B',
      uiVisible: true,
    },
    {
      key: 'test',
      label: 'テスト用DB（赤セルバリデーション無視）',
      spreadsheetId: '1IEwnXis7WiFJ9jRl3E-llZanhjkwlyOafWqSXCxkI3M',
      spreadsheetName: '株管理ツール_TEST_DB',
      uiVisible: true,
    },

    {
      key: 'rakuten_corp_a',
      label: '（株）本田土地建物（楽天）',
      spreadsheetId: '',
      spreadsheetName: '取引DB_法人A_楽天',
      uiVisible: false,
    },
    {
      key: 'rakuten_corp_b',
      label: '（株）本田（楽天）',
      spreadsheetId: '',
      spreadsheetName: '取引DB_法人B_楽天',
      uiVisible: false,
    },
    {
      key: 'rakuten_test',
      label: 'テスト用DB（楽天・赤セルバリデーション無視）',
      spreadsheetId: '',
      spreadsheetName: '株管理ツール_TEST_DB_楽天',
      uiVisible: false,
    }
  ],

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
