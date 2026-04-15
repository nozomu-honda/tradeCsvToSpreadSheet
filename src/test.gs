/**
 * Apps Script テストランナー
 */
function runSmokeTests() {
  const tests = [
    test_averageUnitPrice_keepsDecimal_,
    test_bookValue_usesAcquisitionPrice_,
    test_sellWithoutAvg_addsAlert_,
    test_sortTradeRows_usesPriority_,
    test_stockConversionBuy_updatesHoldingAndAvg_,
    test_forcedRedemptionSell_updatesHoldingAndBookValue_,
    test_redemption_tradeRowAndCashRow_withNoPreviousHolding_,
    test_redemption_tradeRowAndCashRow_withPreviousHolding_,
    test_collectInputAlerts_supportedForeignBond_,
    test_collectInputAlerts_supportedProductAndCurrency_doNothing_,
    test_collectInputAlerts_unsupportedProduct_,
    test_collectInputAlerts_unsupportedSettlementCurrency_,
    test_readInputRecords_headerRowNotFirst_,
    test_readInputRecords_headerRowAppearsInMiddle_,
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

function runAllTests() {
  const tests = [
    test_averageUnitPrice_keepsDecimal_,
    test_bookValue_usesAcquisitionPrice_,
    test_sellWithoutAvg_addsAlert_,
    test_sortTradeRows_usesPriority_,
    test_stockConversionBuy_updatesHoldingAndAvg_,
    test_forcedRedemptionSell_updatesHoldingAndBookValue_,
    test_redemption_tradeRowAndCashRow_withNoPreviousHolding_,
    test_redemption_tradeRowAndCashRow_withPreviousHolding_,
    test_collectInputAlerts_supportedForeignBond_,
    test_collectInputAlerts_supportedProductAndCurrency_doNothing_,
    test_collectInputAlerts_unsupportedProduct_,
    test_collectInputAlerts_unsupportedSettlementCurrency_,
    test_readInputRecords_headerRowNotFirst_,
    test_readInputRecords_headerRowAppearsInMiddle_,
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
  if (failed > 0) throw new Error(message);
  return message;
}

function test_averageUnitPrice_keepsDecimal_() {
  const alerts = [];
  const rows = buildTradeRows_([makeTradeRecord_({
    銘柄名: 'AAA', 取引区分: '現物買付', 数量: 3, 単価: 333.3333333333,
    受渡金額_決済損益: 1000, 手数料税込: 0, 約定日: '2026/04/01', 受渡日: '2026/04/01', 決済通貨: 'JPY'
  })], alerts);
  const avgUnitPrice = getTradeRowValue_(rows[0], '平均取得単価');
  assertApproxEquals_(1000 / 3, avgUnitPrice, 1e-9, '平均取得単価は内部で小数保持');
  assertTrue_(Math.round(avgUnitPrice) !== avgUnitPrice, '平均取得単価は内部で丸め込まれていないこと');
  assertEquals_(0, alerts.length, '不要なアラートは出ないこと');
}

function test_bookValue_usesAcquisitionPrice_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({銘柄名: 'AAA', 取引区分: '現物買付', 数量: 3, 単価: 333.3333333333, 受渡金額_決済損益: 1000, 手数料税込: 0, 約定日: '2026/04/01', 受渡日: '2026/04/01', 決済通貨: 'JPY'}),
    makeTradeRecord_({銘柄名: 'AAA', 取引区分: '現物売却', 数量: 2, 単価: 600, 受渡金額_決済損益: 1200, 手数料税込: 0, 約定日: '2026/04/02', 受渡日: '2026/04/02', 決済通貨: 'JPY'})
  ], alerts);
  const sellRow = rows[1];
  const acquisitionPrice = getTradeRowValue_(sellRow, '取得価格');
  const bookValue = getTradeRowValue_(sellRow, '簿価');
  assertApproxEquals_((1000 / 3) * 2, acquisitionPrice, 1e-9, '取得価格は直前平均取得単価ベース');
  assertApproxEquals_(-acquisitionPrice, bookValue, 1e-9, '簿価は -acquisitionPrice');
}

function test_sellWithoutAvg_addsAlert_() {
  const alerts = [];
  const rows = buildTradeRows_([makeTradeRecord_({
    銘柄名: 'BBB', 取引区分: '現物売却', 数量: 1, 単価: 1000, 受渡金額_決済損益: 1000,
    手数料税込: 0, 約定日: '2026/04/02', 受渡日: '2026/04/02', 決済通貨: 'JPY'
  })], alerts);
  const sellRow = rows[0];
  assertEquals_('', getTradeRowValue_(sellRow, '取得価格'), '取得価格は空欄');
  assertEquals_('', getTradeRowValue_(sellRow, '簿価'), '簿価は空欄');
  assertTrue_(alerts.some(function(x){ return x.indexOf('簿価: 平均取得単価が未計算') >= 0; }), '平均取得単価未計算アラート');
}

