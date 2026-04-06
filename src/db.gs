function getOrCreateDbSpreadsheet_() {
  // 共有DBのスプレッドシートIDが指定されている場合は、それを最優先で使う
  if (DB_CONFIG.DB_SPREADSHEET_ID) {
    const shared = SpreadsheetApp.openById(DB_CONFIG.DB_SPREADSHEET_ID);
    getOrCreateDbSheet_(shared, DB_CONFIG.SHEET_TRANSACTIONS, DB_HEADERS);
    getOrCreateDbSheet_(shared, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);
    return shared;
  }

  // ID固定がない場合は従来どおり、名前検索 → なければ新規作成
  const existing = findDbSpreadsheet_();
  if (existing) {
    getOrCreateDbSheet_(existing, DB_CONFIG.SHEET_TRANSACTIONS, DB_HEADERS);
    getOrCreateDbSheet_(existing, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);
    return existing;
  }

  const ss = SpreadsheetApp.create(DB_CONFIG.DB_SPREADSHEET_NAME);
  const firstSheet = ss.getSheets()[0];
  firstSheet.setName(DB_CONFIG.SHEET_TRANSACTIONS);
  ensureHeaderRow_(firstSheet, DB_HEADERS);

  const logSheet = ss.insertSheet(DB_CONFIG.SHEET_IMPORT_LOGS);
  ensureHeaderRow_(logSheet, IMPORT_LOG_HEADERS);

  return ss;
}

function findDbSpreadsheet_() {
  const files = DriveApp.getFilesByName(DB_CONFIG.DB_SPREADSHEET_NAME);

  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return SpreadsheetApp.openById(file.getId());
    }
  }

  return null;
}

function getOrCreateDbSheet_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  ensureHeaderRow_(sheet, headers);
  return sheet;
}

function ensureHeaderRow_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const same =
    current.length >= headers.length &&
    headers.every(function(h, i) { return String(current[i] || '') === h; });

  if (!same) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function buildImportId_() {
  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  const ts = Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmmss');
  return 'import_' + ts + '_' + Utilities.getUuid().slice(0, 8);
}

function buildRowHash_(record) {
  const parts = [
    formatDateKeyForDb_(record['約定日']),
    formatDateKeyForDb_(record['受渡日']),
    text_(record['商品']),
    text_(record['銘柄コード']),
    text_(record['銘柄名']),
    text_(record['取引区分']),
    String(toNumber_(record['数量'])),
    String(toNumber_(record['単価'])),
    String(toNumber_(record['受渡金額/決済損益'])),
    String(toNumber_(record['手数料（税込）'])),
    normalizeCurrency_(record['決済通貨']),
  ];

  const raw = parts.join('\t');
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    raw,
    Utilities.Charset.UTF_8
  );

  return bytesToHex_(digest);
}

