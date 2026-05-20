/**
 * 5シート出力の振り分けテスト
 */

function test_buildOutputSheetsFromDbRecords_splitsIntoFiveSheets_() {
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
    assertEquals_(2, result.counts.usStocks, '米国株件数（外債を含む）');
    assertEquals_(1, result.counts.funds, '投信件数');
    assertEquals_(2, result.counts.cashJpy, '円残高件数');
    assertEquals_(2, result.counts.cashUsd, 'ドル残高件数');

    assertTrue_(!!ss.getSheetByName(CONFIG.OUTPUT_JAPAN_STOCK), '日本株シートを作成');
    assertTrue_(!!ss.getSheetByName(CONFIG.OUTPUT_US_STOCK), '米国株シートを作成');
    assertTrue_(!!ss.getSheetByName(CONFIG.OUTPUT_FUND), '投信シートを作成');
    assertTrue_(!!ss.getSheetByName(CONFIG.OUTPUT_CASH_JPY), '金銭残高（円）シートを作成');
    assertTrue_(!!ss.getSheetByName(CONFIG.OUTPUT_CASH_USD), '金銭残高（ドル）シートを作成');

    const japanSheet = ss.getSheetByName(CONFIG.OUTPUT_JAPAN_STOCK);
    const usSheet = ss.getSheetByName(CONFIG.OUTPUT_US_STOCK);
    const fundSheet = ss.getSheetByName(CONFIG.OUTPUT_FUND);

    assertEquals_('JP_STOCK', japanSheet.getRange(2, getColumnIndexByHeader_(TRADE_HEADERS, '銘柄名')).getValue(), '日本株の中身');
    assertEquals_('US_STOCK', usSheet.getRange(2, getColumnIndexByHeader_(TRADE_HEADERS, '銘柄名')).getValue(), '米国株1行目の中身');
    assertEquals_('FUND_A', fundSheet.getRange(2, getColumnIndexByHeader_(TRADE_HEADERS, '銘柄名')).getValue(), '投信の中身');
  });
}
