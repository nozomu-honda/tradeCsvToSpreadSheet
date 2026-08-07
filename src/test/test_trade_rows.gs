/**
 * 取引計算系テスト
 */

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
  assertEquals_(500, getCashRowValue_(cashRows[0], '残高'), '償還は金銭残高を増やす');
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

function test_manualDomesticTax_overridesFeeTax_() {
  const alerts = [];
  const rows = buildTradeRows_([makeTradeRecord_({
    銘柄名: 'TAX',
    取引区分: '現物買付',
    数量: 1,
    単価: 1000,
    受渡金額_決済損益: 1000,
    手数料税込: 110,
    国内消費税等円: 7,
    約定日: '2026/04/01',
    受渡日: '2026/04/01',
    決済通貨: 'JPY'
  })], alerts);

  assertEquals_(7, getTradeRowValue_(rows[0], '手数料の消費税額'), '国内消費税等（円）を優先代入');
  assertEquals_(993, getTradeRowValue_(rows[0], '簿価'), '簿価は受渡金額 - 国内消費税等（円）');
  assertEquals_(0, alerts.length, '不要なアラートは出ないこと');
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
  assertEquals_(-1000, getCashRowValue_(rows[0], '残高'), '1行目残高');
  assertEquals_(-950, getCashRowValue_(rows[1], '残高'), '2行目残高');
  assertEquals_(-950, getCashRowValue_(rows[1], '月次残高'), '4月最終行の月次残高');
  assertEquals_(-750, getCashRowValue_(rows[2], '残高'), '3行目残高');
  assertEquals_(-750, getCashRowValue_(rows[2], '月次残高'), '5月最終行の月次残高');
}

function test_normalizeZero_() {
  assertEquals_(0, normalizeZero_(-0), '-0 を 0 に正規化');
  assertEquals_(0, normalizeZero_(1e-12), '極小正数を 0 に正規化');
  assertEquals_(0, normalizeZero_(-1e-12), '極小負数を 0 に正規化');
  assertEquals_('', normalizeZero_(''), '空文字はそのまま');
}

function test_buildTradeRows_foreignStockSellNet_usesRate_20260511_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({
      銘柄名: 'FOREIGN_SELL',
      商品: '外株',
      取引区分: '現物買付',
      数量: 10,
      単価: 10,
      受渡金額_決済損益: 100,
      手数料税込: 0,
      レート: 150,
      約定日: '2026/05/01',
      受渡日: '2026/05/01',
      決済通貨: 'USD'
    }),
    makeTradeRecord_({
      銘柄名: 'FOREIGN_SELL',
      商品: '外株',
      取引区分: '現物売却',
      数量: 2,
      単価: 12,
      受渡金額_決済損益: 0,
      手数料税込: 0,
      レート: 155,
      約定日: '2026/05/02',
      受渡日: '2026/05/02',
      決済通貨: 'USD'
    })
  ], alerts);

  const sellRow = rows[1];
  assertApproxEquals_(12 * 2 * 155, getTradeRowValue_(sellRow, '手数料抜き売値'), 1e-9, '外株の手数料抜き売値は 単価*数量*レート');
}

function test_buildTradeRows_bookValue_foreignBuy_minusFeeTaxOnly_20260511_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({
      銘柄名: 'FOREIGN_BUY',
      商品: '外株',
      取引区分: '現物買付',
      数量: 1,
      単価: 10,
      受渡金額_決済損益: 100,
      手数料税込: 110,
      国内消費税等円: 7,
      レート: 150,
      約定日: '2026/05/01',
      受渡日: '2026/05/01',
      決済通貨: 'USD'
    })
  ], alerts);

  const row = rows[0];
  assertApproxEquals_(100 * 150 - 7, getTradeRowValue_(row, '簿価'), 1e-9, '外貨買付の簿価は 消費税額にレートを掛けない');
}

function test_buildTradeRows_avgUnitPrice_updatesOnStockTransferIn_20260511_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({
      銘柄名: 'TRANSFER_IN',
      商品: '株式',
      取引区分: '現物買付',
      数量: 2,
      単価: 100,
      受渡金額_決済損益: 200,
      手数料税込: 0,
      約定日: '2026/05/01',
      受渡日: '2026/05/01',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: 'TRANSFER_IN',
      商品: '株式',
      取引区分: '入庫（増減資）',
      数量: 1,
      単価: 0,
      受渡金額_決済損益: 0,
      手数料税込: 0,
      約定日: '2026/05/02',
      受渡日: '2026/05/02',
      決済通貨: 'JPY'
    })
  ], alerts);

  const row = rows[1];
  assertEquals_(3, getTradeRowValue_(row, '保有数'), '入庫（増減資）で保有数が増える');
  assertApproxEquals_(200 / 3, getTradeRowValue_(row, '平均取得単価'), 1e-9, '入庫（増減資）は投信以外の平均取得単価更新対象');
}

function test_buildTradeRows_principalReturn_distributionDoesNotChangeBalance_20260511_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({
      銘柄名: 'PRINCIPAL_RETURN',
      商品: '投信',
      取引区分: '現物買付',
      数量: 10000,
      単価: 1,
      受渡金額_決済損益: 10000,
      手数料税込: 0,
      約定日: '2026/05/01',
      受渡日: '2026/05/01',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: 'PRINCIPAL_RETURN',
      商品: '投信',
      取引区分: '入金（分配金）',
      数量: 0,
      単価: 0,
      受渡金額_決済損益: 500,
      手数料税込: 0,
      元本払戻金: true,
      約定日: '2026/05/02',
      受渡日: '2026/05/02',
      決済通貨: 'JPY'
    })
  ], alerts);

  const row = rows[1];
  assertEquals_('', getTradeRowValue_(row, '簿価'), '元本払戻金=true なら簿価は空欄');
  assertApproxEquals_(10000, getTradeRowValue_(row, '銘柄ごとの残高'), 1e-9, '元本払戻金=true の分配金は残高を増やさない');
}
