/**
 * DB・取込・ロールバック系テスト
 */

function test_buildRowHash_sameRecord_sameHash_() {
  const record = makeTradeRecord_({
    約定日: '2026/04/01',
    受渡日: '2026/04/02',
    商品: '株式',
    銘柄コード: '1234',
    銘柄名: 'TEST株',
    取引区分: '現物買付',
    数量: 10,
    単価: 100,
    受渡金額_決済損益: 1000,
    手数料税込: 0,
    決済通貨: 'JPY',
  });

  const hash1 = buildRowHash_(record);
  const hash2 = buildRowHash_(record);

  assertEquals_(hash1, hash2, '同じレコードは同じrowHashになる');
  assertTrue_(!!hash1, 'rowHash が空でないこと');
}

function test_buildRowHash_differentRecord_differentHash_() {
  const record1 = makeTradeRecord_({
    約定日: '2026/04/01',
    受渡日: '2026/04/02',
    商品: '株式',
    銘柄コード: '1234',
    銘柄名: 'TEST株',
    取引区分: '現物買付',
    数量: 10,
    単価: 100,
    受渡金額_決済損益: 1000,
    手数料税込: 0,
    決済通貨: 'JPY',
  });

  const record2 = makeTradeRecord_({
    約定日: '2026/04/01',
    受渡日: '2026/04/02',
    商品: '株式',
    銘柄コード: '1234',
    銘柄名: 'TEST株',
    取引区分: '現物買付',
    数量: 11,
    単価: 100,
    受渡金額_決済損益: 1100,
    手数料税込: 0,
    決済通貨: 'JPY',
  });

  const hash1 = buildRowHash_(record1);
  const hash2 = buildRowHash_(record2);

  assertTrue_(hash1 !== hash2, '異なるレコードは異なるrowHashになる');
}

function test_normalizeRecordForDb_setsMetadata_() {
  const now = new Date('2026-04-04T12:34:56Z');
  const record = makeTradeRecord_({
    約定日: '2026/04/01',
    受渡日: '2026/04/02',
    商品: '外債',
    銘柄コード: 'US0001',
    銘柄名: 'TEST債券',
    取引区分: '償還',
    数量: 0,
    単価: 0,
    受渡金額_決済損益: 500,
    手数料税込: 0,
    決済通貨: 'USD',
  });

  const dbRecord = normalizeRecordForDb_(record, {
    importId: 'import_test',
    sourceName: 'sample.csv',
    sourceRowNo: 7,
    now: now,
  });

  assertEquals_('import_test', dbRecord.importId, 'importId が入る');
  assertEquals_('sample.csv', dbRecord.sourceName, 'sourceName が入る');
  assertEquals_(7, dbRecord.sourceRowNo, 'sourceRowNo が入る');
  assertTrue_(!!dbRecord.recordId, 'recordId が入る');
  assertTrue_(!!dbRecord.rowHash, 'rowHash が入る');
  assertEquals_(true, dbRecord.isActive, 'isActive は true');
  assertEquals_('外債', dbRecord['商品'], '商品が保持される');
  assertEquals_('USD', dbRecord['決済通貨'], '決済通貨が正規化される');
  assertEquals_(500, dbRecord['受渡金額/決済損益'], '金額が保持される');
  assertEquals_('' , dbRecord['国内消費税等（円）'], '国内消費税等（円）は初期値空欄');
  assertEquals_('' , dbRecord['現地源泉税（円）'], '現地源泉税（円）は初期値空欄');
  assertEquals_('' , dbRecord['国内源泉所得税（円）'], '国内源泉所得税（円）は初期値空欄');
  assertEquals_('' , dbRecord['国内源泉地方税（円）'], '国内源泉地方税（円）は初期値空欄');
  assertEquals_(now.getTime(), dbRecord.createdAt.getTime(), 'createdAt が入る');
  assertEquals_(now.getTime(), dbRecord.updatedAt.getTime(), 'updatedAt が入る');
  assertEquals_('', dbRecord.rolledBackAt, 'rolledBackAt は初期値空欄');
}

function test_normalizeRakutenRecordForDb_mapsDividendManualColumns_20260618_() {
  const now = new Date('2026-06-18T00:00:00Z');
  const record = makeTradeRecord_({
    商品: '外株',
    銘柄コード: 'AVGO',
    銘柄名: 'BROADCOM INC',
    取引区分: '入金（配当金）',
    発行通貨: 'USD',
    数量: 18,
    単価: 0.65,
    受渡金額_決済損益: 8.92,
    レート: 150,
    決済通貨: 'USD',
    現地源泉税円: 123,
    国内源泉所得税円: 45,
  });

  const dbRecord = normalizeRakutenRecordForDb_(record, {
    importId: 'import_rakuten_dividend',
    sourceName: 'rakuten_dividend.csv',
    sourceRowNo: 2,
    sourceType: 'rakuten_dividend',
    now: now,
  });

  assertEquals_('', dbRecord.exchangeRate, '楽天配当金の通常為替レート列は空欄');
  assertEquals_(150, dbRecord.manualRate, '楽天配当金の手入力レート');
  assertEquals_(123, dbRecord.manualForeignWithholdingTaxJpy, '楽天配当金の手入力現地源泉税');
  assertEquals_(45, dbRecord.manualDomesticWithholdingTaxJpy, '楽天配当金の手入力国内源泉税');
}

