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