function test_sortTradeRows_usesPriority_() {
  const records = [
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '入金（分配金）', 約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '現物売却', 約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '現物募集', 約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '現物買付', 約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '現物再投', 約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '現物買取', 約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '株転換取得（買）', 約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '入庫（増減資）', 約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '強制償還（売）', 約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '償還', 約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '入金（利金）', 約定日: '2026/04/01', 受渡日: '2026/04/01' }),
    makeTradeRecord_({ 銘柄名: 'CCC', 取引区分: '入金（配当金）', 約定日: '2026/04/01', 受渡日: '2026/04/01' }),
  ];
  const actual = records.slice().sort(sortTradeRows_).map(function(r){ return r['取引区分']; });
  const expected = ['現物買付','現物再投','現物募集','株転換取得（買）','入庫（増減資）','現物売却','現物買取','強制償還（売）','償還','入金（利金）','入金（配当金）','入金（分配金）'];
  assertArrayEquals_(expected, actual, '取引区分優先順位ソート');
}

function test_stockConversionBuy_updatesHoldingAndAvg_() {
  const alerts = [];
  const rows = buildTradeRows_([
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
    })
  ], alerts);
  const row = rows[1];
  assertEquals_(3, getTradeRowValue_(row, '保有数'), '株転換取得（買）で保有数が増える');
  assertEquals_(150, getTradeRowValue_(row, '簿価'), '株転換取得（買）の簿価');
  assertEquals_(200, getTradeRowValue_(row, '銘柄ごとの残高'), '株転換取得（買）は銘柄ごとの残高を動かさない');
  assertApproxEquals_((200 + 150) / 3, getTradeRowValue_(row, '平均取得単価'), 1e-9, '株転換取得（買）は平均取得単価の対象');
  assertEquals_(0, alerts.length, '不要なアラートは出ないこと');
}

function test_forcedRedemptionSell_updatesHoldingAndBookValue_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({銘柄名: 'FRS', 商品: '株式', 取引区分: '現物買付', 数量: 3, 受渡金額_決済損益: 300, 手数料税込: 0, 約定日: '2026/04/01', 受渡日: '2026/04/01', 決済通貨: 'JPY'}),
    makeTradeRecord_({銘柄名: 'FRS', 商品: '株式', 取引区分: '強制償還（売）', 数量: 1, 単価: 120, 受渡金額_決済損益: 120, 手数料税込: 0, 約定日: '2026/04/02', 受渡日: '2026/04/02', 決済通貨: 'JPY'})
  ], alerts);
  const row = rows[1];
  assertEquals_(2, getTradeRowValue_(row, '保有数'), '強制償還（売）で保有数が減る');
  assertApproxEquals_(120, getTradeRowValue_(row, '手数料抜き売値'), 1e-9, '強制償還（売）の手数料抜き売値は受渡金額');
  assertApproxEquals_(100, getTradeRowValue_(row, '取得価格'), 1e-9, '取得価格は原価ベース');
  assertApproxEquals_(-100, getTradeRowValue_(row, '簿価'), 1e-9, '簿価は -acquisitionPrice');
  assertApproxEquals_(20, getTradeRowValue_(row, '売却損益'), 1e-9, '売却損益は 受渡金額 - 取得価格');
  assertApproxEquals_(200, getTradeRowValue_(row, '銘柄ごとの残高'), 1e-9, '残高は原価ベースで減る');
}

function test_redemption_tradeRowAndCashRow_withNoPreviousHolding_() {
  const alerts = [];
  const records = [makeTradeRecord_({銘柄名: 'RED', 商品: '外債', 取引区分: '償還', 数量: 0, 受渡金額_決済損益: 500, 手数料税込: 0, 約定日: '2026/04/10', 受渡日: '2026/04/10', 決済通貨: 'USD'})];
  const tradeRow = buildTradeRows_(records, alerts)[0];
  const cashRows = buildCashRows_(records);
  assertEquals_(0, getTradeRowValue_(tradeRow, '保有数'), '償還の数量0なら保有数は変わらない');
  assertEquals_('', getTradeRowValue_(tradeRow, '手数料抜き売値'), '一つ前の保有数が0なら手数料抜き売値なし');
  assertEquals_('', getTradeRowValue_(tradeRow, '取得価格'), '一つ前の保有数が0なら取得価格なし');
  assertEquals_('', getTradeRowValue_(tradeRow, '売却損益'), '一つ前の保有数が0なら売却損益なし');
  assertEquals_(500, getTradeRowValue_(tradeRow, '簿価'), '一つ前の保有数が0なら簿価は受渡金額');
  assertEquals_(500, cashRows[0][16], '償還は金銭残高を増やす');
}

