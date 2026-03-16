function doGet(e) {
  const template = HtmlService.createTemplateFromFile('src/Index');
  template.initialCsvUrl = (e && e.parameter && e.parameter.csvUrl) ? e.parameter.csvUrl : '';
  return template.evaluate().setTitle('CSVから4シート生成');
}

function runFromWebApp(payload) {
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

  if (uploadedCsvText) {
    return createSpreadsheetFromCsvText_(uploadedCsvText, uploadedFileName || 'uploaded.csv');
  }

  return createSpreadsheetFromCsvUrl_(csvUrl);
}