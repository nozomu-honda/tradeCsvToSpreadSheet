/**
 * 入力読込・入力シート判定系テスト
 */

function test_collectInputAlerts_supportedForeignBond_() {
  const alerts = [];
  collectInputAlerts_([makeTradeRecord_({銘柄名: 'BOND', 商品: '外債', 取引区分: '償還', 決済通貨: 'USD', 受渡金額_決済損益: 100})], alerts);
  assertEquals_(0, alerts.length, '外債/USD は未対応アラート対象ではない');
}

function test_collectInputAlerts_unsupportedProduct_() {
  const alerts = [];
  collectInputAlerts_([makeTradeRecord_({銘柄名: 'ETFTEST', 商品: 'ETF', 取引区分: '現物買付', 決済通貨: 'JPY', 受渡金額_決済損益: 100})], alerts);
  assertTrue_(alerts.some(function(x){ return x.indexOf('商品: 未対応の商品') >= 0; }), '未対応商品アラート');
}

function test_collectInputAlerts_unsupportedSettlementCurrency_() {
  const alerts = [];
  collectInputAlerts_([makeTradeRecord_({銘柄名: 'EURTEST', 商品: '外債', 取引区分: '償還', 決済通貨: 'EUR', 受渡金額_決済損益: 100})], alerts);
  assertTrue_(alerts.some(function(x){ return x.indexOf('決済通貨: 未対応の決済通貨') >= 0; }), '未対応決済通貨アラート');
}

function test_collectInputAlerts_supportedProductAndCurrency_doNothing_() {
  const alerts = [];
  collectInputAlerts_([
    makeTradeRecord_({銘柄名: 'OKTEST', 商品: '株式', 取引区分: '現物買付', 決済通貨: 'JPY', 受渡金額_決済損益: 100}),
    makeTradeRecord_({銘柄名: 'OKBOND', 商品: '外債', 取引区分: '償還', 決済通貨: 'USD', 受渡金額_決済損益: 100}),
    makeTradeRecord_({銘柄名: '', 商品: '現金', 摘要: '入金テスト', 取引区分: '入金（振込）', 決済通貨: 'JPY', 受渡金額_決済損益: 100})
  ], alerts);
  assertEquals_(0, alerts.length, '対応済み商品/決済通貨ではアラートなし');
}

function test_readInputRecords_preambleBeforeHeader_ok_() {
  withTempSpreadsheet_(function(ss) {
    const sheet = ss.getSheets()[0];
    const row20 = function(values) {
      return values.concat(new Array(20 - values.length).fill(''));
    };

    const values = [
      row20(['取引履歴']),
      row20(['基準日', '取引期間From', '取引期間To', '商品区分', '取引区分', '預り区分', '銘柄コード']),
      row20(['約定日', '2021年01月01日', '2026年02月16日', 'すべて（MRF除く）', 'すべて', '特定預り/一般預り', '']),
      row20(['明細数：248件']),
      ['約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分', '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）', '国内消費税等（円）', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）'],
      ['2026/02/13', '2026/02/17', '株式', '6023', 'ダイハツインフィニアース', '', '現物買付', '一般', '', '400', '2545', '1027259', '9259', '', '', '', '', '', '', '']
    ];
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);

    const records = readInputRecords_(sheet);
    assertEquals_(1, records.length, '前置き情報があっても明細は読める');
    assertEquals_('6023', records[0]['銘柄コード'], '銘柄コードを正しく読む');
    assertEquals_('ダイハツインフィニアース', records[0]['銘柄名'], '銘柄名を正しく読む');
    assertEquals_('現物買付', records[0]['取引区分'], '取引区分を正しく読む');
  });
}

function test_readInputRecords_detailRowBeforeHeader_throws_() {
  withTempSpreadsheet_(function(ss) {
    const sheet = ss.getSheets()[0];
    const values = [
      ['2026/02/13', '2026/02/17', '株式', '6023', 'ダイハツインフィニアース', '', '現物買付', '一般', '', '400', '2545', '1027259', '9259', '', '', '', '', '', '', ''],
      ['約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分', '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）', '国内消費税等（円）', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）'],
      ['2026/02/09', '2026/02/12', '株式', '285A', 'キオクシアホールディングス', '', '現物買付', '一般', '', '100', '20695', '2085699', '16199', '', '', '', '', '', '', '']
    ];
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);

    assertThrowsContains_(function() {
      readInputRecords_(sheet);
    }, '明細ヘッダーより前に実データがあります', '明細ヘッダー前の実データはエラー');
  });
}

