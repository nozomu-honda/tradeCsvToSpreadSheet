function getAdditionalManualHeaders_() {
  return [
    '国内消費税等（円）',
    '現地源泉税（円）',
    '国内源泉所得税（円）',
    '国内源泉地方税（円）',
    '国内手数料（円）',
    '現地手数料（円）',
    '元本払戻金'
  ];
}

function getStagingHighlightColors_() {
  return {
    red: '#f4cccc',
    yellow: '#fff2cc'
  };
}

function createSpreadsheetFromCsvUrl_(csvUrl, options) {
  return createSpreadsheetFromCsvUrlUsingDb_(csvUrl, options);
}

function createSpreadsheetFromCsvText_(csvText, sourceName, normalizedUrl, options) {
  return createSpreadsheetFromCsvTextUsingDb_(csvText, sourceName, normalizedUrl, options);
}

function createSpreadsheetFromSourceSpreadsheet_(spreadsheetUrlOrId, options) {
  return createSpreadsheetFromSourceSpreadsheetUsingDb_(spreadsheetUrlOrId, options);
}

function isTestDbTarget_(targetDbKey) {
  return text_(targetDbKey) === 'test';
}

function shouldSkipRequiredManualValidationForTarget_(targetDbKey) {
  return isTestDbTarget_(targetDbKey);
}

function createStagingSpreadsheetFromCsvUrl_(csvUrl) {
  if (!csvUrl) {
    throw new Error('CSVリンクを入力してください。');
  }

  const normalizedUrl = normalizeCsvUrl_(csvUrl);
  const csvText = fetchCsvText_(normalizedUrl);
  return createStagingSpreadsheetFromCsvText_(csvText, 'link.csv', normalizedUrl);
}

function createStagingSpreadsheetFromCsvText_(csvText, sourceName, normalizedUrl) {
  if (!csvText || String(csvText).trim() === '') {
    throw new Error('CSVの内容が空です。');
  }

  const rows = parseCsvWithFallback_(csvText);
  if (!rows || rows.length === 0) {
    throw new Error('CSVを読み込めませんでした。');
  }

  const outputRows = buildRowsWithAdditionalManualHeaders_(rows);

  const ss = SpreadsheetApp.create(buildSpreadsheetName_((sourceName || 'CSV') + '_一次受け'));
  const sheet = ss.getSheets()[0];
  sheet.setName('取引履歴_一次受け枠');
  sheet.getRange(1, 1, outputRows.length, outputRows[0].length).setValues(outputRows);

  applyStagingManualHighlights_(sheet);

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName(),
    sheetName: sheet.getName(),
    inputType: normalizedUrl ? 'url' : 'upload',
    normalizedUrl: normalizedUrl || '',
    sourceName: sourceName || ''
  };
}

function createStagingSpreadsheetFromSourceSpreadsheet_(spreadsheetUrlOrId) {
  if (!spreadsheetUrlOrId) {
    throw new Error('スプレッドシートURLまたはIDを入力してください。');
  }

  const sourceSs = openSpreadsheetByUrlOrId_(spreadsheetUrlOrId);
  const sourceSheet = findInputSheetByHeader_(sourceSs);
  const sourceValues = sourceSheet.getDataRange().getValues();

  if (!sourceValues || sourceValues.length === 0) {
    throw new Error('入力元シートが空です。');
  }

  const outputRows = buildRowsWithAdditionalManualHeaders_(sourceValues);

  const ss = SpreadsheetApp.create(buildSpreadsheetName_(sourceSs.getName() + '_一次受け'));
  const sheet = ss.getSheets()[0];
  sheet.setName('取引履歴_一次受け枠');
  sheet.getRange(1, 1, outputRows.length, outputRows[0].length).setValues(outputRows);

  applyStagingManualHighlights_(sheet);

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName(),
    sheetName: sheet.getName(),
    inputType: 'spreadsheet',
    normalizedUrl: text_(spreadsheetUrlOrId),
    sourceName: sourceSs.getName(),
    sourceSheetName: sourceSheet.getName(),
    sourceSpreadsheetName: sourceSs.getName()
  };
}

