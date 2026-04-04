/**
 * Apps Script テストランナー
 *
 * 役割:
 * - builder.gs の計算ロジック確認
 * - utils.gs の補助ロジック確認
 * - writer.gs の表示/非表示/条件付き書式確認
 * - import.gs の入力アラート確認
 * - feature/use-db 用の軽量DBロジック確認
 *
 * 実行方法:
 * - Apps Script エディタで runSmokeTests または runAllTests を実行
 *
 * 注意:
 * - writer 系テストでは一時スプレッドシートを作成する
 * - テスト後に Drive のゴミ箱へ移動する
 * - 初回は SpreadsheetApp / DriveApp の権限承認が必要
 */

/**
 * 軽い確認テスト
 *
 * writer.gs の一時スプレッドシート生成系を除いた、普段使い向け。
 */
function runSmokeTests() {
  const tests = [
    test_averageUnitPrice_keepsDecimal_,
    test_bookValue_usesAcquisitionPrice_,
    test_sellWithoutAvg_addsAlert_,
    test_sortTradeRows_usesPriority_,
    test_stockConversionBuy_updatesHoldingAndAvg_,
    test_forcedRedemptionSell_updatesHoldingAndBookValue_,
    test_redemption_tradeRowAndCashRow_,
    test_collectInputAlerts_supportedForeignBond_,
    test_collectInputAlerts_supportedProductAndCurrency_doNothing_,
    test_collectInputAlerts_unsupportedProduct_,
    test_collectInputAlerts_unsupportedSettlementCurrency_,
    test_holdingZero_and_balanceZero_,
    test_lastTradeHighlightFlag_,
    test_buildCashRows_runningBalance_,
    test_normalizeZero_,
    test_buildRowHash_sameRecord_sameHash_,
    test_buildRowHash_differentRecord_differentHash_,
    test_normalizeRecordForDb_setsMetadata_,
    test_dbRecordToRow_mapsHeaders_,
  ];

  return runSelectedTests_(tests, '軽い確認テスト');
}

/**
 * フルテスト
 *
 * builder / utils / writer / import / db をまとめて確認する。
 * writer 系では一時スプレッドシートを作成する。
 */
function runAllTests() {
  const tests = [
    test_averageUnitPrice_keepsDecimal_,
    test_bookValue_usesAcquisitionPrice_,
    test_sellWithoutAvg_addsAlert_,
    test_sortTradeRows_usesPriority_,
    test_stockConversionBuy_updatesHoldingAndAvg_,
    test_forcedRedemptionSell_updatesHoldingAndBookValue_,
    test_redemption_tradeRowAndCashRow_,
    test_collectInputAlerts_supportedForeignBond_,
    test_collectInputAlerts_supportedProductAndCurrency_doNothing_,
    test_collectInputAlerts_unsupportedProduct_,
    test_collectInputAlerts_unsupportedSettlementCurrency_,
    test_holdingZero_and_balanceZero_,
    test_lastTradeHighlightFlag_,
    test_buildCashRows_runningBalance_,
    test_normalizeZero_,
    test_buildRowHash_sameRecord_sameHash_,
    test_buildRowHash_differentRecord_differentHash_,
    test_normalizeRecordForDb_setsMetadata_,
    test_dbRecordToRow_mapsHeaders_,
    test_writeSheet_domesticHiddenColumns_,
    test_writeSheet_foreignHiddenColumns_,
    test_writeSheet_tradeConditionalFormatRules_,
    test_writeSheet_averageUnitPriceNumberFormat_,
  ];

  return runSelectedTests_(tests, 'フルテスト');
}

/**
 * 共通テスト実行関数
 */
function runSelectedTests_(tests, label) {
  const results = [];
  let failed = 0;

  tests.forEach(function(fn) {
    try {
      fn();
      results.push('OK  ' + fn.name);
    } catch (e) {
      failed++;
      results.push('NG  ' + fn.name + ' :: ' + e.message);
    }
  });

  const message = '[' + label + ']\n' + results.join('\n');
  Logger.log(message);

  if (failed > 0) {
    throw new Error(message);
  }

  return message;
}

/* =========================================================
 * builder.gs / utils.gs / import.gs のテスト
 * ========================================================= */

/**
 * 平均取得単価は内部では小数保持されることを確認する。
 * 表示時の整数化は writer.gs の書式で行う前提。
 */
