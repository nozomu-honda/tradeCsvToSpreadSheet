/**
 * 楽天 Phase 1:
 * - 野村共通フォーマット
 * - 楽天日本株
 * - 楽天米国株
 * - 楽天投資信託
 * - 楽天配当金・分配金
 * - 楽天入出金履歴
 * を自動判定し、既存の BASE_HEADERS 形式へ正規化する
 */

function isRakutenSourceType_(sourceType) {
  return text_(sourceType).indexOf('rakuten_') === 0;
}

function isSupportedRakutenSourceType_(sourceType) {
  return [
    'rakuten_jp_stock',
    'rakuten_us_stock',
    'rakuten_fund',
    'rakuten_dividend',
    'rakuten_cash'
  ].indexOf(text_(sourceType)) >= 0;
}

const STAGING_SOURCE_METADATA_SHEET_NAME_ = '__TRADE_SOURCE_METADATA__';
const STAGING_SOURCE_METADATA_VERSION_ = '1';

function createStagingSourceMetadata_(normalizedInput) {
  const sourceType = text_(normalizedInput && normalizedInput.sourceType);
  const broker = sourceType === 'nomura_common'
    ? 'nomura'
    : (isRakutenSourceType_(sourceType) ? 'rakuten' : '');
  if (!broker) {
    throw new Error('一次受け枠の証券会社を判定できません。');
  }

  let sourceFields = [];
  if (normalizedInput.sourceRecords) {
    sourceFields = normalizedInput.sourceRecords.map(function(record) {
      return record && record.__rakutenSource ? record.__rakutenSource : null;
    });
  } else if (normalizedInput.stagingSourceFields) {
    sourceFields = normalizedInput.stagingSourceFields;
  }

  return {
    version: STAGING_SOURCE_METADATA_VERSION_,
    format: 'base_records',
    broker: broker,
    sourceType: sourceType,
    sourceFields: sourceFields,
  };
}

function writeStagingSourceMetadata_(ss, metadata) {
  const sheet = ss.getSheetByName(STAGING_SOURCE_METADATA_SHEET_NAME_)
    || ss.insertSheet(STAGING_SOURCE_METADATA_SHEET_NAME_);
  sheet.clear();
  const rows = [
    ['key', 'value'],
    ['version', metadata.version],
    ['format', metadata.format],
    ['broker', metadata.broker],
    ['sourceType', metadata.sourceType],
    ['sourceRecordCount', String(metadata.sourceFields.length)],
  ];
  metadata.sourceFields.forEach(function(fields) {
    rows.push(['sourceField', JSON.stringify(fields)]);
  });
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.hideSheet();
}

function readStagingSourceMetadata_(ss) {
  const sheet = ss.getSheetByName(STAGING_SOURCE_METADATA_SHEET_NAME_);
  if (!sheet) return null;

  const values = sheet.getDataRange().getValues();
  const metadata = {};
  for (var i = 1; i < values.length; i++) {
    const key = text_(values[i][0]);
    if (key) metadata[key] = values[i][1];
  }

  const sourceFields = [];
  for (var j = 1; j < values.length; j++) {
    if (text_(values[j][0]) !== 'sourceField') continue;
    try {
      sourceFields.push(JSON.parse(String(values[j][1])));
    } catch (e) {
      throw new Error('一次受け枠の証券会社メタデータが壊れています。');
    }
  }

  const normalized = validateStagingSourceMetadata_({
    version: metadata.version,
    format: metadata.format,
    broker: metadata.broker,
    sourceType: metadata.sourceType,
    sourceFields: sourceFields,
  });
  const count = toNumber_(metadata.sourceRecordCount);
  if (count !== sourceFields.length) {
    throw new Error('一次受け枠の証券会社メタデータと明細数が一致しません。');
  }
  return normalized;
}

function validateStagingSourceMetadata_(metadata) {
  const version = text_(metadata && metadata.version);
  const format = text_(metadata && metadata.format);
  const broker = text_(metadata && metadata.broker);
  const sourceType = text_(metadata && metadata.sourceType);
  if (version !== STAGING_SOURCE_METADATA_VERSION_ || format !== 'base_records') {
    throw new Error('未対応の一次受け枠メタデータです。');
  }
  if (broker !== 'nomura' && broker !== 'rakuten') {
    throw new Error('一次受け枠の証券会社を判定できません。');
  }
  if (broker === 'nomura' && sourceType !== 'nomura_common') {
    throw new Error('一次受け枠の野村メタデータが不正です。');
  }
  if (broker === 'rakuten' && !isSupportedRakutenSourceType_(sourceType)) {
    throw new Error('一次受け枠の楽天メタデータが不正です。');
  }
  return {
    version: version,
    format: format,
    broker: broker,
    sourceType: sourceType,
    sourceFields: Array.isArray(metadata.sourceFields) ? metadata.sourceFields : [],
  };
}

