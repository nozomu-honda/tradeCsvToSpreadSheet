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