function test_averageUnitPrice_keepsDecimal_() {
  const alerts = [];
  const records = [
    makeTradeRecord_({
      銘柄名: 'AAA',
      取引区分: '現物買付',
      数量: 3,
      単価: 333.3333333333,
      受渡金額_決済損益: 1000,
      手数料税込: 0,
      約定日: '2026/04/01',
      受渡日: '2026/04/01',
      決済通貨: 'JPY'
    })
  ];

  const rows = buildTradeRows_(records, alerts);
  const avgUnitPrice = getTradeRowValue_(rows[0], '平均取得単価');

  assertApproxEquals_(1000 / 3, avgUnitPrice, 1e-9, '平均取得単価は内部で小数保持');
  assertTrue_(Math.round(avgUnitPrice) !== avgUnitPrice, '平均取得単価は内部で丸め込まれていないこと');
  assertEquals_(0, alerts.length, '不要なアラートは出ないこと');
}

/**
 * 売却時の簿価は acquisitionPrice を基準に
 * bookValue = -acquisitionPrice
 * になっていることを確認する。
 */
function test_bookValue_usesAcquisitionPrice_() {
  const alerts = [];
  const records = [
    makeTradeRecord_({
      銘柄名: 'AAA',
      取引区分: '現物買付',
      数量: 3,
      単価: 333.3333333333,
      受渡金額_決済損益: 1000,
      手数料税込: 0,
      約定日: '2026/04/01',
      受渡日: '2026/04/01',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: 'AAA',
      取引区分: '現物売却',
      数量: 2,
      単価: 600,
      受渡金額_決済損益: 1200,
      手数料税込: 0,
      約定日: '2026/04/02',
      受渡日: '2026/04/02',
      決済通貨: 'JPY'
    })
  ];

  const rows = buildTradeRows_(records, alerts);
  const sellRow = rows[1];
  const acquisitionPrice = getTradeRowValue_(sellRow, '取得価格');
  const bookValue = getTradeRowValue_(sellRow, '簿価');

  assertApproxEquals_((1000 / 3) * 2, acquisitionPrice, 1e-9, '取得価格は直前平均取得単価ベース');
  assertApproxEquals_(-acquisitionPrice, bookValue, 1e-9, '簿価は -acquisitionPrice');
  assertEquals_(0, alerts.length, '不要なアラートは出ないこと');
}

/**
 * 買付がないまま売却した場合、
 * 「対象外」ではなく「平均取得単価が未計算」アラートになることを確認する。
 */
function test_sellWithoutAvg_addsAlert_() {
  const alerts = [];
  const records = [
    makeTradeRecord_({
      銘柄名: 'BBB',
      取引区分: '現物売却',
      数量: 1,
      単価: 1000,
      受渡金額_決済損益: 1000,
      手数料税込: 0,
      約定日: '2026/04/02',
      受渡日: '2026/04/02',
      決済通貨: 'JPY'
    })
  ];

  const rows = buildTradeRows_(records, alerts);
  const sellRow = rows[0];

  assertEquals_('', getTradeRowValue_(sellRow, '取得価格'), '取得価格は空欄');
  assertEquals_('', getTradeRowValue_(sellRow, '簿価'), '簿価は空欄');
  assertTrue_(
    alerts.some(function(x) { return x.indexOf('簿価: 平均取得単価が未計算') >= 0; }),
    '平均取得単価未計算アラートが出ること'
  );
  assertTrue_(
    !alerts.some(function(x) { return x.indexOf('簿価: 対象外の取引区分') >= 0; }),
    '対象外アラートではないこと'
  );
}

/**
 * sortTradeRows_ が compareTradePriority_ を使った並び順になっていることを確認する。
 */
function test_sortTradeRows_usesPriority_() {
  const records = [
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '入金（分配金）',   約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '現物売却',         約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '現物募集',         約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '現物買付',         約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '現物再投',         約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '現物買取',         約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '株転換取得（買）', 約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '入庫（増減資）',   約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '強制償還（売）',   約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '償還',             約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '入金（利金）',     約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '入金（配当金）',   約定日: '2026/04/01', 受渡日: '2026/04/01' }),
  ];

  const sorted = records.slice().sort(sortTradeRows_);
  const actual = sorted.map(function(r) { return r['取引区分']; });
  const expected = [
    '現物買付',
    '現物再投',
    '現物募集',
    '株転換取得（買）',
    '入庫（増減資）',
    '現物売却',
    '現物買取',
    '強制償還（売）',
    '償還',
    '入金（利金）',
    '入金（配当金）',
    '入金（分配金）',
  ];

  assertArrayEquals_(expected, actual, '取引区分優先順位ソート');
}