function test_normalizeRakutenRecordForDb_preservesDividendSourceColumns_20260709_() {
  const now = new Date('2026-07-09T00:00:00Z');
  const rows = [
    ['入金日', '商品', '口座', '銘柄コード', '銘柄', '受取通貨', '単価[円/現地通貨]', '数量[株/口]', '配当・分配金合計（税引前）[円/現地通貨]', '税額合計[円/現地通貨]', '受取金額[円/現地通貨]', 'レート', '現地源泉税［円］', '国内源泉税［円］', '備考'],
    ['2026/04/03', '米国株式', '特定・一般', 'AVGO', 'BROADCOM INC', 'USドル', 0.65, 18, 11.7, 2.78, 8.92, 150, 123, 45, '配当メモ']
  ];
  const record = normalizeRakutenDividendRowsToRecords_(rows, 0)[0];

  const dbRecord = normalizeRakutenRecordForDb_(record, {
    importId: 'import_rakuten_dividend_source',
    sourceName: 'rakuten_dividend.csv',
    sourceRowNo: 2,
    sourceType: 'rakuten_dividend',
    now: now,
  });
  const baseRecord = rakutenDbRecordToBaseRecord_(dbRecord);

  assertEquals_(11.7, dbRecord.grossAmount, '配当・分配金合計を楽天DBに保持');
  assertEquals_(2.78, dbRecord.tax, '税額合計を楽天DBに保持');
  assertEquals_(8.92, dbRecord.netAmount, '受取金額を楽天DBに保持');
  assertEquals_(8.92, dbRecord.settlementAmount, '共通金銭残高用の受渡金額');
  assertEquals_(150, dbRecord.manualRate, '手入力レート');
  assertEquals_('配当メモ', dbRecord.description, '備考を楽天DBに保持');
  assertEquals_(8.92, baseRecord['受渡金額/決済損益'], '共通計算には受取金額を渡す');
  assertEquals_('', baseRecord['国内消費税等（円）'], 'USD税額は共通の国内消費税等へ戻さない');
  assertEquals_(2.78, baseRecord.__rakutenDb.tax, '楽天専用出力用metadataに税額を残す');
}

function test_normalizeRakutenRecordForDb_preservesDividendPrincipalReturnViaDescription_20260710_() {
  const now = new Date('2026-07-10T00:00:00Z');
  const rows = [
    ['入金日', '商品', '口座', '銘柄コード', '銘柄', '受取通貨', '単価[円/現地通貨]', '数量[株/口]', '配当・分配金合計（税引前）[円/現地通貨]', '税額合計[円/現地通貨]', '受取金額[円/現地通貨]', '為替レート', '現地源泉税（円）', '国内源泉所得税（円）', '備考'],
    ['2026/04/04', '投資信託', '一般', '', '楽天元本払戻テスト投信', '円', 0, 0, 500, 0, 500, 1, 0, 0, '元本払戻金']
  ];
  const record = normalizeRakutenDividendRowsToRecords_(rows, 0)[0];

  const dbRecord = normalizeRakutenRecordForDb_(record, {
    importId: 'import_rakuten_principal_return',
    sourceName: 'rakuten_dividend.csv',
    sourceRowNo: 2,
    sourceType: 'rakuten_dividend',
    now: now,
  });
  const baseRecord = rakutenDbRecordToBaseRecord_(dbRecord);

  assertEquals_('元本払戻金', dbRecord.description, '既存description列に元本払戻金マーカーを保持');
  assertEquals_(true, baseRecord['元本払戻金'], '楽天DBから共通レコードへ元本払戻金を復元');
}

function test_getDbSpreadsheetPropertyKey_skipsFixedSpreadsheetId_20260618_() {
  assertEquals_(
    'DB_SPREADSHEET_ID_RAKUTEN_CORP_A',
    getDbSpreadsheetPropertyKey_({ key: 'rakuten_corp_a', spreadsheetId: '' }),
    'spreadsheetId未設定DBはScript PropertiesでIDを固定する'
  );
  assertEquals_(
    '',
    getDbSpreadsheetPropertyKey_({ key: 'nomura_corp_a', spreadsheetId: 'fixed_id' }),
    'spreadsheetId固定DBはScript Propertiesを使わない'
  );
}