function test_readInputRecords_headerRowAppearsInMiddle_() {
  withTempSpreadsheet_(function(ss) {
    const sheet = ss.getSheets()[0];
    const values = [
      ['約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分', '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）', '国内消費税等（円）', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）'],
      ['2026/04/01', '2026/04/02', '株式', '1234', 'AAA', '', '現物買付', '', 'JPY', 10, 100, 1000, '', '', '', '', '', '', '', ''],
      ['約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分', '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）', '国内消費税等（円）', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）']
    ];
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);

    assertThrowsContains_(function() {
      readInputRecords_(sheet);
    }, 'データ途中にヘッダー行があります', '途中ヘッダーがあればエラー');
  });
}

function test_readInputRecords_optionalTaxColumns_() {
  withTempSpreadsheet_(function(ss) {
    const sheet = ss.getSheets()[0];
    const values = [
      ['約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分', '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）', '国内消費税等（円）', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）'],
      ['2026/04/01', '2026/04/02', '株式', '1234', 'AAA', '', '現物買付', '', 'JPY', 10, 100, 1000, 110, '', '', '', 10, 20, 30, 40]
    ];
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);

    const records = readInputRecords_(sheet);
    assertEquals_(10, records[0]['国内消費税等（円）'], '国内消費税等（円）を読む');
    assertEquals_(20, records[0]['現地源泉税（円）'], '現地源泉税（円）を読む');
    assertEquals_(30, records[0]['国内源泉所得税（円）'], '国内源泉所得税（円）を読む');
    assertEquals_(40, records[0]['国内源泉地方税（円）'], '国内源泉地方税（円）を読む');
  });
}

function test_readInputRecords_optionalTaxHeaderNameMismatch_throws_() {
  withTempSpreadsheet_(function(ss) {
    const sheet = ss.getSheets()[0];
    const values = [
      ['約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分', '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）', '国内消費税等(円)', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）'],
      ['2026/04/01', '2026/04/02', '株式', '1234', 'AAA', '', '現物買付', '', 'JPY', 10, 100, 1000, 110, '', 'JPY', '', 7, '', '', '']
    ];
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);

    assertThrowsContains_(function() {
      readInputRecords_(sheet);
    }, 'ヘッダー名が一致しません', '税列ヘッダー名が少しでも違えば明示エラー');
  });
}

function test_readInputRecords_manualColumns_20260511_() {
  withTempSpreadsheet_(function(ss) {
    const sheet = ss.getSheets()[0];
    const values = [
      [
        '約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分',
        '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）',
        '国内消費税等（円）', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）',
        '元本払戻金', '国内手数料（円）', '現地手数料（円）'
      ],
      [
        '2026/05/01', '2026/05/02', '外株', 'ABCD', 'ALPHA', '', '現物売却', '特定',
        'USD', 10, 12, 18000, 110, 150, 'USD', 0,
        7, 331, 123, 45,
        1, 222, 333
      ]
    ];
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);

    const records = readInputRecords_(sheet);
    assertEquals_(1, records.length, '1件読めること');

    const r = records[0];
    assertEquals_(true, r['元本払戻金'], '元本払戻金は boolean true');
    assertEquals_(222, r['国内手数料（円）'], '国内手数料（円）を読める');
    assertEquals_(333, r['現地手数料（円）'], '現地手数料（円）を読める');
    assertEquals_(331, r['現地源泉税（円）'], '既存の税列も維持');
  });
}

function test_readInputRecords_manualColumnHeaderMismatch_20260511_() {
  withTempSpreadsheet_(function(ss) {
    const sheet = ss.getSheets()[0];
    const values = [
      [
        '約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分',
        '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）',
        '国内消費税等（円）', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）',
        '元本払戻金', '国内手数料(円)', '現地手数料（円）'
      ],
      [
        '2026/05/01', '2026/05/02', '株式', '1234', 'AAA', '', '現物買付', '',
        'JPY', 10, 100, 1000, 110, '', 'JPY', '', '', '', '', '', '', '', ''
      ]
    ];
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);

    assertThrowsContains_(function() {
      readInputRecords_(sheet);
    }, 'ヘッダー名が一致しません', '国内手数料（円）のヘッダー不一致は明示エラー');
  });
}

function test_findInputSheetByHeader_singleCandidate_() {
  withTempSpreadsheet_(function(ss) {
    const sheet1 = ss.getSheets()[0];
    sheet1.setName('メモ');
    sheet1.getRange(1, 1, 2, 2).setValues([
      ['foo', 'bar'],
      ['1', '2']
    ]);

    const inputSheet = ss.insertSheet('取引データ');
    const values = [
      ['取引履歴'],
      ['明細数：1件'],
      ['約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分', '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）'],
      ['2026/05/01', '2026/05/02', '株式', '1234', 'AAA', '', '現物買付', '', 'JPY', 10, 100, 1000, 110, '', 'JPY', '']
    ];
    inputSheet.getRange(1, 1, values.length, values[2].length).setValues([
      values[0].concat(new Array(values[2].length - values[0].length).fill('')),
      values[1].concat(new Array(values[2].length - values[1].length).fill('')),
      values[2],
      values[3],
    ]);

    const actual = findInputSheetByHeader_(ss);
    assertEquals_('取引データ', actual.getName(), '候補が1枚ならそのシートを採用');
  });
}

function test_findInputSheetByHeader_noCandidate_throws_() {
  withTempSpreadsheet_(function(ss) {
    const sheet = ss.getSheets()[0];
    sheet.setName('メモ');
    sheet.getRange(1, 1, 2, 2).setValues([
      ['foo', 'bar'],
      ['1', '2']
    ]);

    assertThrowsContains_(function() {
      findInputSheetByHeader_(ss);
    }, '取引履歴のヘッダーを持つ入力シートが見つかりません', '候補0枚ならエラー');
  });
}

function test_findInputSheetByHeader_multipleCandidates_throws_() {
  withTempSpreadsheet_(function(ss) {
    const headers = ['約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分', '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）'];
    const row = ['2026/05/01', '2026/05/02', '株式', '1234', 'AAA', '', '現物買付', '', 'JPY', 10, 100, 1000, 110, '', 'JPY', ''];

    const s1 = ss.getSheets()[0];
    s1.setName('候補1');
    s1.getRange(1, 1, 2, headers.length).setValues([headers, row]);

    const s2 = ss.insertSheet('候補2');
    s2.getRange(1, 1, 2, headers.length).setValues([headers, row]);

    assertThrowsContains_(function() {
      findInputSheetByHeader_(ss);
    }, '複数見つかりました', '候補が複数ならエラー');
  });
}

