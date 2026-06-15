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
    folderId: text_(target.folderId || DB_CONFIG.DB_FOLDER_ID || ''),
  };
}

function getDbTargetList_() {
  return getDbTargets_()
    .filter(function(target) {
      return target.uiVisible !== false;
    })
    .map(function(target) {
      return {
        key: target.key,
        label: target.label,
        spreadsheetId: text_(target.spreadsheetId),
        spreadsheetName: text_(target.spreadsheetName),
      };
    });
}

function listDbSpreadsheetFilesInFolder_() {
  const folder = getDbFolder_({ folderId: DB_CONFIG.DB_FOLDER_ID });
  if (!folder) {
    throw new Error('DB_CONFIG.DB_FOLDER_ID が未設定です。');
  }

  const files = folder.getFiles();
  const result = [];

  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() !== MimeType.GOOGLE_SHEETS) {
      continue;
    }

    result.push({
      spreadsheetId: file.getId(),
      spreadsheetName: file.getName(),
      spreadsheetUrl: file.getUrl(),
    });
  }

  result.sort(function(a, b) {
    return compareText_(a.spreadsheetName, b.spreadsheetName);
  });

  return result;
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

  return createDbSpreadsheet_(target);
}

function findDbSpreadsheet_(target) {
  const folder = getDbFolder_(target);
  const files = folder
    ? folder.getFilesByName(target.spreadsheetName)
    : DriveApp.getFilesByName(target.spreadsheetName);

  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return SpreadsheetApp.openById(file.getId());
    }
  }

  return null;
}

function openDbSpreadsheetById_(spreadsheetId) {
  const id = text_(spreadsheetId);
  if (!id) {
    throw new Error('DBファイルを選択してください。');
  }

  return SpreadsheetApp.openById(id);
}

function getDbFolder_(target) {
  const folderId = text_((target && target.folderId) || DB_CONFIG.DB_FOLDER_ID || '');
  if (!folderId) {
    return null;
  }

  try {
    return DriveApp.getFolderById(folderId);
  } catch (e) {
    throw new Error(
      'DB作成先フォルダを開けません。DB_CONFIG.DB_FOLDER_ID または target.folderId を確認してください。' +
      ' folderId=' + folderId +
      ' / error=' + (e && e.message ? e.message : String(e))
    );
  }
}

