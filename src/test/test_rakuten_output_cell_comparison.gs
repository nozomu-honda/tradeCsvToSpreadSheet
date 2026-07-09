/**
 * 楽天出力の実データ相当セル比較テスト
 */

function test_rakutenOutputCellComparison_fromRealLikeInputsThroughDb_20260709_() {
  const temp = createTempDbTargets_(['nomura_corp_a', 'rakuten_corp_a']);
  try {
    withTempDbTargets_(temp.targets, 'nomura_corp_a', function() {
      const fixtures = buildRakutenOutputCellComparisonFixtures_();
      let expectedRecordCount = 0;

      fixtures.forEach(function(fixture) {
        const normalized = normalizeRowsForImport_(fixture.rows);
        assertEquals_(fixture.sourceType, normalized.sourceType, fixture.label + ': sourceType');
        assertEquals_('rakuten_corp_a', routeTargetDbKeyBySource_('nomura_corp_a', normalized.sourceType), fixture.label + ': 楽天DBへルーティング');

        const appendResult = appendRecordsToDb_(normalized.sourceRecords, {
          targetDbKey: routeTargetDbKeyBySource_('nomura_corp_a', normalized.sourceType),
          sourceName: fixture.sourceName,
          inputType: 'upload',
          sourceType: normalized.sourceType,
          importId: fixture.importId,
          alertCount: normalized.alerts.length,
        });

        assertEquals_('rakuten_corp_a', appendResult.dbTargetKey, fixture.label + ': 実際の保存先DB');
        assertEquals_('楽天DB', appendResult.dbTargetKindLabel, fixture.label + ': 保存先DB種別');
        assertEquals_(normalized.sourceRecords.length, appendResult.insertedCount, fixture.label + ': 保存件数');
        expectedRecordCount += normalized.sourceRecords.length;
      });

      assertEquals_(0, readDbRecordObjects_('nomura_corp_a').length, '通常DBには楽天入力を保存しない');
      assertEquals_(expectedRecordCount, readDbRecordObjects_('rakuten_corp_a').length, '楽天DBに全fixtureを保存');

      withTempSpreadsheet_(function(ss) {
        ss.insertSheet(CONFIG.OUTPUT_JAPAN_STOCK);
        ss.insertSheet(CONFIG.OUTPUT_US_STOCK);
        ss.insertSheet(CONFIG.OUTPUT_FUND);

        const result = buildOutputSheetsFromDb_(ss, 'rakuten_corp_a');
        assertEquals_('rakuten', result.outputDbKind, '楽天DBは楽天専用出力入口を使う');
        assertEquals_(13, result.counts.all, '楽天出力の全件数');
        assertEquals_(3, result.counts.japanStocks, '楽天日本株件数');
        assertEquals_(4, result.counts.usStocks, '楽天米国株件数');
        assertEquals_(4, result.counts.funds, '楽天投資信託件数');
        assertEquals_(8, result.counts.cashJpy, '金銭残高（円）件数');
        assertEquals_(5, result.counts.cashUsd, '金銭残高（ドル）件数');

        assertFalse_(!!ss.getSheetByName(CONFIG.OUTPUT_JAPAN_STOCK), '楽天出力では共通日本株シートを残さない');
        assertFalse_(!!ss.getSheetByName(CONFIG.OUTPUT_US_STOCK), '楽天出力では共通米国株シートを残さない');
        assertFalse_(!!ss.getSheetByName(CONFIG.OUTPUT_FUND), '楽天出力では共通投信シートを残さない');

        assertRakutenOutputCellComparisonJapanStock_(ss.getSheetByName(CONFIG.RAKUTEN_OUTPUT_JAPAN_STOCK));
        assertRakutenOutputCellComparisonUsStock_(ss.getSheetByName(CONFIG.RAKUTEN_OUTPUT_US_STOCK));
        assertRakutenOutputCellComparisonFund_(ss.getSheetByName(CONFIG.RAKUTEN_OUTPUT_FUND));
        assertRakutenOutputCellComparisonCashJpy_(ss.getSheetByName(CONFIG.OUTPUT_CASH_JPY));
        assertRakutenOutputCellComparisonCashUsd_(ss.getSheetByName(CONFIG.OUTPUT_CASH_USD));
      });
    });
  } finally {
    temp.cleanup();
  }
}