function test_stockConversionBuy_updatesHoldingAndAvg_() {
  const alerts = [];
  const records = [
    makeTradeRecord_({
      銘柄名: 'SCB',
      商品: '株式',
      取引区分: '現物買付',
      数量: 2,
      受渡金額_決済損益: 200,
      手数料税込: 0,
      約定日: '2026/04/01',
      受渡日: '2026/04/01',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: 'SCB',
      商品: '株式',
      取引区分: '株転換取得（買）',
      数量: 1,
      受渡金額_決済損益: 150,
      手数料税込: 0,
      約定日: '2026/04/02',
      受渡日: '2026/04/02',
      決済通貨: 'JPY'
    }),
  ];

  const rows = buildTradeRows_(records, alerts);
  const row = rows[1];

  assertEquals_(3, getTradeRowValue_(row, '保有数'), '株転換取得（買）で保有数が増える');
  assertEquals_(150, getTradeRowValue_(row, '簿価'), '株転換取得（買）の簿価');
  assertEquals_(200, getTradeRowValue_(row, '銘柄ごとの残高'), '株転換取得（買）は銘柄ごとの残高を動かさない');
  assertApproxEquals_((200 + 150) / 3, getTradeRowValue_(row, '平均取得単価'), 1e-9, '株転換取得（買）は平均取得単価の対象');
  assertEquals_(0, alerts.length, '不要なアラートは出ないこと');
}

function test_forcedRedemptionSell_updatesHoldingAndBookValue_() {
  const alerts = [];
  const records = [
    makeTradeRecord_({
      銘柄名: 'FRS',
      商品: '株式',
      取引区分: '現物買付',
      数量: 3,
      受渡金額_決済損益: 300,
      手数料税込: 0,
      約定日: '2026/04/01',
      受渡日: '2026/04/01',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: 'FRS',
      商品: '株式',
      取引区分: '強制償還（売）',
      数量: 1,
      受渡金額_決済損益: 120,
      手数料税込: 0,
      約定日: '2026/04/02',
      受渡日: '2026/04/02',
      決済通貨: 'JPY'
    }),
  ];

  const rows = buildTradeRows_(records, alerts);
  const row = rows[1];

  assertEquals_(2, getTradeRowValue_(row, '保有数'), '強制償還（売）で保有数が減る');
  assertEquals_(-120, getTradeRowValue_(row, '簿価'), '強制償還（売）の簿価');
  assertEquals_(300, getTradeRowValue_(row, '銘柄ごとの残高'), '強制償還（売）は銘柄ごとの残高を動かさない');
  assertEquals_('', getTradeRowValue_(row, '平均取得単価'), '強制償還（売）は平均取得単価を再計算しない');
  assertEquals_(0, alerts.length, '不要なアラートは出ないこと');
}

function test_redemption_tradeRowAndCashRow_() {
  const alerts = [];
  const records = [
    makeTradeRecord_({
      銘柄名: 'RED',
      商品: '外債',
      取引区分: '償還',
      数量: 0,
      受渡金額_決済損益: 500,
      手数料税込: 0,
      約定日: '2026/04/10',
      受渡日: '2026/04/10',
      決済通貨: 'USD'
    }),
  ];

  const tradeRows = buildTradeRows_(records, alerts);
  const tradeRow = tradeRows[0];
  const cashRows = buildCashRows_(records);

  assertEquals_(0, getTradeRowValue_(tradeRow, '保有数'), '償還は保有数を動かさない');
  assertEquals_('', getTradeRowValue_(tradeRow, '簿価'), '償還は簿価なし');
  assertEquals_('', getTradeRowValue_(tradeRow, '平均取得単価'), '償還は平均取得単価なし');
  assertEquals_(500, cashRows[0][16], '償還は金銭残高を増やす');
  assertEquals_(500, cashRows[0][17], '償還が月末最終行なら月次残高に入る');
  assertEquals_(0, alerts.length, '不要なアラートは出ないこと');
}

function test_collectInputAlerts_supportedForeignBond_() {
  const alerts = [];
  const records = [
    makeTradeRecord_({
      銘柄名: 'BOND',
      商品: '外債',
      取引区分: '償還',
      決済通貨: 'USD',
      受渡金額_決済損益: 100
    }),
  ];

  collectInputAlerts_(records, alerts);

  assertEquals_(0, alerts.length, '外債/USD は未対応アラート対象ではない');
}