function test_dbRecordToRow_mapsHeaders_() {
  const now = new Date('2026-04-04T12:34:56Z');
  const record = makeTradeRecord_({
    約定日: '2026/04/01',
    受渡日: '2026/04/02',
    商品: '株式',
    銘柄コード: '1234',
    銘柄名: 'TEST株',
    取引区分: '現物買付',
    数量: 10,
    単価: 100,
    受渡金額_決済損益: 1000,
    手数料税込: 0,
    決済通貨: 'JPY',
  });

  const dbRecord = normalizeRecordForDb_(record, {
    importId: 'import_test',
    sourceName: 'sample.csv',
    sourceRowNo: 3,
    now: now,
  });

  const row = dbRecordToRow_(dbRecord);

  assertEquals_(DB_HEADERS.length, row.length, 'DB行の列数はDB_HEADERSと一致');
  assertEquals_(dbRecord.recordId, row[DB_HEADERS.indexOf('recordId')], 'recordId の位置');
  assertEquals_('import_test', row[DB_HEADERS.indexOf('importId')], 'importId の位置');
  assertEquals_('sample.csv', row[DB_HEADERS.indexOf('sourceName')], 'sourceName の位置');
  assertEquals_('TEST株', row[DB_HEADERS.indexOf('銘柄名')], '銘柄名 の位置');
  assertEquals_(1000, row[DB_HEADERS.indexOf('受渡金額/決済損益')], '金額 の位置');
  assertEquals_('', row[DB_HEADERS.indexOf('国内消費税等（円）')], '国内消費税等（円）の位置');
  assertEquals_('', row[DB_HEADERS.indexOf('現地源泉税（円）')], '現地源泉税（円）の位置');
  assertEquals_('', row[DB_HEADERS.indexOf('国内源泉所得税（円）')], '国内源泉所得税（円）の位置');
  assertEquals_('', row[DB_HEADERS.indexOf('国内源泉地方税（円）')], '国内源泉地方税（円）の位置');
}

function test_dbTargets_defaultSelection_() {
  const temp = createTempDbTargets_(['nomura_corp_a', 'nomura_corp_b']);
  try {
    withTempDbTargets_(temp.targets, 'nomura_corp_b', function() {
      assertEquals_('nomura_corp_b', getDefaultDbTargetKey_(), 'DEFAULT_TARGET_DB_KEY を返す');
      const resolved = resolveDbTarget_('nomura_corp_b');
      assertEquals_('nomura_corp_b', resolved.key, '選択したDBキーを解決できる');
      assertEquals_('Temp nomura_corp_b', resolved.label, '選択したDBラベルを解決できる');
    });
  } finally {
    temp.cleanup();
  }
}

function test_getResetDbTargetList_includesHiddenTargets_20260616_() {
  const temp = createTempDbTargets_(['nomura_corp_a', 'rakuten_corp_a']);
  try {
    temp.targets[0].uiVisible = true;
    temp.targets[0].importLabel = 'Temp 法人A';
    temp.targets[1].uiVisible = false;

    withTempDbTargets_(temp.targets, 'nomura_corp_a', function() {
      const importTargetList = getDbTargetList_();
      const resetTargetList = getResetDbTargetList_();
      const importTargets = importTargetList.map(function(target) {
        return target.key;
      });
      const resetTargets = resetTargetList.map(function(target) {
        return target.key;
      });

      assertArrayEquals_(['nomura_corp_a'], importTargets, '取込用DBリストは非表示DBを含めない');
      assertArrayEquals_(['nomura_corp_a', 'rakuten_corp_a'], resetTargets, 'リセット用DBリストは楽天DBも含める');
      assertEquals_('Temp 法人A', importTargetList[0].label, '取込用DBリストは importLabel を表示する');
      assertEquals_('Temp nomura_corp_a', resetTargetList[0].label, 'リセット用DBリストは通常ラベルを表示する');
      assertEquals_('nomura', resetTargetList[0].dbKind, '野村DB種別');
      assertEquals_('楽天DB', resetTargetList[1].dbKindLabel, '楽天DB種別ラベル');
      assertEquals_('楽天DB: Temp rakuten_corp_a (rakuten_corp_a)', resetTargetList[1].operationLabel, '操作用ラベルは種別とDBキーを含める');
    });
  } finally {
    temp.cleanup();
  }
}

function test_appendRecordsToDb_writesOnlySelectedDb_() {
  const temp = createTempDbTargets_(['nomura_corp_a', 'nomura_corp_b']);
  try {
    withTempDbTargets_(temp.targets, 'nomura_corp_a', function() {
      const res = appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: 'AAA',
          商品: '株式',
          取引区分: '現物買付',
          数量: 10,
          単価: 100,
          受渡金額_決済損益: 1000,
          決済通貨: 'JPY'
        })
      ], {
        targetDbKey: 'nomura_corp_a',
        sourceName: 'nomura_corp_a.csv',
        inputType: 'upload'
      });

      assertEquals_('nomura_corp_a', res.dbTargetKey, '追加先DBキーが返る');
      assertEquals_('Temp nomura_corp_a', res.dbTargetLabel, '追加先DBラベルが返る');
      assertEquals_(1, readDbRecords_('nomura_corp_a').length, '選択したDBには追加される');
      assertEquals_(0, readDbRecords_('nomura_corp_b').length, '別DBには追加されない');
    });
  } finally {
    temp.cleanup();
  }
}

