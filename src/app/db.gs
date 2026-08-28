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

  const folderId = shouldUseCiE2eRootDbFolder_(target)
    ? ''
    : text_(target.folderId || DB_CONFIG.DB_FOLDER_ID || '');

  return {
    key: key,
    label: target.label,
    dbKind: getDbTargetKind_(key),
    dbKindLabel: getDbTargetKindLabel_(key),
    spreadsheetId: text_(target.spreadsheetId),
    spreadsheetName: text_(target.spreadsheetName),
    folderId: folderId,
  };
}

function getDbTargetList_() {
  return getDbTargets_()
    .filter(function(target) {
      return target.uiVisible !== false;
    })
    .map(function(target) {
      return serializeDbTargetForUi_(target, { preferImportLabel: true });
    });
}

function getResetDbTargetList_() {
  return getDbTargets_().map(serializeDbTargetForUi_);
}

function serializeDbTargetForUi_(target, options) {
  const key = text_(target.key);
  const label = options && options.preferImportLabel
    ? text_(target.importLabel) || target.label
    : target.label;
  const dbKindLabel = getDbTargetKindLabel_(key);

  return {
    key: key,
    label: label,
    dbKind: getDbTargetKind_(key),
    dbKindLabel: dbKindLabel,
    operationLabel: dbKindLabel + ': ' + label + ' (' + key + ')',
    spreadsheetId: text_(target.spreadsheetId),
    spreadsheetName: text_(target.spreadsheetName),
  };
}

function isRakutenDbTargetKey_(targetDbKey) {
  return text_(targetDbKey).indexOf('rakuten_') === 0;
}

function getDbTargetKind_(targetDbKey) {
  return isRakutenDbTargetKey_(targetDbKey) ? 'rakuten' : 'nomura';
}

function getDbTargetKindLabel_(targetDbKey) {
  return getDbTargetKind_(targetDbKey) === 'rakuten' ? '楽天DB' : '野村DB';
}

function getTransactionHeadersForTargetKey_(targetDbKey) {
  return isRakutenDbTargetKey_(targetDbKey) ? RAKUTEN_DB_HEADERS : DB_HEADERS;
}

function getOrCreateDbSpreadsheet_(targetDbKey, options) {
  const target = resolveDbTarget_(targetDbKey);
  if (options && options.e2eUseRootStorage && isTestDbTarget_(target.key)) {
    target.folderId = '';
  }
  const transactionHeaders = getTransactionHeadersForTargetKey_(target.key);
  const shouldRejectExistingDataHeaderMismatch =
    isRakutenDbTargetKey_(target.key) &&
    !(options && options.allowHeaderMismatchForReset);

  if (target.spreadsheetId) {
    const fixed = SpreadsheetApp.openById(target.spreadsheetId);
    getOrCreateDbSheet_(fixed, DB_CONFIG.SHEET_TRANSACTIONS, transactionHeaders, {
      rejectExistingDataHeaderMismatch: shouldRejectExistingDataHeaderMismatch,
      target: target,
      spreadsheet: fixed,
    });
    getOrCreateDbSheet_(fixed, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);
    return fixed;
  }

  const saved = openSavedDbSpreadsheet_(target);
  if (saved) {
    getOrCreateDbSheet_(saved, DB_CONFIG.SHEET_TRANSACTIONS, transactionHeaders, {
      rejectExistingDataHeaderMismatch: shouldRejectExistingDataHeaderMismatch,
      target: target,
      spreadsheet: saved,
    });
    getOrCreateDbSheet_(saved, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);
    return saved;
  }

  const existing = findDbSpreadsheet_(target);
  if (existing) {
    rememberDbSpreadsheet_(target, existing);
    getOrCreateDbSheet_(existing, DB_CONFIG.SHEET_TRANSACTIONS, transactionHeaders, {
      rejectExistingDataHeaderMismatch: shouldRejectExistingDataHeaderMismatch,
      target: target,
      spreadsheet: existing,
    });
    getOrCreateDbSheet_(existing, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);
    return existing;
  }

  return createDbSpreadsheet_(target);
}

