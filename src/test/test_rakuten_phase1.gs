/**
 * 楽天 Phase 1 テスト
 */

function test_detectInputSourceTypeFromRows_rakutenJapanStock_20260615_() {
  const rows = [
    ['メモ'],
    ['約定日', '受渡日', '市場名称', '口座区分', '売買区分', '数量［株］', '受渡金額［円］']
  ];

  const detected = detectInputSourceTypeFromRows_(rows);
  assertEquals_('rakuten_jp_stock', detected.sourceType, '楽天日本株を判定できる');
  assertEquals_(1, detected.headerRowIndex, 'ヘッダー行index');
}

function test_detectInputSourceTypeFromRows_rakutenUsStock_20260615_() {
  const rows = [
    ['約定日', '受渡日', 'ティッカー', '約定代金［USドル］', '為替レート', '受渡金額［USドル］', '受渡金額［円］']
  ];

  const detected = detectInputSourceTypeFromRows_(rows);
  assertEquals_('rakuten_us_stock', detected.sourceType, '楽天米国株を判定できる');
  assertEquals_(0, detected.headerRowIndex, 'ヘッダー行index');
}

function test_normalizeRakutenJapanStockRowsToRecords_buy_20260615_() {
  const rows = [
    ['約定日', '受渡日', '銘柄コード', '銘柄名', '市場名称', '口座区分', '売買区分', '数量［株］', '単価［円］', '手数料［円］', '税金等［円］', '諸費用［円］', '受渡金額［円］'],
    ['2026/06/01', '2026/06/03', '1234', '楽天日本株', '東証', '特定', '買付', 10, 100, 50, 5, 3, 1005]
  ];

  const records = normalizeRakutenJapanStockRowsToRecords_(rows, 0);
  const record = records[0];

  assertEquals_('株式', record['商品'], '商品');
  assertEquals_('現物買付', record['取引区分'], '取引区分');
  assertEquals_('1234', record['銘柄コード'], '銘柄コード');
  assertEquals_('楽天日本株', record['銘柄名'], '銘柄名');
  assertEquals_('JPY', normalizeCurrency_(record['決済通貨']), '決済通貨');
  assertEquals_(55, record['手数料（税込）'], '手数料（税込）');
  assertEquals_(5, record['国内消費税等（円）'], '国内消費税等（円）');
  assertEquals_(50, record['国内手数料（円）'], '国内手数料（円）');
  assertEquals_(3, record['現地手数料（円）'], '現地手数料（円）');
}

function test_normalizeRakutenUsStockRowsToRecords_yenSettlement_20260615_() {
  const rows = [
    ['約定日', '受渡日', 'ティッカー', '銘柄名', '口座', '売買区分', '決済通貨', '数量［株］', '単価［USドル］', '為替レート', '手数料［USドル］', '受渡金額［USドル］', '受渡金額［円］'],
    ['2026/06/01', '2026/06/03', 'AAPL', 'Apple Inc.', '特定', '買付', '円', 1, 200, 150, 1.5, 201.5, 30225]
  ];

  const records = normalizeRakutenUsStockRowsToRecords_(rows, 0);
  const record = records[0];

  assertEquals_('外株', record['商品'], '商品');
  assertEquals_('現物買付', record['取引区分'], '取引区分');
  assertEquals_('AAPL', record['銘柄コード'], '銘柄コード');
  assertEquals_('JPY', normalizeCurrency_(record['決済通貨']), '決済通貨');
  assertEquals_(30225, record['受渡金額/決済損益'], '円決済なら円の受渡金額を使う');
  assertEquals_(150, record['レート'], '為替レート');
}

function test_routeTargetDbKeyBySource_rakuten_20260615_() {
  assertEquals_('rakuten_corp_a', routeTargetDbKeyBySource_('nomura_corp_a', 'rakuten_jp_stock'), '法人A');
  assertEquals_('rakuten_corp_b', routeTargetDbKeyBySource_('nomura_corp_b', 'rakuten_us_stock'), '法人B');
  assertEquals_('rakuten_test', routeTargetDbKeyBySource_('nomura_test', 'rakuten_us_stock'), 'nomura_test');
  assertEquals_('nomura_corp_a', routeTargetDbKeyBySource_('nomura_corp_a', 'nomura_common'), '野村はそのまま');
}