function test_collectInputAlerts_unsupportedProduct_() {
  const alerts = [];
  const records = [
    makeTradeRecord_({
      銘柄名: 'ETFTEST',
      商品: 'ETF',
      取引区分: '現物買付',
      決済通貨: 'JPY',
      受渡金額_決済損益: 100
    }),
  ];

  collectInputAlerts_(records, alerts);

  assertTrue_(
    alerts.some(function(x) { return x.indexOf('商品: 未対応の商品') >= 0; }),
    '未対応商品アラートが出ること'
  );
}

function test_collectInputAlerts_unsupportedSettlementCurrency_() {
  const alerts = [];
  const records = [
    makeTradeRecord_({
      銘柄名: 'EURTEST',
      商品: '外債',
      取引区分: '償還',
      決済通貨: 'EUR',
      受渡金額_決済損益: 100
    }),
  ];

  collectInputAlerts_(records, alerts);

  assertTrue_(
    alerts.some(function(x) { return x.indexOf('決済通貨: 未対応の決済通貨') >= 0; }),
    '未対応決済通貨アラートが出ること'
  );
}

function test_collectInputAlerts_supportedProductAndCurrency_doNothing_() {
  const alerts = [];
  const records = [
    makeTradeRecord_({
      銘柄名: 'OKTEST',
      商品: '株式',
      取引区分: '現物買付',
      決済通貨: 'JPY',
      受渡金額_決済損益: 100
    }),
    makeTradeRecord_({
      銘柄名: 'OKBOND',
      商品: '外債',
      取引区分: '償還',
      決済通貨: 'USD',
      受渡金額_決済損益: 100
    }),
    makeTradeRecord_({
      銘柄名: '',
      商品: '現金',
      摘要: '入金テスト',
      取引区分: '入金',
      決済通貨: 'JPY',
      受渡金額_決済損益: 100
    }),
  ];

  collectInputAlerts_(records, alerts);

  assertEquals_(0, alerts.length, '対応済み商品/決済通貨ではアラートなし');
}

/**
 * 全売却後に保有数と銘柄ごとの残高が 0 になることを確認する。
 * 1 / -1 のようなズレ再発監視用。
 */
function test_holdingZero_and_balanceZero_() {
  const alerts = [];
  const records = [
    makeTradeRecord_({
      銘柄名: 'DDD',
      取引区分: '現物買付',
      数量: 3,
      受渡金額_決済損益: 1000,
      約定日: '2026/04/01',
      受渡日: '2026/04/01',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: 'DDD',
      取引区分: '現物売却',
      数量: 2,
      単価: 700,
      受渡金額_決済損益: 1400,
      約定日: '2026/04/02',
      受渡日: '2026/04/02',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: 'DDD',
      取引区分: '現物売却',
      数量: 1,
      単価: 400,
      受渡金額_決済損益: 400,
      約定日: '2026/04/03',
      受渡日: '2026/04/03',
      決済通貨: 'JPY'
    }),
  ];

  const rows = buildTradeRows_(records, alerts);
  const lastRow = rows[2];

  assertEquals_(0, getTradeRowValue_(lastRow, '保有数'), '最終保有数は0');
  assertEquals_(0, normalizeZero_(getTradeRowValue_(lastRow, '銘柄ごとの残高')), '最終残高は0');
}

/**
 * 同一銘柄の最後の取引で、かつ保有数が正の場合だけ
 * helper列に YES が入ることを確認する。
 */
function test_lastTradeHighlightFlag_() {
  const alerts = [];
  const records = [
    makeTradeRecord_({
      銘柄名: 'EEE',
      取引区分: '現物買付',
      数量: 3,
      受渡金額_決済損益: 900,
      約定日: '2026/04/01',
      受渡日: '2026/04/01',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: 'EEE',
      取引区分: '現物売却',
      数量: 1,
      単価: 500,
      受渡金額_決済損益: 500,
      約定日: '2026/04/02',
      受渡日: '2026/04/02',
      決済通貨: 'JPY'
    }),
  ];

  const rows = buildTradeRows_(records, alerts);
  const firstRow = rows[0];
  const lastRow = rows[1];

  assertEquals_('', getTradeHelperValue_(firstRow), '途中行はハイライト対象ではない');
  assertEquals_('YES', getTradeHelperValue_(lastRow), '最後の取引かつ保有数正なら YES');
  assertTrue_(getTradeRowValue_(lastRow, '保有数') > 0, '最後の行の保有数は正');
}

/**
 * 金銭残高シートの残高/月次残高の累積計算を確認する。
 */
