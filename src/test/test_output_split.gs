/**
 * 6シート出力の振り分けテスト
 */

function test_buildOutputSheetsFromDbRecords_splitsIntoSixSheets_() {
  withTempSpreadsheet_(function(ss) {
    const records = [
      makeTradeRecord_({
        商品: '株式',
        銘柄名: 'JP_STOCK',
        取引区分: '現物買付',
        数量: 1,
        単価: 100,
        受渡金額_決済損益: 100,
        決済通貨: 'JPY',
        約定日: '2026/05/01',
        受渡日: '2026/05/01'
      }),
      makeTradeRecord_({
        商品: '外株',
        銘柄名: 'US_STOCK',
        取引区分: '現物買付',
        数量: 1,
        単価: 10,
        受渡金額_決済損益: 10,
        レート: 150,
        決済通貨: 'USD',
        約定日: '2026/05/02',
        受渡日: '2026/05/02'
      }),
      makeTradeRecord_({
        商品: '外債',
        銘柄名: 'US_BOND',
        取引区分: '償還',
        数量: 0,
        単価: 0,
        受渡金額_決済損益: 20,
        決済通貨: 'USD',
        約定日: '2026/05/03',
        受渡日: '2026/05/03'
      }),
      makeTradeRecord_({
        商品: '投信',
        銘柄名: 'FUND_A',
        取引区分: '現物買付',
        数量: 100,
        単価: 1,
        受渡金額_決済損益: 100,
        決済通貨: 'JPY',
        約定日: '2026/05/04',
        受渡日: '2026/05/04'
      })
    ];

    const result = buildOutputSheetsFromDbRecords_(ss, records);

    assertEquals_(4, result.counts.all, '全件数');
    assertEquals_(1, result.counts.japanStocks, '日本株件数');
    assertEquals_(1, result.counts.usStocks, '米国株件数');
    assertEquals_(1, result.counts.foreignBonds, '外債件数');
    assertEquals_(1, result.counts.funds, '投信件数');
    assertEquals_(2, result.counts.cashJpy, '円残高件数');
    assertEquals_(2, result.counts.cashUsd, 'ドル残高件数');

    assertTrue_(!!ss.getSheetByName(CONFIG.OUTPUT_JAPAN_STOCK), '日本株シートを作成');
    assertTrue_(!!ss.getSheetByName(CONFIG.OUTPUT_US_STOCK), '米国株シートを作成');
    assertTrue_(!!ss.getSheetByName(CONFIG.OUTPUT_FOREIGN_BOND), '外債シートを作成');
    assertTrue_(!!ss.getSheetByName(CONFIG.OUTPUT_FUND), '投信シートを作成');
    assertTrue_(!!ss.getSheetByName(CONFIG.OUTPUT_CASH_JPY), '金銭残高（円）シートを作成');
    assertTrue_(!!ss.getSheetByName(CONFIG.OUTPUT_CASH_USD), '金銭残高（ドル）シートを作成');

    const japanSheet = ss.getSheetByName(CONFIG.OUTPUT_JAPAN_STOCK);
    const usSheet = ss.getSheetByName(CONFIG.OUTPUT_US_STOCK);
    const bondSheet = ss.getSheetByName(CONFIG.OUTPUT_FOREIGN_BOND);
    const fundSheet = ss.getSheetByName(CONFIG.OUTPUT_FUND);

    assertEquals_('JP_STOCK', japanSheet.getRange(2, getColumnIndexByHeader_(TRADE_HEADERS, '銘柄名')).getValue(), '日本株の中身');
    assertEquals_('US_STOCK', usSheet.getRange(2, getColumnIndexByHeader_(TRADE_HEADERS, '銘柄名')).getValue(), '米国株の中身');
    assertEquals_('US_BOND', bondSheet.getRange(2, getColumnIndexByHeader_(TRADE_HEADERS, '銘柄名')).getValue(), '外債の中身');
    assertEquals_('FUND_A', fundSheet.getRange(2, getColumnIndexByHeader_(TRADE_HEADERS, '銘柄名')).getValue(), '投信の中身');
  });
}

function test_buildOutputSheetsFromRecordsForTarget_dispatchesByDbKey_20260618_() {
  withTempSpreadsheet_(function(ss) {
    const now = new Date('2026-06-18T00:00:00Z');
    const records = [
      normalizeRakutenRecordForDb_(makeTradeRecord_({
        商品: '外株',
        銘柄名: 'RAKUTEN_OUTPUT',
        取引区分: '現物買付',
        数量: 1,
        単価: 10,
        受渡金額_決済損益: 10,
        レート: 150,
        決済通貨: 'USD',
        約定日: '2026/06/18',
        受渡日: '2026/06/18'
      }), {
        importId: 'import_rakuten_output',
        sourceName: 'rakuten.csv',
        sourceRowNo: 1,
        sourceType: 'rakuten_us_stock',
        now: now
      })
    ];

    const rakutenResult = buildOutputSheetsFromRecordsForTarget_(ss, 'rakuten_corp_a', records);
    assertEquals_('rakuten', rakutenResult.outputDbKind, '楽天DBは楽天出力入口を使う');
  });

  withTempSpreadsheet_(function(ss) {
    const now = new Date('2026-06-18T00:00:00Z');
    const records = [
      normalizeRecordForDb_(makeTradeRecord_({
        商品: '株式',
        銘柄名: 'NOMURA_OUTPUT',
        取引区分: '現物買付',
        数量: 1,
        単価: 100,
        受渡金額_決済損益: 100,
        決済通貨: 'JPY',
        約定日: '2026/06/18',
        受渡日: '2026/06/18'
      }), {
        importId: 'import_nomura_output',
        sourceName: 'nomura.csv',
        sourceRowNo: 1,
        now: now
      })
    ];

    const nomuraResult = buildOutputSheetsFromRecordsForTarget_(ss, 'nomura_corp_a', records);
    assertEquals_('nomura', nomuraResult.outputDbKind, '野村DBは従来出力入口を使う');
  });
}