function buildRowsWithAdditionalManualHeaders_(rows) {
  const paddedRows = padRows_(rows);
  const headerRowIndex = findHeaderRowIndex_(paddedRows);

  if (headerRowIndex < 0) {
    throw new Error('実データのヘッダー行が見つかりません。');
  }

  validateHeaderPlacement_(paddedRows, headerRowIndex);

  const originalHeaders = paddedRows[headerRowIndex].map(function(v) {
    return String(v).trim();
  });

  validateHeaderNames_(originalHeaders);

  const additionalHeaders = getAdditionalManualHeaders_();
  const missingHeaders = additionalHeaders.filter(function(header) {
    return originalHeaders.indexOf(header) < 0;
  });

  const finalHeaders = originalHeaders.concat(missingHeaders);
  const finalWidth = finalHeaders.length;

  return paddedRows.map(function(row, index) {
    if (index === headerRowIndex) {
      return finalHeaders.slice();
    }

    const newRow = row.slice();
    while (newRow.length < finalWidth) {
      newRow.push('');
    }
    return newRow;
  });
}

function applyStagingManualHighlights_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headerRowIndex = findHeaderRowIndex_(values);

  if (headerRowIndex < 0) {
    throw new Error('実データのヘッダー行が見つかりません。');
  }

  const headers = values[headerRowIndex].map(function(v) {
    return String(v).trim();
  });
  const colors = getStagingHighlightColors_();

  const colIndex = {
    product: headers.indexOf('商品'),
    tx: headers.indexOf('取引区分'),
    settlementCurrency: headers.indexOf('決済通貨'),
    rate: headers.indexOf('レート'),
    domesticTax: headers.indexOf('国内消費税等（円）'),
    foreignWithholding: headers.indexOf('現地源泉税（円）'),
    domesticIncomeTax: headers.indexOf('国内源泉所得税（円）'),
    domesticLocalTax: headers.indexOf('国内源泉地方税（円）'),
    domesticFee: headers.indexOf('国内手数料（円）'),
    foreignFee: headers.indexOf('現地手数料（円）'),
    principalReturn: headers.indexOf('元本払戻金')
  };

  const redRanges = [];
  const yellowRanges = [];

  for (var r = headerRowIndex + 1; r < values.length; r++) {
    const row = values[r];
    if (!row || isEmptyRow_(row)) continue;
    if (!row[0]) continue;

    const product = text_(row[colIndex.product]);
    const tx = text_(row[colIndex.tx]);
    const settlementCurrency = normalizeCurrency_(row[colIndex.settlementCurrency]);

    if (product === '外株') {
      if (settlementCurrency === 'USD' && colIndex.rate >= 0) {
        redRanges.push(a1_(r + 1, colIndex.rate + 1));
      }

      if (tx === '現物買付' || tx === '現物売却') {
        if (colIndex.domesticFee >= 0) redRanges.push(a1_(r + 1, colIndex.domesticFee + 1));
        if (colIndex.domesticTax >= 0) redRanges.push(a1_(r + 1, colIndex.domesticTax + 1));
        if (colIndex.foreignFee >= 0) redRanges.push(a1_(r + 1, colIndex.foreignFee + 1));
      }

      if (tx === '入金（配当金）' || tx === '入金（分配金）') {
        if (colIndex.foreignWithholding >= 0) yellowRanges.push(a1_(r + 1, colIndex.foreignWithholding + 1));
        if (colIndex.domesticIncomeTax >= 0) redRanges.push(a1_(r + 1, colIndex.domesticIncomeTax + 1));
        if (colIndex.domesticLocalTax >= 0) yellowRanges.push(a1_(r + 1, colIndex.domesticLocalTax + 1));
      }
    }

    if (product === '投信') {
      if (tx === '現物売却' || tx === '現物買取') {
        if (colIndex.domesticIncomeTax >= 0) yellowRanges.push(a1_(r + 1, colIndex.domesticIncomeTax + 1));
        if (colIndex.domesticLocalTax >= 0) yellowRanges.push(a1_(r + 1, colIndex.domesticLocalTax + 1));
      }

      if (tx === '入金（分配金）') {
        if (colIndex.domesticIncomeTax >= 0) yellowRanges.push(a1_(r + 1, colIndex.domesticIncomeTax + 1));
        if (colIndex.domesticLocalTax >= 0) yellowRanges.push(a1_(r + 1, colIndex.domesticLocalTax + 1));
        if (colIndex.principalReturn >= 0) yellowRanges.push(a1_(r + 1, colIndex.principalReturn + 1));
      }
    }
  }

  if (redRanges.length > 0) {
    sheet.getRangeList(unique_(redRanges)).setBackground(colors.red);
  }

  if (yellowRanges.length > 0) {
    sheet.getRangeList(unique_(yellowRanges)).setBackground(colors.yellow);
  }
}