function buildRakutenOutputCellComparisonFixtures_() {
  return [
    {
      label: '楽天日本株',
      sourceType: 'rakuten_jp_stock',
      sourceName: 'rakuten_japan_stock_real_like.csv',
      importId: 'import_rakuten_cell_jp',
      rows: [
        ['約定日', '受渡日', '銘柄コード', '銘柄名', '市場名称', '口座区分', '取引区分', '売買区分', '信用区分', '弁済期限', '数量［株］', '単価［円］', '手数料［円］', '税金等［円］', '諸費用［円］', '税区分', '受渡金額［円］'],
        ['2026/01/05', '2026/01/07', '4755', '楽天実データ日本株', '東証', '特定', '現物', '買付', '', '', 10, 100, 50, 5, 3, '課税', 1005],
        ['2026/01/10', '2026/01/12', '4755', '楽天実データ日本株', '東証', '特定', '現物', '売付', '', '', 4, 120, 0, 0, 0, '課税', 480],
        ['2026/01/14', '2026/01/15', '4755', '楽天実データ日本株', '東証', '特定', '入庫', '入庫', '', '', 6, 0, 0, 0, 0, '', 0],
      ],
    },
    {
      label: '楽天米国株',
      sourceType: 'rakuten_us_stock',
      sourceName: 'rakuten_us_stock_real_like.csv',
      importId: 'import_rakuten_cell_us',
      rows: [
        ['約定日', '受渡日', 'ティッカー', '銘柄名', '口座', '取引区分', '売買区分', '信用区分', '弁済期限', '決済通貨', '数量［株］', '単価［USドル］', '約定代金［USドル］', '為替レート', '手数料［USドル］', '税金［USドル］', '受渡金額［USドル］', '受渡金額［円］'],
        ['2026/01/06', '2026/01/08', 'AAPL', 'APPLE INC', '特定', '現物', '買付', '', '', 'USドル', 1, 200, 200, 150, 1.5, 0.2, 201.7, 30255],
        ['2026/01/18', '2026/01/20', 'AAPL', 'APPLE INC', '特定', '現物', '売付', '', '', 'USドル', 1, 250, 250, 150, 0.8, 0.1, 250.8, 37620],
        ['2026/01/09', '2026/01/11', 'MSFT', 'MICROSOFT CORP', '特定', '現物', '買付', '', '', '円', 1, 200, 200, 150, 1.5, 0.2, 201.5, 30225],
      ],
    },
    {
      label: '楽天投資信託',
      sourceType: 'rakuten_fund',
      sourceName: 'rakuten_fund_real_like.csv',
      importId: 'import_rakuten_cell_fund',
      rows: [
        ['約定日', '受渡日', 'ファンド名', '分配金', '口座', '取引', '買付方法', '数量［口］', '単価', '経費', '為替レート', '受付金額[現地通貨]', '受渡金額/(ポイント利用)[円]', '決済通貨'],
        ['2026/01/07', '2026/01/09', '楽天実データ投信JPY', '再投資型', '一般', '買付', '通常', 10000, 12000, 100, 1, 12000, 12000, '円'],
        ['2026/01/14', '2026/01/16', '楽天実データ投信JPY', '再投資型', '一般', '解約', '', 4000, 15000, 0, 1, 6000, 6000, '円'],
        ['2026/01/16', '2026/01/18', '楽天米ドル投信', '再投資型', '一般', '買付', '通常', 10000, 20, 0, 150, 20, 20, 'USドル'],
      ],
    },
    {
      label: '楽天配当金分配金',
      sourceType: 'rakuten_dividend',
      sourceName: 'rakuten_dividend_real_like.csv',
      importId: 'import_rakuten_cell_dividend',
      rows: [
        ['入金日', '商品', '口座', '銘柄コード', '銘柄', '受取通貨', '単価[円/現地通貨]', '数量[株/口]', '配当・分配金合計（税引前）[円/現地通貨]', '税額合計[円/現地通貨]', '受取金額[円/現地通貨]', '為替レート', '現地源泉税（円）', '国内源泉所得税（円）', '備考'],
        ['2026/01/25', '米国株式', '特定', 'AAPL', 'APPLE INC', 'USドル', 0.1, 100, 10, 2, 8, 150, 100, 20, '米国株配当'],
        ['2026/01/26', '投資信託', '一般', '', '楽天米ドル投信', 'USドル', 0.05, 10000, 6, 1, 5, 150, 50, 10, '投信分配金'],
      ],
    },
    {
      label: '楽天入出金',
      sourceType: 'rakuten_cash',
      sourceName: 'rakuten_cash_real_like.csv',
      importId: 'import_rakuten_cell_cash',
      rows: [
        ['口座開設以来の入出金合計額'],
        ['入出金日', '入金額［円］', '出金額［円］', '内容', '出金先'],
        ['2026/01/01', 100000, '', '通常振込入金', ''],
        ['2026/01/28', '', 30000, '通常出金', 'テスト銀行'],
      ],
    },
  ];
}