function test_buildCashRows_runningBalance_() {
  const records = [
    makeTradeRecord_({
      銘柄名: 'FFF',
      取引区分: '現物買付',
      受渡金額_決済損益: 1000,
      約定日: '2026/04/01',
      受渡日: '2026/04/01',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: 'FFF',
      取引区分: '入金（配当金）',
      受渡金額_決済損益: 50,
      約定日: '2026/04/10',
      受渡日: '2026/04/10',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: '',
      商品: '現金',
      摘要: '入金テスト',
      取引区分: '入金',
      受渡金額_決済損益: 200,
      約定日: '2026/05/01',
      受渡日: '2026/05/01',
      決済通貨: 'JPY'
    }),
  ];

  const rows = buildCashRows_(records);

  assertEquals_(-1000, rows[0][16], '1行目残高');
  assertEquals_(-950, rows[1][16], '2行目残高');
  assertEquals_(-950, rows[1][17], '4月最終行の月次残高');
  assertEquals_(-750, rows[2][16], '3行目残高');
  assertEquals_(-750, rows[2][17], '5月最終行の月次残高');
}

/**
 * -0 や極小誤差を 0 に寄せるユーティリティ確認。
 */
function test_normalizeZero_() {
  assertEquals_(0, normalizeZero_(-0), '-0 を 0 に正規化');
  assertEquals_(0, normalizeZero_(1e-12), '極小正数を 0 に正規化');
  assertEquals_(0, normalizeZero_(-1e-12), '極小負数を 0 に正規化');
  assertEquals_('', normalizeZero_(''), '空文字はそのまま');
}

/* =========================================================
 * feature/use-db の軽量テスト
 * ========================================================= */

function test_buildRowHash_sameRecord_sameHash_() {
  const record = makeTradeRecord_({
    約定日: '2026/04/01',
    受渡日: '2026/04/02',
    商品: '株式',
    銘柄コード: '1234',
    銘柄名: 'TEST株',
    取引区分: '現物買付',
    数量: 10,
    単価: 100,
    受渡金額_決済損益: 1000,
    手数料税込: 0,
    決済通貨: 'JPY',
  });

  const hash1 = buildRowHash_(record);
  const hash2 = buildRowHash_(record);

  assertEquals_(hash1, hash2, '同じレコードは同じrowHashになる');
  assertTrue_(!!hash1, 'rowHash が空でないこと');
}

function test_buildRowHash_differentRecord_differentHash_() {
  const record1 = makeTradeRecord_({
    約定日: '2026/04/01',
    受渡日: '2026/04/02',
    商品: '株式',
    銘柄コード: '1234',
    銘柄名: 'TEST株',
    取引区分: '現物買付',
    数量: 10,
    単価: 100,
    受渡金額_決済損益: 1000,
    手数料税込: 0,
    決済通貨: 'JPY',
  });

  const record2 = makeTradeRecord_({
    約定日: '2026/04/01',
    受渡日: '2026/04/02',
    商品: '株式',
    銘柄コード: '1234',
    銘柄名: 'TEST株',
    取引区分: '現物買付',
    数量: 11,
    単価: 100,
    受渡金額_決済損益: 1100,
    手数料税込: 0,
    決済通貨: 'JPY',
  });

  const hash1 = buildRowHash_(record1);
  const hash2 = buildRowHash_(record2);

  assertTrue_(hash1 !== hash2, '異なるレコードは異なるrowHashになる');
}

function test_normalizeRecordForDb_setsMetadata_() {
  const now = new Date('2026-04-04T12:34:56Z');
  const record = makeTradeRecord_({
    約定日: '2026/04/01',
    受渡日: '2026/04/02',
    商品: '外債',
    銘柄コード: 'US0001',
    銘柄名: 'TEST債券',
    取引区分: '償還',
    数量: 0,
    単価: 0,
    受渡金額_決済損益: 500,
    手数料税込: 0,
    決済通貨: 'USD',
  });

  const dbRecord = normalizeRecordForDb_(record, {
    importId: 'import_test',
    sourceName: 'sample.csv',
    sourceRowNo: 7,
    now: now,
  });

  assertEquals_('import_test', dbRecord.importId, 'importId が入る');
  assertEquals_('sample.csv', dbRecord.sourceName, 'sourceName が入る');
  assertEquals_(7, dbRecord.sourceRowNo, 'sourceRowNo が入る');
  assertTrue_(!!dbRecord.recordId, 'recordId が入る');
  assertTrue_(!!dbRecord.rowHash, 'rowHash が入る');
  assertEquals_(true, dbRecord.isActive, 'isActive は true');
  assertEquals_('外債', dbRecord['商品'], '商品が保持される');
  assertEquals_('USD', dbRecord['決済通貨'], '決済通貨が正規化される');
  assertEquals_(500, dbRecord['受渡金額/決済損益'], '金額が保持される');
  assertEquals_(now.getTime(), dbRecord.createdAt.getTime(), 'createdAt が入る');
  assertEquals_(now.getTime(), dbRecord.updatedAt.getTime(), 'updatedAt が入る');
}

