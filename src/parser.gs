function readInputRecords_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headerRowIndex = findHeaderRowIndex_(values);

  if (headerRowIndex < 0) {
    throw new Error('実データのヘッダー行が見つかりません。');
  }

  validateHeaderPlacement_(values, headerRowIndex);

  const headers = values[headerRowIndex].map(function(v) {
    return String(v).trim();
  });

  validateHeaderNames_(headers);

  const records = [];

  for (let r = headerRowIndex + 1; r < values.length; r++) {
    const row = values[r];
    if (isEmptyRow_(row)) continue;

    const obj = {};
    headers.forEach(function(h, i) {
      obj[h] = row[i];
    });

    if (!obj['約定日']) continue;

    obj['約定日'] = parseDate_(obj['約定日']);
    obj['受渡日'] = parseDate_(obj['受渡日']);
    obj['商品'] = text_(obj['商品']);
    obj['銘柄コード'] = text_(obj['銘柄コード']);
    obj['銘柄名'] = text_(obj['銘柄名']);
    obj['摘要'] = text_(obj['摘要']);
    obj['取引区分'] = text_(obj['取引区分']);
    obj['預り区分'] = text_(obj['預り区分']);
    obj['発行通貨'] = normalizeCurrency_(obj['発行通貨']);
    obj['決済通貨'] = normalizeCurrency_(obj['決済通貨']);
    obj['数量'] = toNumber_(obj['数量']);
    obj['単価'] = toNumber_(obj['単価']);
    obj['受渡金額/決済損益'] = toNumber_(obj['受渡金額/決済損益']);
    obj['手数料（税込）'] = toNumber_(obj['手数料（税込）']);
    obj['レート'] = toNumber_(obj['レート']);
    obj['売買損益（円）'] = toNumber_(obj['売買損益（円）']);
    obj['国内消費税等（円）'] = toOptionalNumber_(obj['国内消費税等（円）']);
    obj['現地源泉税（円）'] = toOptionalNumber_(obj['現地源泉税（円）']);
    obj['国内源泉所得税（円）'] = toOptionalNumber_(obj['国内源泉所得税（円）']);
    obj['国内源泉地方税（円）'] = toOptionalNumber_(obj['国内源泉地方税（円）']);

    records.push(obj);
  }

  return records;
}

function validateHeaderNames_(headers) {
  const required = ['約定日', '受渡日', '商品', '銘柄名', '取引区分', '受渡金額/決済損益'];

  required.forEach(function(name) {
    if (!headers.includes(name)) {
      throw new Error('必須列「' + name + '」が見つかりません。');
    }
  });

  validateOptionalHeaderNames_(headers);
}

function validateOptionalHeaderNames_(headers) {
  const optionalRules = [
    {
      expected: '国内消費税等（円）',
      markers: ['国内消費税等']
    },
    {
      expected: '現地源泉税（円）',
      markers: ['現地源泉税']
    },
    {
      expected: '国内源泉所得税（円）',
      markers: ['国内源泉所得税']
    },
    {
      expected: '国内源泉地方税（円）',
      markers: ['国内源泉地方税']
    }
  ];

  headers.forEach(function(header) {
    const actual = String(header || '').trim();
    if (!actual) return;

    optionalRules.forEach(function(rule) {
      if (actual === rule.expected) return;

      const normalizedActual = normalizeHeaderNameForCompare_(actual);
      const normalizedExpected = normalizeHeaderNameForCompare_(rule.expected);

      const normalizedSame = normalizedActual === normalizedExpected;
      const suspiciousKeywordMatch = rule.markers.some(function(marker) {
        const normalizedMarker = normalizeHeaderNameForCompare_(marker);
        return (
          normalizedActual.indexOf(normalizedMarker) >= 0 ||
          normalizedMarker.indexOf(normalizedActual) >= 0
        );
      });

      if (normalizedSame || suspiciousKeywordMatch) {
        throw new Error(
          'ヘッダー名が一致しません。' +
          '「' + rule.expected + '」を使用してください。' +
          ' 実際: 「' + actual + '」'
        );
      }
    });
  });
}

function normalizeHeaderNameForCompare_(name) {
  return text_(name)
    .replace(/\s/g, '')
    .replace(/\(/g, '（')
    .replace(/\)/g, '）');
}

function findHeaderRowIndex_(values) {
  for (let i = 0; i < values.length; i++) {
    if (isHeaderRow_(values[i])) return i;
  }
  return -1;
}

function validateHeaderPlacement_(values, headerRowIndex) {
  for (let i = 0; i < headerRowIndex; i++) {
    if (looksLikeTradeDetailRow_(values[i])) {
      throw new Error('入力CSV異常: 明細ヘッダーより前に実データがあります。' + (i + 1) + '行目を確認してください。');
    }
  }

  for (let i = headerRowIndex + 1; i < values.length; i++) {
    if (isHeaderRow_(values[i])) {
      throw new Error('入力CSV異常: データ途中にヘッダー行があります。' + (i + 1) + '行目を確認してください。');
    }
  }
}

function looksLikeTradeDetailRow_(row) {
  if (!row || isEmptyRow_(row)) return false;

  const tradeDate = parseDate_(row[0]);
  const settlementDate = parseDate_(row[1]);
  const product = text_(row[2]);
  const symbolName = text_(row[4]);
  const tx = text_(row[6]);
  const amount = text_(row[11]);

  return !!tradeDate && !!settlementDate && !!product && !!symbolName && !!tx && amount !== '';
}

function isHeaderRow_(row) {
  const normalized = row.map(function(v) {
    return String(v).trim();
  });

  return (
    normalized.includes('約定日') &&
    normalized.includes('受渡日') &&
    normalized.includes('商品') &&
    normalized.includes('銘柄名') &&
    normalized.includes('取引区分') &&
    normalized.includes('受渡金額/決済損益')
  );
}