function validateRequiredManualInputsOnSheet_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headerRowIndex = findHeaderRowIndex_(values);

  if (headerRowIndex < 0) {
    throw new Error('実データのヘッダー行が見つかりません。');
  }

  const headers = values[headerRowIndex].map(function(v) {
    return String(v).trim();
  });

  const colIndex = {
    product: headers.indexOf('商品'),
    tx: headers.indexOf('取引区分'),
    settlementCurrency: headers.indexOf('決済通貨'),
    rate: headers.indexOf('レート'),
    domesticTax: headers.indexOf('国内消費税等（円）'),
    domesticIncomeTax: headers.indexOf('国内源泉所得税（円）'),
    domesticFee: headers.indexOf('国内手数料（円）'),
    foreignFee: headers.indexOf('現地手数料（円）')
  };

  const errors = [];

  for (var r = headerRowIndex + 1; r < values.length; r++) {
    const row = values[r];
    if (!row || isEmptyRow_(row)) continue;
    if (!row[0]) continue;

    const product = text_(row[colIndex.product]);
    const tx = text_(row[colIndex.tx]);
    const settlementCurrency = normalizeCurrency_(row[colIndex.settlementCurrency]);

    if (product === '外株') {
      if (settlementCurrency === 'USD' && isBlankCell_(row[colIndex.rate])) {
        errors.push(buildManualRequiredError_(r + 1, 'レート', product, tx));
      }

      if (tx === '現物買付' || tx === '現物売却') {
        if (isBlankCell_(row[colIndex.domesticFee])) {
          errors.push(buildManualRequiredError_(r + 1, '国内手数料（円）', product, tx));
        }
        if (isBlankCell_(row[colIndex.domesticTax])) {
          errors.push(buildManualRequiredError_(r + 1, '国内消費税等（円）', product, tx));
        }
        if (isBlankCell_(row[colIndex.foreignFee])) {
          errors.push(buildManualRequiredError_(r + 1, '現地手数料（円）', product, tx));
        }
      }

      if (tx === '入金（配当金）' || tx === '入金（分配金）') {
        if (isBlankCell_(row[colIndex.domesticIncomeTax])) {
          errors.push(buildManualRequiredError_(r + 1, '国内源泉所得税（円）', product, tx));
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      '一次受け枠の必須入力が未入力です。赤色のセルを入力してください。\n' +
      errors.join('\n')
    );
  }
}

function buildManualRequiredError_(rowNo, headerName, product, tx) {
  return '行' + rowNo + ': ' + headerName + ' が未入力です'
    + ' / 商品: ' + (product || '(空欄)')
    + ' / 取引区分: ' + (tx || '(空欄)');
}

function isBlankCell_(value) {
  return value === '' || value === null || value === undefined;
}

function unique_(items) {
  const seen = {};
  const result = [];
  items.forEach(function(item) {
    if (seen[item]) return;
    seen[item] = true;
    result.push(item);
  });
  return result;
}

function a1_(row, col) {
  return columnToLetter_(col) + row;
}

function getManagedOutputSpreadsheet_(targetDbKey, sourceNameForNewFile) {
  if (!isTestDbTarget_(targetDbKey)) {
    return {
      ss: SpreadsheetApp.create(buildSpreadsheetName_(sourceNameForNewFile)),
      reused: false,
      mode: 'created'
    };
  }

  const outputConfig = DB_CONFIG.TEST_OUTPUT_SPREADSHEET || {};
  const fixedId = text_(outputConfig.spreadsheetId);
  const fixedName = text_(outputConfig.spreadsheetName) || '株管理ツール_TEST_OUTPUT';

  if (fixedId) {
    return {
      ss: SpreadsheetApp.openById(fixedId),
      reused: true,
      mode: 'fixed_id'
    };
  }

  const existing = findSpreadsheetByName_(fixedName);
  if (existing) {
    return {
      ss: existing,
      reused: true,
      mode: 'fixed_name'
    };
  }

  return {
    ss: SpreadsheetApp.create(fixedName),
    reused: false,
    mode: 'created_test_output'
  };
}

function findSpreadsheetByName_(spreadsheetName) {
  if (!spreadsheetName) {
    return null;
  }

  const files = DriveApp.getFilesByName(spreadsheetName);
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return SpreadsheetApp.openById(file.getId());
    }
  }
  return null;
}