function restoreStagingSourceFields_(records, sourceFields) {
  if (!sourceFields || sourceFields.length === 0) return records;
  if (records.length !== sourceFields.length) {
    throw new Error('一次受け枠の証券会社メタデータと明細数が一致しません。');
  }
  records.forEach(function(record, index) {
    const fields = sourceFields[index];
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      setRakutenSourceFields_(record, fields);
    }
  });
  return records;
}

function routeTargetDbKeyBySource_(selectedTargetDbKey, sourceType) {
  const key = text_(selectedTargetDbKey) || getDefaultDbTargetKey_();
  if (!isRakutenSourceType_(sourceType)) {
    return key;
  }

  const rakutenTargetByNomuraTarget = {
    nomura_corp_a: 'rakuten_corp_a',
    nomura_corp_b: 'rakuten_corp_b',
    nomura_test: 'rakuten_test',
  };

  if (rakutenTargetByNomuraTarget[key]) {
    return rakutenTargetByNomuraTarget[key];
  }

  return key;
}

function normalizeRowsForImport_(rows, stagingMetadata) {
  const paddedRows = padRows_(rows || []);
  const detected = detectInputSourceTypeFromRows_(paddedRows);

  if (stagingMetadata) {
    const declared = validateStagingSourceMetadata_(stagingMetadata);
    if (declared.format === 'base_records') {
      const headerRowIndex = findHeaderRowIndex_(paddedRows);
      if (headerRowIndex < 0) {
        throw new Error('一次受け枠のヘッダー行が見つかりません。');
      }
      validateHeaderNames_(paddedRows[headerRowIndex] || []);
      return {
        sourceType: declared.sourceType,
        broker: declared.broker,
        headerRowIndex: headerRowIndex,
        normalizedRows: paddedRows,
        stagingSourceFields: declared.sourceFields,
        hasManualColumns: hasAllAdditionalManualHeadersInHeader_(paddedRows[headerRowIndex] || []),
        alerts: []
      };
    }
  }

  if (!detected || !detected.sourceType) {
    throw new Error('入力フォーマットを判定できませんでした。野村共通形式または楽天日本株/楽天米国株のヘッダーを確認してください。');
  }

  if (detected.sourceType === 'nomura_common') {
    return {
      sourceType: detected.sourceType,
      broker: 'nomura',
      headerRowIndex: detected.headerRowIndex,
      normalizedRows: paddedRows,
      hasManualColumns: hasAllAdditionalManualHeadersInHeader_(paddedRows[detected.headerRowIndex] || []),
      alerts: []
    };
  }

  let records = [];
  if (detected.sourceType === 'rakuten_jp_stock') {
    records = normalizeRakutenJapanStockRowsToRecords_(paddedRows, detected.headerRowIndex);
  } else if (detected.sourceType === 'rakuten_us_stock') {
    records = normalizeRakutenUsStockRowsToRecords_(paddedRows, detected.headerRowIndex);
  } else if (detected.sourceType === 'rakuten_fund') {
    records = normalizeRakutenFundRowsToRecords_(paddedRows, detected.headerRowIndex);
  } else if (detected.sourceType === 'rakuten_dividend') {
    records = normalizeRakutenDividendRowsToRecords_(paddedRows, detected.headerRowIndex);
  } else if (detected.sourceType === 'rakuten_cash') {
    records = normalizeRakutenCashRowsToRecords_(paddedRows, detected.headerRowIndex);
  } else {
    throw new Error('未対応の楽天フォーマットです: ' + detected.sourceType);
  }

  return {
    sourceType: detected.sourceType,
    broker: 'rakuten',
    headerRowIndex: detected.headerRowIndex,
    normalizedRows: buildRowsFromRecords_(records),
    sourceRecords: records,
    hasManualColumns: false,
    alerts: detected.sourceType === 'rakuten_dividend'
      ? collectRakutenDividendManualInputAlerts_(records)
      : []
  };
}

