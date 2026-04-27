const CONFIG = {
  SOURCE_SHEET_NAME: '元データ',
  OUTPUT_DOMESTIC: '国内取引',
  OUTPUT_FOREIGN: '外国取引',
  OUTPUT_CASH_JPY: '金銭残高（円）',
  OUTPUT_CASH_USD: '金銭残高（ドル）',
};

const BASE_HEADERS = [
  '約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分',
  '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）',
  '国内消費税等（円）', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）'
];

const TRADE_HEADERS = [
  ...BASE_HEADERS,
  '保有数',
  '手数料の消費税額',
  '平均取得単価',
  '手数料抜き売値',
  '取得価格',
  '売却損益',
  '簿価',
  '銘柄ごとの残高',
  'FX2の期末簿価',
];

const CASH_HEADERS = [
  ...BASE_HEADERS,
  '残高',
  '月次残高',
];
