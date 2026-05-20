/**
 * 入金（分配金）は簿価・銘柄ごとの残高を増やさないテスト
 */

function test_buildTradeRows_distributionDoesNotChangeBalance_20260515_() {
  const alerts = [];
  const rows = buildTradeRows_([
    makeTradeRecord_({
      銘柄名: 'DISTRIBUTION_NORMAL',
      商品: '投信',
      取引区分: '現物買付',
      数量: 10000,
      単価: 1,
      受渡金額_決済損益: 10000,
      手数料税込: 0,
      約定日: '2026/05/01',
      受渡日: '2026/05/01',
      決済通貨: 'JPY'
    }),
    makeTradeRecord_({
      銘柄名: 'DISTRIBUTION_NORMAL',
      商品: '投信',
      取引区分: '入金（分配金）',
      数量: 0,
      単価: 0,
      受渡金額_決済損益: 500,
      手数料税込: 0,
      元本払戻金: '',
      約定日: '2026/05/02',
      受渡日: '2026/05/02',
      決済通貨: 'JPY'
    })
  ], alerts);

  const row = rows[1];
  assertEquals_('', getTradeRowValue_(row, '簿価'), '通常の入金（分配金）でも簿価は空欄');
  assertApproxEquals_(10000, getTradeRowValue_(row, '銘柄ごとの残高'), 1e-9, '通常の入金（分配金）でも残高は増やさない');
  assertEquals_(0, alerts.length, '不要なアラートは出ないこと');
}
