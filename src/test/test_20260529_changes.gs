/**
 * 2026/05/29 変更点テスト
 */

function test_buildTradeRows_bookValue_foreignBuy_minusFeeTaxOnly_20260529_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({
      銘柄名: 'FOREIGN_BUY_20260529',
      商品: '外株',
      取引区分: '現物買付',
      数量: 1,
      単価: 10,
      受渡金額_決済損益: 100,
      手数料税込: 110,
      国内消費税等円: 7,
      レート: 150,
      約定日: '2026/05/29',
      受渡日: '2026/05/29',
      決済通貨: 'USD'
    })
  ], alerts);

  const row = rows[0];
  assertApproxEquals_(100 * 150 - 7, getTradeRowValue_(row, '簿価'), 1e-9, '5/29仕様: 外貨買付の簿価は 消費税額にレートを掛けない');
  assertEquals_(0, alerts.length, '不要なアラートは出ないこと');
}

function test_applyStagingManualHighlights_fundBuyAndReinvest_20260529_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [
      [
        '約定日','受渡日','商品','銘柄コード','銘柄名','摘要','取引区分','預り区分','発行通貨','数量','単価',
        '受渡金額/決済損益','手数料（税込）','レート','決済通貨','売買損益（円）',
        '国内消費税等（円）','現地源泉税（円）','国内源泉所得税（円）','国内源泉地方税（円）',
        '国内手数料（円）','現地手数料（円）','元本払戻金'
      ],
      ['2026/05/29','2026/05/29','投信','','FUND_A','','現物買付','','',0,0,0,0,'','JPY',0,'','','','','','',''],
      ['2026/05/30','2026/05/30','投信','','FUND_A','','現物買取','','',0,0,0,0,'','JPY',0,'','','','','','',''],
      ['2026/05/31','2026/05/31','投信','','FUND_A','','現物再投','','',0,0,0,0,'','JPY',0,'','','','','','','']
    ];

    const sheet = ss.getSheets()[0];
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

    applyStagingManualHighlights_(sheet);

    const domesticIncomeTaxCol = rows[0].indexOf('国内源泉所得税（円）') + 1;
    const domesticLocalTaxCol = rows[0].indexOf('国内源泉地方税（円）') + 1;
    const domesticTaxCol = rows[0].indexOf('国内消費税等（円）') + 1;
    const domesticFeeCol = rows[0].indexOf('国内手数料（円）') + 1;
    const principalReturnCol = rows[0].indexOf('元本払戻金') + 1;

    assertEquals_('#fff2cc', sheet.getRange(2, domesticIncomeTaxCol).getBackground(), '5/29仕様: 投信の現物買付では国内源泉所得税（円）が黄色');
    assertEquals_('#fff2cc', sheet.getRange(2, domesticLocalTaxCol).getBackground(), '5/29仕様: 投信の現物買付では国内源泉地方税（円）が黄色');
    assertEquals_('#fff2cc', sheet.getRange(2, domesticTaxCol).getBackground(), '5/29仕様: 投信の現物買付では国内消費税等（円）が黄色');
    assertEquals_('#fff2cc', sheet.getRange(2, domesticFeeCol).getBackground(), '5/29仕様: 投信の現物買付では国内手数料（円）が黄色');

    assertEquals_('#ffffff', sheet.getRange(3, domesticTaxCol).getBackground(), '5/29仕様: 投信の現物買取では国内消費税等（円）を黄色にしない');
    assertEquals_('#ffffff', sheet.getRange(3, domesticFeeCol).getBackground(), '5/29仕様: 投信の現物買取では国内手数料（円）を黄色にしない');

    assertEquals_('#fff2cc', sheet.getRange(4, principalReturnCol).getBackground(), '5/29仕様: 投信の現物再投では元本払戻金が黄色');
  });
}