function assertRakutenOutputCellComparisonJapanStock_(sheet) {
  assertTrue_(!!sheet, '楽天日本株シートを作成');
  assertArrayEquals_(RAKUTEN_JAPAN_STOCK_HEADERS, sheet.getRange(1, 1, 1, RAKUTEN_JAPAN_STOCK_HEADERS.length).getValues()[0], '楽天日本株ヘッダー');

  const buyRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, { '銘柄コード': '4755', '売買区分': '買付' });
  assertEquals_('楽天実データ日本株', getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, buyRow, '銘柄名'), '日本株買付 銘柄名');
  assertEquals_(50, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, buyRow, '手数料［円］'), '日本株買付 手数料');
  assertEquals_(5, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, buyRow, '税金等［円］'), '日本株買付 税金等');
  assertEquals_(3, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, buyRow, '諸費用［円］'), '日本株買付 諸費用');
  assertEquals_(1005, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, buyRow, '受渡金額［円］'), '日本株買付 受渡金額');
  assertEquals_(10, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, buyRow, '保有数'), '日本株買付 保有数');
  assertEquals_(100, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, buyRow, '平均取得単価'), '日本株買付 平均取得単価');
  assertEquals_(1000, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, buyRow, '簿価'), '日本株買付 簿価');

  const sellRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, { '銘柄コード': '4755', '売買区分': '売付' });
  assertEquals_(6, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, sellRow, '保有数'), '日本株売却 保有数');
  assertEquals_(480, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, sellRow, '手数料抜き売値'), '日本株売却 手数料抜き売値');
  assertEquals_(400, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, sellRow, '取得価格'), '日本株売却 取得価格');
  assertEquals_(80, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, sellRow, '売却損益'), '日本株売却 売却損益');
  assertEquals_(-400, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, sellRow, '簿価'), '日本株売却 簿価');
  assertEquals_(600, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, sellRow, '銘柄ごとの残高'), '日本株売却 銘柄ごとの残高');

  const transferRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, { '銘柄コード': '4755', '売買区分': '入庫' });
  assertEquals_(12, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, transferRow, '保有数'), '日本株入庫 保有数');
  assertEquals_(50, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, transferRow, '平均取得単価'), '日本株入庫 平均取得単価');
  assertEquals_('', getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, transferRow, '簿価'), '日本株入庫 簿価');
  assertEquals_(600, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, transferRow, '銘柄ごとの残高'), '日本株入庫 銘柄ごとの残高');
}