function test_listRecentImports_returnsOnlySelectedDbLogs_() {
  const temp = createTempDbTargets_(['nomura_corp_a', 'nomura_corp_b']);
  try {
    withTempDbTargets_(temp.targets, 'nomura_corp_a', function() {
      appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: 'AAA',
          商品: '株式',
          取引区分: '現物買付',
          数量: 10,
          単価: 100,
          受渡金額_決済損益: 1000,
          決済通貨: 'JPY'
        })
      ], {
        targetDbKey: 'nomura_corp_a',
        sourceName: 'nomura_corp_a.csv',
        inputType: 'upload'
      });

      appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: 'BBB',
          商品: '株式',
          取引区分: '現物買付',
          数量: 20,
          単価: 100,
          受渡金額_決済損益: 2000,
          決済通貨: 'JPY'
        })
      ], {
        targetDbKey: 'nomura_corp_b',
        sourceName: 'nomura_corp_b.csv',
        inputType: 'upload'
      });

      const logsA = listRecentImports_('nomura_corp_a', 10);
      const logsB = listRecentImports_('nomura_corp_b', 10);

      assertEquals_(1, logsA.length, 'nomura_corp_a のログだけ返る');
      assertEquals_(1, logsB.length, 'nomura_corp_b のログだけ返る');
      assertEquals_('nomura_corp_a.csv', logsA[0].sourceName, 'nomura_corp_a の sourceName');
      assertEquals_('nomura_corp_b.csv', logsB[0].sourceName, 'nomura_corp_b の sourceName');
      assertEquals_('nomura_corp_a', logsA[0].targetDbKey, 'nomura_corp_a の targetDbKey');
      assertEquals_('nomura_corp_b', logsB[0].targetDbKey, 'nomura_corp_b の targetDbKey');
      assertEquals_('野村DB', logsA[0].targetDbKindLabel, '履歴にDB種別ラベルを含める');
      assertTrue_(logsA[0].displayLabel.indexOf('野村DB nomura_corp_a') >= 0, '履歴表示名にDB種別とキーを含める');
    });
  } finally {
    temp.cleanup();
  }
}

function test_rollbackImport_marksImportInactive_() {
  const temp = createTempDbTargets_(['nomura_corp_a', 'nomura_corp_b']);
  try {
    withTempDbTargets_(temp.targets, 'nomura_corp_a', function() {
      const first = appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: 'AAA',
          商品: '株式',
          取引区分: '現物買付',
          数量: 10,
          単価: 100,
          受渡金額_決済損益: 1000,
          決済通貨: 'JPY'
        })
      ], {
        targetDbKey: 'nomura_corp_a',
        sourceName: 'first.csv',
        inputType: 'upload'
      });

      appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: 'BBB',
          商品: '株式',
          取引区分: '現物買付',
          数量: 20,
          単価: 100,
          受渡金額_決済損益: 2000,
          決済通貨: 'JPY'
        })
      ], {
        targetDbKey: 'nomura_corp_a',
        sourceName: 'second.csv',
        inputType: 'upload'
      });

      assertEquals_(2, readDbRecords_('nomura_corp_a').length, 'ロールバック前は2件');

      const rollback = rollbackImport_('nomura_corp_a', first.importId);
      assertEquals_(1, rollback.rolledBackCount, '1件ロールバック');
      assertEquals_('nomura_corp_a', rollback.dbTargetKey, 'ロールバック対象DBキー');
      assertEquals_('野村DB', rollback.dbTargetKindLabel, 'ロールバック対象DB種別');
      assertTrue_(rollback.rolledBackAt instanceof Date, 'ロールバック結果にrolledBackAtが入る');
      assertTrue_(!!rollback.rolledBackAtText, 'ロールバック結果にrolledBackAtTextが入る');

      const after = readDbRecords_('nomura_corp_a');
      assertEquals_(1, after.length, 'ロールバック後は有効レコード1件');
      assertEquals_('BBB', after[0]['銘柄名'], '後から入れた取引は残る');

      const logs = listRecentImports_('nomura_corp_a', 10);
      const rolled = logs.find(function(item) {
        return item.importId === first.importId;
      });

      assertTrue_(!!rolled, 'ロールバック対象ログが見つかる');
      assertTrue_(rolled.isRolledBack, 'ログがロールバック済みになる');
      assertEquals_(1, rolled.rolledBackRecordCount, 'ロールバック件数が記録される');
    });
  } finally {
    temp.cleanup();
  }
}

function test_rollbackImport_setsRolledBackAt_() {
  const temp = createTempDbTargets_(['nomura_corp_a', 'nomura_corp_b']);
  try {
    withTempDbTargets_(temp.targets, 'nomura_corp_a', function() {
      const first = appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: 'AAA',
          商品: '株式',
          取引区分: '現物買付',
          数量: 10,
          単価: 100,
          受渡金額_決済損益: 1000,
          決済通貨: 'JPY'
        })
      ], {
        targetDbKey: 'nomura_corp_a',
        sourceName: 'first.csv',
        inputType: 'upload'
      });

      rollbackImport_('nomura_corp_a', first.importId);

      const ssA = getOrCreateDbSpreadsheet_('nomura_corp_a');
      const txA = getOrCreateDbSheet_(ssA, DB_CONFIG.SHEET_TRANSACTIONS, DB_HEADERS);
      const lastRow = txA.getLastRow();
      assertEquals_(2, lastRow, 'ヘッダー+1行');

      const values = txA.getRange(2, 1, 1, DB_HEADERS.length).getValues()[0];
      const rolledBackAt = values[DB_HEADERS.indexOf('rolledBackAt')];
      const isActive = values[DB_HEADERS.indexOf('isActive')];

      assertFalse_(!(isActive === false || String(isActive).toUpperCase() === 'FALSE'), 'ロールバック後 isActive は false');
      assertTrue_(rolledBackAt instanceof Date, 'ロールバック後 rolledBackAt が入る');
    });
  } finally {
    temp.cleanup();
  }
}