function test_detectInputSourceTypeFromRows_rakutenFund_20260616_() {
  const rows = [
    ['約定日', '受渡日', 'ファンド名', '分配金', '口座', '取引', '買付方法', '数量［口］', '単価', '経費', '為替レート', '受付金額[現地通貨]', '受渡金額/(ポイント利用)[円]', '決済通貨']
  ];

  const detected = detectInputSourceTypeFromRows_(rows);
  assertEquals_('rakuten_fund', detected.sourceType, '楽天投資信託を判定できる');
  assertEquals_(0, detected.headerRowIndex, 'ヘッダー行index');
}

function test_normalizeRakutenFundRowsToRecords_buyAndSell_20260616_() {
  const rows = [
    ['約定日', '受渡日', 'ファンド名', '分配金', '口座', '取引', '買付方法', '数量［口］', '単価', '経費', '為替レート', '受付金額[現地通貨]', '受渡金額/(ポイント利用)[円]', '決済通貨'],
    ['2025/03/14', '2025/03/19', 'eMAXIS Slim 米国株式(S&P500)', '再投資型', '一般', '買付', '通常', 841440, 29711, 0, '-', '-', 2500000, '円'],
    ['2024/11/26', '2024/12/03', 'イーストスプリング', '再投資型', '一般', '解約', '', 1454122, 20631, 0, '-', '-', 3000000, '円']
  ];

  const records = normalizeRakutenFundRowsToRecords_(rows, 0);

  assertEquals_('投信', records[0]['商品'], '買付の商品');
  assertEquals_('現物買付', records[0]['取引区分'], '買付の取引区分');
  assertEquals_(2500000, records[0]['受渡金額/決済損益'], '買付の受渡金額');
  assertEquals_('JPY', normalizeCurrency_(records[0]['決済通貨']), '買付の決済通貨');

  assertEquals_('投信', records[1]['商品'], '解約の商品');
  assertEquals_('現物買取', records[1]['取引区分'], '解約の取引区分');
  assertEquals_(3000000, records[1]['受渡金額/決済損益'], '解約の受渡金額');
}

function test_detectInputSourceTypeFromRows_rakutenDividend_20260616_() {
  const rows = [
    ['入金日', '商品', '口座', '銘柄コード', '銘柄', '受取通貨', '単価[円/現地通貨]', '数量[株/口]', '配当・分配金合計（税引前）[円/現地通貨]', '税額合計[円/現地通貨]', '受取金額[円/現地通貨]']
  ];

  const detected = detectInputSourceTypeFromRows_(rows);
  assertEquals_('rakuten_dividend', detected.sourceType, '楽天配当金・分配金を判定できる');
}

function test_normalizeRakutenDividendRowsToRecords_usStockDividend_20260616_() {
  const rows = [
    ['入金日', '商品', '口座', '銘柄コード', '銘柄', '受取通貨', '単価[円/現地通貨]', '数量[株/口]', '配当・分配金合計（税引前）[円/現地通貨]', '税額合計[円/現地通貨]', '受取金額[円/現地通貨]', 'レート', '現地源泉税［円］', '国内源泉税［円］'],
    ['2026/04/03', '米国株式', '特定・一般', 'AVGO', 'BROADCOM INC', 'USドル', 0.65, 18, 11.7, '-', 8.92, 150, 123, 45]
  ];

  const records = normalizeRakutenDividendRowsToRecords_(rows, 0);
  const record = records[0];

  assertEquals_('外株', record['商品'], '商品');
  assertEquals_('入金（配当金）', record['取引区分'], '取引区分');
  assertEquals_('AVGO', record['銘柄コード'], '銘柄コード');
  assertEquals_('USD', normalizeCurrency_(record['決済通貨']), '決済通貨');
  assertEquals_(8.92, record['受渡金額/決済損益'], '受取金額を使う');
  assertEquals_(150, record['レート'], '手入力レート');
  assertEquals_(123, record['現地源泉税（円）'], '手入力現地源泉税');
  assertEquals_(45, record['国内源泉所得税（円）'], '手入力国内源泉税');
}

