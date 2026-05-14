/**
 * writer.gs 系テスト
 */

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

