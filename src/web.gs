function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialCsvUrl = (e && e.parameter && e.parameter.csvUrl) ? e.parameter.csvUrl : '';
  template.initialSpreadsheetUrl = (e && e.parameter && e.parameter.spreadsheetUrl) ? e.parameter.spreadsheetUrl : '';
  template.dbTargetsJson = JSON.stringify(getDbTargetList_());
  template.defaultTargetDbKey = getDefaultDbTargetKey_();
  return template.evaluate().setTitle('CSV / スプレッドシートから4シート生成');
}

function runFromWebApp(payload) {
  if (!payload) {
    throw new Error('入力がありません。');
  }

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

function resetDbFromWebApp(targetDbKey) {
  return resetDbData_(targetDbKey);
}

function listRecentImportsFromWebApp(targetDbKey) {
  const target = resolveDbTarget_(targetDbKey);
  return {
    dbTargetKey: target.key,
    dbTargetLabel: target.label,
    imports: listRecentImports_(target.key, DB_CONFIG.MAX_RECENT_IMPORTS),
  };
}

function rollbackImportFromWebApp(payload) {
  if (!payload) {
    throw new Error('ロールバック対象が指定されていません。');
  }

  return rollbackImport_(payload.targetDbKey, payload.importId);
}

function runStagingSheetFromWebApp(payload) {
  if (!payload) {
    throw new Error('入力がありません。');
  }

  const csvUrl = (payload.csvUrl || '').trim();
  const uploadedCsvText = payload.uploadedCsvText || '';
  const uploadedFileName = (payload.uploadedFileName || '').trim();

  if (!csvUrl && !uploadedCsvText) {
    throw new Error('CSVリンクまたはCSVファイルを指定してください。');
  }

  if (csvUrl && uploadedCsvText) {
    throw new Error('CSVリンクとCSVファイルは同時に指定せず、どちらか一方だけ指定してください。');
  }

  if (payload.spreadsheetUrl && String(payload.spreadsheetUrl).trim()) {
    throw new Error('一次受け枠を作成できるのはCSVリンクまたはCSVファイルのみです。');
  }

  if (uploadedCsvText) {
    return createStagingSpreadsheetFromCsvText_(
      uploadedCsvText,
      uploadedFileName || 'uploaded.csv',
      ''
    );
  }

  return createStagingSpreadsheetFromCsvUrl_(csvUrl);
}

function runStagingSheetFromWebApp(payload) {
  if (!payload) {
    throw new Error('入力がありません。');
  }

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
