function readInputRecords_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headerRowIndex = findHeaderRowIndex_(values);

  if (headerRowIndex < 0) {
    throw new Error('実データのヘッダー行が見つかりません。');
  }

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
    const row = values[i].map(v => String(v).trim());
    const hasCore =
      row.includes('約定日') &&
      row.includes('受渡日') &&
      row.includes('商品') &&
      row.includes('銘柄名') &&
      row.includes('取引区分') &&
      row.includes('受渡金額/決済損益');

    if (hasCore) return i;
  }
  return -1;
}