function test_buildRakutenOutputSheetsFromBaseRecords_writesJapanStockFinalLook_20260708_() {
  withTempSpreadsheet_(function(ss) {
    ss.insertSheet(CONFIG.OUTPUT_JAPAN_STOCK);

    const records = [
      makeTradeRecord_({
        商品: '株式',
        銘柄コード: '4755',
        銘柄名: 'RAKUTEN_JP_OUTPUT',
        預り区分: '一般',
        取引区分: '現物買付',
        数量: 10,
        単価: 100,
        受渡金額_決済損益: 1005,
        手数料税込: 55,
        国内消費税等円: 5,
        国内手数料円: 50,
        現地手数料円: 3,
        決済通貨: 'JPY',
        約定日: '2026/07/01',
        受渡日: '2026/07/03'
      }),
      makeTradeRecord_({
        商品: '株式',
        銘柄コード: '4755',
        銘柄名: 'RAKUTEN_JP_OUTPUT',
        預り区分: '一般',
        取引区分: '現物売却',
        数量: 4,
        単価: 120,
        受渡金額_決済損益: 480,
        手数料税込: 0,
        国内消費税等円: '',
        国内手数料円: 0,
        現地手数料円: 0,
        決済通貨: 'JPY',
        約定日: '2026/07/10',
        受渡日: '2026/07/12'
      })
    ];

    const result = buildRakutenOutputSheetsFromBaseRecords_(ss, records);
    const sheet = ss.getSheetByName(CONFIG.RAKUTEN_OUTPUT_JAPAN_STOCK);

    assertEquals_(2, result.counts.japanStocks, '楽天日本株件数');
    assertTrue_(!!sheet, '楽天日本株シートを作成');
    assertFalse_(!!ss.getSheetByName(CONFIG.OUTPUT_JAPAN_STOCK), '楽天出力では共通日本株シートを作らない');

    const headerRow = sheet.getRange(1, 1, 1, RAKUTEN_JAPAN_STOCK_HEADERS.length).getValues()[0];
    assertArrayEquals_(RAKUTEN_JAPAN_STOCK_HEADERS, headerRow, '楽天日本株の列順はDrive最終見た目に合わせる');

    assertEquals_('現物', getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 2, '取引区分'), '買付の取引区分');
    assertEquals_('買付', getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 2, '売買区分'), '買付の売買区分');
    assertEquals_(10, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 2, '数量［株］'), '数量［株］');
    assertEquals_(50, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 2, '手数料［円］'), '手数料［円］');
    assertEquals_(5, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 2, '税金等［円］'), '税金等［円］');
    assertEquals_(3, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 2, '諸費用［円］'), '諸費用［円］');
    assertEquals_(1005, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 2, '受渡金額［円］'), '受渡金額［円］');

    assertEquals_(10, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 2, '保有数'), '買付後の保有数');
    assertEquals_(5, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 2, '手数料の消費税額（円）'), '手数料の消費税額（円）');
    assertEquals_(100, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 2, '平均取得単価'), '平均取得単価');
    assertEquals_(1000, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 2, '簿価'), '買付の簿価');

    assertEquals_('売付', getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 3, '売買区分'), '売却の売買区分');
    assertEquals_(6, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 3, '保有数'), '売却後の保有数');
    assertEquals_(480, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 3, '手数料抜き売値'), '売却の手数料抜き売値');
    assertEquals_(400, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 3, '取得価格'), '売却の取得価格');
    assertEquals_(80, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 3, '売却損益'), '売却損益');
    assertEquals_(-400, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 3, '簿価'), '売却の簿価');
    assertEquals_(600, getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 3, '銘柄ごとの残高'), '銘柄ごとの残高');
    assertEquals_('', getSheetValueByHeader_(sheet, RAKUTEN_JAPAN_STOCK_HEADERS, 3, 'FX2の期末簿価'), 'FX2の期末簿価');

    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(RAKUTEN_JAPAN_STOCK_HEADERS, '信用区分')), '信用区分は非表示');
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(RAKUTEN_JAPAN_STOCK_HEADERS, '建約定日')), '建約定日は非表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(RAKUTEN_JAPAN_STOCK_HEADERS, '約定日')), '約定日は表示');
  });
}