function createSpreadsheetFromCsvUrlLegacy_(csvUrl) {
  if (!csvUrl) {
    throw new Error('CSVリンクを入力してください。');
  }

  const normalizedUrl = normalizeCsvUrl_(csvUrl);
  const csvText = fetchCsvText_(normalizedUrl);
  return createSpreadsheetFromCsvTextLegacy_(csvText, 'link.csv', normalizedUrl);
}

function createSpreadsheetFromCsvTextLegacy_(csvText, sourceName, normalizedUrl) {
  if (!csvText || String(csvText).trim() === '') {
    throw new Error('CSVの内容が空です。');
  }

  const rows = parseCsvWithFallback_(csvText);
  if (!rows || rows.length === 0) {
    throw new Error('CSVを読み込めませんでした。');
  }

  const paddedRows = padRows_(rows);
  const ss = SpreadsheetApp.create(buildSpreadsheetName_(sourceName));
  const sourceSheet = ss.getSheets()[0];
  sourceSheet.setName(CONFIG.SOURCE_SHEET_NAME);

  sourceSheet.getRange(1, 1, paddedRows.length, paddedRows[0].length).setValues(paddedRows);

  const result = buildOutputSheetsFromSourceSheet_(ss, sourceSheet);
  result.inputType = normalizedUrl ? 'url' : 'upload';
  result.normalizedUrl = normalizedUrl || '';
  result.sourceName = sourceName || '';
  return result;
}

function createSpreadsheetFromCsvUrlUsingDb_(csvUrl, options) {
  if (!csvUrl) {
    throw new Error('CSVリンクを入力してください。');
  }

  const normalizedUrl = normalizeCsvUrl_(csvUrl);
  const csvText = fetchCsvText_(normalizedUrl);
  return createSpreadsheetFromCsvTextUsingDb_(csvText, 'link.csv', normalizedUrl, options);
}

