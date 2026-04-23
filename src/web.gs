function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialCsvUrl = (e && e.parameter && e.parameter.csvUrl) ? e.parameter.csvUrl : '';
  template.dbTargetsJson = JSON.stringify(getDbTargetList_());
  template.defaultTargetDbKey = getDefaultDbTargetKey_();
  return template.evaluate().setTitle('CSVから4シート生成');
}

function runFromWebApp(payload) {
  if (!payload) {
    throw new Error('入力がありません。');
  }

  const csvUrl = (payload.csvUrl || '').trim();
  const uploadedCsvText = payload.uploadedCsvText || '';
  const uploadedFileName = (payload.uploadedFileName || '').trim();
  const targetDbKey = payload.targetDbKey || getDefaultDbTargetKey_();

  resolveDbTarget_(targetDbKey);

  if (!csvUrl && !uploadedCsvText) {
    throw new Error('CSVリンクまたはCSVファイルを指定してください。');
  }

  if (csvUrl && uploadedCsvText) {
    throw new Error('CSVリンクとCSVファイルは同時に指定せず、どちらか一方だけ指定してください。');
  }

  if (uploadedCsvText) {
    return createSpreadsheetFromCsvText_(uploadedCsvText, uploadedFileName || 'uploaded.csv', '', {
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