function test_buildRakutenOutputSheetsFromBaseRecords_writesUsStockFinalLook_20260708_() {
  withTempSpreadsheet_(function(ss) {
    ss.insertSheet(CONFIG.OUTPUT_US_STOCK);

    const records = [
      makeTradeRecord_({
        商品: '外株',
        銘柄コード: 'AAPL',
        銘柄名: 'APPLE INC',
        預り区分: '特定',
        取引区分: '現物買付',
        数量: 10,
        単価: 100,
        受渡金額_決済損益: 1005,
        手数料税込: 0,
        レート: 150,
        決済通貨: 'USD',
        現地手数料円: 5,
        約定日: '2026/07/01',
        受渡日: '2026/07/03'
      }),
      makeTradeRecord_({
        商品: '外株',
        銘柄コード: 'AAPL',
        銘柄名: 'APPLE INC',
        預り区分: '特定',
        取引区分: '現物売却',
        数量: 4,
        単価: 120,
        受渡金額_決済損益: 480,
        手数料税込: 0,
        レート: 150,
        決済通貨: 'USD',
        現地手数料円: 0,
        約定日: '2026/07/10',
        受渡日: '2026/07/12'
      })
    ];

    const result = buildRakutenOutputSheetsFromBaseRecords_(ss, records);
    const sheet = ss.getSheetByName(CONFIG.RAKUTEN_OUTPUT_US_STOCK);

    assertEquals_(2, result.counts.usStocks, '楽天米国株件数');
    assertTrue_(!!sheet, '楽天米国株シートを作成');
    assertFalse_(!!ss.getSheetByName(CONFIG.OUTPUT_US_STOCK), '楽天出力では共通米国株シートを作らない');

    const headerRow = sheet.getRange(1, 1, 1, RAKUTEN_US_STOCK_HEADERS.length).getValues()[0];
    assertArrayEquals_(RAKUTEN_US_STOCK_HEADERS, headerRow, '楽天米国株の列順はDrive最終見た目に合わせる');

    assertEquals_('AAPL', getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, 'ティッカー'), 'ティッカー');
    assertEquals_('APPLE INC', getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '銘柄名'), '銘柄名');
    assertEquals_('特定', getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '口座'), '口座');
    assertEquals_('現物', getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '取引区分'), '買付の取引区分');
    assertEquals_('買付', getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '売買区分'), '買付の売買区分');
    assertEquals_('USD', getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '決済通貨'), '決済通貨');
    assertEquals_(10, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '数量［株］'), '数量［株］');
    assertEquals_(100, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '単価［USドル］'), '単価［USドル］');
    assertEquals_(1000, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '約定代金［USドル］'), '約定代金［USドル］');
    assertEquals_(150, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '為替レート'), '為替レート');
    assertEquals_(5, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '手数料［USドル］'), '手数料［USドル］');
    assertEquals_('', getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '税金［USドル］'), '税金［USドル］');
    assertEquals_(1005, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '受渡金額［USドル］'), '受渡金額［USドル］');
    assertEquals_(150750, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '受渡金額［円］'), '受渡金額［円］');

    assertEquals_(10, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '保有数'), '買付後の保有数');
    assertEquals_(750, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '国内手数料（円）'), '国内手数料（円）');
    assertEquals_('', getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '手数料の消費税額（円）'), '手数料の消費税額（円）');
    assertEquals_(15075, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '平均取得単価'), '平均取得単価');
    assertEquals_(150750, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 2, '簿価'), '買付の簿価');

    assertEquals_('売付', getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 3, '売買区分'), '売却の売買区分');
    assertEquals_(6, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 3, '保有数'), '売却後の保有数');
    assertEquals_(72000, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 3, '手数料抜き売値'), '売却の手数料抜き売値');
    assertEquals_(60300, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 3, '取得価格'), '売却の取得価格');
    assertEquals_(11700, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 3, '売却損益'), '売却損益');
    assertEquals_(-60300, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 3, '簿価'), '売却の簿価');
    assertEquals_(90450, getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 3, '銘柄ごとの残高'), '銘柄ごとの残高');
    assertEquals_('', getSheetValueByHeader_(sheet, RAKUTEN_US_STOCK_HEADERS, 3, 'FX2の期末簿価'), 'FX2の期末簿価');

    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(RAKUTEN_US_STOCK_HEADERS, '信用区分')), '信用区分は非表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(RAKUTEN_US_STOCK_HEADERS, '約定日')), '約定日は表示');
  });
}

function test_buildRakutenOutputSheetsFromBaseRecords_writesFundFinalLook_20260708_() {
  withTempSpreadsheet_(function(ss) {
    ss.insertSheet(CONFIG.OUTPUT_FUND);

    const records = [
      makeTradeRecord_({
        商品: '投信',
        銘柄名: 'RAKUTEN_FUND_OUTPUT',
        摘要: '通常',
        預り区分: '一般',
        取引区分: '現物買付',
        数量: 10000,
        単価: 12000,
        受渡金額_決済損益: 12000,
        手数料税込: 100,
        国内消費税等円: 10,
        国内手数料円: 100,
        レート: 1,
        決済通貨: 'JPY',
        約定日: '2026/07/01',
        受渡日: '2026/07/03'
      }),
      makeTradeRecord_({
        商品: '投信',
        銘柄名: 'RAKUTEN_FUND_OUTPUT',
        摘要: '',
        預り区分: '一般',
        取引区分: '現物買取',
        数量: 4000,
        単価: 15000,
        受渡金額_決済損益: 6000,
        手数料税込: 0,
        国内手数料円: 0,
        レート: 1,
        決済通貨: 'JPY',
        約定日: '2026/07/10',
        受渡日: '2026/07/12'
      })
    ];

    const result = buildRakutenOutputSheetsFromBaseRecords_(ss, records);
    const sheet = ss.getSheetByName(CONFIG.RAKUTEN_OUTPUT_FUND);

    assertEquals_(2, result.counts.funds, '楽天投資信託件数');
    assertTrue_(!!sheet, '楽天投資信託シートを作成');
    assertFalse_(!!ss.getSheetByName(CONFIG.OUTPUT_FUND), '楽天出力では共通投信シートを作らない');

    const headerRow = sheet.getRange(1, 1, 1, RAKUTEN_FUND_HEADERS.length).getValues()[0];
    assertArrayEquals_(RAKUTEN_FUND_HEADERS, headerRow, '楽天投資信託の列順はDrive最終見た目に合わせる');

    assertEquals_('RAKUTEN_FUND_OUTPUT', getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, 'ファンド名'), 'ファンド名');
    assertEquals_('', getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '分配金'), '分配金は現状モデルにないため空欄');
    assertEquals_('一般', getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '口座'), '口座');
    assertEquals_('買付', getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '取引'), '買付の取引');
    assertEquals_('通常', getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '買付方法'), '買付方法');
    assertEquals_(10000, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '数量'), '数量');
    assertEquals_(12000, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '単価'), '単価');
    assertEquals_(100, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '経費'), '経費');
    assertEquals_(1, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '為替レート'), '為替レート');
    assertEquals_('', getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '受付金額'), '受付金額は現状モデルにないため空欄');
    assertEquals_(12000, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '受渡金額'), '受渡金額');
    assertEquals_('JPY', getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '決済通貨'), '決済通貨');
    assertEquals_(100, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '国内手数料（円）'), '国内手数料（円）');
    assertEquals_(10, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '国内消費税等（円）'), '国内消費税等（円）');
    assertEquals_('', getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '国内源泉所得税（円）'), '国内源泉所得税（円）');
    assertEquals_('', getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '元金払戻金'), '元金払戻金');

    assertEquals_(10000, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '保有数'), '買付後の保有数');
    assertEquals_(10, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '手数料の消費税額（円）'), '手数料の消費税額（円）');
    assertEquals_(11990, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '平均取得単価'), '平均取得単価');
    assertEquals_(11990, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 2, '簿価'), '買付の簿価');

    assertEquals_('解約', getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 3, '取引'), '解約の取引');
    assertEquals_(6000, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 3, '保有数'), '解約後の保有数');
    assertEquals_(6000, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 3, '手数料抜き売値'), '解約の手数料抜き売値');
    assertEquals_(4796, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 3, '取得価格'), '解約の取得価格');
    assertEquals_(1204, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 3, '売却損益'), '売却損益');
    assertEquals_(-4796, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 3, '簿価'), '解約の簿価');
    assertEquals_(7194, getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 3, '銘柄ごとの残高'), '銘柄ごとの残高');
    assertEquals_('', getSheetValueByHeader_(sheet, RAKUTEN_FUND_HEADERS, 3, 'FX2の期末簿価'), 'FX2の期末簿価');

    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(RAKUTEN_FUND_HEADERS, '約定日')), '約定日は表示');
  });
}