function test_dbRecordToRow_mapsHeaders_() {
  const now = new Date('2026-04-04T12:34:56Z');
  const record = makeTradeRecord_({
    約定日: '2026/04/01',
    受渡日: '2026/04/02',
    商品: '株式',
    銘柄コード: '1234',
    銘柄名: 'TEST株',
    取引区分: '現物買付',
    数量: 10,
    単価: 100,
    受渡金額_決済損益: 1000,
    手数料税込: 0,
    決済通貨: 'JPY',
  });

  const dbRecord = normalizeRecordForDb_(record, {
    importId: 'import_test',
    sourceName: 'sample.csv',
    sourceRowNo: 3,
    now: now,
  });

  const row = dbRecordToRow_(dbRecord);

  assertEquals_(DB_HEADERS.length, row.length, 'DB行の列数はDB_HEADERSと一致');
  assertEquals_(dbRecord.recordId, row[DB_HEADERS.indexOf('recordId')], 'recordId の位置');
  assertEquals_('import_test', row[DB_HEADERS.indexOf('importId')], 'importId の位置');
  assertEquals_('sample.csv', row[DB_HEADERS.indexOf('sourceName')], 'sourceName の位置');
  assertEquals_('TEST株', row[DB_HEADERS.indexOf('銘柄名')], '銘柄名 の位置');
  assertEquals_(1000, row[DB_HEADERS.indexOf('受渡金額/決済損益')], '金額 の位置');
}

/* =========================================================
 * writer.gs のテスト
 * ========================================================= */

/**
 * 国内取引シートの非表示列が仕様通りであることを確認する。
 * あわせて helper 列も非表示になることを確認する。
 */
function test_writeSheet_domesticHiddenColumns_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [
      buildTradeRowForWriterTest_({
        銘柄名: 'AAA',
        保有数: 0,
        helper: ''
      })
    ];

    writeSheet_(ss, CONFIG.OUTPUT_DOMESTIC, TRADE_HEADERS, rows, true);

    const sheet = ss.getSheetByName(CONFIG.OUTPUT_DOMESTIC);

    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '摘要')), '国内取引: 摘要は非表示');
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '発行通貨')), '国内取引: 発行通貨は非表示');
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, 'レート')), '国内取引: レートは非表示');
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '決済通貨')), '国内取引: 決済通貨は非表示');

    const helperCol = TRADE_HEADERS.length + 1;
    assertTrue_(sheet.isColumnHiddenByUser(helperCol), '国内取引: helper列は非表示');
  });
}

/**
 * 外国取引シートでは摘要のみ非表示で、他は表示のままであることを確認する。
 */
function test_writeSheet_foreignHiddenColumns_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [
      buildTradeRowForWriterTest_({
        銘柄名: 'BBB',
        保有数: 0,
        helper: ''
      })
    ];

    writeSheet_(ss, CONFIG.OUTPUT_FOREIGN, TRADE_HEADERS, rows, true);

    const sheet = ss.getSheetByName(CONFIG.OUTPUT_FOREIGN);

    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '摘要')), '外国取引: 摘要は非表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '発行通貨')), '外国取引: 発行通貨は表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, 'レート')), '外国取引: レートは表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '決済通貨')), '外国取引: 決済通貨は表示');

    const helperCol = TRADE_HEADERS.length + 1;
    assertTrue_(sheet.isColumnHiddenByUser(helperCol), '外国取引: helper列は非表示');
  });
}

/**
 * 取引シートの条件付き書式が想定どおり作られていることを確認する。
 * - 保有数 = 0 の赤字ルール
 * - helper = YES の銘柄名水色ルール
 */