function findSupportedImportSheet_(ss) {
  const analyses = ss.getSheets().map(function(sheet) {
    if (sheet.getName() === STAGING_SOURCE_METADATA_SHEET_NAME_) {
      return { ok: false, sheet: sheet, sheetName: sheet.getName(), reason: '内部メタデータ' };
    }
    const values = sheet.getDataRange().getValues();
    if (!values || values.length === 0) {
      return { ok: false, sheet: sheet, sheetName: sheet.getName(), reason: '空シート' };
    }

    try {
      const detected = detectInputSourceTypeFromRows_(values);
      return {
        ok: true,
        sheet: sheet,
        sheetName: sheet.getName(),
        reason: 'OK',
        sourceType: detected.sourceType,
        headerRowIndex: detected.headerRowIndex
      };
    } catch (e) {
      return {
        ok: false,
        sheet: sheet,
        sheetName: sheet.getName(),
        reason: e && e.message ? e.message : String(e)
      };
    }
  });

  const candidates = analyses.filter(function(item) { return item.ok; });

  if (candidates.length === 0) {
    throw new Error(
      '取引履歴の入力シートが見つかりません。\n' +
      analyses.map(function(item) {
        return '- ' + item.sheetName + ': ' + item.reason;
      }).join('\n')
    );
  }

  if (candidates.length > 1) {
    throw new Error(
      '入力候補シートが複数見つかりました。シートを1つに絞ってください: ' +
      candidates.map(function(item) {
        return item.sheetName + ' (' + item.sourceType + ')';
      }).join(', ')
    );
  }

  return candidates[0].sheet;
}

function detectInputSourceTypeFromRows_(rows) {
  const detectors = [
    {
      sourceType: 'nomura_common',
      markers: ['約定日', '受渡日', '商品', '銘柄名', '取引区分', '受渡金額/決済損益']
    },
    {
      sourceType: 'rakuten_jp_stock',
      markers: ['約定日', '受渡日', '市場名称', '口座区分', '売買区分', '数量[株]', '受渡金額[円]']
    },
    {
      sourceType: 'rakuten_us_stock',
      markers: ['約定日', '受渡日', 'ティッカー', '約定代金[USドル]', '為替レート', '受渡金額[USドル]', '受渡金額[円]']
    },
    {
      sourceType: 'rakuten_fund',
      markers: ['約定日', '受渡日', 'ファンド名', '取引', '数量[口]', '単価', '受渡金額/(ポイント利用)[円]', '決済通貨']
    },
    {
      sourceType: 'rakuten_dividend',
      markers: ['入金日', '商品', '銘柄コード', '銘柄', '受取通貨', '配当・分配金合計(税引前)[円/現地通貨]', '受取金額[円/現地通貨]']
    },
    {
      sourceType: 'rakuten_cash',
      markers: ['入出金日', '入金額[円]', '出金額[円]', '内容']
    }
  ];

  for (var i = 0; i < rows.length; i++) {
    const normalizedHeaders = (rows[i] || []).map(normalizeSourceHeaderName_);
    for (var j = 0; j < detectors.length; j++) {
      const detector = detectors[j];
      const ok = detector.markers.every(function(marker) {
        return normalizedHeaders.indexOf(normalizeSourceHeaderName_(marker)) >= 0;
      });
      if (ok) {
        return {
          sourceType: detector.sourceType,
          headerRowIndex: i
        };
      }
    }
  }

  throw new Error('対応フォーマットのヘッダー行が見つかりません。');
}

function normalizeSourceHeaderName_(name) {
  return String(name || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/［/g, '[')
    .replace(/］/g, ']')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/／/g, '/')
    .replace(/　/g, '')
    .toUpperCase();
}

function buildHeaderIndexMap_(headers) {
  const map = {};
  headers.forEach(function(h, i) {
    map[normalizeSourceHeaderName_(h)] = i;
  });
  return map;
}

function getByHeaderCandidates_(row, headerIndexMap, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    const key = normalizeSourceHeaderName_(candidates[i]);
    if (headerIndexMap.hasOwnProperty(key)) {
      return row[headerIndexMap[key]];
    }
  }
  return '';
}