function createSpreadsheetFromCsvTextUsingDb_(csvText, sourceName, normalizedUrl, options) {
  if (!csvText || String(csvText).trim() === '') {
    throw new Error('CSVの内容が空です。');
  }

  const rows = parseCsvWithFallback_(csvText);
  if (!rows || rows.length === 0) {
    throw new Error('CSVを読み込めませんでした。');
  }

  const paddedRows = padRows_(rows);
  const targetDbKey = options && options.targetDbKey ? options.targetDbKey : getDefaultDbTargetKey_();
  const outputMeta = getManagedOutputSpreadsheet_(targetDbKey, sourceName);
  const ss = outputMeta.ss;

  let sourceSheet = ss.getSheetByName(CONFIG.SOURCE_SHEET_NAME);
  if (!sourceSheet) {
    sourceSheet = ss.insertSheet(CONFIG.SOURCE_SHEET_NAME, 0);
  } else {
    sourceSheet.clear();
  }
  sourceSheet.setName(CONFIG.SOURCE_SHEET_NAME);
  sourceSheet.getRange(1, 1, paddedRows.length, paddedRows[0].length).setValues(paddedRows);

  const records = readInputRecords_(sourceSheet);

  const inputAlerts = [];
  collectInputAlerts_(records, inputAlerts);

  const dbAppendResult = appendRecordsToDb_(records, {
    sourceName: sourceName || '',
    inputType: normalizedUrl ? 'url' : 'upload',
    normalizedUrl: normalizedUrl || '',
    alertCount: inputAlerts.length,
    targetDbKey: targetDbKey,
  });

  const dbRecords = readDbRecords_(targetDbKey);
  const result = buildOutputSheetsFromDbRecords_(ss, dbRecords);

  result.inputType = normalizedUrl ? 'url' : 'upload';
  result.normalizedUrl = normalizedUrl || '';
  result.sourceName = sourceName || '';
  result.sourceSheetName = sourceSheet.getName();
  result.outputSpreadsheetReused = outputMeta.reused;
  result.outputSpreadsheetMode = outputMeta.mode;

  result.db = {
    dbSpreadsheetId: dbAppendResult.dbSpreadsheetId,
    dbSpreadsheetUrl: dbAppendResult.dbSpreadsheetUrl,
    dbTargetKey: dbAppendResult.dbTargetKey,
    dbTargetLabel: dbAppendResult.dbTargetLabel,
    importId: dbAppendResult.importId,
    rowCount: dbAppendResult.rowCount,
    insertedCount: dbAppendResult.insertedCount,
    skippedCount: dbAppendResult.skippedCount,
  };

  return result;
}

function createSpreadsheetFromSourceSpreadsheetUsingDb_(spreadsheetUrlOrId, options) {
  if (!spreadsheetUrlOrId) {
    throw new Error('スプレッドシートURLまたはIDを入力してください。');
  }

  const sourceSs = openSpreadsheetByUrlOrId_(spreadsheetUrlOrId);
  const sourceSheet = findInputSheetByHeader_(sourceSs);
  const sourceValues = sourceSheet.getDataRange().getValues();

  if (!sourceValues || sourceValues.length === 0) {
    throw new Error('入力元シートが空です。');
  }

  const paddedRows = padRows_(sourceValues);
  const targetDbKey = options && options.targetDbKey ? options.targetDbKey : getDefaultDbTargetKey_();
  const outputMeta = getManagedOutputSpreadsheet_(targetDbKey, sourceSs.getName());
  const ss = outputMeta.ss;

  let outputSourceSheet = ss.getSheetByName(CONFIG.SOURCE_SHEET_NAME);
  if (!outputSourceSheet) {
    outputSourceSheet = ss.insertSheet(CONFIG.SOURCE_SHEET_NAME, 0);
  } else {
    outputSourceSheet.clear();
  }
  outputSourceSheet.setName(CONFIG.SOURCE_SHEET_NAME);
  outputSourceSheet.getRange(1, 1, paddedRows.length, paddedRows[0].length).setValues(paddedRows);

  const validationBypassed = shouldSkipRequiredManualValidationForTarget_(targetDbKey);
  if (!validationBypassed) {
    validateRequiredManualInputsOnSheet_(outputSourceSheet);
  }

  const records = readInputRecords_(outputSourceSheet);

  const inputAlerts = [];
  collectInputAlerts_(records, inputAlerts);

  const dbAppendResult = appendRecordsToDb_(records, {
    sourceName: sourceSs.getName() + ' / ' + sourceSheet.getName(),
    inputType: 'spreadsheet',
    normalizedUrl: text_(spreadsheetUrlOrId),
    alertCount: inputAlerts.length,
    targetDbKey: targetDbKey,
  });

  const dbRecords = readDbRecords_(targetDbKey);
  const result = buildOutputSheetsFromDbRecords_(ss, dbRecords);

  result.inputType = 'spreadsheet';
  result.normalizedUrl = text_(spreadsheetUrlOrId);
  result.sourceName = sourceSs.getName();
  result.sourceSheetName = sourceSheet.getName();
  result.sourceSpreadsheetName = sourceSs.getName();
  result.validationBypassed = validationBypassed;
  result.outputSpreadsheetReused = outputMeta.reused;
  result.outputSpreadsheetMode = outputMeta.mode;

  result.db = {
    dbSpreadsheetId: dbAppendResult.dbSpreadsheetId,
    dbSpreadsheetUrl: dbAppendResult.dbSpreadsheetUrl,
    dbTargetKey: dbAppendResult.dbTargetKey,
    dbTargetLabel: dbAppendResult.dbTargetLabel,
    importId: dbAppendResult.importId,
    rowCount: dbAppendResult.rowCount,
    insertedCount: dbAppendResult.insertedCount,
    skippedCount: dbAppendResult.skippedCount,
  };

  return result;
}

