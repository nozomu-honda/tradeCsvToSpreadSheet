function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialCsvUrl = (e && e.parameter && e.parameter.csvUrl) ? e.parameter.csvUrl : '';
  template.initialSpreadsheetUrl = (e && e.parameter && e.parameter.spreadsheetUrl) ? e.parameter.spreadsheetUrl : '';
  template.dbTargetsJson = JSON.stringify(getDbTargetList_());
  template.resetDbTargetsJson = JSON.stringify(getResetDbTargetList_());
  template.defaultTargetDbKey = getDefaultDbTargetKey_();
  return template.evaluate().setTitle('CSV / スプレッドシートから6シート生成');
}

function normalizeWebAppTargetPayload_(payloadOrTargetDbKey) {
  if (payloadOrTargetDbKey && typeof payloadOrTargetDbKey === 'object') {
    return payloadOrTargetDbKey;
  }
  return {
    targetDbKey: payloadOrTargetDbKey,
  };
}

function runFromWebApp(payload) {
  if (!payload) {
    throw new Error('入力がありません。');
  }

  assertCiE2eTokenForWebAppIfConfigured_(payload);

  const csvUrl = (payload.csvUrl || '').trim();
  const spreadsheetUrl = (payload.spreadsheetUrl || '').trim();
  const uploadedCsvText = payload.uploadedCsvText || '';
  const uploadedFileName = (payload.uploadedFileName || '').trim();
  const targetDbKey = payload.targetDbKey || getDefaultDbTargetKey_();

  resolveDbTarget_(targetDbKey);

  const inputCount =
    (csvUrl ? 1 : 0) +
    (spreadsheetUrl ? 1 : 0) +
    (uploadedCsvText ? 1 : 0);

  if (inputCount === 0) {
    throw new Error('CSVリンク、スプレッドシートURL、CSVファイルのいずれかを指定してください。');
  }

  if (inputCount >= 2) {
    throw new Error('CSVリンク、スプレッドシートURL、CSVファイルは同時に指定せず、どれか1つだけ指定してください。');
  }

  if (uploadedCsvText) {
    return createSpreadsheetFromCsvText_(uploadedCsvText, uploadedFileName || 'uploaded.csv', '', {
      targetDbKey: targetDbKey,
    });
  }

  if (spreadsheetUrl) {
    return createSpreadsheetFromSourceSpreadsheet_(spreadsheetUrl, {
      targetDbKey: targetDbKey,
    });
  }

  return createSpreadsheetFromCsvUrl_(csvUrl, {
    targetDbKey: targetDbKey,
  });
}

function resetDbFromWebApp(payloadOrTargetDbKey) {
  const payload = normalizeWebAppTargetPayload_(payloadOrTargetDbKey);
  assertCiE2eTokenForWebAppIfConfigured_(payload);
  return resetDbData_(payload.targetDbKey);
}

function getDbSpreadsheetFromWebApp(payloadOrTargetDbKey) {
  const payload = normalizeWebAppTargetPayload_(payloadOrTargetDbKey);
  assertCiE2eTokenForWebAppIfConfigured_(payload);
  return getDbSpreadsheetMeta_(payload.targetDbKey);
}

function listRecentImportsFromWebApp(payloadOrTargetDbKey) {
  const payload = normalizeWebAppTargetPayload_(payloadOrTargetDbKey);
  assertCiE2eTokenForWebAppIfConfigured_(payload);
  const target = resolveDbTarget_(payload.targetDbKey);
  return {
    dbTargetKey: target.key,
    dbTargetLabel: target.label,
    dbTargetKind: target.dbKind,
    dbTargetKindLabel: target.dbKindLabel,
    imports: listRecentImports_(target.key, DB_CONFIG.MAX_RECENT_IMPORTS),
  };
}

function rollbackImportFromWebApp(payload) {
  if (!payload) {
    throw new Error('ロールバック対象が指定されていません。');
  }
  assertCiE2eTokenForWebAppIfConfigured_(payload);
  if (!payload.targetDbKey) {
    throw new Error('ロールバック対象DBを選択してください。');
  }
  if (!payload.importId) {
    throw new Error('ロールバック対象の取込IDを選択してください。');
  }

  const result = rollbackImport_(payload.targetDbKey, payload.importId);
  if (result.rolledBackAt instanceof Date) {
    result.rolledBackAt = result.rolledBackAtText;
  }
  return result;
}

function runStagingSheetFromWebApp(payload) {
  if (!payload) {
    throw new Error('入力がありません。');
  }

  assertCiE2eTokenForWebAppIfConfigured_(payload);

  const csvUrl = (payload.csvUrl || '').trim();
  const spreadsheetUrl = (payload.spreadsheetUrl || '').trim();
  const uploadedCsvText = payload.uploadedCsvText || '';
  const uploadedFileName = (payload.uploadedFileName || '').trim();

  const inputCount =
    (csvUrl ? 1 : 0) +
    (spreadsheetUrl ? 1 : 0) +
    (uploadedCsvText ? 1 : 0);

  if (inputCount === 0) {
    throw new Error('CSVリンク、スプレッドシートURL、CSVファイルのいずれかを指定してください。');
  }

  if (inputCount >= 2) {
    throw new Error('CSVリンク、スプレッドシートURL、CSVファイルは同時に指定せず、どれか1つだけ指定してください。');
  }

  if (uploadedCsvText) {
    return createStagingSpreadsheetFromCsvText_(
      uploadedCsvText,
      uploadedFileName || 'uploaded.csv',
      ''
    );
  }

  if (spreadsheetUrl) {
    return createStagingSpreadsheetFromSourceSpreadsheet_(spreadsheetUrl);
  }

  return createStagingSpreadsheetFromCsvUrl_(csvUrl);
}