function assertRakutenOutputCellComparisonUsStock_(sheet) {
  assertTrue_(!!sheet, '楽天米国株シートを作成');
  assertArrayEquals_(RAKUTEN_US_STOCK_HEADERS, sheet.getRange(1, 1, 1, RAKUTEN_US_STOCK_HEADERS.length).getValues()[0], '楽天米国株ヘッダー');

  const buyRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_US_STOCK_HEADERS, { 'ティッカー': 'AAPL', '売買区分': '買付' });
  assertEquals_(200, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, buyRow, '約定代金［USドル］'), '米国株買付 約定代金');
  assertEquals_(0.2, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, buyRow, '税金［USドル］'), '米国株買付 税金USD');
  assertEquals_(201.7, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, buyRow, '受渡金額［USドル］'), '米国株買付 受渡USD');
  assertEquals_(30255, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, buyRow, '受渡金額［円］'), '米国株買付 受渡円');
  assertEquals_(225, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, buyRow, '国内手数料（円）'), '米国株買付 国内手数料');
  assertEquals_(30, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, buyRow, '手数料の消費税額（円）'), '米国株買付 手数料消費税');
  assertEquals_(30255, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, buyRow, '平均取得単価'), '米国株買付 平均取得単価');
  assertEquals_(30255, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, buyRow, '簿価'), '米国株買付 簿価');

  const sellRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_US_STOCK_HEADERS, { 'ティッカー': 'AAPL', '売買区分': '売付' });
  assertEquals_(0, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, sellRow, '保有数'), '米国株売却 保有数');
  assertEquals_(37500, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, sellRow, '手数料抜き売値'), '米国株売却 手数料抜き売値');
  assertEquals_(30255, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, sellRow, '取得価格'), '米国株売却 取得価格');
  assertEquals_(7245, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, sellRow, '売却損益'), '米国株売却 売却損益');
  assertEquals_(-30255, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, sellRow, '簿価'), '米国株売却 簿価');
  assertEquals_(0, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, sellRow, '銘柄ごとの残高'), '米国株売却 銘柄ごとの残高');
  assertEquals_(15, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, sellRow, '手数料の消費税額（円）'), '米国株売却 税金USD円換算');

  const jpySettlementRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_US_STOCK_HEADERS, { 'ティッカー': 'MSFT', '売買区分': '買付' });
  assertEquals_('JPY', getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, jpySettlementRow, '決済通貨'), '米国株円決済 決済通貨');
  assertEquals_(201.5, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, jpySettlementRow, '受渡金額［USドル］'), '米国株円決済 受渡USD換算');
  assertEquals_(30225, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, jpySettlementRow, '受渡金額［円］'), '米国株円決済 受渡円');

  const dividendRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_US_STOCK_HEADERS, { 'ティッカー': 'AAPL', '売買区分': '入金（配当金）' });
  assertEquals_(10, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, dividendRow, '約定代金［USドル］'), '米国株配当 税引前合計');
  assertEquals_(2, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, dividendRow, '税金［USドル］'), '米国株配当 税額合計');
  assertEquals_(8, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, dividendRow, '受渡金額［USドル］'), '米国株配当 受取金額');
  assertEquals_(150, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, dividendRow, '為替レート'), '米国株配当 為替レート');
  assertEquals_(100, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, dividendRow, '現地源泉税（円）'), '米国株配当 現地源泉税');
  assertEquals_(20, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, dividendRow, '国内源泉所得税（円）'), '米国株配当 国内源泉税');
  assertEquals_('', getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, dividendRow, '手数料の消費税額（円）'), '米国株配当 税額は手数料消費税に流さない');
}