function openSpreadsheetByUrlOrId_(value) {
  const s = text_(value);

  if (!s) {
    throw new Error('スプレッドシートURLまたはIDを入力してください。');
  }

  if (s.indexOf('https://docs.google.com/spreadsheets/') === 0) {
    return SpreadsheetApp.openByUrl(s);
  }

  return SpreadsheetApp.openById(s);
}

function findInputSheetByHeader_(ss) {
  const analyses = ss.getSheets().map(function(sheet) {
    return analyzeInputSheetCandidate_(sheet);
  });

  const candidates = analyses.filter(function(item) {
    return item.ok;
  });

  if (candidates.length === 0) {
    throw new Error(
      '取引履歴のヘッダーを持つ入力シートが見つかりません。\n' +
      analyses.map(function(item) {
        return '- ' + item.sheetName + ': ' + item.reason;
      }).join('\n')
    );
  }

  if (candidates.length > 1) {
    throw new Error(
      '取引履歴のヘッダーを持つ入力シートが複数見つかりました。シートを1つに絞ってください: ' +
      candidates.map(function(item) { return item.sheetName; }).join(', ')
    );
  }

  return candidates[0].sheet;
}

function analyzeInputSheetCandidate_(sheet) {
  const sheetName = sheet.getName();

  try {
    const values = sheet.getDataRange().getValues();
    if (!values || values.length === 0) {
      return { ok: false, sheet: sheet, sheetName: sheetName, reason: '空シート' };
    }

    const headerRowIndex = findHeaderRowIndex_(values);
    if (headerRowIndex < 0) {
      return { ok: false, sheet: sheet, sheetName: sheetName, reason: 'ヘッダー行なし' };
    }

    validateHeaderPlacement_(values, headerRowIndex);

    const headers = values[headerRowIndex].map(function(v) {
      return String(v).trim();
    });

    validateHeaderNames_(headers);

    if (!isLikelyRawInputSheetHeaders_(headers)) {
      return { ok: false, sheet: sheet, sheetName: sheetName, reason: '入力用ではないヘッダー構成' };
    }

    const manualColumnReason = validateManualColumnsSample_(values, headers, headerRowIndex);
    if (manualColumnReason) {
      return { ok: false, sheet: sheet, sheetName: sheetName, reason: manualColumnReason };
    }

    return { ok: true, sheet: sheet, sheetName: sheetName, reason: 'OK' };
  } catch (e) {
    return {
      ok: false,
      sheet: sheet,
      sheetName: sheetName,
      reason: e && e.message ? e.message : String(e)
    };
  }
}

