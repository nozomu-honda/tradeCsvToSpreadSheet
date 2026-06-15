/**
 * 2026/05/26 変更点テスト
 */

function test_buildTradeRows_avgUnitPrice_updatesOnStockConversionBuy_20260526_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({
      銘柄名: 'SCB_20260526',
      商品: '株式',
      取引区分: '現物買付',
      数量: 2,
      受渡金額_決済損益: 200,
      手数料税込: 0,
      約定日: '2026/05/01',
      受渡日: '2026/05/01',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: 'SCB_20260526',
      商品: '株式',
      取引区分: '株転換取得（買）',
      数量: 1,
      受渡金額_決済損益: 150,
      手数料税込: 0,
      約定日: '2026/05/02',
      受渡日: '2026/05/02',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: 'SCB_20260526',
      商品: '株式',
      取引区分: '現物売却',
      数量: 1,
      単価: 130,
      受渡金額_決済損益: 130,
      手数料税込: 0,
      約定日: '2026/05/03',
      受渡日: '2026/05/03',
      決済通貨: 'JPY'
    })
  ], alerts);

  const conversionRow = rows[1];
  const sellRow = rows[2];
  const expectedAvg = 350 / 3;

  assertEquals_(3, getTradeRowValue_(conversionRow, '保有数'), '株転換取得（買）で保有数が増える');
  assertEquals_(150, getTradeRowValue_(conversionRow, '簿価'), '株転換取得（買）の簿価');
  assertEquals_(200, getTradeRowValue_(conversionRow, '銘柄ごとの残高'), '株転換取得（買）は銘柄ごとの残高を動かさない');
  assertApproxEquals_(expectedAvg, getTradeRowValue_(conversionRow, '平均取得単価'), 1e-9, '株転換取得（買）は平均取得単価更新対象');

  assertApproxEquals_(expectedAvg, getTradeRowValue_(sellRow, '取得価格'), 1e-9, '売却時の取得価格は更新後平均取得単価ベース');
  assertApproxEquals_(-expectedAvg, getTradeRowValue_(sellRow, '簿価'), 1e-9, '売却簿価は更新後平均取得単価ベース');
  assertEquals_(0, alerts.length, '不要なアラートは出ないこと');
}

function test_buildTradeRows_avgUnitPrice_updatesOnFundOffering_20260526_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({
      銘柄名: 'FUND_OFFERING_20260526',
      商品: '投信',
      取引区分: '現物買付',
      数量: 10000,
      受渡金額_決済損益: 10000,
      手数料税込: 0,
      約定日: '2026/05/01',
      受渡日: '2026/05/01',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: 'FUND_OFFERING_20260526',
      商品: '投信',
      取引区分: '現物募集',
      数量: 5000,
      受渡金額_決済損益: 6000,
      手数料税込: 0,
      約定日: '2026/05/02',
      受渡日: '2026/05/02',
      決済通貨: 'JPY'
    })
  ], alerts);

  const row = rows[1];
  const expectedAvg = ((10000 + 6000) / 15000) * 10000;

  assertEquals_(15000, getTradeRowValue_(row, '保有数'), '投信の現物募集で保有数が増える');
  assertApproxEquals_(expectedAvg, getTradeRowValue_(row, '平均取得単価'), 1e-9, '投信の現物募集は平均取得単価更新対象');
  assertApproxEquals_(16000, getTradeRowValue_(row, '銘柄ごとの残高'), 1e-9, '投信の現物募集は銘柄ごとの残高に反映');
  assertEquals_(0, alerts.length, '不要なアラートは出ないこと');
}

function test_applyStagingManualHighlights_fundCashInAndReinvest_20260526_() {
  withTempSpreadsheet_(function(ss) {
    const rows = [
      [
        '約定日','受渡日','商品','銘柄コード','銘柄名','摘要','取引区分','預り区分','発行通貨','数量','単価',
        '受渡金額/決済損益','手数料（税込）','レート','決済通貨','売買損益（円）',
        '国内消費税等（円）','現地源泉税（円）','国内源泉所得税（円）','国内源泉地方税（円）',
        '国内手数料（円）','現地手数料（円）','元本払戻金'
      ],
      ['2026/05/01','2026/05/01','投信','','FUND_A','','現物買取','','',0,0,0,0,'','JPY',0,'','','','','','',''],
      ['2026/05/02','2026/05/02','投信','','FUND_A','','現物再投','','',0,0,0,0,'','JPY',0,'','','','','','','']
    ];

    const sheet = ss.getSheets()[0];
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

    applyStagingManualHighlights_(sheet);

    const domesticTaxCol = rows[0].indexOf('国内消費税等（円）') + 1;
    const domesticFeeCol = rows[0].indexOf('国内手数料（円）') + 1;
    const principalReturnCol = rows[0].indexOf('元本払戻金') + 1;

    assertEquals_('#fff2cc', sheet.getRange(2, domesticTaxCol).getBackground(), '投信の現物買取では国内消費税等（円）が黄色');
    assertEquals_('#fff2cc', sheet.getRange(2, domesticFeeCol).getBackground(), '投信の現物買取では国内手数料（円）が黄色');
    assertEquals_('#fff2cc', sheet.getRange(3, principalReturnCol).getBackground(), '投信の現物再投では元本払戻金が黄色');
  });
}
