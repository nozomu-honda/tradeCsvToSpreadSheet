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
  assertEquals_('rakuten_corp_a', routeTargetDbKeyBySource_('corp_a', 'rakuten_jp_stock'), '法人A');
  assertEquals_('rakuten_corp_b', routeTargetDbKeyBySource_('corp_b', 'rakuten_us_stock'), '法人B');
  assertEquals_('rakuten_test', routeTargetDbKeyBySource_('test', 'rakuten_us_stock'), 'test');
  assertEquals_('corp_a', routeTargetDbKeyBySource_('corp_a', 'nomura_common'), '野村はそのまま');
}