function isLikelyRawInputSheetHeaders_(headers) {
  const normalized = headers
    .map(function(h) { return String(h).trim(); })
    .filter(function(h) { return h !== ''; });

  if (normalized.length === 0) {
    return false;
  }

  const requiredPrefix = [
    '約定日',
    '受渡日',
    '商品',
    '銘柄コード',
    '銘柄名',
    '摘要',
    '取引区分',
    '預り区分',
    '発行通貨',
    '数量',
    '単価',
    '受渡金額/決済損益',
    '手数料（税込）',
    'レート',
    '決済通貨',
    '売買損益（円）'
  ];

  if (normalized.length < requiredPrefix.length) {
    return false;
  }

  for (var i = 0; i < requiredPrefix.length; i++) {
    if (normalized[i] !== requiredPrefix[i]) {
      return false;
    }
  }

  const forbiddenHeaders = [
    'recordId',
    'importId',
    'sourceName',
    'sourceRowNo',
    'rowHash',
    'createdAt',
    'updatedAt',
    'rolledBackAt',
    'isActive',
    '保有数',
    '手数料の消費税額',
    '平均取得単価',
    '手数料抜き売値',
    '取得価格',
    '売却損益',
    '簿価',
    '銘柄ごとの残高',
    'FX2の期末簿価',
    '残高',
    '月次残高',
    '__highlight_symbol__'
  ];

  return !forbiddenHeaders.some(function(h) {
    return normalized.indexOf(h) >= 0;
  });
}

function validateManualColumnsSample_(values, headers, headerRowIndex) {
  const flagCol = headers.indexOf('元本払戻金');
  const domesticFeeCol = headers.indexOf('国内手数料（円）');
  const foreignFeeCol = headers.indexOf('現地手数料（円）');

  const maxCheckRows = Math.min(values.length, headerRowIndex + 21);

  for (var r = headerRowIndex + 1; r < maxCheckRows; r++) {
    const row = values[r];
    if (!row || isEmptyRow_(row)) continue;
    if (!row[0]) continue;

    if (flagCol >= 0) {
      const v = row[flagCol];
      if (!isAllowedNullableBooleanCell_(v)) {
        return '元本払戻金列に入力用でない値があります。row=' + (r + 1) + ' value=' + JSON.stringify(v);
      }
    }

    if (domesticFeeCol >= 0) {
      const v = row[domesticFeeCol];
      if (!isAllowedOptionalNumberCell_(v)) {
        return '国内手数料（円）列に入力用でない値があります。row=' + (r + 1) + ' value=' + JSON.stringify(v);
      }
    }

    if (foreignFeeCol >= 0) {
      const v = row[foreignFeeCol];
      if (!isAllowedOptionalNumberCell_(v)) {
        return '現地手数料（円）列に入力用でない値があります。row=' + (r + 1) + ' value=' + JSON.stringify(v);
      }
    }
  }

  return '';
}

function isAllowedNullableBooleanCell_(v) {
  if (v === '' || v === null || v === undefined || v === false) return true;
  if (v === true) return true;
  if (typeof v === 'number') return v === 0 || v === 1;
  if (v instanceof Date) return false;

  const s = String(v)
    .replace(/\u00A0/g, ' ')
    .replace(/\u200B/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/\u3000/g, ' ')
    .trim()
    .toUpperCase();

  return s === '' || s === '0' || s === '1' || s === 'TRUE' || s === 'FALSE';
}

function isAllowedOptionalNumberCell_(v) {
  if (v === '' || v === null || v === undefined || v === false) return true;
  if (typeof v === 'number') return true;
  if (v instanceof Date) return false;

  const s = String(v).replace(/,/g, '').trim();
  if (!s) return true;
  return !isNaN(Number(s));
}