function assertRakutenOutputCellComparisonFund_(sheet) {
  assertTrue_(!!sheet, '楽天投資信託シートを作成');
  assertArrayEquals_(RAKUTEN_FUND_HEADERS, sheet.getRange(1, 1, 1, RAKUTEN_FUND_HEADERS.length).getValues()[0], '楽天投資信託ヘッダー');

  const buyRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_FUND_HEADERS, { 'ファンド名': '楽天実データ投信JPY', '取引': '買付' });
  assertEquals_('再投資型', getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, buyRow, '分配金'), '投信買付 分配金列');
  assertEquals_(12000, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, buyRow, '受付金額'), '投信買付 受付金額');
  assertEquals_(100, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, buyRow, '経費'), '投信買付 経費');
  assertEquals_(100, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, buyRow, '国内手数料（円）'), '投信買付 国内手数料');
  assertEquals_(9, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, buyRow, '手数料の消費税額（円）'), '投信買付 手数料消費税');
  assertEquals_(11991, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, buyRow, '平均取得単価'), '投信買付 平均取得単価');
  assertEquals_(11991, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, buyRow, '簿価'), '投信買付 簿価');

  const sellRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_FUND_HEADERS, { 'ファンド名': '楽天実データ投信JPY', '取引': '解約' });
  assertEquals_(6000, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, sellRow, '保有数'), '投信解約 保有数');
  assertEquals_(6000, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, sellRow, '手数料抜き売値'), '投信解約 手数料抜き売値');
  assertApproxEquals_(4796.4, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, sellRow, '取得価格'), 0.000001, '投信解約 取得価格');
  assertApproxEquals_(1203.6, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, sellRow, '売却損益'), 0.000001, '投信解約 売却損益');
  assertApproxEquals_(-4796.4, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, sellRow, '簿価'), 0.000001, '投信解約 簿価');
  assertApproxEquals_(7194.6, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, sellRow, '銘柄ごとの残高'), 0.000001, '投信解約 銘柄ごとの残高');

  const usdFundBuyRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_FUND_HEADERS, { 'ファンド名': '楽天米ドル投信', '取引': '買付' });
  assertEquals_('USD', getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, usdFundBuyRow, '決済通貨'), '外貨投信買付 決済通貨');
  assertEquals_(20, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, usdFundBuyRow, '受付金額'), '外貨投信買付 受付金額');

  const distributionRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_FUND_HEADERS, { 'ファンド名': '楽天米ドル投信', '取引': '入金（分配金）' });
  assertEquals_(5, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, distributionRow, '受渡金額'), '投信分配金 受渡金額');
  assertEquals_(150, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, distributionRow, '為替レート'), '投信分配金 為替レート');
  assertEquals_(10, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, distributionRow, '国内源泉所得税（円）'), '投信分配金 国内源泉税');
}

function assertRakutenOutputCellComparisonCashJpy_(sheet) {
  assertTrue_(!!sheet, '金銭残高（円）シートを作成');
  assertArrayEquals_(RAKUTEN_CASH_JPY_HEADERS, sheet.getRange(1, 1, 1, RAKUTEN_CASH_JPY_HEADERS.length).getValues()[0], '金銭残高（円）ヘッダー');

  const depositRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_CASH_JPY_HEADERS, { '内容': '通常振込入金' });
  assertEquals_(100000, getSheetValueByHeader_(sheet, RAKUTEN_CASH_JPY_HEADERS, depositRow, '入金額［円］'), '円入金額');
  assertEquals_(100000, getSheetValueByHeader_(sheet, RAKUTEN_CASH_JPY_HEADERS, depositRow, '残高'), '円入金後残高');

  const jpBuyRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_CASH_JPY_HEADERS, { '銘柄コード': '4755', '取引区分': '現物買付' });
  assertEquals_(1005, getSheetValueByHeader_(sheet, RAKUTEN_CASH_JPY_HEADERS, jpBuyRow, '日本株受渡金額［円］'), '日本株円決済');
  assertEquals_(98995, getSheetValueByHeader_(sheet, RAKUTEN_CASH_JPY_HEADERS, jpBuyRow, '残高'), '日本株買付後残高');

  const usJpyBuyRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_CASH_JPY_HEADERS, { '銘柄コード': 'MSFT', '取引区分': '現物買付' });
  assertEquals_(30225, getSheetValueByHeader_(sheet, RAKUTEN_CASH_JPY_HEADERS, usJpyBuyRow, '米国株受渡金額［円］'), '米国株円決済');
  assertEquals_(56770, getSheetValueByHeader_(sheet, RAKUTEN_CASH_JPY_HEADERS, usJpyBuyRow, '残高'), '米国株円決済後残高');

  const withdrawalRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_CASH_JPY_HEADERS, { '内容': '通常出金' });
  assertEquals_(30000, getSheetValueByHeader_(sheet, RAKUTEN_CASH_JPY_HEADERS, withdrawalRow, '出金額［円］'), '円出金額');
  assertEquals_('', getSheetValueByHeader_(sheet, RAKUTEN_CASH_JPY_HEADERS, withdrawalRow, '出金先'), '出金先は現状モデルにないため空欄');
  assertEquals_(33250, getSheetValueByHeader_(sheet, RAKUTEN_CASH_JPY_HEADERS, withdrawalRow, '残高'), '円最終残高');
  assertEquals_(33250, getSheetValueByHeader_(sheet, RAKUTEN_CASH_JPY_HEADERS, withdrawalRow, '月次残高'), '円月次残高');
}