function buildEmptyBaseRecord_() {
  const obj = {};
  BASE_HEADERS.forEach(function(header) {
    obj[header] = '';
  });
  return obj;
}

function buildRowsFromRecords_(records) {
  const rows = [BASE_HEADERS.slice()];
  records.forEach(function(record) {
    rows.push(BASE_HEADERS.map(function(header) {
      return record[header] !== undefined ? record[header] : '';
    }));
  });
  return rows;
}

function setRakutenSourceFields_(record, fields) {
  record.__rakutenSource = fields || {};
  return record;
}

function hasAllAdditionalManualHeadersInHeader_(headers) {
  const normalized = (headers || []).map(function(h) {
    return String(h || '').trim();
  });
  return getAdditionalManualHeaders_().every(function(header) {
    return normalized.indexOf(header) >= 0;
  });
}

function normalizeRakutenJapanStockRowsToRecords_(rows, headerRowIndex) {
  const headers = rows[headerRowIndex].map(function(v) { return String(v).trim(); });
  const headerIndexMap = buildHeaderIndexMap_(headers);
  const records = [];

  for (var r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || isEmptyRow_(row)) continue;

    const tradeDate = getByHeaderCandidates_(row, headerIndexMap, ['約定日']);
    const settlementDate = getByHeaderCandidates_(row, headerIndexMap, ['受渡日']);
    const symbolName = getByHeaderCandidates_(row, headerIndexMap, ['銘柄名']);
    if (!tradeDate && !settlementDate && !symbolName) continue;

    const record = buildEmptyBaseRecord_();
    const tradeType = mapRakutenJapanStockTradeType_(row, headerIndexMap);

    record['約定日'] = tradeDate;
    record['受渡日'] = settlementDate;
    record['商品'] = '株式';
    record['銘柄コード'] = getByHeaderCandidates_(row, headerIndexMap, ['銘柄コード']);
    record['銘柄名'] = symbolName;
    record['摘要'] = '';
    record['取引区分'] = tradeType;
    record['預り区分'] = getByHeaderCandidates_(row, headerIndexMap, ['口座区分']);
    record['発行通貨'] = '';
    record['数量'] = getByHeaderCandidates_(row, headerIndexMap, ['数量[株]', '数量［株］']);
    record['単価'] = getByHeaderCandidates_(row, headerIndexMap, ['単価[円]', '単価［円］']);
    record['受渡金額/決済損益'] = getByHeaderCandidates_(row, headerIndexMap, ['受渡金額[円]', '受渡金額［円］']);

    const fee = toOptionalNumber_(getByHeaderCandidates_(row, headerIndexMap, ['手数料[円]', '手数料［円］']));
    const tax = toOptionalNumber_(getByHeaderCandidates_(row, headerIndexMap, ['税金等[円]', '税金等［円］']));
    const misc = toOptionalNumber_(getByHeaderCandidates_(row, headerIndexMap, ['諸費用[円]', '諸費用［円］']));

    record['手数料（税込）'] = (fee === '' ? 0 : fee) + (tax === '' ? 0 : tax);
    record['レート'] = '';
    record['決済通貨'] = 'JPY';
    record['売買損益（円）'] = '';
    record['国内消費税等（円）'] = tax;
    record['現地源泉税（円）'] = '';
    record['国内源泉所得税（円）'] = '';
    record['国内源泉地方税（円）'] = '';
    record['元本払戻金'] = '';
    record['国内手数料（円）'] = fee;
    record['現地手数料（円）'] = misc;

    records.push(record);
  }

  return records;
}

function mapRakutenJapanStockTradeType_(row, headerIndexMap) {
  const sellBuy = text_(getByHeaderCandidates_(row, headerIndexMap, ['売買区分']));
  const tx = text_(getByHeaderCandidates_(row, headerIndexMap, ['取引区分']));
  const credit = text_(getByHeaderCandidates_(row, headerIndexMap, ['信用区分']));

  const merged = [sellBuy, tx, credit].join(' ');

  if (merged.indexOf('信用') >= 0) {
    throw new Error('楽天日本株の信用取引は Phase 1 未対応です。');
  }
  if (merged.indexOf('入庫') >= 0) return '入庫（増減資）';
  if (merged.indexOf('買') >= 0) return '現物買付';
  if (merged.indexOf('売') >= 0) return '現物売却';

  throw new Error('楽天日本株の取引区分を判定できません。 actual=' + merged);
}