function test_buildRakutenOutputSheetsFromBaseRecords_writesCashFinalLook_20260708_() {
  withTempSpreadsheet_(function(ss) {
    const records = [
      makeTradeRecord_({
        商品: '現金',
        摘要: '円入金テスト',
        取引区分: '入金（振込）',
        受渡金額_決済損益: 100000,
        決済通貨: 'JPY',
        約定日: '2026/07/01',
        受渡日: '2026/07/01'
      }),
      makeTradeRecord_({
        商品: '外株',
        銘柄コード: 'AAPL',
        銘柄名: 'APPLE INC',
        預り区分: '特定',
        取引区分: '現物買付',
        数量: 10,
        単価: 10,
        受渡金額_決済損益: 100,
        レート: 150,
        発行通貨: 'USD',
        決済通貨: 'USD',
        約定日: '2026/07/02',
        受渡日: '2026/07/02'
      }),
      makeTradeRecord_({
        商品: '株式',
        銘柄コード: '4755',
        銘柄名: 'RAKUTEN_JP_CASH',
        取引区分: '現物買付',
        数量: 10,
        単価: 500,
        受渡金額_決済損益: 5000,
        決済通貨: 'JPY',
        約定日: '2026/07/05',
        受渡日: '2026/07/05'
      }),
      makeTradeRecord_({
        商品: '現金',
        摘要: '円出金テスト',
        取引区分: '出金（振込）',
        受渡金額_決済損益: 30000,
        決済通貨: 'JPY',
        約定日: '2026/07/10',
        受渡日: '2026/07/10'
      }),
      makeTradeRecord_({
        商品: '投信',
        銘柄名: 'USD_FUND_CASH',
        取引区分: '現物買付',
        数量: 10000,
        単価: 20,
        受渡金額_決済損益: 20,
        レート: 150,
        発行通貨: 'USD',
        決済通貨: 'USD',
        約定日: '2026/07/15',
        受渡日: '2026/07/15'
      }),
      makeTradeRecord_({
        商品: '投信',
        銘柄名: 'JPY_FUND_CASH',
        取引区分: '現物買付',
        数量: 10000,
        単価: 7000,
        受渡金額_決済損益: 7000,
        決済通貨: 'JPY',
        約定日: '2026/07/18',
        受渡日: '2026/07/18'
      }),
      makeTradeRecord_({
        商品: '外株',
        銘柄コード: 'AAPL',
        銘柄名: 'APPLE INC',
        預り区分: '特定',
        取引区分: '入金（配当金）',
        受渡金額_決済損益: 30,
        発行通貨: 'USD',
        決済通貨: 'USD',
        約定日: '2026/07/20',
        受渡日: '2026/07/20'
      }),
      makeTradeRecord_({
        商品: '外株',
        銘柄コード: 'MSFT',
        銘柄名: 'MICROSOFT CORP',
        取引区分: '現物売却',
        受渡金額_決済損益: 2000,
        決済通貨: 'JPY',
        約定日: '2026/07/25',
        受渡日: '2026/07/25'
      })
    ];

    const result = buildRakutenOutputSheetsFromBaseRecords_(ss, records);
    const jpySheet = ss.getSheetByName(CONFIG.OUTPUT_CASH_JPY);
    const usdSheet = ss.getSheetByName(CONFIG.OUTPUT_CASH_USD);

    assertEquals_(5, result.counts.cashJpy, '楽天金銭残高（円）件数');
    assertEquals_(3, result.counts.cashUsd, '楽天金銭残高（ドル）件数');
    assertTrue_(!!jpySheet, '金銭残高（円）シートを作成');
    assertTrue_(!!usdSheet, '金銭残高（ドル）シートを作成');

    const jpyHeaderRow = jpySheet.getRange(1, 1, 1, RAKUTEN_CASH_JPY_HEADERS.length).getValues()[0];
    const usdHeaderRow = usdSheet.getRange(1, 1, 1, RAKUTEN_CASH_USD_HEADERS.length).getValues()[0];
    assertArrayEquals_(RAKUTEN_CASH_JPY_HEADERS, jpyHeaderRow, '楽天金銭残高（円）の列順はDrive最終見た目に近づける');
    assertArrayEquals_(RAKUTEN_CASH_USD_HEADERS, usdHeaderRow, '楽天金銭残高（ドル）の列順はDrive最終見た目に近づける');

    assertEquals_(100000, getSheetValueByHeader_(jpySheet, RAKUTEN_CASH_JPY_HEADERS, 2, '入金額［円］'), '円入金額');
    assertEquals_('円入金テスト', getSheetValueByHeader_(jpySheet, RAKUTEN_CASH_JPY_HEADERS, 2, '内容'), '円入金内容');
    assertEquals_(100000, getSheetValueByHeader_(jpySheet, RAKUTEN_CASH_JPY_HEADERS, 2, '残高'), '円入金後残高');
    assertEquals_(5000, getSheetValueByHeader_(jpySheet, RAKUTEN_CASH_JPY_HEADERS, 3, '日本株受渡金額［円］'), '日本株円受渡');
    assertEquals_(95000, getSheetValueByHeader_(jpySheet, RAKUTEN_CASH_JPY_HEADERS, 3, '残高'), '日本株買付後残高');
    assertEquals_(30000, getSheetValueByHeader_(jpySheet, RAKUTEN_CASH_JPY_HEADERS, 4, '出金額［円］'), '円出金額');
    assertEquals_(65000, getSheetValueByHeader_(jpySheet, RAKUTEN_CASH_JPY_HEADERS, 4, '残高'), '円出金後残高');
    assertEquals_(7000, getSheetValueByHeader_(jpySheet, RAKUTEN_CASH_JPY_HEADERS, 5, '投信受渡金額［円］'), '投信円受渡');
    assertEquals_(2000, getSheetValueByHeader_(jpySheet, RAKUTEN_CASH_JPY_HEADERS, 6, '米国株受渡金額［円］'), '米国株円受渡');
    assertEquals_(60000, getSheetValueByHeader_(jpySheet, RAKUTEN_CASH_JPY_HEADERS, 6, '残高'), '円最終残高');
    assertEquals_(60000, getSheetValueByHeader_(jpySheet, RAKUTEN_CASH_JPY_HEADERS, 6, '月次残高'), '円月次残高');
    assertEquals_('', getSheetValueByHeader_(jpySheet, RAKUTEN_CASH_JPY_HEADERS, 4, '出金先'), '出金先は現状モデルにないため空欄');

    assertEquals_(100, getSheetValueByHeader_(usdSheet, RAKUTEN_CASH_USD_HEADERS, 2, '米国株受渡金額［USドル］'), '米国株USD受渡');
    assertEquals_(100, getSheetValueByHeader_(usdSheet, RAKUTEN_CASH_USD_HEADERS, 2, '受渡金額［USドル］'), 'USD受渡金額');
    assertEquals_(-100, getSheetValueByHeader_(usdSheet, RAKUTEN_CASH_USD_HEADERS, 2, '残高'), 'USD買付後残高');
    assertEquals_(20, getSheetValueByHeader_(usdSheet, RAKUTEN_CASH_USD_HEADERS, 3, '投信受渡金額［USドル］'), '投信USD受渡');
    assertEquals_(-120, getSheetValueByHeader_(usdSheet, RAKUTEN_CASH_USD_HEADERS, 3, '残高'), '投信USD買付後残高');
    assertEquals_('USD', getSheetValueByHeader_(usdSheet, RAKUTEN_CASH_USD_HEADERS, 4, '受取通貨'), '受取通貨');
    assertEquals_(30, getSheetValueByHeader_(usdSheet, RAKUTEN_CASH_USD_HEADERS, 4, '配当金・分配金受取金額［USドル］'), '配当金USD受取');
    assertEquals_(-90, getSheetValueByHeader_(usdSheet, RAKUTEN_CASH_USD_HEADERS, 4, '残高'), 'USD最終残高');
    assertEquals_(-90, getSheetValueByHeader_(usdSheet, RAKUTEN_CASH_USD_HEADERS, 4, '月次残高'), 'USD月次残高');
  });
}