function test_redemption_tradeRowAndCashRow_withPreviousHolding_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({銘柄名: 'R2', 商品: '外債', 取引区分: '現物買付', 数量: 3, 単価: 100, 受渡金額_決済損益: 300, 手数料税込: 0, 約定日: '2026/04/01', 受渡日: '2026/04/01', 決済通貨: 'USD'}),
    makeTradeRecord_({銘柄名: 'R2', 商品: '外債', 取引区分: '償還', 数量: 1, 単価: 120, 受渡金額_決済損益: 120, 手数料税込: 0, 約定日: '2026/04/10', 受渡日: '2026/04/10', 決済通貨: 'USD'})
  ], alerts);
  const row = rows[1];
  assertEquals_(2, getTradeRowValue_(row, '保有数'), '保有数ありの償還は数量分マイナス');
  assertApproxEquals_(120, getTradeRowValue_(row, '手数料抜き売値'), 1e-9, '償還の手数料抜き売値');
  assertApproxEquals_(100, getTradeRowValue_(row, '取得価格'), 1e-9, '償還の取得価格');
  assertApproxEquals_(20, getTradeRowValue_(row, '売却損益'), 1e-9, '償還の売却損益');
  assertApproxEquals_(-100, getTradeRowValue_(row, '簿価'), 1e-9, '償還の簿価');
  assertApproxEquals_(200, getTradeRowValue_(row, '銘柄ごとの残高'), 1e-9, '償還後の銘柄残高');
}

function test_collectInputAlerts_supportedForeignBond_() {
  const alerts = [];
  collectInputAlerts_([makeTradeRecord_({銘柄名: 'BOND', 商品: '外債', 取引区分: '償還', 決済通貨: 'USD', 受渡金額_決済損益: 100})], alerts);
  assertEquals_(0, alerts.length, '外債/USD は未対応アラート対象ではない');
}

function test_collectInputAlerts_unsupportedProduct_() {
  const alerts = [];
  collectInputAlerts_([makeTradeRecord_({銘柄名: 'ETFTEST', 商品: 'ETF', 取引区分: '現物買付', 決済通貨: 'JPY', 受渡金額_決済損益: 100})], alerts);
  assertTrue_(alerts.some(function(x){ return x.indexOf('商品: 未対応の商品') >= 0; }), '未対応商品アラート');
}

function test_collectInputAlerts_unsupportedSettlementCurrency_() {
  const alerts = [];
  collectInputAlerts_([makeTradeRecord_({銘柄名: 'EURTEST', 商品: '外債', 取引区分: '償還', 決済通貨: 'EUR', 受渡金額_決済損益: 100})], alerts);
  assertTrue_(alerts.some(function(x){ return x.indexOf('決済通貨: 未対応の決済通貨') >= 0; }), '未対応決済通貨アラート');
}

function test_collectInputAlerts_supportedProductAndCurrency_doNothing_() {
  const alerts = [];
  collectInputAlerts_([
    makeTradeRecord_({銘柄名: 'OKTEST', 商品: '株式', 取引区分: '現物買付', 決済通貨: 'JPY', 受渡金額_決済損益: 100}),
    makeTradeRecord_({銘柄名: 'OKBOND', 商品: '外債', 取引区分: '償還', 決済通貨: 'USD', 受渡金額_決済損益: 100}),
    makeTradeRecord_({銘柄名: '', 商品: '現金', 摘要: '入金テスト', 取引区分: '入金（振込）', 決済通貨: 'JPY', 受渡金額_決済損益: 100})
  ], alerts);
  assertEquals_(0, alerts.length, '対応済み商品/決済通貨ではアラートなし');
}

function test_readInputRecords_headerRowNotFirst_() {
  withTempSpreadsheet_(function(ss) {
    const sheet = ss.getSheets()[0];
    const values = [
      ['2026/04/01', '2026/04/02', '株式', '1234', 'AAA', '', '現物買付', '', 'JPY', 10, 100, 1000],
      [''],
      ['約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分', '発行通貨', '数量', '単価', '受渡金額/決済損益']
    ];
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);

    assertThrowsContains_(function() {
      readInputRecords_(sheet);
    }, 'ヘッダー行が1行目ではありません', 'ヘッダーが1行目以外ならエラー');
  });
}