function test_writeSheet_tradeConditionalFormatRules_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [
      buildTradeRowForWriterTest_({
        銘柄名: 'AAA',
        保有数: 0,
        helper: ''
      }),
      buildTradeRowForWriterTest_({
        銘柄名: 'AAA',
        保有数: 2,
        helper: 'YES'
      })
    ];

    writeSheet_(ss, CONFIG.OUTPUT_DOMESTIC, TRADE_HEADERS, rows, true);

    const sheet = ss.getSheetByName(CONFIG.OUTPUT_DOMESTIC);
    const rules = sheet.getConditionalFormatRules();

    assertEquals_(2, rules.length, '取引シートの条件付き書式は2件');

    const holdingCol = getColumnIndexByHeader_(TRADE_HEADERS, '保有数');
    const symbolCol = getColumnIndexByHeader_(TRADE_HEADERS, '銘柄名');
    const helperCol = TRADE_HEADERS.length + 1;

    const rule1 = rules[0];
    const rule2 = rules[1];

    const rule1Range = rule1.getRanges()[0].getA1Notation();
    const rule2Range = rule2.getRanges()[0].getA1Notation();

    const rule1Condition = rule1.getBooleanCondition();
    const rule2Condition = rule2.getBooleanCondition();

    const rule1CriteriaValues = rule1Condition ? rule1Condition.getCriteriaValues() : [];
    const rule2CriteriaValues = rule2Condition ? rule2Condition.getCriteriaValues() : [];

    assertEquals_(
      columnToLetter_(holdingCol) + '2:' + columnToLetter_(holdingCol) + '3',
      rule1Range,
      '保有数列に0赤字ルール'
    );
    assertEquals_(
      columnToLetter_(symbolCol) + '2:' + columnToLetter_(symbolCol) + '3',
      rule2Range,
      '銘柄名列にハイライトルール'
    );
    assertEquals_(0, rule1CriteriaValues[0], '0赤字ルールの条件値');
    assertEquals_(
      '=$' + columnToLetter_(helperCol) + '2="YES"',
      rule2CriteriaValues[0],
      'helper列参照の条件式'
    );
  });
}

/**
 * 平均取得単価の表示書式が「整数表示」になっていることを確認する。
 * 内部値は小数保持、見た目だけ整数という仕様の確認。
 */
function test_writeSheet_averageUnitPriceNumberFormat_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [
      buildTradeRowForWriterTest_({
        銘柄名: 'AAA',
        '平均取得単価': 333.3333333333,
        保有数: 3,
        helper: ''
      })
    ];

    writeSheet_(ss, CONFIG.OUTPUT_DOMESTIC, TRADE_HEADERS, rows, true);

    const sheet = ss.getSheetByName(CONFIG.OUTPUT_DOMESTIC);
    const avgCol = getColumnIndexByHeader_(TRADE_HEADERS, '平均取得単価');
    const fmt = sheet.getRange(2, avgCol).getNumberFormat();

    assertEquals_('#,##0;[Red]-#,##0;0', fmt, '平均取得単価は整数表示書式');
  });
}

/* =========================================================
 * テスト補助関数
 * ========================================================= */

/**
 * builder / import / db テスト用の標準レコードを作る。
 * 実CSV読み込み後の形に寄せている。
 */
function makeTradeRecord_(params) {
  return {
    約定日: parseDate_(params.約定日 || '2026/04/01'),
    受渡日: parseDate_(params.受渡日 || '2026/04/01'),
    商品: params.商品 || '株式',
    銘柄コード: params.銘柄コード || '0000',
    銘柄名: params.銘柄名 || 'TEST',
    摘要: params.摘要 || '',
    取引区分: params.取引区分 || '現物買付',
    預り区分: params.預り区分 || '',
    発行通貨: normalizeCurrency_(params.発行通貨 || 'JPY'),
    数量: params.数量 || 0,
    単価: params.単価 || 0,
    '受渡金額/決済損益': params.受渡金額_決済損益 || 0,
    '手数料（税込）': params.手数料税込 || 0,
    レート: params.レート || 0,
    決済通貨: normalizeCurrency_(params.決済通貨 || 'JPY'),
    '売買損益（円）': params.売買損益円 || 0,
  };
}

/**
 * writer テスト用の 1 行分データを作る。
 * writeSheet_ にそのまま渡せる配列形式。
 */