function test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsDividendSourceColumns_20260709_() {
  withTempSpreadsheet_(function(ss) {
    const now = new Date('2026-07-09T00:00:00Z');
    const rows = [
      ['入金日', '商品', '口座', '銘柄コード', '銘柄', '受取通貨', '単価[円/現地通貨]', '数量[株/口]', '配当・分配金合計（税引前）[円/現地通貨]', '税額合計[円/現地通貨]', '受取金額[円/現地通貨]', 'レート', '現地源泉税［円］', '国内源泉税［円］'],
      ['2026/04/03', '米国株式', '特定・一般', 'AVGO', 'BROADCOM INC', 'USドル', 0.65, 18, 11.7, 2.78, 8.92, 150, 123, 45]
    ];
    const dbRecords = normalizeRakutenDividendRowsToRecords_(rows, 0).map(function(record, index) {
      return normalizeRakutenRecordForDb_(record, {
        importId: 'import_rakuten_dividend_source',
        sourceName: 'rakuten_dividend.csv',
        sourceRowNo: index + 2,
        sourceType: 'rakuten_dividend',
        now: now,
      });
    });

    const result = buildOutputSheetsFromRecordsForTarget_(ss, 'rakuten_corp_a', dbRecords);
    const usSheet = ss.getSheetByName(CONFIG.RAKUTEN_OUTPUT_US_STOCK);
    const usdCashSheet = ss.getSheetByName(CONFIG.OUTPUT_CASH_USD);

    assertEquals_(1, result.counts.usStocks, '配当金由来の外株件数');
    assertEquals_(1, result.counts.cashUsd, '配当金由来のUSD残高件数');
    assertEquals_(11.7, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, 2, '約定代金［USドル］'), '米国株出力に税引前合計を反映');
    assertEquals_(2.78, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, 2, '税金［USドル］'), '米国株出力に税額合計を反映');
    assertEquals_(8.92, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, 2, '受渡金額［USドル］'), '米国株出力に受取金額を反映');
    assertEquals_(150, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, 2, '為替レート'), '米国株出力に手入力レートを反映');
    assertEquals_(123, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, 2, '現地源泉税（円）'), '米国株出力に現地源泉税を反映');
    assertEquals_(45, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, 2, '国内源泉所得税（円）'), '米国株出力に国内源泉税を反映');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, 2, '手数料の消費税額（円）'), '配当金税額は手数料消費税へ流さない');

    assertEquals_(8.92, getSheetValueByHeader_(usdCashSheet, RAKUTEN_CASH_USD_HEADERS, 2, '配当金・分配金受取金額［USドル］'), 'USD残高に受取金額を反映');
    assertEquals_(11.7, getSheetValueByHeader_(usdCashSheet, RAKUTEN_CASH_USD_HEADERS, 2, '配当金・分配金合計［USドル］'), 'USD残高に税引前合計を反映');
    assertEquals_(2.78, getSheetValueByHeader_(usdCashSheet, RAKUTEN_CASH_USD_HEADERS, 2, '税金［USドル］'), 'USD残高に税額合計を反映');
    assertEquals_(150, getSheetValueByHeader_(usdCashSheet, RAKUTEN_CASH_USD_HEADERS, 2, '為替レート'), 'USD残高にレートを反映');
    assertEquals_(123, getSheetValueByHeader_(usdCashSheet, RAKUTEN_CASH_USD_HEADERS, 2, '現地源泉税（円）'), 'USD残高に現地源泉税を反映');
    assertEquals_(45, getSheetValueByHeader_(usdCashSheet, RAKUTEN_CASH_USD_HEADERS, 2, '国内源泉所得税（円）'), 'USD残高に国内源泉税を反映');
    assertEquals_(8.92, getSheetValueByHeader_(usdCashSheet, RAKUTEN_CASH_USD_HEADERS, 2, '残高'), 'USD残高計算は受取金額ベース');
  });
}