function bytesToHex_(bytes) {
  return bytes.map(function(b) {
    const v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function formatDateKeyForDb_(value) {
  if (!value) return '';
  const d = parseDate_(value);
  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function normalizeRecordForDb_(record, options) {
  const now = options.now || new Date();

  return {
    recordId: options.recordId || Utilities.getUuid(),
    importId: options.importId || '',
    sourceName: options.sourceName || '',
    sourceRowNo: options.sourceRowNo || '',
    rowHash: buildRowHash_(record),

    約定日: parseDate_(record['約定日']),
    受渡日: parseDate_(record['受渡日']),
    商品: text_(record['商品']),
    銘柄コード: text_(record['銘柄コード']),
    銘柄名: text_(record['銘柄名']),
    摘要: text_(record['摘要']),
    取引区分: text_(record['取引区分']),
    預り区分: text_(record['預り区分']),
    発行通貨: normalizeCurrency_(record['発行通貨']),
    数量: toNumber_(record['数量']),
    単価: toNumber_(record['単価']),
    '受渡金額/決済損益': toNumber_(record['受渡金額/決済損益']),
    '手数料（税込）': toNumber_(record['手数料（税込）']),
    レート: toNumber_(record['レート']),
    決済通貨: normalizeCurrency_(record['決済通貨']),
    '売買損益（円）': toNumber_(record['売買損益（円）']),

    createdAt: now,
    updatedAt: now,
    isActive: true,
  };
}

function dbRecordToRow_(dbRecord) {
  return DB_HEADERS.map(function(header) {
    return dbRecord[header];
  });
}

function appendRecordsToDb_(records, options) {
  const dbSs = getOrCreateDbSpreadsheet_();
  const txSheet = getOrCreateDbSheet_(dbSs, DB_CONFIG.SHEET_TRANSACTIONS, DB_HEADERS);

  const importId = options.importId || buildImportId_();
  const now = new Date();
  const existingHashes = getExistingRowHashSet_(txSheet);

  const rowsToAppend = [];
  let insertedCount = 0;
  let skippedCount = 0;

  records.forEach(function(record, index) {
    const dbRecord = normalizeRecordForDb_(record, {
      importId: importId,
      sourceName: options.sourceName || '',
      sourceRowNo: index + 1,
      now: now,
    });

    if (existingHashes[dbRecord.rowHash]) {
      skippedCount++;
      return;
    }

    existingHashes[dbRecord.rowHash] = true;
    rowsToAppend.push(dbRecordToRow_(dbRecord));
    insertedCount++;
  });

  if (rowsToAppend.length > 0) {
    txSheet
      .getRange(txSheet.getLastRow() + 1, 1, rowsToAppend.length, DB_HEADERS.length)
      .setValues(rowsToAppend);
  }

  appendImportLog_(dbSs, {
    importId: importId,
    importedAt: now,
    sourceName: options.sourceName || '',
    inputType: options.inputType || '',
    normalizedUrl: options.normalizedUrl || '',
    rowCount: records.length,
    insertedCount: insertedCount,
    skippedCount: skippedCount,
    alertCount: options.alertCount || 0,
  });

  return {
    dbSpreadsheetId: dbSs.getId(),
    dbSpreadsheetUrl: dbSs.getUrl(),
    importId: importId,
    rowCount: records.length,
    insertedCount: insertedCount,
    skippedCount: skippedCount,
  };
}

function getExistingRowHashSet_(sheet) {
  const hashCol = DB_HEADERS.indexOf('rowHash') + 1;
  const lastRow = sheet.getLastRow();
  const result = {};

  if (lastRow <= 1) {
    return result;
  }

  const values = sheet.getRange(2, hashCol, lastRow - 1, 1).getValues();
  values.forEach(function(row) {
    const hash = text_(row[0]);
    if (hash) {
      result[hash] = true;
    }
  });

  return result;
}

function appendImportLog_(dbSs, log) {
  const logSheet = getOrCreateDbSheet_(dbSs, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);
  const row = IMPORT_LOG_HEADERS.map(function(header) {
    return log[header];
  });

  logSheet.getRange(logSheet.getLastRow() + 1, 1, 1, IMPORT_LOG_HEADERS.length).setValues([row]);
}

function readDbRecords_() {
  const dbSs = getOrCreateDbSpreadsheet_();
  const txSheet = getOrCreateDbSheet_(dbSs, DB_CONFIG.SHEET_TRANSACTIONS, DB_HEADERS);
  const lastRow = txSheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  const values = txSheet.getRange(2, 1, lastRow - 1, DB_HEADERS.length).getValues();

  return values
    .map(function(row) {
      const obj = {};
      DB_HEADERS.forEach(function(header, i) {
        obj[header] = row[i];
      });
      return obj;
    })
    .filter(function(obj) {
      return obj.isActive !== false && String(obj.isActive).toUpperCase() !== 'FALSE';
    })
    .map(function(obj) {
      return {
        約定日: parseDate_(obj['約定日']),
        受渡日: parseDate_(obj['受渡日']),
        商品: text_(obj['商品']),
        銘柄コード: text_(obj['銘柄コード']),
        銘柄名: text_(obj['銘柄名']),
        摘要: text_(obj['摘要']),
        取引区分: text_(obj['取引区分']),
        預り区分: text_(obj['預り区分']),
        発行通貨: normalizeCurrency_(obj['発行通貨']),
        数量: toNumber_(obj['数量']),
        単価: toNumber_(obj['単価']),
        '受渡金額/決済損益': toNumber_(obj['受渡金額/決済損益']),
        '手数料（税込）': toNumber_(obj['手数料（税込）']),
        レート: toNumber_(obj['レート']),
        決済通貨: normalizeCurrency_(obj['決済通貨']),
        '売買損益（円）': toNumber_(obj['売買損益（円）']),
      };
    });
}

function buildOutputSheetsFromDbRecords_(ss, records) {
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