function normalizeRakutenUsStockRowsToRecords_(rows, headerRowIndex) {
  const headers = rows[headerRowIndex].map(function(v) { return String(v).trim(); });
  const headerIndexMap = buildHeaderIndexMap_(headers);
  const records = [];

  for (var r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || isEmptyRow_(row)) continue;

    const tradeDate = getByHeaderCandidates_(row, headerIndexMap, ['約定日']);
    const settlementDate = getByHeaderCandidates_(row, headerIndexMap, ['受渡日']);
    const symbolCode = getByHeaderCandidates_(row, headerIndexMap, ['ティッカー']);
    if (!tradeDate && !settlementDate && !symbolCode) continue;

    const record = buildEmptyBaseRecord_();
    const tradeType = mapRakutenUsStockTradeType_(row, headerIndexMap);
    const settlementCurrencyRaw = getByHeaderCandidates_(row, headerIndexMap, ['決済通貨']);
    const settlementCurrency = normalizeCurrency_(settlementCurrencyRaw);
    const amount =
      settlementCurrency === 'JPY'
        ? getByHeaderCandidates_(row, headerIndexMap, ['受渡金額[円]', '受渡金額［円］'])
        : getByHeaderCandidates_(row, headerIndexMap, ['受渡金額[USドル]', '受渡金額［USドル］']);

    record['約定日'] = tradeDate;
    record['受渡日'] = settlementDate;
    record['商品'] = '外株';
    record['銘柄コード'] = symbolCode;
    record['銘柄名'] = getByHeaderCandidates_(row, headerIndexMap, ['銘柄名']);
    record['摘要'] = '';
    record['取引区分'] = tradeType;
    record['預り区分'] = getByHeaderCandidates_(row, headerIndexMap, ['口座']);
    record['発行通貨'] = 'USD';
    record['数量'] = getByHeaderCandidates_(row, headerIndexMap, ['数量[株]', '数量［株］']);
    record['単価'] = getByHeaderCandidates_(row, headerIndexMap, ['単価[USドル]', '単価［USドル］']);
    record['受渡金額/決済損益'] = amount;
    record['手数料（税込）'] = 0;
    record['レート'] = getByHeaderCandidates_(row, headerIndexMap, ['為替レート']);
    record['決済通貨'] = settlementCurrency || 'USD';
    record['売買損益（円）'] = '';
    record['国内消費税等（円）'] = '';
    record['現地源泉税（円）'] = '';
    record['国内源泉所得税（円）'] = '';
    record['国内源泉地方税（円）'] = '';
    record['元本払戻金'] = '';
    record['国内手数料（円）'] = '';
    record['現地手数料（円）'] = getByHeaderCandidates_(row, headerIndexMap, ['手数料[USドル]', '手数料［USドル］']);

    setRakutenSourceFields_(record, {
      grossAmount: getByHeaderCandidates_(row, headerIndexMap, ['約定代金[USドル]', '約定代金［USドル］']),
      tax: getByHeaderCandidates_(row, headerIndexMap, ['税金[USドル]', '税金［USドル］']),
      exchangeRate: record['レート'],
      rawTradeType: text_(getByHeaderCandidates_(row, headerIndexMap, ['取引区分'])),
      rawSellBuyType: text_(getByHeaderCandidates_(row, headerIndexMap, ['売買区分'])),
    });

    records.push(record);
  }

  return records;
}

function mapRakutenUsStockTradeType_(row, headerIndexMap) {
  const sellBuy = text_(getByHeaderCandidates_(row, headerIndexMap, ['売買区分']));
  const tx = text_(getByHeaderCandidates_(row, headerIndexMap, ['取引区分']));
  const merged = [sellBuy, tx].join(' ');

  if (merged.indexOf('買') >= 0) return '現物買付';
  if (merged.indexOf('売') >= 0) return '現物売却';

  throw new Error('楽天米国株の取引区分を判定できません。 actual=' + merged);
}