function openSavedDbSpreadsheet_(target) {
  const propertyKey = getDbSpreadsheetPropertyKey_(target);
  if (!propertyKey) {
    return null;
  }

  const props = PropertiesService.getScriptProperties();
  const savedId = text_(props.getProperty(propertyKey));
  if (!savedId) {
    return null;
  }

  try {
    return SpreadsheetApp.openById(savedId);
  } catch (e) {
    props.deleteProperty(propertyKey);
    return null;
  }
}

function rememberDbSpreadsheet_(target, ss) {
  const propertyKey = getDbSpreadsheetPropertyKey_(target);
  if (!propertyKey || !ss) {
    return;
  }

  PropertiesService.getScriptProperties().setProperty(propertyKey, ss.getId());
}

function getDbSpreadsheetPropertyKey_(target) {
  const key = text_(target && target.key);
  if (!key || text_(target && target.spreadsheetId)) {
    return '';
  }
  return 'DB_SPREADSHEET_ID_' + key.toUpperCase();
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
  const transactionHeaders = getTransactionHeadersForTargetKey_(target.key);

  const folder = getDbFolder_(target);
  if (folder) {
    const file = DriveApp.getFileById(ss.getId());
    file.moveTo(folder);
  }

  const firstSheet = ss.getSheets()[0];
  firstSheet.setName(DB_CONFIG.SHEET_TRANSACTIONS);
  ensureHeaderRow_(firstSheet, transactionHeaders);

  const logSheet = ss.insertSheet(DB_CONFIG.SHEET_IMPORT_LOGS);
  ensureHeaderRow_(logSheet, IMPORT_LOG_HEADERS);

  rememberDbSpreadsheet_(target, ss);

  return ss;
}

function getOrCreateDbSheet_(ss, sheetName, headers, options) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  ensureHeaderRow_(sheet, headers, options);
  return sheet;
}