function createDbSpreadsheet_(target) {
  const ss = SpreadsheetApp.create(target.spreadsheetName);

  const folder = getDbFolder_(target);
  if (folder) {
    const file = DriveApp.getFileById(ss.getId());
    file.moveTo(folder);
  }

  const firstSheet = ss.getSheets()[0];
  firstSheet.setName(DB_CONFIG.SHEET_TRANSACTIONS);
  ensureHeaderRow_(firstSheet, DB_HEADERS);

  const logSheet = ss.insertSheet(DB_CONFIG.SHEET_IMPORT_LOGS);
  ensureHeaderRow_(logSheet, IMPORT_LOG_HEADERS);

  return ss;
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

function assertDbSheetCompatible_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return;
  }

  const rowCount = Math.min(lastRow - 1, 50);
  const values = sheet.getRange(2, 1, rowCount, headers.length).getValues();

  const idx = {
    principalReturn: headers.indexOf('元本払戻金'),
    domesticFee: headers.indexOf('国内手数料（円）'),
    foreignFee: headers.indexOf('現地手数料（円）'),
    createdAt: headers.indexOf('createdAt'),
    updatedAt: headers.indexOf('updatedAt'),
    isActive: headers.indexOf('isActive')
  };

  values.forEach(function(row, i) {
    const rowNo = i + 2;
    const issues = [];

    if (idx.principalReturn >= 0 && row[idx.principalReturn] instanceof Date) {
      issues.push('元本払戻金列に日時が入っています');
    }

    if (idx.domesticFee >= 0 && row[idx.domesticFee] instanceof Date) {
      issues.push('国内手数料（円）列に日時が入っています');
    }

    if (idx.foreignFee >= 0 && row[idx.foreignFee] instanceof Date) {
      issues.push('現地手数料（円）列に日時が入っています');
    }

    if (idx.createdAt >= 0) {
      const v = row[idx.createdAt];
      if (v !== '' && v !== null && v !== undefined && !(v instanceof Date)) {
        issues.push('createdAt列が日時ではありません');
      }
    }

    if (idx.updatedAt >= 0) {
      const v = row[idx.updatedAt];
      if (v !== '' && v !== null && v !== undefined && !(v instanceof Date)) {
        issues.push('updatedAt列が日時ではありません');
      }
    }

    if (idx.isActive >= 0) {
      const v = row[idx.isActive];
      const ok =
        v === '' ||
        v === null ||
        v === undefined ||
        v === true ||
        v === false ||
        String(v).toUpperCase() === 'TRUE' ||
        String(v).toUpperCase() === 'FALSE';
      if (!ok) {
        issues.push('isActive列がbooleanではありません');
      }
    }

    if (issues.length > 0) {
      throw new Error(
        'DB側のデータレイアウトが現行仕様と一致していない可能性があります。' +
        '旧レイアウトのDBを読んでいる可能性があります。' +
        ' 対象シート: ' + sheet.getName() +
        ' / 行: ' + rowNo +
        ' / 問題: ' + issues.join(', ') +
        '。選択中DBをリセットして再取込してください。'
      );
    }
  });
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
    String(record['元本払戻金'] === true ? 1 : ''),
    String(record['国内手数料（円）'] === '' ? '' : toNumber_(record['国内手数料（円）'])),
    String(record['現地手数料（円）'] === '' ? '' : toNumber_(record['現地手数料（円）'])),
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
    '元本払戻金': toNullableBooleanFlag_(record['元本払戻金'], '元本払戻金'),
    '国内手数料（円）': toOptionalNumber_(record['国内手数料（円）']),
    '現地手数料（円）': toOptionalNumber_(record['現地手数料（円）']),

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

  assertDbSheetCompatible_(txSheet, DB_HEADERS);

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

  assertDbSheetCompatible_(txSheet, DB_HEADERS);

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
        '元本払戻金': toNullableBooleanFlag_(obj['元本払戻金'], '元本払戻金'),
        '国内手数料（円）': toOptionalNumber_(obj['国内手数料（円）']),
        '現地手数料（円）': toOptionalNumber_(obj['現地手数料（円）']),
      };
    });
}

function buildOutputSheetsFromDbRecords_(ss, records) {
  const alerts = [];

  const japanStocks = records
    .filter(function(r) { return r['商品'] === '株式'; })
    .sort(sortTradeRows_);

  const usStocks = records
    .filter(function(r) { return r['商品'] === '外株'; })
    .sort(sortTradeRows_);

  const foreignBonds = records
    .filter(function(r) { return r['商品'] === '外債'; })
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
  writeSheet_(ss, CONFIG.OUTPUT_FOREIGN_BOND, TRADE_HEADERS, buildTradeRows_(foreignBonds, alerts), true);
  writeSheet_(ss, CONFIG.OUTPUT_FUND, TRADE_HEADERS, buildTradeRows_(funds, alerts), true);
  writeSheet_(ss, CONFIG.OUTPUT_CASH_JPY, CASH_HEADERS, buildCashRows_(cashJpy), false);
  writeSheet_(ss, CONFIG.OUTPUT_CASH_USD, CASH_HEADERS, buildCashRows_(cashUsd), false);
  reorderOutputSheets_(ss);

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName(),
    alerts: alerts,
    counts: {
      all: records.length,
      japanStocks: japanStocks.length,
      usStocks: usStocks.length,
      foreignBonds: foreignBonds.length,
      funds: funds.length,
      cashJpy: cashJpy.length,
      cashUsd: cashUsd.length,
    }
  };

}

function readImportLogs_(targetDbKey) {
  const dbSs = getOrCreateDbSpreadsheet_(targetDbKey);
  return readImportLogsFromSpreadsheet_(dbSs, true);
}

function readImportLogsFromSpreadsheet_(dbSs, createIfMissing) {
  let logSheet = dbSs.getSheetByName(DB_CONFIG.SHEET_IMPORT_LOGS);

  if (!logSheet) {
    if (!createIfMissing) {
      return [];
    }
    logSheet = getOrCreateDbSheet_(dbSs, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);
  }

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
  const dbSs = getOrCreateDbSpreadsheet_(target.key);
  return listRecentImportsFromSpreadsheet_(dbSs, maxCount, target);
}