function normalizeRakutenFundRowsToRecords_(rows, headerRowIndex) {
  const headers = rows[headerRowIndex].map(function(v) { return String(v).trim(); });
  const headerIndexMap = buildHeaderIndexMap_(headers);
  const records = [];

  for (var r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || isEmptyRow_(row)) continue;

    const tradeDate = getByHeaderCandidates_(row, headerIndexMap, ['約定日']);
    const settlementDate = getByHeaderCandidates_(row, headerIndexMap, ['受渡日']);
    const symbolName = getByHeaderCandidates_(row, headerIndexMap, ['ファンド名']);
    if (!tradeDate && !settlementDate && !symbolName) continue;

    const record = buildEmptyBaseRecord_();
    const tradeType = mapRakutenFundTradeType_(row, headerIndexMap);

    record['約定日'] = tradeDate;
    record['受渡日'] = settlementDate;
    record['商品'] = '投信';
    record['銘柄コード'] = '';
    record['銘柄名'] = symbolName;
    record['摘要'] = getByHeaderCandidates_(row, headerIndexMap, ['買付方法']);
    record['取引区分'] = tradeType;
    record['預り区分'] = getByHeaderCandidates_(row, headerIndexMap, ['口座']);
    record['発行通貨'] = '';
    record['数量'] = getByHeaderCandidates_(row, headerIndexMap, ['数量[口]', '数量［口］']);
    record['単価'] = getByHeaderCandidates_(row, headerIndexMap, ['単価']);
    record['受渡金額/決済損益'] = getByHeaderCandidates_(row, headerIndexMap, ['受渡金額/(ポイント利用)[円]', '受渡金額／(ポイント利用)[円]']);
    record['手数料（税込）'] = getByHeaderCandidates_(row, headerIndexMap, ['経費']);
    record['レート'] = getByHeaderCandidates_(row, headerIndexMap, ['為替レート']);
    record['決済通貨'] = normalizeCurrency_(getByHeaderCandidates_(row, headerIndexMap, ['決済通貨'])) || 'JPY';
    record['売買損益（円）'] = '';
    record['国内消費税等（円）'] = '';
    record['現地源泉税（円）'] = '';
    record['国内源泉所得税（円）'] = '';
    record['国内源泉地方税（円）'] = '';
    record['元本払戻金'] = '';
    record['国内手数料（円）'] = getByHeaderCandidates_(row, headerIndexMap, ['経費']);
    record['現地手数料（円）'] = '';

    setRakutenSourceFields_(record, {
      rawProduct: getByHeaderCandidates_(row, headerIndexMap, ['分配金']),
      grossAmount: getByHeaderCandidates_(row, headerIndexMap, ['受付金額[現地通貨]', '受付金額［現地通貨］']),
      exchangeRate: record['レート'],
      rawTradeType: text_(getByHeaderCandidates_(row, headerIndexMap, ['取引'])),
      description: getByHeaderCandidates_(row, headerIndexMap, ['買付方法']),
    });

    records.push(record);
  }

  return records;
}

function mapRakutenFundTradeType_(row, headerIndexMap) {
  const tx = text_(getByHeaderCandidates_(row, headerIndexMap, ['取引']));

  if (tx.indexOf('買付') >= 0) return '現物買付';
  if (tx.indexOf('解約') >= 0) return '現物買取';
  if (tx.indexOf('再投資') >= 0) return '現物再投';

  throw new Error('楽天投資信託の取引区分を判定できません。 actual=' + tx);
}