function test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsFundDistributionSourceColumns_20260710_() {
  withTempSpreadsheet_(function(ss) {
    const now = new Date('2026-07-10T00:00:00Z');
    const rows = [
      ['入金日', '商品', '口座', '銘柄コード', '銘柄', '受取通貨', '単価[円/現地通貨]', '数量[株/口]', '配当・分配金合計（税引前）[円/現地通貨]', '税額合計[円/現地通貨]', '受取金額[円/現地通貨]', '為替レート', '現地源泉税（円）', '国内源泉所得税（円）', '備考'],
      ['2026/05/10', '投資信託', '一般', '', '楽天分配金テスト投信', 'USドル', 0.05, 10000, 6, 1, 5, 100, 50, 10, '投信分配金']
    ];
    const dbRecords = normalizeRakutenDividendRowsToRecords_(rows, 0).map(function(record, index) {
      return normalizeRakutenRecordForDb_(record, {
        importId: 'import_rakuten_fund_distribution',
        sourceName: 'rakuten_dividend.csv',
        sourceRowNo: index + 2,
        sourceType: 'rakuten_dividend',
        now: now,
      });
    });

    const result = buildOutputSheetsFromRecordsForTarget_(ss, 'rakuten_corp_a', dbRecords);
    const fundSheet = ss.getSheetByName(CONFIG.RAKUTEN_OUTPUT_FUND);
    const usdCashSheet = ss.getSheetByName(CONFIG.OUTPUT_CASH_USD);

    assertEquals_(1, result.counts.funds, '分配金由来の投信件数');
    assertEquals_(1, result.counts.cashUsd, '分配金由来のUSD残高件数');
    assertEquals_('分配金', getSheetValueByHeader_(fundSheet, RAKUTEN_FUND_HEADERS, 2, '分配金'), '投信分配金CSV由来の分配金種別');
    assertEquals_(6, getSheetValueByHeader_(fundSheet, RAKUTEN_FUND_HEADERS, 2, '受付金額'), '投信分配金CSVの税引前合計を受付金額に反映');
    assertEquals_(5, getSheetValueByHeader_(fundSheet, RAKUTEN_FUND_HEADERS, 2, '受渡金額'), '投信分配金CSVの受取金額を反映');
    assertEquals_(5, getSheetValueByHeader_(usdCashSheet, RAKUTEN_CASH_USD_HEADERS, 2, '配当金・分配金受取金額［USドル］'), 'USD残高に投信分配金受取を反映');
  });
}