function buildTradeRowForWriterTest_(params) {
  const row = new Array(TRADE_HEADERS.length + 1).fill('');

  setTradeRowValue_(row, '約定日', parseDate_(params.約定日 || '2026/04/01'));
  setTradeRowValue_(row, '受渡日', parseDate_(params.受渡日 || '2026/04/01'));
  setTradeRowValue_(row, '商品', params.商品 || '株式');
  setTradeRowValue_(row, '銘柄コード', params.銘柄コード || '0000');
  setTradeRowValue_(row, '銘柄名', params.銘柄名 || 'TEST');
  setTradeRowValue_(row, '摘要', params.摘要 || '');
  setTradeRowValue_(row, '取引区分', params.取引区分 || '現物買付');
  setTradeRowValue_(row, '預り区分', params.預り区分 || '');
  setTradeRowValue_(row, '発行通貨', params.発行通貨 || 'JPY');
  setTradeRowValue_(row, '数量', defaultValue_(params.数量, 0));
  setTradeRowValue_(row, '単価', defaultValue_(params.単価, 100));
  setTradeRowValue_(row, '受渡金額/決済損益', defaultValue_(params.受渡金額_決済損益, 1000));
  setTradeRowValue_(row, '手数料（税込）', defaultValue_(params.手数料税込, 0));
  setTradeRowValue_(row, 'レート', defaultValue_(params.レート, 0));
  setTradeRowValue_(row, '決済通貨', params.決済通貨 || 'JPY');
  setTradeRowValue_(row, '売買損益（円）', defaultValue_(params.売買損益円, 0));
  setTradeRowValue_(row, '保有数', defaultValue_(params.保有数, 0));
  setTradeRowValue_(row, '手数料の消費税額', defaultValue_(params['手数料の消費税額'], ''));
  setTradeRowValue_(row, '平均取得単価', defaultValue_(params['平均取得単価'], ''));
  setTradeRowValue_(row, '手数料抜き売値', defaultValue_(params['手数料抜き売値'], ''));
  setTradeRowValue_(row, '取得価格', defaultValue_(params['取得価格'], ''));
  setTradeRowValue_(row, '売却損益', defaultValue_(params['売却損益'], ''));
  setTradeRowValue_(row, '簿価', defaultValue_(params['簿価'], ''));
  setTradeRowValue_(row, '銘柄ごとの残高', defaultValue_(params['銘柄ごとの残高'], ''));
  setTradeRowValue_(row, 'FX2の期末簿価', defaultValue_(params['FX2の期末簿価'], ''));

  row[TRADE_HEADERS.length] = params.helper || '';
  return row;
}

function setTradeRowValue_(row, headerName, value) {
  const idx = TRADE_HEADERS.indexOf(headerName);
  if (idx < 0) {
    throw new Error('TRADE_HEADERS に存在しないヘッダーです: ' + headerName);
  }
  row[idx] = value;
}

function getTradeRowValue_(row, headerName) {
  const idx = TRADE_HEADERS.indexOf(headerName);
  if (idx < 0) {
    throw new Error('TRADE_HEADERS に存在しないヘッダーです: ' + headerName);
  }
  return row[idx];
}

function getTradeHelperValue_(row) {
  return row[TRADE_HEADERS.length];
}

function getColumnIndexByHeader_(headers, headerName) {
  const idx = headers.indexOf(headerName);
  if (idx < 0) {
    throw new Error('ヘッダーが見つかりません: ' + headerName);
  }
  return idx + 1;
}

function withTempSpreadsheet_(fn) {
  const ss = SpreadsheetApp.create('test_' + Utilities.getUuid());
  try {
    fn(ss);
  } finally {
    try {
      DriveApp.getFileById(ss.getId()).setTrashed(true);
    } catch (e) {
      Logger.log('temp spreadsheet cleanup failed: ' + e.message);
    }
  }
}

function defaultValue_(value, fallback) {
  return value === undefined ? fallback : value;
}

/* =========================================================
 * アサート群
 * ========================================================= */

function assertEquals_(expected, actual, message) {
  if (expected !== actual) {
    throw new Error((message || 'assertEquals failed') + ' expected=' + expected + ' actual=' + actual);
  }
}

function assertTrue_(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertTrue failed');
  }
}

function assertFalse_(condition, message) {
  if (condition) {
    throw new Error(message || 'assertFalse failed');
  }
}

function assertApproxEquals_(expected, actual, epsilon, message) {
  const diff = Math.abs(expected - actual);
  if (diff > (epsilon || 1e-9)) {
    throw new Error((message || 'assertApproxEquals failed') + ' expected=' + expected + ' actual=' + actual + ' diff=' + diff);
  }
}

function assertArrayEquals_(expected, actual, message) {
  assertEquals_(expected.length, actual.length, message || 'array length mismatch');
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== actual[i]) {
      throw new Error((message || 'assertArrayEquals failed') + ' index=' + i + ' expected=' + expected[i] + ' actual=' + actual[i]);
    }
  }
}