function ensureHeaderRow_(sheet, headers, options) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const same =
    current.length >= headers.length &&
    headers.every(function(h, i) { return String(current[i] || '') === h; });

  if (!same) {
    if (options && options.rejectExistingDataHeaderMismatch && sheet.getLastRow() > 1) {
      throw new Error(
        '楽天DBのヘッダーが現行仕様と一致しません。' +
        ' 既存データを保持したままヘッダーだけを上書きすると列ずれが発生するため、処理を停止しました。' +
        ' 対象DB: ' + text_(options.target && options.target.key) +
        ' / 対象ファイル: ' + text_(options.spreadsheet && options.spreadsheet.getName && options.spreadsheet.getName()) +
        ' / URL: ' + text_(options.spreadsheet && options.spreadsheet.getUrl && options.spreadsheet.getUrl()) +
        ' / 対象シート: ' + sheet.getName() +
        '。楽天DBをリセットしてから再取込してください。'
      );
    }
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

function dbRecordToRowByHeaders_(dbRecord, headers) {
  return headers.map(function(header) {
    return dbRecord[header];
  });
}

function normalizeRakutenRecordForDb_(record, options) {
  const base = normalizeRecordForDb_(record, options);
  const source = record.__rakutenSource || {};
  const tx = text_(base['取引区分']);
  const product = text_(base['商品']);
  const isDividend = tx === '入金（配当金）' || tx === '入金（分配金）';
  const isCash = product === '現金';
  const sourceGrossAmount = source.hasOwnProperty('grossAmount') ? toOptionalNumber_(source.grossAmount) : '';
  const sourceTax = source.hasOwnProperty('tax') ? toOptionalNumber_(source.tax) : '';
  const description = base['元本払戻金'] === true && !isRakutenPrincipalReturnText_(text_(base['摘要']))
    ? (text_(base['摘要']) ? text_(base['摘要']) + ' / 元本払戻金' : '元本払戻金')
    : text_(base['摘要']);

  return {
    recordId: base.recordId,
    importId: base.importId,
    sourceName: base.sourceName,
    sourceRowNo: base.sourceRowNo,
    rowHash: base.rowHash,
    sourceType: text_(options.sourceType),
    broker: '楽天',
    tradeDate: isCash || isDividend ? '' : base['約定日'],
    settlementDate: isCash || isDividend ? '' : base['受渡日'],
    paymentDate: isDividend ? base['受渡日'] : '',
    cashDate: isCash ? base['受渡日'] : '',
    product: product,
    rawProduct: text_(source.rawProduct) || text_(record['摘要']) || product,
    symbolCode: text_(base['銘柄コード']),
    symbolName: text_(base['銘柄名']),
    rawTradeType: text_(source.rawTradeType) || tx,
    normalizedTradeType: tx,
    accountType: text_(base['預り区分']),
    market: text_(source.market),
    currency: normalizeCurrency_(base['発行通貨']),
    settlementCurrency: normalizeCurrency_(base['決済通貨']),
    quantity: base['数量'],
    unitPrice: base['単価'],
    grossAmount: sourceGrossAmount,
    netAmount: isDividend ? base['受渡金額/決済損益'] : '',
    settlementAmount: base['受渡金額/決済損益'],
    fee: base['手数料（税込）'],
    tax: sourceTax !== '' ? sourceTax : base['国内消費税等（円）'],
    miscFee: base['現地手数料（円）'],
    exchangeRate: isDividend ? '' : base['レート'],
    manualRate: isDividend ? base['レート'] : '',
    manualForeignWithholdingTaxJpy: isDividend ? base['現地源泉税（円）'] : '',
    manualDomesticWithholdingTaxJpy: isDividend ? base['国内源泉所得税（円）'] : '',
    manualDomesticLocalTaxJpy: isDividend ? base['国内源泉地方税（円）'] : '',
    description: description,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    rolledBackAt: base.rolledBackAt,
    isActive: base.isActive,
  };
}

function rakutenDbRecordToBaseRecord_(obj) {
  const tx = text_(obj.normalizedTradeType || obj.rawTradeType);
  const product = text_(obj.product);
  const date = obj.tradeDate || obj.settlementDate || obj.paymentDate || obj.cashDate;
  const settlementDate = obj.settlementDate || obj.paymentDate || obj.cashDate || obj.tradeDate;
  const isPrincipalReturn =
    tx === '入金（分配金）' &&
    isRakutenPrincipalReturnText_([obj.rawProduct, obj.description].join(' '));
  const commonDomesticTax = product === '株式' ? toOptionalNumber_(obj.tax) : '';
  const fee = toNumber_(obj.fee);
  let domesticFee = '';
  if (product === '株式' && fee !== 0) {
    domesticFee = normalizeZero_(fee - (commonDomesticTax === '' ? 0 : commonDomesticTax));
  } else if (product === '投信' && fee !== 0) {
    domesticFee = fee;
  }

  const record = {
    約定日: parseDate_(date),
    受渡日: parseDate_(settlementDate),
    商品: product,
    銘柄コード: text_(obj.symbolCode),
    銘柄名: text_(obj.symbolName),
    摘要: text_(obj.description || obj.rawProduct),
    取引区分: tx,
    預り区分: text_(obj.accountType),
    発行通貨: normalizeCurrency_(obj.currency),
    数量: toNumber_(obj.quantity),
    単価: toNumber_(obj.unitPrice),
    '受渡金額/決済損益': toNumber_(obj.settlementAmount || obj.netAmount),
    '手数料（税込）': fee,
    レート: toNumber_(obj.exchangeRate || obj.manualRate),
    決済通貨: normalizeCurrency_(obj.settlementCurrency || obj.currency),
    '売買損益（円）': '',
    '国内消費税等（円）': commonDomesticTax,
    '現地源泉税（円）': toOptionalNumber_(obj.manualForeignWithholdingTaxJpy),
    '国内源泉所得税（円）': toOptionalNumber_(obj.manualDomesticWithholdingTaxJpy),
    '国内源泉地方税（円）': toOptionalNumber_(obj.manualDomesticLocalTaxJpy),
    '元本払戻金': isPrincipalReturn ? true : '',
    '国内手数料（円）': domesticFee,
    '現地手数料（円）': toOptionalNumber_(obj.miscFee),
  };
  record.__rakutenDb = obj;
  return record;
}

function appendRecordsToDb_(records, options) {
  const target = resolveDbTarget_(options.targetDbKey);
  const dbSs = getOrCreateDbSpreadsheet_(target.key, {
    e2eUseRootStorage: options && options.e2eUseRootStorage,
  });
  const transactionHeaders = getTransactionHeadersForTargetKey_(target.key);
  const txSheet = getOrCreateDbSheet_(dbSs, DB_CONFIG.SHEET_TRANSACTIONS, transactionHeaders);

  assertDbSheetCompatible_(txSheet, transactionHeaders);

  const importId = options.importId || buildImportId_();
  const now = new Date();
  const existingHashes = getExistingRowHashSet_(txSheet, transactionHeaders);

  const rowsToAppend = [];
  let insertedCount = 0;
  let skippedCount = 0;

  records.forEach(function(record, index) {
    const normalizeOptions = {
      importId: importId,
      sourceName: options.sourceName || '',
      sourceRowNo: index + 1,
      now: now,
      sourceType: options.sourceType || '',
    };
    const dbRecord = isRakutenDbTargetKey_(target.key)
      ? normalizeRakutenRecordForDb_(record, normalizeOptions)
      : normalizeRecordForDb_(record, normalizeOptions);

    if (existingHashes[dbRecord.rowHash]) {
      skippedCount++;
      return;
    }

    existingHashes[dbRecord.rowHash] = true;
    rowsToAppend.push(dbRecordToRowByHeaders_(dbRecord, transactionHeaders));
    insertedCount++;
  });

  if (rowsToAppend.length > 0) {
    txSheet
      .getRange(txSheet.getLastRow() + 1, 1, rowsToAppend.length, transactionHeaders.length)
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
    dbTargetKind: getDbTargetKind_(target.key),
    dbTargetKindLabel: getDbTargetKindLabel_(target.key),
    importId: importId,
    rowCount: records.length,
    insertedCount: insertedCount,
    skippedCount: skippedCount,
  };
}

function getExistingRowHashSet_(sheet, headers) {
  const activeHeaders = headers || DB_HEADERS;
  const hashCol = activeHeaders.indexOf('rowHash') + 1;
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
  const target = resolveDbTarget_(targetDbKey);
  return readDbRecordObjects_(target.key).map(function(obj) {
    return dbRecordObjectToBaseRecord_(target.key, obj);
  });
}

function readDbRecordObjects_(targetDbKey, options) {
  const target = resolveDbTarget_(targetDbKey);
  const transactionHeaders = getTransactionHeadersForTargetKey_(target.key);
  const dbSs = getOrCreateDbSpreadsheet_(target.key, {
    e2eUseRootStorage: options && options.e2eUseRootStorage,
  });
  const txSheet = getOrCreateDbSheet_(dbSs, DB_CONFIG.SHEET_TRANSACTIONS, transactionHeaders);

  assertDbSheetCompatible_(txSheet, transactionHeaders);

  const lastRow = txSheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  const values = txSheet.getRange(2, 1, lastRow - 1, transactionHeaders.length).getValues();

  return values
    .map(function(row) {
      const obj = {};
      transactionHeaders.forEach(function(header, i) {
        obj[header] = row[i];
      });
      return obj;
    })
    .filter(function(obj) {
      return obj.isActive !== false && String(obj.isActive).toUpperCase() !== 'FALSE';
    });
}

function dbRecordObjectToBaseRecord_(targetDbKey, obj) {
  if (isRakutenDbTargetKey_(targetDbKey)) {
    return rakutenDbRecordToBaseRecord_(obj);
  }

  return nomuraDbRecordToBaseRecord_(obj);
}

function nomuraDbRecordToBaseRecord_(obj) {
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
}

function buildOutputSheetsFromDb_(ss, targetDbKey, options) {
  const records = readDbRecordObjects_(targetDbKey, options);
  return buildOutputSheetsFromRecordsForTarget_(ss, targetDbKey, records);
}

function buildOutputSheetsFromRecordsForTarget_(ss, targetDbKey, records) {
  if (isRakutenDbTargetKey_(targetDbKey)) {
    return buildRakutenOutputSheetsFromDbRecords_(ss, records);
  }

  const baseRecords = records.map(nomuraDbRecordToBaseRecord_);
  const result = buildOutputSheetsFromDbRecords_(ss, baseRecords);
  result.outputDbKind = 'nomura';
  return result;
}

function buildRakutenOutputSheetsFromDbRecords_(ss, records) {
  const baseRecords = records.map(rakutenDbRecordToBaseRecord_);
  const result = buildRakutenOutputSheetsFromBaseRecords_(ss, baseRecords);
  result.outputDbKind = 'rakuten';
  return result;
}

function buildRakutenOutputSheetsFromBaseRecords_(ss, records) {
  const groups = groupRakutenOutputRecords_(records);
  return writeRakutenOutputSheetsFromGroups_(ss, groups);
}

function buildOutputSheetsFromDbRecords_(ss, records) {
  const groups = groupOutputRecords_(records);
  return writeOutputSheetsFromGroups_(ss, groups);
}

function groupRakutenOutputRecords_(records) {
  return groupOutputRecords_(records);
}

function writeRakutenOutputSheetsFromGroups_(ss, groups) {
  const alerts = [];

  writeSheet_(ss, CONFIG.RAKUTEN_OUTPUT_JAPAN_STOCK, RAKUTEN_JAPAN_STOCK_HEADERS, buildRakutenJapanStockRows_(groups.japanStocks, alerts), true);
  deleteSheetIfExists_(ss, CONFIG.OUTPUT_JAPAN_STOCK);
  writeSheet_(ss, CONFIG.RAKUTEN_OUTPUT_US_STOCK, RAKUTEN_US_STOCK_HEADERS, buildRakutenUsStockRows_(groups.usStocks, alerts), true);
  deleteSheetIfExists_(ss, CONFIG.OUTPUT_US_STOCK);
  writeSheet_(ss, CONFIG.OUTPUT_FOREIGN_BOND, TRADE_HEADERS, buildTradeRows_(groups.foreignBonds, alerts), true);
  writeSheet_(ss, CONFIG.RAKUTEN_OUTPUT_FUND, RAKUTEN_FUND_HEADERS, buildRakutenFundRows_(groups.funds, alerts), true);
  deleteSheetIfExists_(ss, CONFIG.OUTPUT_FUND);
  writeSheet_(ss, CONFIG.OUTPUT_CASH_JPY, RAKUTEN_CASH_JPY_HEADERS, buildRakutenCashJpyRows_(groups.cashJpy), false);
  writeSheet_(ss, CONFIG.OUTPUT_CASH_USD, RAKUTEN_CASH_USD_HEADERS, buildRakutenCashUsdRows_(groups.cashUsd), false);
  reorderRakutenOutputSheets_(ss);

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName(),
    alerts: alerts,
    counts: {
      all: groups.all.length,
      japanStocks: groups.japanStocks.length,
      usStocks: groups.usStocks.length,
      foreignBonds: groups.foreignBonds.length,
      funds: groups.funds.length,
      cashJpy: groups.cashJpy.length,
      cashUsd: groups.cashUsd.length,
    }
  };
}