function test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsUsStockTaxSourceColumn_20260709_() {
  withTempSpreadsheet_(function(ss) {
    const now = new Date('2026-07-09T00:00:00Z');
    const rows = [
      ['約定日', '受渡日', 'ティッカー', '銘柄名', '口座', '売買区分', '決済通貨', '数量［株］', '単価［USドル］', '約定代金［USドル］', '為替レート', '手数料［USドル］', '税金［USドル］', '受渡金額［USドル］', '受渡金額［円］'],
      ['2026/06/01', '2026/06/03', 'AAPL', 'Apple Inc.', '特定', '買付', 'USドル', 1, 200, 200, 150, 1.5, 0.2, 201.697333333333, 30255],
      ['2026/06/02', '2026/06/04', 'AAPL', 'Apple Inc.', '特定', '買付', 'USドル', 1, 100, 100, 150, 1.5, '', 101.5, 15225],
      ['2026/06/03', '2026/06/05', 'AAPL', 'Apple Inc.', '特定', '売付', 'USドル', 2, 100, 200, 150, 1.5, 0, 198.5, 29775],
      ['2026/06/02', '2026/06/04', 'MSFT', 'Microsoft Corp.', '特定', '買付', 'USドル', 1, 100, 100, 150, 1.5, 0, 101.5, 15225],
      ['2026/06/02', '2026/06/04', 'AMZN', 'Amazon.com Inc.', '特定', '買付', 'USドル', 1, 100, 100, 150, 1.5, 0, 101.5, ''],
      ['2026/06/03', '2026/06/05', 'TSLA', 'Tesla Inc.', '特定', '買付', 'USドル', 1, 100, 100, 150, 1.5, '', 101.5, 15225],
      ['2026/06/04', '2026/06/06', 'TSLA', 'Tesla Inc.', '特定', '買付', 'USドル', 1, 120, 120, 150, 1.5, 0, 121.5, 18225],
      ['2026/06/05', '2026/06/07', 'TSLA', 'Tesla Inc.', '特定', '売付', 'USドル', 2, 110, 220, 150, 1.5, 0, 218.5, 32775],
      ['2026/06/06', '2026/06/08', 'NFLX', 'Netflix Inc.', '特定', '買付', 'USドル', 1, 100, 100, '', 1.5, 0, 101.5, ''],
      ['2026/06/07', '2026/06/09', 'NFLX', 'Netflix Inc.', '特定', '売付', 'USドル', 1, 110, 110, '', 1.5, 0, 108.5, ''],
      ['2026/06/08', '2026/06/10', 'NFLX', 'Netflix Inc.', '特定', '買付', 'USドル', 1, 100, 100, 150, 1.5, 0, 101.5, 15225]
    ];
    const dbRecords = normalizeRakutenUsStockRowsToRecords_(rows, 0).map(function(record, index) {
      return normalizeRakutenRecordForDb_(record, {
        importId: 'import_rakuten_us_tax',
        sourceName: 'rakuten_us_stock.csv',
        sourceRowNo: index + 2,
        sourceType: 'rakuten_us_stock',
        now: now,
      });
    });

    const result = buildOutputSheetsFromRecordsForTarget_(ss, 'rakuten_corp_a', dbRecords);
    const usSheet = ss.getSheetByName(CONFIG.RAKUTEN_OUTPUT_US_STOCK);
    assertTrue_(result.alerts.some(function(alert) {
      return alert.indexOf('手数料の消費税額が取得できません') >= 0;
    }), '税額取得不能時はalertを出す');
    assertTrue_(result.alerts.some(function(alert) {
      return alert.indexOf('円換算レートが取得できません') >= 0;
    }), 'USDレート欠落時はalertを出す');

    assertEquals_(200, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, 2, '約定代金［USドル］'), '米国株CSVの約定代金を反映');
    assertEquals_(0.2, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, 2, '税金［USドル］'), '米国株CSVの税金を反映');
    assertEquals_(30255, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, 2, '受渡金額［円］'), '元CSVの受渡円額を正本にする');
    assertEquals_(30, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, 2, '手数料の消費税額（円）'), '米国株CSVの税金を円換算');
    assertEquals_(30225, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, 2, '簿価'), '米国株CSVの簿価から円建て税額を控除');

    const aaplUnknownBuyRow = findSheetRowByHeaderValues_(usSheet, RAKUTEN_US_STOCK_HEADERS, { 'ティッカー': 'AAPL', '売買区分': '買付', '受渡日': '2026/06/04' });
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, aaplUnknownBuyRow, '簿価'), '正常買付後の税額取得不能買付は簿価を空欄');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, aaplUnknownBuyRow, '平均取得単価'), '正常買付後の税額取得不能買付は平均取得単価を空欄');

    const aaplUnknownSellRow = findSheetRowByHeaderValues_(usSheet, RAKUTEN_US_STOCK_HEADERS, { 'ティッカー': 'AAPL', '売買区分': '売付', '受渡日': '2026/06/05' });
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, aaplUnknownSellRow, '取得価格'), '取得原価unknown中の売却は取得価格を空欄');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, aaplUnknownSellRow, '売却損益'), '取得原価unknown中の売却は売却損益を空欄');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, aaplUnknownSellRow, '簿価'), '取得原価unknown中の売却は簿価を空欄');

    const zeroTaxRow = findSheetRowByHeaderValues_(usSheet, RAKUTEN_US_STOCK_HEADERS, { 'ティッカー': 'MSFT', '売買区分': '買付' });
    assertEquals_(0, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, zeroTaxRow, '手数料の消費税額（円）'), '税額0は0円として扱う');
    assertEquals_(15225, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, zeroTaxRow, '簿価'), '税額0の簿価');

    const jpyAmountMissingRow = findSheetRowByHeaderValues_(usSheet, RAKUTEN_US_STOCK_HEADERS, { 'ティッカー': 'AMZN', '売買区分': '買付' });
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, jpyAmountMissingRow, '簿価'), '元CSVの受渡円額欠落時はUSD換算せず簿価を空欄');
    assertTrue_(result.alerts.some(function(alert) {
      return alert.indexOf('受渡金額［円］が取得できません') >= 0;
    }), '元CSVの受渡円額欠落時はalertを出す');

    const missingTaxRow = findSheetRowByHeaderValues_(usSheet, RAKUTEN_US_STOCK_HEADERS, { 'ティッカー': 'TSLA', '売買区分': '買付', '受渡日': '2026/06/05' });
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, missingTaxRow, '手数料の消費税額（円）'), '税額取得不能時は出力を空欄');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, missingTaxRow, '簿価'), '税額取得不能時は簿価を推測しない');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, missingTaxRow, '平均取得単価'), '税額取得不能時は平均取得単価も未計算');

    const followingNormalBuyRow = findSheetRowByHeaderValues_(usSheet, RAKUTEN_US_STOCK_HEADERS, { 'ティッカー': 'TSLA', '売買区分': '買付', '受渡日': '2026/06/06' });
    assertEquals_(0, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, followingNormalBuyRow, '手数料の消費税額（円）'), 'unknown後の正常買付の税額');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, followingNormalBuyRow, '簿価'), 'unknown中は後続買付の簿価を推測しない');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, followingNormalBuyRow, '平均取得単価'), 'unknown中は後続買付の平均取得単価を推測しない');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, followingNormalBuyRow, '銘柄ごとの残高'), 'unknown中は後続買付の残高を推測しない');

    const unknownSellRow = findSheetRowByHeaderValues_(usSheet, RAKUTEN_US_STOCK_HEADERS, { 'ティッカー': 'TSLA', '売買区分': '売付', '受渡日': '2026/06/07' });
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, unknownSellRow, '取得価格'), 'unknown中の売却で取得価格を推測しない');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, unknownSellRow, '売却損益'), 'unknown中の売却で売却損益を推測しない');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, unknownSellRow, '簿価'), 'unknown中の売却で簿価を推測しない');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, unknownSellRow, '銘柄ごとの残高'), 'unknown中の売却で残高を推測しない');

    const rateMissingRow = findSheetRowByHeaderValues_(usSheet, RAKUTEN_US_STOCK_HEADERS, { 'ティッカー': 'NFLX', '売買区分': '買付', '受渡日': '2026/06/08' });
    assertEquals_(0, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, rateMissingRow, '手数料の消費税額（円）'), '税額0はレート欠落でも0円');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, rateMissingRow, '簿価'), 'USDレート欠落時は簿価を空欄');
    assertEquals_('', getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, rateMissingRow, '平均取得単価'), 'USDレート欠落時は平均取得単価を空欄');

    const recoveredBuyRow = findSheetRowByHeaderValues_(usSheet, RAKUTEN_US_STOCK_HEADERS, { 'ティッカー': 'NFLX', '売買区分': '買付', '受渡日': '2026/06/10' });
    assertEquals_(15225, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, recoveredBuyRow, '簿価'), '全保有解消後の正常買付で簿価stateを再開');
    assertEquals_(15225, getSheetValueByHeader_(usSheet, RAKUTEN_US_STOCK_HEADERS, recoveredBuyRow, '平均取得単価'), '全保有解消後の正常買付で平均取得単価stateを再開');
  });
}

