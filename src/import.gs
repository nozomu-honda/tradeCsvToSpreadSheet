function createSpreadsheetFromCsvUrl_(csvUrl, options) {
  return createSpreadsheetFromCsvUrlUsingDb_(csvUrl, options);
}

function createSpreadsheetFromCsvText_(csvText, sourceName, normalizedUrl, options) {
  return createSpreadsheetFromCsvTextUsingDb_(csvText, sourceName, normalizedUrl, options);
}

function createSpreadsheetFromSourceSpreadsheet_(spreadsheetUrlOrId, options) {
  return createSpreadsheetFromSourceSpreadsheetUsingDb_(spreadsheetUrlOrId, options);
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

  sourceSheet
    .getRange(1, 1, paddedRows.length, paddedRows[0].length)
    .setValues(paddedRows);

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

  const ss = SpreadsheetApp.create(buildSpreadsheetName_(sourceName));
  const sourceSheet = ss.getSheets()[0];
  sourceSheet.setName(CONFIG.SOURCE_SHEET_NAME);
  sourceSheet
    .getRange(1, 1, paddedRows.length, paddedRows[0].length)
    .setValues(paddedRows);

  const records = readInputRecords_(sourceSheet);

  const inputAlerts = [];
  collectInputAlerts_(records, inputAlerts);

  const targetDbKey =
    options && options.targetDbKey
      ? options.targetDbKey
      : getDefaultDbTargetKey_();

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
  const ss = SpreadsheetApp.create(buildSpreadsheetName_(sourceSs.getName()));
  const outputSourceSheet = ss.getSheets()[0];
  outputSourceSheet.setName(CONFIG.SOURCE_SHEET_NAME);
  outputSourceSheet
    .getRange(1, 1, paddedRows.length, paddedRows[0].length)
    .setValues(paddedRows);

  const records = readInputRecords_(outputSourceSheet);

  const inputAlerts = [];
  collectInputAlerts_(records, inputAlerts);

  const targetDbKey =
    options && options.targetDbKey
      ? options.targetDbKey
      : getDefaultDbTargetKey_();

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

  const domestic = records
    .filter(function(r) { return ['株式', '投信'].includes(r['商品']); })
    .sort(sortTradeRows_);

  const foreign = records
    .filter(function(r) { return ['外株', '外債'].includes(r['商品']); })
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

  writeSheet_(ss, CONFIG.OUTPUT_DOMESTIC, TRADE_HEADERS, buildTradeRows_(domestic, alerts), true);
  writeSheet_(ss, CONFIG.OUTPUT_FOREIGN, TRADE_HEADERS, buildTradeRows_(foreign, alerts), true);
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
      domestic: domestic.length,
      foreign: foreign.length,
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
