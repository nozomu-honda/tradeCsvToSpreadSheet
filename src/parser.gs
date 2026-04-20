function readInputRecords_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headerRowIndex = findHeaderRowIndex_(values);

  if (headerRowIndex < 0) {
    throw new Error('実データのヘッダー行が見つかりません。');
  }

  validateHeaderPlacement_(values, headerRowIndex);

  const headers = values[headerRowIndex].map(v => String(v).trim());

  const required = ['約定日', '受渡日', '商品', '銘柄名', '取引区分', '受渡金額/決済損益'];
  required.forEach(name => {
    if (!headers.includes(name)) {
      throw new Error(`必須列「${name}」が見つかりません。`);
    }
  });

  const records = [];

  for (let r = headerRowIndex + 1; r < values.length; r++) {
    const row = values[r];
    if (isEmptyRow_(row)) continue;

    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);

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

    records.push(obj);
  }

  return records;
}

function findHeaderRowIndex_(values) {
  for (let i = 0; i < values.length; i++) {
    if (isHeaderRow_(values[i])) return i;
  }
  return -1;
}

function validateHeaderPlacement_(values, headerRowIndex) {
  if (headerRowIndex !== 0) {
    throw new Error(`入力CSV異常: ヘッダー行が1行目ではありません。${headerRowIndex + 1}行目を確認してください。`);
  }

  for (let i = headerRowIndex + 1; i < values.length; i++) {
    if (isHeaderRow_(values[i])) {
      throw new Error(`入力CSV異常: データ途中にヘッダー行があります。${i + 1}行目を確認してください。`);
    }
  }
}

function isHeaderRow_(row) {
  const normalized = row.map(v => String(v).trim());
  return (
    normalized.includes('約定日') &&
    normalized.includes('受渡日') &&
    normalized.includes('商品') &&
    normalized.includes('銘柄名') &&
    normalized.includes('取引区分') &&
    normalized.includes('受渡金額/決済損益')
  );
}
