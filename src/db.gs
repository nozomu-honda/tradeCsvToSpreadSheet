function getDbTargets_() {
  const targets = DB_CONFIG.TARGET_DBS || [];
  if (!targets.length) {
    throw new Error('DB_CONFIG.TARGET_DBS が空です。');
  }
  return targets;
}

function getDefaultDbTargetKey_() {
  const targets = getDbTargets_();
  const defaultKey = text_(DB_CONFIG.DEFAULT_TARGET_DB_KEY);
  if (!defaultKey) {
    return targets[0].key;
  }
  const found = targets.some(function(target) {
    return target.key === defaultKey;
  });
  return found ? defaultKey : targets[0].key;
}

function resolveDbTarget_(targetDbKey) {
  const targets = getDbTargets_();
  const key = text_(targetDbKey) || getDefaultDbTargetKey_();

  const target = targets.find(function(item) {
    return item.key === key;
  });

  if (!target) {
    throw new Error('存在しないDBです: ' + key);
  }

  if (!text_(target.label)) {
    throw new Error('DBラベルが未設定です: ' + key);
  }

  if (!text_(target.spreadsheetId) && !text_(target.spreadsheetName)) {
    throw new Error('DBの spreadsheetId か spreadsheetName を設定してください: ' + key);
  }

  return {
    key: key,
    label: target.label,
    spreadsheetId: text_(target.spreadsheetId),
    spreadsheetName: text_(target.spreadsheetName),
  };
}

function getDbTargetList_() {
  return getDbTargets_().map(function(target) {
    return {
      key: target.key,
      label: target.label,
      spreadsheetId: text_(target.spreadsheetId),
      spreadsheetName: text_(target.spreadsheetName),
    };
  });
}

function getOrCreateDbSpreadsheet_(targetDbKey) {
  const target = resolveDbTarget_(targetDbKey);

  if (target.spreadsheetId) {
    const fixed = SpreadsheetApp.openById(target.spreadsheetId);
    getOrCreateDbSheet_(fixed, DB_CONFIG.SHEET_TRANSACTIONS, DB_HEADERS);
    getOrCreateDbSheet_(fixed, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);
    return fixed;
  }

  const existing = findDbSpreadsheet_(target);
  if (existing) {
    getOrCreateDbSheet_(existing, DB_CONFIG.SHEET_TRANSACTIONS, DB_HEADERS);
    getOrCreateDbSheet_(existing, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);
    return existing;
  }

  const ss = SpreadsheetApp.create(target.spreadsheetName);
  const firstSheet = ss.getSheets()[0];
  firstSheet.setName(DB_CONFIG.SHEET_TRANSACTIONS);
  ensureHeaderRow_(firstSheet, DB_HEADERS);

  const logSheet = ss.insertSheet(DB_CONFIG.SHEET_IMPORT_LOGS);
  ensureHeaderRow_(logSheet, IMPORT_LOG_HEADERS);

  return ss;
}

function findDbSpreadsheet_(target) {
  const files = DriveApp.getFilesByName(target.spreadsheetName);

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
    String(record['国内消費税等（円）'] === '' ? '' : toNumber_(record['国内消費税等（円）'])),
    String(record['現地源泉税（円）'] === '' ? '' : toNumber_(record['現地源泉税（円）'])),
    String(record['国内源泉所得税（円）'] === '' ? '' : toNumber_(record['国内源泉所得税（円）'])),
    String(record['国内源泉地方税（円）'] === '' ? '' : toNumber_(record['国内源泉地方税（円）'])),
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
    '国内消費税等（円）': toOptionalNumber_(record['国内消費税等（円）']),
    '現地源泉税（円）': toOptionalNumber_(record['現地源泉税（円）']),
    '国内源泉所得税（円）': toOptionalNumber_(record['国内源泉所得税（円）']),
    '国内源泉地方税（円）': toOptionalNumber_(record['国内源泉地方税（円）']),

    createdAt: now,
    updatedAt: now,
    rolledBackAt: '',
    isActive: true,
  };
}

function dbRecordToRow_(dbRecord) {
  return DB_HEADERS.map(function(header) {
    return dbRecord[header];
  });
}

