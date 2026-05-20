/**
 * writer.gs 系テスト
 */

function test_writeSheet_japanStockHiddenColumns_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [buildTradeRowForWriterTest_({銘柄名: 'AAA', 保有数: 0, helper: ''})];
    writeSheet_(ss, CONFIG.OUTPUT_JAPAN_STOCK, TRADE_HEADERS, rows, true);
    const sheet = ss.getSheetByName(CONFIG.OUTPUT_JAPAN_STOCK);
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '摘要')), '日本株: 摘要は非表示');
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '発行通貨')), '日本株: 発行通貨は非表示');
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, 'レート')), '日本株: レートは非表示');
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '決済通貨')), '日本株: 決済通貨は非表示');
    assertTrue_(sheet.isColumnHiddenByUser(TRADE_HEADERS.length + 1), '日本株: helper列は非表示');
  });
}

function test_writeSheet_usStockHiddenColumns_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [buildTradeRowForWriterTest_({銘柄名: 'BBB', 保有数: 0, helper: ''})];
    writeSheet_(ss, CONFIG.OUTPUT_US_STOCK, TRADE_HEADERS, rows, true);
    const sheet = ss.getSheetByName(CONFIG.OUTPUT_US_STOCK);
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '摘要')), '米国株: 摘要は非表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '発行通貨')), '米国株: 発行通貨は表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, 'レート')), '米国株: レートは表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '決済通貨')), '米国株: 決済通貨は表示');
  });
}

function test_writeSheet_foreignBondHiddenColumns_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [buildTradeRowForWriterTest_({銘柄名: 'BOND', 商品: '外債', 保有数: 0, helper: ''})];
    writeSheet_(ss, CONFIG.OUTPUT_FOREIGN_BOND, TRADE_HEADERS, rows, true);
    const sheet = ss.getSheetByName(CONFIG.OUTPUT_FOREIGN_BOND);
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '摘要')), '外債: 摘要は非表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '発行通貨')), '外債: 発行通貨は表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, 'レート')), '外債: レートは表示');
    assertFalse_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '決済通貨')), '外債: 決済通貨は表示');
  });
}

function test_writeSheet_fundHiddenColumns_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [buildTradeRowForWriterTest_({銘柄名: 'CCC', 商品: '投信', 保有数: 0, helper: ''})];
    writeSheet_(ss, CONFIG.OUTPUT_FUND, TRADE_HEADERS, rows, true);
    const sheet = ss.getSheetByName(CONFIG.OUTPUT_FUND);
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '摘要')), '投信: 摘要は非表示');
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '発行通貨')), '投信: 発行通貨は非表示');
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, 'レート')), '投信: レートは非表示');
    assertTrue_(sheet.isColumnHiddenByUser(getColumnIndexByHeader_(TRADE_HEADERS, '決済通貨')), '投信: 決済通貨は非表示');
  });
}

function test_writeSheet_tradeConditionalFormatRules_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [
      buildTradeRowForWriterTest_({銘柄名: 'AAA', 保有数: 0, helper: ''}),
      buildTradeRowForWriterTest_({銘柄名: 'AAA', 保有数: 2, helper: 'YES'})
    ];
    writeSheet_(ss, CONFIG.OUTPUT_JAPAN_STOCK, TRADE_HEADERS, rows, true);
    const rules = ss.getSheetByName(CONFIG.OUTPUT_JAPAN_STOCK).getConditionalFormatRules();
    assertEquals_(2, rules.length, '取引シートの条件付き書式は2件');
  });
}

function test_writeSheet_averageUnitPriceNumberFormat_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [buildTradeRowForWriterTest_({銘柄名: 'AAA', '平均取得単価': 333.3333333333, 保有数: 3, helper: ''})];
    writeSheet_(ss, CONFIG.OUTPUT_JAPAN_STOCK, TRADE_HEADERS, rows, true);
    const sheet = ss.getSheetByName(CONFIG.OUTPUT_JAPAN_STOCK);
    const avgCol = getColumnIndexByHeader_(TRADE_HEADERS, '平均取得単価');
    assertEquals_('#,##0;[Red]-#,##0;0', sheet.getRange(2, avgCol).getNumberFormat(), '平均取得単価は整数表示書式');
  });
}