function deleteSheetIfExists_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  if (ss.getSheets().length <= 1) {
    sheet.clear();
    return;
  }
  ss.deleteSheet(sheet);
}

function groupOutputRecords_(records) {
  return {
    all: records,
    japanStocks: records
      .filter(function(r) { return r['商品'] === '株式'; })
      .sort(sortTradeRows_),
    usStocks: records
      .filter(function(r) { return r['商品'] === '外株'; })
      .sort(sortTradeRows_),
    foreignBonds: records
      .filter(function(r) { return r['商品'] === '外債'; })
      .sort(sortTradeRows_),
    funds: records
      .filter(function(r) { return r['商品'] === '投信'; })
      .sort(sortTradeRows_),
    cashJpy: records
      .filter(function(r) {
        const c = normalizeCurrency_(r['決済通貨']);
        return c === '' || c === 'JPY';
      })
      .sort(sortCashRows_),
    cashUsd: records
      .filter(function(r) { return normalizeCurrency_(r['決済通貨']) === 'USD'; })
      .sort(sortCashRows_),
  };
}

function writeOutputSheetsFromGroups_(ss, groups) {
  const alerts = [];

  writeSheet_(ss, CONFIG.OUTPUT_JAPAN_STOCK, TRADE_HEADERS, buildTradeRows_(groups.japanStocks, alerts), true);
  writeSheet_(ss, CONFIG.OUTPUT_US_STOCK, TRADE_HEADERS, buildTradeRows_(groups.usStocks, alerts), true);
  writeSheet_(ss, CONFIG.OUTPUT_FOREIGN_BOND, TRADE_HEADERS, buildTradeRows_(groups.foreignBonds, alerts), true);
  writeSheet_(ss, CONFIG.OUTPUT_FUND, TRADE_HEADERS, buildTradeRows_(groups.funds, alerts), true);
  writeSheet_(ss, CONFIG.OUTPUT_CASH_JPY, CASH_HEADERS, buildCashRows_(groups.cashJpy), false);
  writeSheet_(ss, CONFIG.OUTPUT_CASH_USD, CASH_HEADERS, buildCashRows_(groups.cashUsd), false);
  reorderOutputSheets_(ss);

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName(),
    alerts: alerts,
    counts: {
      all: groups.all.length,
      japanStocks: groups.japanStocks.length,
      usStocks: groups.usStocks.length,
      foreignBonds: groups.foreignBonds.length,
      funds: groups.funds.length,
      cashJpy: groups.cashJpy.length,
      cashUsd: groups.cashUsd.length,
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

function getDbSpreadsheetMeta_(targetDbKey) {
  const target = resolveDbTarget_(targetDbKey);
  const dbSs = getOrCreateDbSpreadsheet_(target.key);
  return {
    dbSpreadsheetId: dbSs.getId(),
    dbSpreadsheetUrl: dbSs.getUrl(),
    dbTargetKey: target.key,
    dbTargetLabel: target.label,
    dbTargetKind: target.dbKind,
    dbTargetKindLabel: target.dbKindLabel,
  };
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
      const targetDbKey = text_(log.targetDbKey) || text_(fallback.key);
      const targetDbLabel = text_(log.targetDbLabel) || text_(fallback.label) || dbSs.getName();
      const targetDbKind = getDbTargetKind_(targetDbKey);
      const targetDbKindLabel = getDbTargetKindLabel_(targetDbKey);

      return {
        importId: text_(log.importId),
        importedAtText: importedAtText,
        targetDbKey: targetDbKey,
        targetDbLabel: targetDbLabel,
        targetDbKind: targetDbKind,
        targetDbKindLabel: targetDbKindLabel,
        sourceName: sourceName,
        rowCount: toNumber_(log.rowCount),
        insertedCount: insertedCount,
        skippedCount: toNumber_(log.skippedCount),
        isRolledBack: isRolledBack,
        rolledBackAtText: rolledBackAtText,
        rolledBackRecordCount: toNumber_(log.rolledBackRecordCount),
        displayLabel:
          targetDbKindLabel +
          ' ' + targetDbKey +
          ' / ' +
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

function rollbackImportInSpreadsheet_(dbSs, target, importId) {
  const rollbackImportId = text_(importId);
  const transactionHeaders = getTransactionHeadersForTargetKey_(target && target.key);

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

  assertDbSheetCompatible_(txSheet, transactionHeaders);

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

  const now = new Date();
  const txLastRow = txSheet.getLastRow();
  let rolledBackCount = 0;

  if (txLastRow > 1) {
    const range = txSheet.getRange(2, 1, txLastRow - 1, transactionHeaders.length);
    const values = range.getValues();
    const importIdCol = transactionHeaders.indexOf('importId');
    const isActiveCol = transactionHeaders.indexOf('isActive');
    const updatedAtCol = transactionHeaders.indexOf('updatedAt');
    const rolledBackAtCol = transactionHeaders.indexOf('rolledBackAt');

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
    dbTargetKind: getDbTargetKind_(target.key),
    dbTargetKindLabel: getDbTargetKindLabel_(target.key),
    importId: rollbackImportId,
    rolledBackCount: rolledBackCount,
    rolledBackAt: now,
    rolledBackAtText: Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
  };
}

function resetDbData_(targetDbKey) {
  const target = resolveDbTarget_(targetDbKey);
  const dbSs = getOrCreateDbSpreadsheet_(target.key, {
    allowHeaderMismatchForReset: true,
  });
  const transactionHeaders = getTransactionHeadersForTargetKey_(target.key);

  const txDeletedCount = recreateSheetWithHeaders_(dbSs, DB_CONFIG.SHEET_TRANSACTIONS, transactionHeaders);
  const logDeletedCount = recreateSheetWithHeaders_(dbSs, DB_CONFIG.SHEET_IMPORT_LOGS, IMPORT_LOG_HEADERS);

  return {
    ok: true,
    dbSpreadsheetId: dbSs.getId(),
    dbSpreadsheetUrl: dbSs.getUrl(),
    dbTargetKey: target.key,
    dbTargetLabel: target.label,
    dbTargetKind: target.dbKind,
    dbTargetKindLabel: target.dbKindLabel,
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
