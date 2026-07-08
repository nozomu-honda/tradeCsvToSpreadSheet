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
