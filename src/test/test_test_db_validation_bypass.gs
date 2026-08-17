/**
 * テスト用DBでは赤セル必須入力バリデーションをスキップするテスト
 *
 * test_staging_sheet.gs などに追記してください。
 */

// selected GAS Tests の実動作確認用no-op変更

function test_shouldSkipRequiredManualValidationForTarget_testDb_true_() {
  assertTrue_(
    shouldSkipRequiredManualValidationForTarget_('nomura_test'),
    'test DB では必須入力バリデーションをスキップする'
  );
}

function test_shouldSkipRequiredManualValidationForTarget_normalDb_false_() {
  assertFalse_(
    shouldSkipRequiredManualValidationForTarget_('nomura_corp_a'),
    '通常DBでは必須入力バリデーションをスキップしない'
  );
}

function test_createSpreadsheetFromSourceSpreadsheetUsingDb_testDb_skipsManualValidation_() {
  const temp = createTempDbTargets_(['nomura_test']);
  try {
    const patchedTargets = temp.targets.map(function(target) {
      return {
        key: target.key,
        label: target.key === 'nomura_test' ? 'テスト用DB（赤セルバリデーション無視）' : target.label,
        spreadsheetId: target.spreadsheetId,
        spreadsheetName: target.spreadsheetName
      };
    });

    withTempDbTargets_(patchedTargets, 'nomura_test', function() {
      const sourceSs = getSuiteTempSpreadsheet_();
      resetTempSpreadsheet_(sourceSs);
      const sheet = sourceSs.getSheets()[0];
      sheet.setName('入力候補');

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

      const result = createSpreadsheetFromSourceSpreadsheetUsingDb_(sourceSs.getId(), {
        targetDbKey: 'nomura_test'
      });

      assertTrue_(result.validationBypassed, 'テスト用DBではバリデーションスキップが返る');
      assertEquals_('nomura_test', result.db.dbTargetKey, 'テスト用DBに追加される');
    });
  } finally {
    temp.cleanup();
  }
}