function test_rollbackImport_twice_throws_() {
  const temp = createTempDbTargets_(['nomura_corp_a', 'nomura_corp_b']);
  try {
    withTempDbTargets_(temp.targets, 'nomura_corp_a', function() {
      const first = appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: 'AAA',
          商品: '株式',
          取引区分: '現物買付',
          数量: 10,
          単価: 100,
          受渡金額_決済損益: 1000,
          決済通貨: 'JPY'
        })
      ], {
        targetDbKey: 'nomura_corp_a',
        sourceName: 'first.csv',
        inputType: 'upload'
      });

      rollbackImport_('nomura_corp_a', first.importId);

      assertThrowsContains_(function() {
        rollbackImport_('nomura_corp_a', first.importId);
      }, 'すでにロールバック済み', '2回目のロールバックはエラー');
    });
  } finally {
    temp.cleanup();
  }
}

function test_resetDbData_recreatesSheetsAndClearsFormats_() {
  const temp = createTempDbTargets_(['nomura_corp_a']);
  try {
    withTempDbTargets_(temp.targets, 'nomura_corp_a', function() {
      const beforeSs = getOrCreateDbSpreadsheet_('nomura_corp_a');
      const beforeTx = getOrCreateDbSheet_(beforeSs, DB_CONFIG.SHEET_TRANSACTIONS, DB_HEADERS);
      const beforeLog = getOrCreateDbSheet_(beforeSs, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);

      const domesticTaxCol = DB_HEADERS.indexOf('国内消費税等（円）') + 1;
      const foreignTaxCol = DB_HEADERS.indexOf('現地源泉税（円）') + 1;

      beforeTx.getRange(2, domesticTaxCol).setNumberFormat('m/d/yyyy');
      beforeTx.getRange(2, foreignTaxCol).setNumberFormat('m/d/yyyy');

      const dbRecord = normalizeRecordForDb_(makeTradeRecord_({
        銘柄名: 'FMT',
        商品: '株式',
        取引区分: '現物買付',
        数量: 1,
        単価: 100,
        受渡金額_決済損益: 1000,
        手数料税込: 110,
        国内消費税等円: 7,
        現地源泉税円: 331,
        約定日: '2026/04/01',
        受渡日: '2026/04/02',
        決済通貨: 'JPY'
      }), {
        importId: 'import_test',
        sourceName: 'test.csv',
        sourceRowNo: 1,
        now: new Date()
      });

      beforeTx.getRange(2, 1, 1, DB_HEADERS.length).setValues([dbRecordToRow_(dbRecord)]);

      const log = {
        importId: 'import_test',
        importedAt: new Date(),
        targetDbKey: 'nomura_corp_a',
        targetDbLabel: 'nomura_corp_a',
        sourceName: 'test.csv',
        inputType: 'upload',
        normalizedUrl: '',
        rowCount: 1,
        insertedCount: 1,
        skippedCount: 0,
        alertCount: 0,
        isRolledBack: false,
        rolledBackAt: '',
        rolledBackRecordCount: ''
      };

      beforeLog.getRange(2, 1, 1, IMPORT_LOG_HEADERS.length).setValues([
        IMPORT_LOG_HEADERS.map(function(header) {
          return log[header];
        })
      ]);

      SpreadsheetApp.flush();

      const result = resetDbData_('nomura_corp_a');

      const afterSs = SpreadsheetApp.openById(result.dbSpreadsheetId);
      const afterTx = afterSs.getSheetByName(DB_CONFIG.SHEET_TRANSACTIONS);
      const afterLog = afterSs.getSheetByName(DB_CONFIG.SHEET_IMPORT_LOGS);

      assertTrue_(!!afterTx, '取引DBシートが再作成されている');
      assertTrue_(!!afterLog, '取込履歴シートが再作成されている');

      assertEquals_(1, afterTx.getLastRow(), '取引DBはヘッダーのみになる');
      assertEquals_(1, afterLog.getLastRow(), '取込履歴はヘッダーのみになる');
      assertEquals_(1, result.deletedTransactionCount, '取引DBの削除件数');
      assertEquals_(1, result.deletedImportLogCount, '取込履歴の削除件数');

      const txHeaders = afterTx.getRange(1, 1, 1, DB_HEADERS.length).getValues()[0];
      const logHeaders = afterLog.getRange(1, 1, 1, IMPORT_LOG_HEADERS.length).getValues()[0];
      assertArrayEquals_(DB_HEADERS, txHeaders, '取引DBヘッダーを再作成');
      assertArrayEquals_(IMPORT_LOG_HEADERS, logHeaders, '取込履歴ヘッダーを再作成');

      const domesticTaxFormat = afterTx.getRange(2, domesticTaxCol).getNumberFormat();
      const foreignTaxFormat = afterTx.getRange(2, foreignTaxCol).getNumberFormat();

      assertTrue_(domesticTaxFormat !== 'm/d/yyyy', '国内消費税等（円）列の日付書式が消えている');
      assertTrue_(foreignTaxFormat !== 'm/d/yyyy', '現地源泉税（円）列の日付書式が消えている');
    });
  } finally {
    temp.cleanup();
  }
}