function normalizeRakutenDividendRowsToRecords_(rows, headerRowIndex) {
  const headers = rows[headerRowIndex].map(function(v) { return String(v).trim(); });
  const headerIndexMap = buildHeaderIndexMap_(headers);
  const records = [];
  validateRakutenDividendManualHeaders_(headerIndexMap);

  for (var r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || isEmptyRow_(row)) continue;

    const paymentDate = getByHeaderCandidates_(row, headerIndexMap, ['入金日']);
    const symbolName = getByHeaderCandidates_(row, headerIndexMap, ['銘柄']);
    if (!paymentDate && !symbolName) continue;

    const productRaw = text_(getByHeaderCandidates_(row, headerIndexMap, ['商品']));
    const currency = normalizeCurrency_(getByHeaderCandidates_(row, headerIndexMap, ['受取通貨']));
    const grossAmount = getByHeaderCandidates_(row, headerIndexMap, [
      '配当・分配金合計(税引前)[円/現地通貨]',
      '配当・分配金合計（税引前）[円/現地通貨]',
      '配当・分配金合計(税引前)［円/現地通貨］',
      '配当・分配金合計（税引前）［円/現地通貨］'
    ]);
    const taxAmount = getByHeaderCandidates_(row, headerIndexMap, [
      '税額合計[円/現地通貨]',
      '税額合計［円/現地通貨］'
    ]);
    const netAmount = getByHeaderCandidates_(row, headerIndexMap, [
      '受取金額[円/現地通貨]',
      '受取金額［円/現地通貨］'
    ]);
    const manualRate = getByHeaderCandidates_(row, headerIndexMap, ['レート', '為替レート']);
    const foreignWithholdingTaxJpy = getByHeaderCandidates_(row, headerIndexMap, [
      '現地源泉税[円]',
      '現地源泉税［円］',
      '現地源泉税（円）'
    ]);
    const domesticWithholdingTaxJpy = getByHeaderCandidates_(row, headerIndexMap, [
      '国内源泉税[円]',
      '国内源泉税［円］',
      '国内源泉税（円）',
      '国内源泉所得税（円）'
    ]);
    const description = getByHeaderCandidates_(row, headerIndexMap, ['備考', '摘要']);
    const principalReturn = getRakutenDividendPrincipalReturnFlag_(
      row,
      headerIndexMap,
      productRaw,
      description
    );
    const record = buildEmptyBaseRecord_();

    record['約定日'] = paymentDate;
    record['受渡日'] = paymentDate;
    record['商品'] = mapRakutenDividendProduct_(productRaw);
    record['銘柄コード'] = getByHeaderCandidates_(row, headerIndexMap, ['銘柄コード']);
    record['銘柄名'] = symbolName;
    record['摘要'] = productRaw;
    record['取引区分'] = productRaw.indexOf('投資信託') >= 0 ? '入金（分配金）' : '入金（配当金）';
    record['預り区分'] = getByHeaderCandidates_(row, headerIndexMap, ['口座']);
    record['発行通貨'] = currency;
    record['数量'] = getByHeaderCandidates_(row, headerIndexMap, ['数量[株/口]', '数量［株/口］']);
    record['単価'] = getByHeaderCandidates_(row, headerIndexMap, ['単価[円/現地通貨]', '単価［円/現地通貨］']);
    record['受渡金額/決済損益'] = netAmount;
    record['手数料（税込）'] = 0;
    record['レート'] = manualRate;
    record['決済通貨'] = currency || 'JPY';
    record['売買損益（円）'] = '';
    record['国内消費税等（円）'] = '';
    record['現地源泉税（円）'] = foreignWithholdingTaxJpy;
    record['国内源泉所得税（円）'] = domesticWithholdingTaxJpy;
    record['国内源泉地方税（円）'] = getByHeaderCandidates_(row, headerIndexMap, ['国内源泉地方税[円]', '国内源泉地方税［円］', '国内源泉地方税（円）']);
    record['元本払戻金'] = principalReturn;
    record['国内手数料（円）'] = '';
    record['現地手数料（円）'] = '';

    setRakutenSourceFields_(record, {
      paymentDate: paymentDate,
      rawProduct: productRaw,
      sourceCurrency: currency,
      grossAmount: grossAmount,
      tax: taxAmount,
      netAmount: netAmount,
      exchangeRate: manualRate,
      manualForeignWithholdingTaxJpy: foreignWithholdingTaxJpy,
      manualDomesticWithholdingTaxJpy: domesticWithholdingTaxJpy,
      manualDomesticLocalTaxJpy: record['国内源泉地方税（円）'],
      description: description,
    });

    if (currency && currency !== 'JPY' && isBlankCell_(record['レート'])) {
      throw new Error('楽天配当金CSVの外貨配当は「レート」を入力してください。 row=' + (r + 1));
    }

    records.push(record);
  }

  return records;
}

function getRakutenDividendPrincipalReturnFlag_(row, headerIndexMap, productRaw, description) {
  const explicit = getByHeaderCandidates_(row, headerIndexMap, ['元本払戻金', '元金払戻金']);
  if (!isBlankCell_(explicit)) {
    return toNullableBooleanFlag_(explicit, '元本払戻金');
  }

  return isRakutenPrincipalReturnText_([productRaw, description].join(' ')) ? true : '';
}

function isRakutenPrincipalReturnText_(value) {
  const text = text_(value);
  return (
    text.indexOf('元本払戻金') >= 0 ||
    text.indexOf('元金払戻金') >= 0 ||
    text.indexOf('特別分配金') >= 0
  );
}

