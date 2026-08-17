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
