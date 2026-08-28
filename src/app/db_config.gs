/**
 * DB化ブランチ用の設定
 *
 * 方針:
 * - 法人ごと / 口座グループごとにDBスプレッドシートを分ける
 * - Web UI では従来どおり 法人A / 法人B / test 用DBを選ぶ
 * - 入力ヘッダーを見て 野村 / 楽天 を自動判定し、対応するDBへ振り分ける
 * - nomura_test / rakuten_test DB は赤セル必須入力バリデーションをスキップできる
 * - nomura_test / rakuten_test DB は固定の確認用Spreadsheetへ出力する
 */
const DB_CONFIG = {
  DEFAULT_TARGET_DB_KEY: 'nomura_corp_a',
  DB_FOLDER_ID: '1T7vfpPMgmk8auy22ZA9OWuMtC4Nswhaq',
  
  TARGET_DBS: [
    {
      key: 'nomura_corp_a',
      label: '（株）本田土地建物（野村）',
      importLabel: '（株）本田土地建物',
      spreadsheetId: '1XqCr8PpcENcx_-krJV1jRKb5_yU9tVBVXvEtypCSLGY',
      spreadsheetName: '取引DB_（株）本田土地建物_野村',
      uiVisible: true,
    },
    {
      key: 'nomura_corp_b',
      label: '（株）本田（野村）',
      importLabel: '（株）本田',
      spreadsheetId: '1i9pU8D8J-vRVP6uMfaIbMtX9lC4DFw3jw1AfbASCvlw',
      spreadsheetName: '取引DB_（株）本田_野村',
      uiVisible: true,
    },
    {
      key: 'nomura_test',
      label: 'テスト用DB（野村・赤セルバリデーション無視）',
      importLabel: 'テスト用DB（赤セルバリデーション無視）',
      spreadsheetId: '1IEwnXis7WiFJ9jRl3E-llZanhjkwlyOafWqSXCxkI3M',
      spreadsheetName: '株管理ツール_テスト用DB_野村',
      uiVisible: true,
    },

    {
      key: 'rakuten_corp_a',
      label: '（株）本田土地建物（楽天）',
      spreadsheetId: '',
      spreadsheetName: '取引DB_（株）本田土地建物_楽天',
      uiVisible: false,
    },
    {
      key: 'rakuten_corp_b',
      label: '（株）本田（楽天）',
      spreadsheetId: '',
      spreadsheetName: '取引DB_（株）本田_楽天',
      uiVisible: false,
    },
    {
      key: 'rakuten_test',
      label: 'テスト用DB（楽天・赤セルバリデーション無視）',
      spreadsheetId: '',
      spreadsheetName: '株管理ツール_テスト用DB_楽天',
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

const RAKUTEN_DB_HEADERS = [
  'recordId', // CSV由来なし: DB内レコードID
  'importId', // CSV由来なし: 取込ID
  'sourceName', // CSV由来なし: 入力ファイル名/入力元シート名
  'sourceRowNo', // CSV由来なし: 入力明細の行番号
  'rowHash', // CSV由来なし: 重複判定用ハッシュ
  'sourceType', // CSV由来なし: rakuten_jp_stock / rakuten_us_stock / rakuten_fund / rakuten_dividend / rakuten_cash
  'broker', // CSV由来なし: 楽天
  'tradeDate', // 約定日
  'settlementDate', // 受渡日
  'paymentDate', // 入金日
  'cashDate', // 入出金日
  'product', // 商品
  'rawProduct', // 商品
  'symbolCode', // 銘柄コード / ティッカー
  'symbolName', // 銘柄名 / 銘柄 / ファンド名
  'rawTradeType', // 売買区分 / 取引区分 / 取引 / 内容
  'normalizedTradeType', // CSV由来なし: 共通計算モデル用の取引区分
  'accountType', // 口座区分 / 口座
  'market', // 市場名称
  'currency', // 受取通貨 / 発行通貨相当
  'settlementCurrency', // 決済通貨 / 受取通貨
  'quantity', // 数量[株] / 数量[口] / 数量[株/口]
  'unitPrice', // 単価[円] / 単価[USドル] / 単価 / 単価[円/現地通貨]
  'grossAmount', // 約定代金[USドル] / 配当・分配金合計(税引前)[円/現地通貨] / 受付金額[現地通貨]
  'netAmount', // 受取金額[円/現地通貨] / 楽天米国株の元CSV受渡金額[円]
  'settlementAmount', // 受渡金額[円] / 受渡金額[USドル] / 受渡金額/(ポイント利用)[円] / 入金額[円] / 出金額[円]
  'fee', // 手数料[円] / 手数料[USドル] / 経費
  'tax', // 税金等[円] / 税額合計[円/現地通貨]
  'miscFee', // 諸費用[円]
  'exchangeRate', // 為替レート
  'manualRate', // 楽天配当金CSV手入力: レート
  'manualForeignWithholdingTaxJpy', // 楽天配当金CSV手入力: 現地源泉税［円］
  'manualDomesticWithholdingTaxJpy', // 楽天配当金CSV手入力: 国内源泉税［円］
  'description', // 内容 / 出金先 / 買付方法 / 商品補足
  'createdAt', // CSV由来なし: 作成日時
  'updatedAt', // CSV由来なし: 更新日時
  'rolledBackAt', // CSV由来なし: ロールバック日時
  'isActive', // CSV由来なし: 有効フラグ
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