function test_resetDbData_resetsOnlySelectedDb_() {
  const temp = createTempDbTargets_(['nomura_corp_a', 'nomura_corp_b']);
  try {
    withTempDbTargets_(temp.targets, 'nomura_corp_a', function() {
      appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: 'AAA',
          商品: '株式',
          取引区分: '現物買付',
          数量: 10,
          単価: 100,
          受渡金額_決済損益: 1000,
          決済通貨: 'JPY'
        })
      ], {
        targetDbKey: 'nomura_corp_a',
        sourceName: 'nomura_corp_a.csv',
        inputType: 'upload'
      });

      appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: 'BBB',
          商品: '株式',
          取引区分: '現物買付',
          数量: 20,
          単価: 100,
          受渡金額_決済損益: 2000,
          決済通貨: 'JPY'
        })
      ], {
        targetDbKey: 'nomura_corp_b',
        sourceName: 'nomura_corp_b.csv',
        inputType: 'upload'
      });

      const reset = resetDbData_('nomura_corp_a');
      assertEquals_('nomura_corp_a', reset.dbTargetKey, 'リセット対象DBキー');
      assertEquals_('Temp nomura_corp_a', reset.dbTargetLabel, 'リセット対象DBラベル');

      const ssA = getOrCreateDbSpreadsheet_('nomura_corp_a');
      const ssB = getOrCreateDbSpreadsheet_('nomura_corp_b');
      const txA = getOrCreateDbSheet_(ssA, DB_CONFIG.SHEET_TRANSACTIONS, DB_HEADERS);
      const txB = getOrCreateDbSheet_(ssB, DB_CONFIG.SHEET_TRANSACTIONS, DB_HEADERS);
      const logA = getOrCreateDbSheet_(ssA, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);
      const logB = getOrCreateDbSheet_(ssB, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);

      assertEquals_(0, countNonEmptyRowsByHeader_(txA, DB_HEADERS, 'recordId'), 'nomura_corp_a の取引DBは空になる');
      assertEquals_(0, countNonEmptyRowsByHeader_(logA, IMPORT_LOG_HEADERS, 'importId'), 'nomura_corp_a の取込履歴は空になる');
      assertEquals_(1, countNonEmptyRowsByHeader_(txB, DB_HEADERS, 'recordId'), 'nomura_corp_b の取引DBは残る');
      assertEquals_(1, countNonEmptyRowsByHeader_(logB, IMPORT_LOG_HEADERS, 'importId'), 'nomura_corp_b の取込履歴は残る');
    });
  } finally {
    temp.cleanup();
  }
}

function test_rakutenDb_usesRakutenHeadersAndReadsAsBaseRecord_20260617_() {
  const temp = createTempDbTargets_(['rakuten_corp_a']);
  try {
    withTempDbTargets_(temp.targets, 'rakuten_corp_a', function() {
      const result = appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: '楽天TEST',
          商品: '外株',
          取引区分: '現物買付',
          数量: 2,
          単価: 100,
          受渡金額_決済損益: 200,
          レート: 150,
          決済通貨: 'USD'
        })
      ], {
        targetDbKey: 'rakuten_corp_a',
        sourceName: 'rakuten.csv',
        inputType: 'upload',
        sourceType: 'rakuten_us_stock'
      });

      assertEquals_('rakuten_corp_a', result.dbTargetKey, '楽天DBキー');

      const ss = getOrCreateDbSpreadsheet_('rakuten_corp_a');
      const txSheet = ss.getSheetByName(DB_CONFIG.SHEET_TRANSACTIONS);
      const headers = txSheet.getRange(1, 1, 1, RAKUTEN_DB_HEADERS.length).getValues()[0];
      assertArrayEquals_(RAKUTEN_DB_HEADERS, headers, '楽天DBはRAKUTEN_DB_HEADERSを使う');

      const row = txSheet.getRange(2, 1, 1, RAKUTEN_DB_HEADERS.length).getValues()[0];
      assertEquals_('rakuten_us_stock', row[RAKUTEN_DB_HEADERS.indexOf('sourceType')], 'sourceTypeを保存');
      assertEquals_('楽天', row[RAKUTEN_DB_HEADERS.indexOf('broker')], 'brokerを保存');
      assertEquals_('外株', row[RAKUTEN_DB_HEADERS.indexOf('product')], 'productを保存');
      assertEquals_('現物買付', row[RAKUTEN_DB_HEADERS.indexOf('normalizedTradeType')], 'normalizedTradeTypeを保存');

      const records = readDbRecords_('rakuten_corp_a');
      assertEquals_(1, records.length, '楽天DBから共通計算用レコードとして読める');
      assertEquals_('楽天TEST', records[0]['銘柄名'], '銘柄名を復元');
      assertEquals_('外株', records[0]['商品'], '商品を復元');
      assertEquals_('現物買付', records[0]['取引区分'], '取引区分を復元');
      assertEquals_(200, records[0]['受渡金額/決済損益'], '金額を復元');
    });
  } finally {
    temp.cleanup();
  }
}