function listRecentImportsBySpreadsheetId_(spreadsheetId, maxCount) {
  const dbSs = openDbSpreadsheetById_(spreadsheetId);
  return listRecentImportsFromSpreadsheet_(dbSs, maxCount, {
    key: '',
    label: dbSs.getName(),
  });
}

function listRecentImportsFromSpreadsheet_(dbSs, maxCount, fallbackTarget) {
  const count = maxCount || DB_CONFIG.MAX_RECENT_IMPORTS || 30;
  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  const fallback = fallbackTarget || {};

  return readImportLogsFromSpreadsheet_(dbSs, false)
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
        targetDbKey: text_(log.targetDbKey) || text_(fallback.key),
        targetDbLabel: text_(log.targetDbLabel) || text_(fallback.label) || dbSs.getName(),
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
  const dbSs = getOrCreateDbSpreadsheet_(target.key);
  return rollbackImportInSpreadsheet_(dbSs, target, importId);
}

function rollbackImportBySpreadsheetId_(spreadsheetId, importId) {
  const dbSs = openDbSpreadsheetById_(spreadsheetId);
  return rollbackImportInSpreadsheet_(dbSs, {
    key: '',
    label: dbSs.getName(),
  }, importId);
}

function rollbackImportInSpreadsheet_(dbSs, target, importId) {
  const rollbackImportId = text_(importId);

  if (!rollbackImportId) {
    throw new Error('ロールバック対象の取込IDを選択してください。');
  }

  const txSheet = dbSs.getSheetByName(DB_CONFIG.SHEET_TRANSACTIONS);
  const logSheet = dbSs.getSheetByName(DB_CONFIG.SHEET_IMPORT_LOGS);

  if (!txSheet || !logSheet) {
    throw new Error(
      '選択したファイルにDBシートが見つかりません。' +
      ' 必要なシート: ' + DB_CONFIG.SHEET_TRANSACTIONS + ', ' + DB_CONFIG.SHEET_IMPORT_LOGS +
      ' / ファイル: ' + dbSs.getName()
    );
  }

  assertDbSheetCompatible_(txSheet, DB_HEADERS);

  const logs = readImportLogsFromSpreadsheet_(dbSs, false);
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
    dbTargetKey: text_(target.key) || text_(targetLog.targetDbKey),
    dbTargetLabel: text_(target.label) || text_(targetLog.targetDbLabel) || dbSs.getName(),
    importId: rollbackImportId,
    rolledBackCount: rolledBackCount,
  };
}

function resetDbData_(targetDbKey) {
  const target = resolveDbTarget_(targetDbKey);
  const dbSs = getOrCreateDbSpreadsheet_(target.key);

  const txDeletedCount = recreateSheetWithHeaders_(dbSs, DB_CONFIG.SHEET_TRANSACTIONS, DB_HEADERS);
  const logDeletedCount = recreateSheetWithHeaders_(dbSs, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);

  return {
    ok: true,
    dbSpreadsheetId: dbSs.getId(),
    dbSpreadsheetUrl: dbSs.getUrl(),
    dbTargetKey: target.key,
    dbTargetLabel: target.label,
    deletedTransactionCount: txDeletedCount,
    deletedImportLogCount: logDeletedCount,
  };
}

function recreateSheetWithHeaders_(ss, sheetName, headers) {
  let oldSheet = ss.getSheetByName(sheetName);
  let deletedCount = 0;

  if (oldSheet) {
    deletedCount = Math.max(oldSheet.getLastRow() - 1, 0);
  }

  if (!oldSheet) {
    const newSheet = ss.insertSheet(sheetName);
    newSheet.clear();
    newSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return deletedCount;
  }

  const newSheet = ss.insertSheet(sheetName + '_tmp_' + Utilities.getUuid().slice(0, 8));
  newSheet.clear();
  newSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  ss.deleteSheet(oldSheet);
  newSheet.setName(sheetName);

  return deletedCount;
}