function validateRakutenDividendManualHeaders_(headerIndexMap) {
  const requiredGroups = [
    { label: 'レート', candidates: ['レート', '為替レート'] },
    { label: '現地源泉税[円]', candidates: ['現地源泉税[円]', '現地源泉税［円］', '現地源泉税（円）'] },
    { label: '国内源泉税[円]', candidates: ['国内源泉税[円]', '国内源泉税［円］', '国内源泉税（円）', '国内源泉所得税（円）'] },
  ];
  const missing = requiredGroups.filter(function(group) {
    return !group.candidates.some(function(header) {
      return headerIndexMap.hasOwnProperty(normalizeSourceHeaderName_(header));
    });
  }).map(function(group) {
    return group.label;
  });

  if (missing.length > 0) {
    throw new Error(
      '楽天配当金CSVには手入力列が必要です: ' +
      missing.join(', ') +
      '。CSVに「レート」「現地源泉税［円］」「国内源泉税［円］」を追加してください。'
    );
  }
}

function collectRakutenDividendManualInputAlerts_(records) {
  const alerts = [];

  records.forEach(function(record) {
    const symbol = text_(record['銘柄名']);
    const date = formatDateForAlert_(record['受渡日']);

    if (isBlankCell_(record['現地源泉税（円）'])) {
      alerts.push(
        '楽天配当金CSV: 現地源泉税［円］が未入力です' +
        ' / 銘柄名: ' + (symbol || '(空欄)') +
        ' / 入金日: ' + date
      );
    }

    if (isBlankCell_(record['国内源泉所得税（円）'])) {
      alerts.push(
        '楽天配当金CSV: 国内源泉税［円］が未入力です' +
        ' / 銘柄名: ' + (symbol || '(空欄)') +
        ' / 入金日: ' + date
      );
    }
  });

  return alerts;
}

function mapRakutenDividendProduct_(productRaw) {
  const product = text_(productRaw);
  if (product.indexOf('米国株') >= 0 || product.indexOf('外国株') >= 0) return '外株';
  if (product.indexOf('投資信託') >= 0 || product.indexOf('投信') >= 0) return '投信';
  if (product.indexOf('株') >= 0) return '株式';
  return product || '現金';
}

function normalizeRakutenCashRowsToRecords_(rows, headerRowIndex) {
  const headers = rows[headerRowIndex].map(function(v) { return String(v).trim(); });
  const headerIndexMap = buildHeaderIndexMap_(headers);
  const records = [];

  for (var r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || isEmptyRow_(row)) continue;

    const cashDate = getByHeaderCandidates_(row, headerIndexMap, ['入出金日']);
    const deposit = toOptionalNumber_(getByHeaderCandidates_(row, headerIndexMap, ['入金額[円]', '入金額［円］']));
    const withdrawal = toOptionalNumber_(getByHeaderCandidates_(row, headerIndexMap, ['出金額[円]', '出金額［円］']));
    const description = getByHeaderCandidates_(row, headerIndexMap, ['内容']);
    if (!cashDate && deposit === '' && withdrawal === '' && !description) continue;

    const isWithdrawal = withdrawal !== '' && withdrawal !== 0;
    const amount = isWithdrawal ? withdrawal : deposit;
    const record = buildEmptyBaseRecord_();

    record['約定日'] = cashDate;
    record['受渡日'] = cashDate;
    record['商品'] = '現金';
    record['銘柄コード'] = '';
    record['銘柄名'] = '';
    record['摘要'] = description || getByHeaderCandidates_(row, headerIndexMap, ['出金先']);
    record['取引区分'] = isWithdrawal ? '出金（振込）' : '入金（振込）';
    record['預り区分'] = '';
    record['発行通貨'] = '';
    record['数量'] = '';
    record['単価'] = '';
    record['受渡金額/決済損益'] = amount;
    record['手数料（税込）'] = 0;
    record['レート'] = '';
    record['決済通貨'] = 'JPY';
    record['売買損益（円）'] = '';
    record['国内消費税等（円）'] = '';
    record['現地源泉税（円）'] = '';
    record['国内源泉所得税（円）'] = '';
    record['国内源泉地方税（円）'] = '';
    record['元本払戻金'] = '';
    record['国内手数料（円）'] = '';
    record['現地手数料（円）'] = '';

    records.push(record);
  }

  return records;
}