function appendRecordsToDb_(records, options) {
  const target = resolveDbTarget_(options.targetDbKey);
  const dbSs = getOrCreateDbSpreadsheet_(target.key);
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
    targetDbKey: target.key,
    targetDbLabel: target.label,
    sourceName: options.sourceName || '',
    inputType: options.inputType || '',
    normalizedUrl: options.normalizedUrl || '',
    rowCount: records.length,
    insertedCount: insertedCount,
    skippedCount: skippedCount,
    alertCount: options.alertCount || 0,
    isRolledBack: false,
    rolledBackAt: '',
    rolledBackRecordCount: '',
  });

  return {
    dbSpreadsheetId: dbSs.getId(),
    dbSpreadsheetUrl: dbSs.getUrl(),
    dbTargetKey: target.key,
    dbTargetLabel: target.label,
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

function readDbRecords_(targetDbKey) {
  const dbSs = getOrCreateDbSpreadsheet_(targetDbKey);
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
        '国内消費税等（円）': toOptionalNumber_(obj['国内消費税等（円）']),
        '現地源泉税（円）': toOptionalNumber_(obj['現地源泉税（円）']),
        '国内源泉所得税（円）': toOptionalNumber_(obj['国内源泉所得税（円）']),
        '国内源泉地方税（円）': toOptionalNumber_(obj['国内源泉地方税（円）']),
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

function readImportLogs_(targetDbKey) {
  const dbSs = getOrCreateDbSpreadsheet_(targetDbKey);
  const logSheet = getOrCreateDbSheet_(dbSs, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);
  const lastRow = logSheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  const values = logSheet.getRange(2, 1, lastRow - 1, IMPORT_LOG_HEADERS.length).getValues();

  return values.map(function(row, index) {
    const obj = {};
    IMPORT_LOG_HEADERS.forEach(function(header, i) {
      obj[header] = row[i];
    });
    obj._sheetRow = index + 2;
    return obj;
  });
}

function listRecentImports_(targetDbKey, maxCount) {
  const target = resolveDbTarget_(targetDbKey);
  const count = maxCount || DB_CONFIG.MAX_RECENT_IMPORTS || 30;
  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';

  return readImportLogs_(target.key)
    .filter(function(log) {
      return text_(log.importId) !== '';
    })
    .sort(function(a, b) {
      return new Date(b.importedAt || 0).getTime() - new Date(a.importedAt || 0).getTime();
    })
    .slice(0, count)
    .map(function(log) {
      const isRolledBack =
        log.isRolledBack === true ||
        String(log.isRolledBack).toUpperCase() === 'TRUE';

      const importedAtText = log.importedAt
        ? Utilities.formatDate(new Date(log.importedAt), tz, 'yyyy/MM/dd HH:mm:ss')
        : '';

      const rolledBackAtText = log.rolledBackAt
        ? Utilities.formatDate(new Date(log.rolledBackAt), tz, 'yyyy/MM/dd HH:mm:ss')
        : '';

      const sourceName = text_(log.sourceName) || '(sourceName空欄)';
      const insertedCount = toNumber_(log.insertedCount);

      return {
        importId: text_(log.importId),
        importedAtText: importedAtText,
        targetDbKey: target.key,
        targetDbLabel: target.label,
        sourceName: sourceName,
        rowCount: toNumber_(log.rowCount),
        insertedCount: insertedCount,
        skippedCount: toNumber_(log.skippedCount),
        isRolledBack: isRolledBack,
        rolledBackAtText: rolledBackAtText,
        rolledBackRecordCount: toNumber_(log.rolledBackRecordCount),
        displayLabel:
          text_(log.importId) +
          ' / ' + sourceName +
          ' / 追加:' + insertedCount +
          ' / ' + importedAtText +
          (isRolledBack ? ' / ロールバック済み' : '')
      };
    });
}

function rollbackImport_(targetDbKey, importId) {
  const target = resolveDbTarget_(targetDbKey);
  const rollbackImportId = text_(importId);

  if (!rollbackImportId) {
    throw new Error('ロールバック対象の取込IDを選択してください。');
  }

  const dbSs = getOrCreateDbSpreadsheet_(target.key);
  const txSheet = getOrCreateDbSheet_(dbSs, DB_CONFIG.SHEET_TRANSACTIONS, DB_HEADERS);
  const logSheet = getOrCreateDbSheet_(dbSs, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);

  const logs = readImportLogs_(target.key);
  const targetLog = logs.find(function(log) {
    return text_(log.importId) === rollbackImportId;
  });

  if (!targetLog) {
    throw new Error('指定した取込IDが見つかりません: ' + rollbackImportId);
  }

  const alreadyRolledBack =
    targetLog.isRolledBack === true ||
    String(targetLog.isRolledBack).toUpperCase() === 'TRUE';

  if (alreadyRolledBack) {
    throw new Error('この取込IDはすでにロールバック済みです: ' + rollbackImportId);
  }

  const txLastRow = txSheet.getLastRow();
  let rolledBackCount = 0;

  if (txLastRow > 1) {
    const range = txSheet.getRange(2, 1, txLastRow - 1, DB_HEADERS.length);
    const values = range.getValues();
    const importIdCol = DB_HEADERS.indexOf('importId');
    const isActiveCol = DB_HEADERS.indexOf('isActive');
    const updatedAtCol = DB_HEADERS.indexOf('updatedAt');
    const rolledBackAtCol = DB_HEADERS.indexOf('rolledBackAt');
    const now = new Date();

    values.forEach(function(row) {
      const rowImportId = text_(row[importIdCol]);
      const isActive = !(row[isActiveCol] === false || String(row[isActiveCol]).toUpperCase() === 'FALSE');

      if (rowImportId === rollbackImportId && isActive) {
        row[isActiveCol] = false;
        row[updatedAtCol] = now;
        row[rolledBackAtCol] = now;
        rolledBackCount++;
      }
    });

    range.setValues(values);
  }

  if (rolledBackCount === 0) {
    throw new Error('ロールバック対象の有効レコードがありません: ' + rollbackImportId);
  }

  const logLastRow = logSheet.getLastRow();
  if (logLastRow > 1) {
    const logRange = logSheet.getRange(2, 1, logLastRow - 1, IMPORT_LOG_HEADERS.length);
    const logValues = logRange.getValues();
    const importedIdCol = IMPORT_LOG_HEADERS.indexOf('importId');
    const isRolledBackCol = IMPORT_LOG_HEADERS.indexOf('isRolledBack');
    const rolledBackAtCol = IMPORT_LOG_HEADERS.indexOf('rolledBackAt');
    const rolledBackRecordCountCol = IMPORT_LOG_HEADERS.indexOf('rolledBackRecordCount');
    const now = new Date();

    logValues.forEach(function(row) {
      if (text_(row[importedIdCol]) === rollbackImportId) {
        row[isRolledBackCol] = true;
        row[rolledBackAtCol] = now;
        row[rolledBackRecordCountCol] = rolledBackCount;
      }
    });

    logRange.setValues(logValues);
  }

  return {
    ok: true,
    dbSpreadsheetId: dbSs.getId(),
    dbSpreadsheetUrl: dbSs.getUrl(),
    dbTargetKey: target.key,
    dbTargetLabel: target.label,
    importId: rollbackImportId,
    rolledBackCount: rolledBackCount,
  };
}

function resetDbData_(targetDbKey) {
  const target = resolveDbTarget_(targetDbKey);
  const dbSs = getOrCreateDbSpreadsheet_(target.key);
  const txSheet = getOrCreateDbSheet_(dbSs, DB_CONFIG.SHEET_TRANSACTIONS, DB_HEADERS);
  const logSheet = getOrCreateDbSheet_(dbSs, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);

  const deletedTransactionCount = clearSheetDataKeepHeader_(txSheet, DB_HEADERS);
  const deletedImportLogCount = clearSheetDataKeepHeader_(logSheet, IMPORT_LOG_HEADERS);

  return {
    ok: true,
    dbSpreadsheetId: dbSs.getId(),
    dbSpreadsheetUrl: dbSs.getUrl(),
    dbTargetKey: target.key,
    dbTargetLabel: target.label,
    deletedTransactionCount: deletedTransactionCount,
    deletedImportLogCount: deletedImportLogCount,
  };
}

function clearSheetDataKeepHeader_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  const deleteCount = Math.max(lastRow - 1, 0);

  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  return deleteCount;
}