function test_readInputRecords_headerRowAppearsInMiddle_() {
  withTempSpreadsheet_(function(ss) {
    const sheet = ss.getSheets()[0];
    const values = [
      ['約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分', '発行通貨', '数量', '単価', '受渡金額/決済損益'],
      ['2026/04/01', '2026/04/02', '株式', '1234', 'AAA', '', '現物買付', '', 'JPY', 10, 100, 1000],
      ['約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分', '発行通貨', '数量', '単価', '受渡金額/決済損益']
    ];
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);

    assertThrowsContains_(function() {
      readInputRecords_(sheet);
    }, 'データ途中にヘッダー行があります', '途中ヘッダーがあればエラー');
  });
}

function test_holdingZero_and_balanceZero_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({銘柄名: 'DDD', 取引区分: '現物買付', 数量: 3, 受渡金額_決済損益: 1000, 約定日: '2026/04/01', 受渡日: '2026/04/01', 決済通貨: 'JPY'}),
    makeTradeRecord_({銘柄名: 'DDD', 取引区分: '現物売却', 数量: 2, 単価: 700, 受渡金額_決済損益: 1400, 約定日: '2026/04/02', 受渡日: '2026/04/02', 決済通貨: 'JPY'}),
    makeTradeRecord_({銘柄名: 'DDD', 取引区分: '現物売却', 数量: 1, 単価: 400, 受渡金額_決済損益: 400, 約定日: '2026/04/03', 受渡日: '2026/04/03', 決済通貨: 'JPY'})
  ], alerts);
  const lastRow = rows[2];
  assertEquals_(0, getTradeRowValue_(lastRow, '保有数'), '最終保有数は0');
  assertEquals_(0, normalizeZero_(getTradeRowValue_(lastRow, '銘柄ごとの残高')), '最終残高は0');
}

function test_lastTradeHighlightFlag_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({銘柄名: 'EEE', 取引区分: '現物買付', 数量: 3, 受渡金額_決済損益: 900, 約定日: '2026/04/01', 受渡日: '2026/04/01', 決済通貨: 'JPY'}),
    makeTradeRecord_({銘柄名: 'EEE', 取引区分: '現物売却', 数量: 1, 単価: 500, 受渡金額_決済損益: 500, 約定日: '2026/04/02', 受渡日: '2026/04/02', 決済通貨: 'JPY'})
  ], alerts);
  assertEquals_('', getTradeHelperValue_(rows[0]), '途中行はハイライト対象ではない');
  assertEquals_('YES', getTradeHelperValue_(rows[1]), '最後の取引かつ保有数正なら YES');
}

function test_buildCashRows_runningBalance_() {
  const rows = buildCashRows_([
    makeTradeRecord_({銘柄名: 'FFF', 取引区分: '現物買付', 受渡金額_決済損益: 1000, 約定日: '2026/04/01', 受渡日: '2026/04/01', 決済通貨: 'JPY'}),
    makeTradeRecord_({銘柄名: 'FFF', 取引区分: '入金（配当金）', 受渡金額_決済損益: 50, 約定日: '2026/04/10', 受渡日: '2026/04/10', 決済通貨: 'JPY'}),
    makeTradeRecord_({銘柄名: '', 商品: '現金', 摘要: '入金テスト', 取引区分: '入金（振込）', 受渡金額_決済損益: 200, 約定日: '2026/05/01', 受渡日: '2026/05/01', 決済通貨: 'JPY'})
  ]);
  assertEquals_(-1000, rows[0][16], '1行目残高');
  assertEquals_(-950, rows[1][16], '2行目残高');
  assertEquals_(-950, rows[1][17], '4月最終行の月次残高');
  assertEquals_(-750, rows[2][16], '3行目残高');
  assertEquals_(-750, rows[2][17], '5月最終行の月次残高');
}

function test_normalizeZero_() {
  assertEquals_(0, normalizeZero_(-0), '-0 を 0 に正規化');
  assertEquals_(0, normalizeZero_(1e-12), '極小正数を 0 に正規化');
  assertEquals_(0, normalizeZero_(-1e-12), '極小負数を 0 に正規化');
  assertEquals_('', normalizeZero_(''), '空文字はそのまま');
}

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