function assertRakutenOutputCellComparisonCashUsd_(sheet) {
  assertTrue_(!!sheet, '金銭残高（ドル）シートを作成');
  assertArrayEquals_(RAKUTEN_CASH_USD_HEADERS, sheet.getRange(1, 1, 1, RAKUTEN_CASH_USD_HEADERS.length).getValues()[0], '金銭残高（ドル）ヘッダー');

  const usBuyRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_CASH_USD_HEADERS, { '銘柄コード': 'AAPL', '取引区分': '現物買付' });
  assertEquals_(201.7, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, usBuyRow, '米国株受渡金額［USドル］'), '米国株USD決済');
  assertApproxEquals_(-201.7, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, usBuyRow, '残高'), 0.000001, '米国株USD買付後残高');

  const usdFundBuyRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_CASH_USD_HEADERS, { '銘柄名': '楽天米ドル投信', '取引区分': '現物買付' });
  assertEquals_(20, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, usdFundBuyRow, '投信受渡金額［USドル］'), '投信USD決済');
  assertApproxEquals_(-221.7, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, usdFundBuyRow, '残高'), 0.000001, '投信USD買付後残高');

  const dividendRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_CASH_USD_HEADERS, { '銘柄コード': 'AAPL', '取引区分': '入金（配当金）' });
  assertEquals_(8, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, dividendRow, '配当金・分配金受取金額［USドル］'), '米国株配当 受取金額');
  assertEquals_(10, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, dividendRow, '配当金・分配金合計［USドル］'), '米国株配当 税引前合計');
  assertEquals_(2, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, dividendRow, '税金［USドル］'), '米国株配当 税額合計');
  assertEquals_(150, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, dividendRow, '為替レート'), '米国株配当 為替レート');
  assertEquals_(100, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, dividendRow, '現地源泉税（円）'), '米国株配当 現地源泉税');
  assertEquals_(20, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, dividendRow, '国内源泉所得税（円）'), '米国株配当 国内源泉税');
  assertApproxEquals_(37.1, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, dividendRow, '残高'), 0.000001, '米国株配当後USD残高');

  const distributionRow = findSheetRowByHeaderValues_(sheet, RAKUTEN_CASH_USD_HEADERS, { '銘柄名': '楽天米ドル投信', '取引区分': '入金（分配金）' });
  assertEquals_(5, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, distributionRow, '配当金・分配金受取金額［USドル］'), '投信分配金 受取金額');
  assertEquals_(1, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, distributionRow, '税金［USドル］'), '投信分配金 税額');
  assertApproxEquals_(42.1, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, distributionRow, '残高'), 0.000001, 'USD最終残高');
  assertApproxEquals_(42.1, getSheetValueByHeader_(sheet, RAKUTEN_CASH_USD_HEADERS, distributionRow, '月次残高'), 0.000001, 'USD月次残高');
}

function findSheetRowByHeaderValues_(sheet, headers, criteria) {
  const lastRow = sheet.getLastRow();
  for (var row = 2; row <= lastRow; row++) {
    const ok = Object.keys(criteria).every(function(header) {
      return String(getSheetValueByHeader_(sheet, headers, row, header)) === String(criteria[header]);
    });
    if (ok) {
      return row;
    }
  }
  throw new Error('条件に一致する行が見つかりません: ' + JSON.stringify(criteria));
}
