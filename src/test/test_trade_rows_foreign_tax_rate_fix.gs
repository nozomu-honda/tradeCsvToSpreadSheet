/**
 * 外貨買付の簿価は、手数料の消費税額にもレートを掛けるテスト
 */

function test_buildTradeRows_bookValue_foreignBuy_multipliesFeeTaxByRate_20260515_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({
      銘柄名: 'FOREIGN_BUY_RATE_TAX',
      商品: '外株',
      取引区分: '現物買付',
      数量: 1,
      単価: 10,
      受渡金額_決済損益: 100,
      手数料税込: 110,
      国内消費税等円: 7,
      レート: 150,
      約定日: '2026/05/01',
      受渡日: '2026/05/01',
      決済通貨: 'USD'
    })
  ], alerts);

  const row = rows[0];
  assertApproxEquals_(100 * 150 - 7 * 150, getTradeRowValue_(row, '簿価'), 1e-9, '外貨買付の簿価は 受渡金額*レート - 手数料の消費税額*レート');
  assertEquals_(0, alerts.length, '不要なアラートは出ないこと');
}