function test_writeSheet_domesticHiddenColumns_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [buildTradeRowForWriterTest_({銘柄名: 'AAA', 保有数: 0, helper: ''})];
    writeSheet_(ss, CONFIG.OUTPUT_DOMESTIC, TRADE_HEADERS, rows, true);
    const sheet = ss.getSheetByName(CONFIG.OUTPUT_DOMESTIC);
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '摘要')), '国内取引: 摘要は非表示');
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '発行通貨')), '国内取引: 発行通貨は非表示');
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, 'レート')), '国内取引: レートは非表示');
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '決済通貨')), '国内取引: 決済通貨は非表示');
    assertTrue_(sheet.isColumnHiddenByUser(TRADE_HEADERS.length + 1), '国内取引: helper列は非表示');
  });
}

function test_writeSheet_foreignHiddenColumns_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [buildTradeRowForWriterTest_({銘柄名: 'BBB', 保有数: 0, helper: ''})];
    writeSheet_(ss, CONFIG.OUTPUT_FOREIGN, TRADE_HEADERS, rows, true);
    const sheet = ss.getSheetByName(CONFIG.OUTPUT_FOREIGN);
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '摘要')), '外国取引: 摘要は非表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '発行通貨')), '外国取引: 発行通貨は表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, 'レート')), '外国取引: レートは表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '決済通貨')), '外国取引: 決済通貨は表示');
  });
}

function test_writeSheet_tradeConditionalFormatRules_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [
      buildTradeRowForWriterTest_({銘柄名: 'AAA', 保有数: 0, helper: ''}),
      buildTradeRowForWriterTest_({銘柄名: 'AAA', 保有数: 2, helper: 'YES'})
    ];
    writeSheet_(ss, CONFIG.OUTPUT_DOMESTIC, TRADE_HEADERS, rows, true);
    const rules = ss.getSheetByName(CONFIG.OUTPUT_DOMESTIC).getConditionalFormatRules();
    assertEquals_(2, rules.length, '取引シートの条件付き書式は2件');
  });
}

function test_writeSheet_averageUnitPriceNumberFormat_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [buildTradeRowForWriterTest_({銘柄名: 'AAA', '平均取得単価': 333.3333333333, 保有数: 3, helper: ''})];
    writeSheet_(ss, CONFIG.OUTPUT_DOMESTIC, TRADE_HEADERS, rows, true);
    const sheet = ss.getSheetByName(CONFIG.OUTPUT_DOMESTIC);
    const avgCol = getColumnIndexByHeader_(TRADE_HEADERS, '平均取得単価');
    assertEquals_('#,##0;[Red]-#,##0;0', sheet.getRange(2, avgCol).getNumberFormat(), '平均取得単価は整数表示書式');
  });
}

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
  if (idx < 0) throw new Error('TRADE_HEADERS に存在しないヘッダーです: ' + headerName);
  row[idx] = value;
}

function getTradeRowValue_(row, headerName) {
  const idx = TRADE_HEADERS.indexOf(headerName);
  if (idx < 0) throw new Error('TRADE_HEADERS に存在しないヘッダーです: ' + headerName);
  return row[idx];
}

function getTradeHelperValue_(row) {
  return row[TRADE_HEADERS.length];
}

function getColumnIndexByHeader_(headers, headerName) {
  const idx = headers.indexOf(headerName);
  if (idx < 0) throw new Error('ヘッダーが見つかりません: ' + headerName);
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

function assertEquals_(expected, actual, message) {
  if (expected !== actual) throw new Error((message || 'assertEquals failed') + ' expected=' + expected + ' actual=' + actual);
}

function assertTrue_(condition, message) {
  if (!condition) throw new Error(message || 'assertTrue failed');
}

function assertFalse_(condition, message) {
  if (condition) throw new Error(message || 'assertFalse failed');
}

function assertApproxEquals_(expected, actual, epsilon, message) {
  const diff = Math.abs(expected - actual);
  if (diff > (epsilon || 1e-9)) throw new Error((message || 'assertApproxEquals failed') + ' expected=' + expected + ' actual=' + actual + ' diff=' + diff);
}

function assertArrayEquals_(expected, actual, message) {
  assertEquals_(expected.length, actual.length, message || 'array length mismatch');
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== actual[i]) {
      throw new Error((message || 'assertArrayEquals failed') + ' index=' + i + ' expected=' + expected[i] + ' actual=' + actual[i]);
    }
  }
}

function assertThrowsContains_(fn, expectedMessagePart, message) {
  try {
    fn();
  } catch (e) {
    const actual = String(e && e.message ? e.message : e);
    if (actual.indexOf(expectedMessagePart) >= 0) {
      return;
    }
    throw new Error((message || 'assertThrowsContains failed') + ' expectedPart=' + expectedMessagePart + ' actual=' + actual);
  }
  throw new Error((message || 'assertThrowsContains failed') + ' expected exception');
}
