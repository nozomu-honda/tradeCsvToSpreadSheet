/**
 * 一次受け枠系テスト
 */

function test_buildRowsWithAdditionalManualHeaders_appendsInSpecifiedOrder_() {
  const rows = [
    ['取引履歴'],
    [
      '約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分',
      '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）'
    ],
    [
      '2026/05/01', '2026/05/02', '外株', 'ABCD', 'ALPHA', '', '現物買付', '',
      'USD', '10', '100', '1000', '110', '150', 'USD', ''
    ]
  ];

  const actual = buildRowsWithAdditionalManualHeaders_(rows);
  const headerRow = actual[1];

  assertEquals_('国内消費税等（円）', headerRow[16], '追加列1');
  assertEquals_('現地源泉税（円）', headerRow[17], '追加列2');
  assertEquals_('国内源泉所得税（円）', headerRow[18], '追加列3');
  assertEquals_('国内源泉地方税（円）', headerRow[19], '追加列4');
  assertEquals_('国内手数料（円）', headerRow[20], '追加列5');
  assertEquals_('現地手数料（円）', headerRow[21], '追加列6');
  assertEquals_('元本払戻金', headerRow[22], '追加列7');

  assertEquals_('', actual[2][16], 'データ行の追加列は空欄初期化');
  assertEquals_('', actual[2][22], '元本払戻金も空欄初期化');
}

function test_validateRequiredManualInputsOnSheet_requiresForeignStockManualInputs_() {
  withTempSpreadsheet_(function(ss) {
    const sheet = ss.getSheets()[0];
    sheet.setName('取引履歴_一次受け枠');

    const headers = [
      '約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分',
      '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）',
      '国内消費税等（円）', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）',
      '国内手数料（円）', '現地手数料（円）', '元本払戻金'
    ];
    const row = [
      '2026/05/01', '2026/05/02', '外株', 'ABCD', 'ALPHA', '', '現物買付', '',
      'USD', 10, 100, 1000, 110, '', 'USD', '',
      '', '', '', '',
      '', '', ''
    ];

    sheet.getRange(1, 1, 2, headers.length).setValues([headers, row]);

    assertThrowsContains_(function() {
      validateRequiredManualInputsOnSheet_(sheet);
    }, '赤色のセルを入力してください', '外株の必須入力不足はエラー');
  });
}

function test_validateRequiredManualInputsOnSheet_allowsWhenForeignStockManualInputsFilled_() {
  withTempSpreadsheet_(function(ss) {
    const sheet = ss.getSheets()[0];
    sheet.setName('取引履歴_一次受け枠');

    const headers = [
      '約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分',
      '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）',
      '国内消費税等（円）', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）',
      '国内手数料（円）', '現地手数料（円）', '元本払戻金'
    ];
    const row = [
      '2026/05/01', '2026/05/02', '外株', 'ABCD', 'ALPHA', '', '現物買付', '',
      'USD', 10, 100, 1000, 110, 150, 'USD', '',
      7, '', '', '',
      22, 33, ''
    ];

    sheet.getRange(1, 1, 2, headers.length).setValues([headers, row]);

    validateRequiredManualInputsOnSheet_(sheet);
    assertTrue_(true, '必須入力が埋まっていれば通る');
  });
}

function test_createStagingSpreadsheetFromSourceSpreadsheet_createsSingleSheet_() {
  withTempSpreadsheet_(function(sourceSs) {
    const sheet = sourceSs.getSheets()[0];
    sheet.setName('入力候補');

    const headers = [
      '約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分',
      '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）'
    ];
    const row = [
      '2026/05/01', '2026/05/02', '投信', '1234', 'AAA', '', '入金（分配金）', '',
      'JPY', 0, 0, 500, 0, '', 'JPY', ''
    ];

    sheet.getRange(1, 1, 2, headers.length).setValues([headers, row]);

    const res = createStagingSpreadsheetFromSourceSpreadsheet_(sourceSs.getUrl());
    const created = SpreadsheetApp.openById(res.spreadsheetId);

    try {
      assertEquals_('spreadsheet', res.inputType, '入力方式');
      assertEquals_('入力候補', res.sourceSheetName, '自動判定した元シート名');
      assertEquals_(1, created.getSheets().length, '一次受け枠は1シートだけ作成');
      assertEquals_('取引履歴_一次受け枠', created.getSheets()[0].getName(), 'シート名');

      const createdHeaders = created.getSheets()[0].getRange(1, 1, 1, 23).getValues()[0];
      assertEquals_('国内手数料（円）', createdHeaders[20], '追加列順5');
      assertEquals_('現地手数料（円）', createdHeaders[21], '追加列順6');
      assertEquals_('元本払戻金', createdHeaders[22], '追加列順7');
    } finally {
      trashFileWithRetry_(created.getId(), 'generated staging spreadsheet cleanup failed');
    }
  });
}