function test_rakutenDb_existingOldHeaderWithData_throwsBeforeHeaderRewrite_20260617_() {
  const temp = createTempDbTargets_(['rakuten_corp_a']);
  try {
    withTempDbTargets_(temp.targets, 'rakuten_corp_a', function() {
      const ss = getSuiteTempDbSpreadsheetByKey_('rakuten_corp_a');
      resetTempDbSpreadsheet_(ss);
      const txSheet = ss.getSheets()[0];
      txSheet.setName(DB_CONFIG.SHEET_TRANSACTIONS);
      txSheet.getRange(1, 1, 1, DB_HEADERS.length).setValues([DB_HEADERS]);
      txSheet.getRange(2, 1, 1, DB_HEADERS.length).setValues([
        DB_HEADERS.map(function(header) {
          if (header === 'recordId') return 'old_rakuten_record';
          if (header === 'importId') return 'old_import';
          if (header === 'rowHash') return 'old_hash';
          if (header === '銘柄名') return 'OLD_RAKUTEN';
          if (header === 'isActive') return true;
          return '';
        })
      ]);
      const logSheet = ss.insertSheet(DB_CONFIG.SHEET_IMPORT_LOGS);
      logSheet.getRange(1, 1, 1, IMPORT_LOG_HEADERS.length).setValues([IMPORT_LOG_HEADERS]);

      assertThrowsContains_(function() {
        getOrCreateDbSpreadsheet_('rakuten_corp_a');
      }, '楽天DBをリセットしてから再取込してください', '旧ヘッダーの楽天DBは明示エラー');

      const headersAfter = txSheet.getRange(1, 1, 1, DB_HEADERS.length).getValues()[0];
      assertArrayEquals_(DB_HEADERS, headersAfter, 'エラー時に旧ヘッダーを上書きしない');

      const reset = resetDbData_('rakuten_corp_a');
      assertEquals_(1, reset.deletedTransactionCount, '旧楽天DBデータをリセットできる');

      const afterSs = SpreadsheetApp.openById(reset.dbSpreadsheetId);
      const afterTx = afterSs.getSheetByName(DB_CONFIG.SHEET_TRANSACTIONS);
      const resetHeadersAfter = afterTx.getRange(1, 1, 1, RAKUTEN_DB_HEADERS.length).getValues()[0];
      assertArrayEquals_(RAKUTEN_DB_HEADERS, resetHeadersAfter, 'リセット後はRAKUTEN_DB_HEADERS');
      assertEquals_(1, afterTx.getLastRow(), 'リセット後はヘッダーのみ');
    });
  } finally {
    temp.cleanup();
  }
}

function test_rakutenDb_rollback_marksOnlyTargetImportInactive_20260617_() {
  const temp = createTempDbTargets_(['rakuten_corp_a']);
  try {
    withTempDbTargets_(temp.targets, 'rakuten_corp_a', function() {
      const first = appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: 'ROLLBACK_FIRST',
          商品: '外株',
          取引区分: '現物買付',
          数量: 1,
          単価: 100,
          受渡金額_決済損益: 100,
          レート: 150,
          決済通貨: 'USD'
        })
      ], {
        targetDbKey: 'rakuten_corp_a',
        sourceName: 'rakuten_first.csv',
        inputType: 'upload',
        sourceType: 'rakuten_us_stock'
      });

      appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: 'ROLLBACK_SECOND',
          商品: '外株',
          取引区分: '現物買付',
          数量: 2,
          単価: 100,
          受渡金額_決済損益: 200,
          レート: 150,
          決済通貨: 'USD'
        })
      ], {
        targetDbKey: 'rakuten_corp_a',
        sourceName: 'rakuten_second.csv',
        inputType: 'upload',
        sourceType: 'rakuten_us_stock'
      });

      const rollback = rollbackImport_('rakuten_corp_a', first.importId);
      assertEquals_(1, rollback.rolledBackCount, '楽天DBで1件ロールバック');

      const records = readDbRecords_('rakuten_corp_a');
      assertEquals_(1, records.length, '楽天DBの有効レコードは1件残る');
      assertEquals_('ROLLBACK_SECOND', records[0]['銘柄名'], '対象外の取込は残る');

      const ss = getOrCreateDbSpreadsheet_('rakuten_corp_a');
      const txSheet = ss.getSheetByName(DB_CONFIG.SHEET_TRANSACTIONS);
      const values = txSheet.getRange(2, 1, 2, RAKUTEN_DB_HEADERS.length).getValues();
      const importIdCol = RAKUTEN_DB_HEADERS.indexOf('importId');
      const isActiveCol = RAKUTEN_DB_HEADERS.indexOf('isActive');
      const rolledBackAtCol = RAKUTEN_DB_HEADERS.indexOf('rolledBackAt');
      const firstRow = values.find(function(row) {
        return row[importIdCol] === first.importId;
      });

      assertTrue_(!!firstRow, 'ロールバック対象行が見つかる');
      assertFalse_(!(firstRow[isActiveCol] === false || String(firstRow[isActiveCol]).toUpperCase() === 'FALSE'), '楽天DB対象行 isActive は false');
      assertTrue_(firstRow[rolledBackAtCol] instanceof Date, '楽天DB対象行 rolledBackAt が入る');
    });
  } finally {
    temp.cleanup();
  }
}