function test_normalizeRakutenDividendRowsToRecords_requiresManualHeaders_20260618_() {
  const rows = [
    ['入金日', '商品', '口座', '銘柄コード', '銘柄', '受取通貨', '単価[円/現地通貨]', '数量[株/口]', '配当・分配金合計（税引前）[円/現地通貨]', '税額合計[円/現地通貨]', '受取金額[円/現地通貨]'],
    ['2026/04/03', '米国株式', '特定・一般', 'AVGO', 'BROADCOM INC', 'USドル', 0.65, 18, 11.7, '-', 8.92]
  ];

  assertThrowsContains_(function() {
    normalizeRakutenDividendRowsToRecords_(rows, 0);
  }, '楽天配当金CSVには手入力列が必要です', '楽天配当金CSVの手入力3列は必須');
}

function test_normalizeRakutenDividendRowsToRecords_requiresRateForForeignCurrency_20260618_() {
  const rows = [
    ['入金日', '商品', '口座', '銘柄コード', '銘柄', '受取通貨', '単価[円/現地通貨]', '数量[株/口]', '配当・分配金合計（税引前）[円/現地通貨]', '税額合計[円/現地通貨]', '受取金額[円/現地通貨]', 'レート', '現地源泉税［円］', '国内源泉税［円］'],
    ['2026/04/03', '米国株式', '特定・一般', 'AVGO', 'BROADCOM INC', 'USドル', 0.65, 18, 11.7, '-', 8.92, '', 123, 45]
  ];

  assertThrowsContains_(function() {
    normalizeRakutenDividendRowsToRecords_(rows, 0);
  }, '外貨配当は「レート」を入力してください', '外貨配当はレート必須');
}

function test_detectInputSourceTypeFromRows_rakutenCash_20260616_() {
  const rows = [
    ['口座開設以来の入出金合計額'],
    ['入出金日', '入金額［円］', '出金額［円］', '内容', '出金先']
  ];

  const detected = detectInputSourceTypeFromRows_(rows);
  assertEquals_('rakuten_cash', detected.sourceType, '楽天入出金履歴を判定できる');
  assertEquals_(1, detected.headerRowIndex, 'ヘッダー行index');
}

function test_normalizeRakutenCashRowsToRecords_depositAndWithdrawal_20260616_() {
  const rows = [
    ['入出金日', '入金額［円］', '出金額［円］', '内容', '出金先'],
    ['2024/07/23', 20000000, '', '通常振込入金', ''],
    ['2025/11/05', '', 6001186, '通常出金', '七十七銀行 六丁目支店']
  ];

  const records = normalizeRakutenCashRowsToRecords_(rows, 0);

  assertEquals_('現金', records[0]['商品'], '入金の商品');
  assertEquals_('入金（振込）', records[0]['取引区分'], '入金の取引区分');
  assertEquals_(20000000, records[0]['受渡金額/決済損益'], '入金額');

  assertEquals_('現金', records[1]['商品'], '出金の商品');
  assertEquals_('出金（振込）', records[1]['取引区分'], '出金の取引区分');
  assertEquals_(6001186, records[1]['受渡金額/決済損益'], '出金額');
}

function test_rakutenDbHeaders_includeDividendManualColumns_20260617_() {
  assertTrue_(RAKUTEN_DB_HEADERS.indexOf('manualRate') >= 0, '楽天配当金の手入力レート列');
  assertTrue_(RAKUTEN_DB_HEADERS.indexOf('manualForeignWithholdingTaxJpy') >= 0, '楽天配当金の現地源泉税列');
  assertTrue_(RAKUTEN_DB_HEADERS.indexOf('manualDomesticWithholdingTaxJpy') >= 0, '楽天配当金の国内源泉税列');
  assertTrue_(RAKUTEN_DB_HEADERS.indexOf('normalizedTradeType') >= 0, '共通計算モデルへ渡す取引区分列');
  assertTrue_(RAKUTEN_DB_HEADERS.indexOf('isActive') > RAKUTEN_DB_HEADERS.indexOf('recordId'), '論理削除列');
}