function test_buildRakutenOutputSheetsFromRecordsForTarget_reflectsFundSourceColumns_20260709_() {
  withTempSpreadsheet_(function(ss) {
    const now = new Date('2026-07-09T00:00:00Z');
    const rows = [
      ['約定日', '受渡日', 'ファンド名', '分配金', '口座', '取引', '買付方法', '数量［口］', '単価', '経費', '為替レート', '受付金額[現地通貨]', '受渡金額/(ポイント利用)[円]', '決済通貨'],
      ['2025/03/14', '2025/03/19', 'eMAXIS Slim 米国株式(S&P500)', '再投資型', '一般', '買付', '通常', 10000, 12000, 0, 1, 12000, 12000, '円']
    ];
    const dbRecords = normalizeRakutenFundRowsToRecords_(rows, 0).map(function(record, index) {
      return normalizeRakutenRecordForDb_(record, {
        importId: 'import_rakuten_fund_source',
        sourceName: 'rakuten_fund.csv',
        sourceRowNo: index + 2,
        sourceType: 'rakuten_fund',
        now: now,
      });
    });

    buildOutputSheetsFromRecordsForTarget_(ss, 'rakuten_corp_a', dbRecords);
    const fundSheet = ss.getSheetByName(CONFIG.RAKUTEN_OUTPUT_FUND);

    assertEquals_('再投資型', getSheetValueByHeader_(fundSheet, RAKUTEN_FUND_HEADERS, 2, '分配金'), '投信CSVの分配金列を反映');
    assertEquals_(12000, getSheetValueByHeader_(fundSheet, RAKUTEN_FUND_HEADERS, 2, '受付金額'), '投信CSVの受付金額を反映');
  });
}

function test_groupRakutenOutputRecords_splitsWithoutSpreadsheet_20260618_() {
  const records = [
    makeTradeRecord_({
      商品: '株式',
      銘柄名: 'RAKUTEN_JP_OUTPUT',
      取引区分: '現物買付',
      数量: 1,
      単価: 100,
      受渡金額_決済損益: 100,
      決済通貨: 'JPY',
      約定日: '2026/06/18',
      受渡日: '2026/06/18'
    }),
    makeTradeRecord_({
      商品: '外株',
      銘柄名: 'RAKUTEN_US_OUTPUT',
      取引区分: '現物買付',
      数量: 1,
      単価: 10,
      受渡金額_決済損益: 10,
      レート: 150,
      決済通貨: 'USD',
      約定日: '2026/06/18',
      受渡日: '2026/06/18'
    })
  ];

  const groups = groupRakutenOutputRecords_(records);

  assertEquals_(2, groups.all.length, '楽天出力分類の全件数');
  assertEquals_(1, groups.japanStocks.length, '楽天出力分類の日本株件数');
  assertEquals_(1, groups.usStocks.length, '楽天出力分類の米国株件数');
  assertEquals_('RAKUTEN_JP_OUTPUT', groups.japanStocks[0]['銘柄名'], '楽天出力分類の日本株');
  assertEquals_('RAKUTEN_US_OUTPUT', groups.usStocks[0]['銘柄名'], '楽天出力分類の米国株');
}

function getSheetValueByHeader_(sheet, headers, row, headerName) {
  return sheet.getRange(row, getColumnIndexByHeader_(headers, headerName)).getValue();
}