function test_rollbackImport_sameImportIdOnlySelectedDb_20260709_() {
  const temp = createTempDbTargets_(['nomura_corp_a', 'rakuten_corp_a']);
  try {
    withTempDbTargets_(temp.targets, 'nomura_corp_a', function() {
      appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: 'NOMURA_SHARED_IMPORT',
          商品: '株式',
          取引区分: '現物買付',
          数量: 1,
          単価: 100,
          受渡金額_決済損益: 100,
          決済通貨: 'JPY'
        })
      ], {
        targetDbKey: 'nomura_corp_a',
        sourceName: 'nomura_shared.csv',
        inputType: 'upload',
        importId: 'shared_import'
      });

      appendRecordsToDb_([
        makeTradeRecord_({
          銘柄名: 'RAKUTEN_SHARED_IMPORT',
          商品: '外株',
          取引区分: '現物買付',
          数量: 1,
          単価: 100,
          受渡金額_決済損益: 100,
          レート: 150,
          決済通貨: 'USD'
        })
      ], {
        targetDbKey: 'rakuten_corp_a',
        sourceName: 'rakuten_shared.csv',
        inputType: 'upload',
        sourceType: 'rakuten_us_stock',
        importId: 'shared_import'
      });

      const rollback = rollbackImport_('rakuten_corp_a', 'shared_import');
      assertEquals_('rakuten_corp_a', rollback.dbTargetKey, '楽天DBだけをロールバック対象にする');
      assertEquals_('楽天DB', rollback.dbTargetKindLabel, '楽天DB種別を返す');
      assertEquals_(1, rollback.rolledBackCount, '楽天DBの1件だけ無効化');

      const nomuraRecords = readDbRecords_('nomura_corp_a');
      const rakutenRecords = readDbRecords_('rakuten_corp_a');
      assertEquals_(1, nomuraRecords.length, '同じimportIdでも野村DBのレコードは残る');
      assertEquals_('NOMURA_SHARED_IMPORT', nomuraRecords[0]['銘柄名'], '野村DBの対象外レコード');
      assertEquals_(0, rakutenRecords.length, '楽天DBの対象レコードだけ無効化');

      const nomuraLogs = listRecentImports_('nomura_corp_a', 10);
      const rakutenLogs = listRecentImports_('rakuten_corp_a', 10);
      assertFalse_(nomuraLogs[0].isRolledBack, '野村DBの同名importIdログは未ロールバック');
      assertTrue_(rakutenLogs[0].isRolledBack, '楽天DBの同名importIdログだけロールバック済み');
      assertEquals_('楽天DB', rakutenLogs[0].targetDbKindLabel, '楽天履歴にDB種別を含める');
      assertTrue_(rakutenLogs[0].displayLabel.indexOf('楽天DB rakuten_corp_a') >= 0, '楽天履歴表示名にDB種別とキーを含める');
    });
  } finally {
    temp.cleanup();
  }
}

function test_buildRowHash_changesWhenManualColumnsChange_20260511_() {
  const a = makeTradeRecord_({
    銘柄名: 'HASH_TEST',
    商品: '外株',
    取引区分: '現物売却',
    数量: 1,
    単価: 10,
    受渡金額_決済損益: 100,
    レート: 150,
    約定日: '2026/05/01',
    受渡日: '2026/05/02',
    決済通貨: 'USD',
    国内手数料円: 111,
    現地手数料円: 222,
    元本払戻金: true
  });

  const b = makeTradeRecord_({
    銘柄名: 'HASH_TEST',
    商品: '外株',
    取引区分: '現物売却',
    数量: 1,
    単価: 10,
    受渡金額_決済損益: 100,
    レート: 150,
    約定日: '2026/05/01',
    受渡日: '2026/05/02',
    決済通貨: 'USD',
    国内手数料円: 999,
    現地手数料円: 222,
    元本払戻金: true
  });

  const ha = buildRowHash_(a);
  const hb = buildRowHash_(b);
  assertTrue_(ha !== hb, '追加手入力列が変わると rowHash も変わる');
}

function test_createSpreadsheetFromSourceSpreadsheetUsingDb_readsDetectedSheet_() {
  const temp = createTempDbTargets_(['nomura_corp_a']);
  try {
    withTempDbTargets_(temp.targets, 'nomura_corp_a', function() {
      withTempSpreadsheet_(function(sourceSs) {
        const memo = sourceSs.getSheets()[0];
        memo.setName('メモ');
        memo.getRange(1, 1, 2, 2).setValues([
          ['foo', 'bar'],
          ['1', '2']
        ]);

        const inputSheet = sourceSs.insertSheet('入力候補');
        const headers = ['約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分', '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）', '国内消費税等（円）', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）', '元本払戻金', '国内手数料（円）', '現地手数料（円）'];
        const row = ['2026/05/01', '2026/05/02', '株式', '1234', 'AAA', '', '現物買付', '', 'JPY', 10, 100, 1000, 110, '', 'JPY', '', '', '', '', '', '', '', ''];
        inputSheet.getRange(1, 1, 2, headers.length).setValues([headers, row]);

        const result = createSpreadsheetFromSourceSpreadsheetUsingDb_(sourceSs.getUrl(), {
          targetDbKey: 'nomura_corp_a'
        });

        try {
          assertEquals_('spreadsheet', result.inputType, '入力方式は spreadsheet');
          assertEquals_('入力候補', result.sourceSheetName, '自動判定したシート名を返す');
          assertEquals_(1, result.db.insertedCount, 'DBに1件追加');
          assertEquals_(1, result.counts.all, '全件数1件');
        } finally {
          trashFileWithRetry_(result.spreadsheetId, 'generated spreadsheet cleanup failed');
        }
      });
    });
  } finally {
    temp.cleanup();
  }
}