function buildOutputSheetsFromSourceSheet_(ss, sourceSheet) {
  const records = readInputRecords_(sourceSheet);
  const alerts = [];

  collectInputAlerts_(records, alerts);

  const japanStocks = records
    .filter(function(r) { return r['商品'] === '株式'; })
    .sort(sortTradeRows_);

  const usStocks = records
    .filter(function(r) { return ['外株', '外債'].includes(r['商品']); })
    .sort(sortTradeRows_);

  const funds = records
    .filter(function(r) { return r['商品'] === '投信'; })
    .sort(sortTradeRows_);

  const cashJpy = records
    .filter(function(r) {
      const c = normalizeCurrency_(r['決済通貨']);
      return c === '' || c === 'JPY';
    })
    .sort(sortCashRows_);

  const cashUsd = records
    .filter(function(r) { return normalizeCurrency_(r['決済通貨']) === 'USD'; })
    .sort(sortCashRows_);

  writeSheet_(ss, CONFIG.OUTPUT_JAPAN_STOCK, TRADE_HEADERS, buildTradeRows_(japanStocks, alerts), true);
  writeSheet_(ss, CONFIG.OUTPUT_US_STOCK, TRADE_HEADERS, buildTradeRows_(usStocks, alerts), true);
  writeSheet_(ss, CONFIG.OUTPUT_FUND, TRADE_HEADERS, buildTradeRows_(funds, alerts), true);
  writeSheet_(ss, CONFIG.OUTPUT_CASH_JPY, CASH_HEADERS, buildCashRows_(cashJpy), false);
  writeSheet_(ss, CONFIG.OUTPUT_CASH_USD, CASH_HEADERS, buildCashRows_(cashUsd), false);

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName(),
    sourceSheetName: sourceSheet.getName(),
    alerts: alerts,
    counts: {
      all: records.length,
      japanStocks: japanStocks.length,
      usStocks: usStocks.length,
      funds: funds.length,
      cashJpy: cashJpy.length,
      cashUsd: cashUsd.length,
    }
  };
}

function collectInputAlerts_(records, alerts) {
  const supportedProducts = ['株式', '投信', '外株', '外債', '現金'];
  const supportedSettlementCurrencies = ['', 'JPY', 'USD'];

  records.forEach(function(r) {
    const product = text_(r['商品']);
    const settlementCurrency = normalizeCurrency_(r['決済通貨']);
    const tx = text_(r['取引区分']);
    const symbol = text_(r['銘柄名']);

    if (!supportedProducts.includes(product)) {
      alerts.push(
        '商品: 未対応の商品: ' + (product || '(空欄)') +
        ' / 取引区分: ' + (tx || '(空欄)') +
        ' / 銘柄名: ' + (symbol || '(空欄)') +
        ' / 受渡日: ' + formatDateForAlert_(r['受渡日'])
      );
    }

    if (!supportedSettlementCurrencies.includes(settlementCurrency)) {
      alerts.push(
        '決済通貨: 未対応の決済通貨: ' + (settlementCurrency || '(空欄)') +
        ' / 取引区分: ' + (tx || '(空欄)') +
        ' / 銘柄名: ' + (symbol || '(空欄)') +
        ' / 受渡日: ' + formatDateForAlert_(r['受渡日'])
      );
    }
  });
}

function normalizeCsvUrl_(url) {
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return 'https://drive.google.com/uc?export=download&id=' + fileMatch[1];
  }

  const openMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch && url.indexOf('drive.google.com') >= 0) {
    return 'https://drive.google.com/uc?export=download&id=' + openMatch[1];
  }

  return url;
}

function fetchCsvText_(url) {
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('CSV取得に失敗しました。HTTP ' + code);
  }

  const blob = response.getBlob();
  const utf8Text = blob.getDataAsString('UTF-8');
  const sjisText = blob.getDataAsString('Shift_JIS');

  const utf8LooksHtml = looksLikeHtml_(utf8Text);
  const sjisLooksHtml = looksLikeHtml_(sjisText);

  if (!utf8LooksHtml && hasCsvLikeHeader_(utf8Text)) return utf8Text;
  if (!sjisLooksHtml && hasCsvLikeHeader_(sjisText)) return sjisText;
  if (!utf8LooksHtml) return utf8Text;
  if (!sjisLooksHtml) return sjisText;

  throw new Error('CSVではなくHTMLが返ってきました。共有設定かリンク形式を確認してください。');
}

function parseCsvWithFallback_(csvText) {
  return Utilities.parseCsv(csvText);
}

function buildSpreadsheetName_(sourceName) {
  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  const now = Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmmss');
  const cleanName = (sourceName || 'CSV').replace(/\.[^.]+$/, '');
  return '取引履歴_自動生成_' + cleanName + '_' + now;
}
