/**
 * 楽天 Phase 1:
 * - 野村共通フォーマット
 * - 楽天日本株
 * - 楽天米国株
 * を自動判定し、既存の BASE_HEADERS 形式へ正規化する
 */

function isRakutenSourceType_(sourceType) {
  return text_(sourceType).indexOf('rakuten_') === 0;
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

function normalizeRowsForImport_(rows) {
  const paddedRows = padRows_(rows || []);
  const detected = detectInputSourceTypeFromRows_(paddedRows);

  if (!detected || !detected.sourceType) {
    throw new Error('入力フォーマットを判定できませんでした。野村共通形式または楽天日本株/楽天米国株のヘッダーを確認してください。');
  }

  if (detected.sourceType === 'nomura_common') {
    return {
      sourceType: detected.sourceType,
      headerRowIndex: detected.headerRowIndex,
      normalizedRows: paddedRows,
      hasManualColumns: hasAllAdditionalManualHeadersInHeader_(paddedRows[detected.headerRowIndex] || [])
    };
  }

  let records = [];
  if (detected.sourceType === 'rakuten_jp_stock') {
    records = normalizeRakutenJapanStockRowsToRecords_(paddedRows, detected.headerRowIndex);
  } else if (detected.sourceType === 'rakuten_us_stock') {
    records = normalizeRakutenUsStockRowsToRecords_(paddedRows, detected.headerRowIndex);
  } else {
    throw new Error('Phase 1 未対応のフォーマットです: ' + detected.sourceType);
  }

  return {
    sourceType: detected.sourceType,
    headerRowIndex: detected.headerRowIndex,
    normalizedRows: buildRowsFromRecords_(records),
    hasManualColumns: false
  };
}

function findSupportedImportSheet_(ss) {
  const analyses = ss.getSheets().map(function(sheet) {
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
