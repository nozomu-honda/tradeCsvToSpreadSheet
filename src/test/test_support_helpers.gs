/**
 * テスト共通ユーティリティ
 */

function makeTradeRecord_(overrides) {
  overrides = overrides || {};

  return {
    '約定日': parseDate_(overrides.約定日 || '2026/04/01'),
    '受渡日': parseDate_(overrides.受渡日 || overrides.約定日 || '2026/04/01'),
    '商品': overrides.商品 || '株式',
    '銘柄コード': overrides.銘柄コード || '',
    '銘柄名': overrides.銘柄名 || 'TEST',
    '摘要': overrides.摘要 || '',
    '取引区分': overrides.取引区分 || '現物買付',
    '預り区分': overrides.預り区分 || '',
    '発行通貨': overrides.発行通貨 || '',
    '数量': overrides.数量 !== undefined ? overrides.数量 : 0,
    '単価': overrides.単価 !== undefined ? overrides.単価 : 0,
    '受渡金額/決済損益': overrides.受渡金額_決済損益 !== undefined ? overrides.受渡金額_決済損益 : 0,
    '手数料（税込）': overrides.手数料税込 !== undefined ? overrides.手数料税込 : 0,
    'レート': overrides.レート !== undefined ? overrides.レート : 0,
    '決済通貨': overrides.決済通貨 || '',
    '売買損益（円）': overrides.売買損益円 !== undefined ? overrides.売買損益円 : 0,
    '国内消費税等（円）': overrides.国内消費税等円 !== undefined ? overrides.国内消費税等円 : '',
    '現地源泉税（円）': overrides.現地源泉税円 !== undefined ? overrides.現地源泉税円 : '',
    '国内源泉所得税（円）': overrides.国内源泉所得税円 !== undefined ? overrides.国内源泉所得税円 : '',
    '国内源泉地方税（円）': overrides.国内源泉地方税円 !== undefined ? overrides.国内源泉地方税円 : '',
    '元本払戻金': overrides.元本払戻金 === true ? true : '',
    '国内手数料（円）': overrides.国内手数料円 !== undefined ? overrides.国内手数料円 : '',
    '現地手数料（円）': overrides.現地手数料円 !== undefined ? overrides.現地手数料円 : '',
  };
}

function buildTradeRowForWriterTest_(params) {
  const row = new Array(TRADE_HEADERS.length + 1).fill('');
  setTradeRowValue_(row, '約定日', parseDate_(params.約定日 || '2026/04/01'));
  setTradeRowValue_(row, '受渡日', parseDate_(params.受渡日 || '2026/04/01'));
  setTradeRowValue_(row, '商品', params.商品 || '株式');
  setTradeRowValue_(row, '銘柄コード', params.銘柄コード || '0000');
  setTradeRowValue_(row, '銘柄名', params.銘柄名 || 'TEST');
  setTradeRowValue_(row, '摘要', params.摘要 || '');
  setTradeRowValue_(row, '取引区分', params.取引区分 || '現物買付');
  setTradeRowValue_(row, '預り区分', params.預り区分 || '');
  setTradeRowValue_(row, '発行通貨', params.発行通貨 || 'JPY');
  setTradeRowValue_(row, '数量', defaultValue_(params.数量, 0));
  setTradeRowValue_(row, '単価', defaultValue_(params.単価, 100));
  setTradeRowValue_(row, '受渡金額/決済損益', defaultValue_(params.受渡金額_決済損益, 1000));
  setTradeRowValue_(row, '手数料（税込）', defaultValue_(params.手数料税込, 0));
  setTradeRowValue_(row, 'レート', defaultValue_(params.レート, 0));
  setTradeRowValue_(row, '決済通貨', params.決済通貨 || 'JPY');
  setTradeRowValue_(row, '売買損益（円）', defaultValue_(params.売買損益円, 0));
  setTradeRowValue_(row, '国内消費税等（円）', defaultValue_(params.国内消費税等円, ''));
  setTradeRowValue_(row, '現地源泉税（円）', defaultValue_(params.現地源泉税円, ''));
  setTradeRowValue_(row, '国内源泉所得税（円）', defaultValue_(params.国内源泉所得税円, ''));
  setTradeRowValue_(row, '国内源泉地方税（円）', defaultValue_(params.国内源泉地方税円, ''));
  setTradeRowValue_(row, '保有数', defaultValue_(params.保有数, 0));
  setTradeRowValue_(row, '手数料の消費税額', defaultValue_(params['手数料の消費税額'], ''));
  setTradeRowValue_(row, '平均取得単価', defaultValue_(params['平均取得単価'], ''));
  setTradeRowValue_(row, '手数料抜き売値', defaultValue_(params['手数料抜き売値'], ''));
  setTradeRowValue_(row, '取得価格', defaultValue_(params['取得価格'], ''));
  setTradeRowValue_(row, '売却損益', defaultValue_(params['売却損益'], ''));
  setTradeRowValue_(row, '簿価', defaultValue_(params['簿価'], ''));
  setTradeRowValue_(row, '銘柄ごとの残高', defaultValue_(params['銘柄ごとの残高'], ''));
  setTradeRowValue_(row, 'FX2の期末簿価', defaultValue_(params['FX2の期末簿価'], ''));
  row[TRADE_HEADERS.length] = params.helper || '';
  return row;
}

function setTradeRowValue_(row, headerName, value) {
  const idx = TRADE_HEADERS.indexOf(headerName);
  if (idx < 0) throw new Error('TRADE_HEADERS に存在しないヘッダーです: ' + headerName);
  row[idx] = value;
}

function getTradeRowValue_(row, headerName) {
  const idx = TRADE_HEADERS.indexOf(headerName);
  if (idx < 0) throw new Error('TRADE_HEADERS に存在しないヘッダーです: ' + headerName);
  return row[idx];
}

function getTradeHelperValue_(row) {
  return row[TRADE_HEADERS.length];
}

function getCashRowValue_(row, headerName) {
  const idx = CASH_HEADERS.indexOf(headerName);
  if (idx < 0) throw new Error('CASH_HEADERS に存在しないヘッダーです: ' + headerName);
  return row[idx];
}

function getColumnIndexByHeader_(headers, headerName) {
  const idx = headers.indexOf(headerName);
  if (idx < 0) throw new Error('ヘッダーが見つかりません: ' + headerName);
  return idx + 1;
}

function defaultValue_(value, fallback) {
  return value === undefined ? fallback : value;
}

function assertEquals_(expected, actual, message) {
  if (expected !== actual) throw new Error((message || 'assertEquals failed') + ' expected=' + expected + ' actual=' + actual);
}

function assertTrue_(condition, message) {
  if (!condition) throw new Error(message || 'assertTrue failed');
}

function assertFalse_(condition, message) {
  if (condition) throw new Error(message || 'assertFalse failed');
}

function assertApproxEquals_(expected, actual, epsilon, message) {
  const diff = Math.abs(expected - actual);
  if (diff > (epsilon || 1e-9)) throw new Error((message || 'assertApproxEquals failed') + ' expected=' + expected + ' actual=' + actual + ' diff=' + diff);
}

function assertArrayEquals_(expected, actual, message) {
  assertEquals_(expected.length, actual.length, message || 'array length mismatch');
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== actual[i]) {
      throw new Error((message || 'assertArrayEquals failed') + ' index=' + i + ' expected=' + expected[i] + ' actual=' + actual[i]);
    }
  }
}

function assertThrowsContains_(fn, expectedMessagePart, message) {
  try {
    fn();
  } catch (e) {
    const actual = String(e && e.message ? e.message : e);
    if (actual.indexOf(expectedMessagePart) >= 0) {
      return;
    }
    throw new Error((message || 'assertThrowsContains failed') + ' expectedPart=' + expectedMessagePart + ' actual=' + actual);
  }
  throw new Error((message || 'assertThrowsContains failed') + ' expected exception');
}

