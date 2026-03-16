const CONFIG = {
  SOURCE_SHEET_NAME: '元データ',
  OUTPUT_DOMESTIC: '国内取引',
  OUTPUT_FOREIGN: '外国取引',
  OUTPUT_CASH_JPY: '金銭残高（円）',
  OUTPUT_CASH_USD: '金銭残高（ドル）',
};

const BASE_HEADERS = [
  '約定日', '受渡日', '商品', '銘柄コード', '銘柄名', '摘要', '取引区分', '預り区分',
  '発行通貨', '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '決済通貨', '売買損益（円）'
];

const TRADE_HEADERS = [
  ...BASE_HEADERS,
  '保有数',
  '手数料の消費税額',
  '手数料抜き売値',
  '取得価格',
  '売却損益',
  '簿価',
  '銘柄ごとの残高',
  '平均取得単価',
  'FX2の期末簿価',
];

const CASH_HEADERS = [
  ...BASE_HEADERS,
  '残高',
  '月次残高',
];

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialCsvUrl = (e && e.parameter && e.parameter.csvUrl) ? e.parameter.csvUrl : '';
  return template.evaluate().setTitle('CSVから4シート生成');
}

function runFromWebApp(payload) {
  if (!payload) {
    throw new Error('入力がありません。');
  }

  const csvUrl = (payload.csvUrl || '').trim();
  const uploadedCsvText = payload.uploadedCsvText || '';
  const uploadedFileName = (payload.uploadedFileName || '').trim();

  if (!csvUrl && !uploadedCsvText) {
    throw new Error('CSVリンクまたはCSVファイルを指定してください。');
  }

  if (csvUrl && uploadedCsvText) {
    throw new Error('CSVリンクとCSVファイルは同時に指定せず、どちらか一方だけ指定してください。');
  }

  if (uploadedCsvText) {
    return createSpreadsheetFromCsvText_(uploadedCsvText, uploadedFileName || 'uploaded.csv');
  }

  return createSpreadsheetFromCsvUrl_(csvUrl);
}

function createSpreadsheetFromCsvUrl_(csvUrl) {
  if (!csvUrl) {
    throw new Error('CSVリンクを入力してください。');
  }

  const normalizedUrl = normalizeCsvUrl_(csvUrl);
  const csvText = fetchCsvText_(normalizedUrl);
  return createSpreadsheetFromCsvText_(csvText, 'link.csv', normalizedUrl);
}

function createSpreadsheetFromCsvText_(csvText, sourceName, normalizedUrl) {
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

  sourceSheet.getRange(1, 1, paddedRows.length, paddedRows[0].length).setValues(paddedRows);

  const result = buildOutputSheetsFromSourceSheet_(ss, sourceSheet);
  result.inputType = normalizedUrl ? 'url' : 'upload';
  result.normalizedUrl = normalizedUrl || '';
  result.sourceName = sourceName || '';
  return result;
}

function buildOutputSheetsFromSourceSheet_(ss, sourceSheet) {
  const records = readInputRecords_(sourceSheet);

  const domestic = records
    .filter(r => ['株式', '投信'].includes(r['商品']))
    .sort(sortTradeRows_);

  const foreign = records
    .filter(r => r['商品'] === '外株')
    .sort(sortTradeRows_);

  const cashJpy = records
    .filter(r => {
      const c = normalizeCurrency_(r['決済通貨']);
      return c === '' || c === 'JPY';
    })
    .sort(sortCashRows_);

  const cashUsd = records
    .filter(r => normalizeCurrency_(r['決済通貨']) === 'USD')
    .sort(sortCashRows_);

  writeSheet_(ss, CONFIG.OUTPUT_DOMESTIC, TRADE_HEADERS, buildTradeRows_(domestic), true);
  writeSheet_(ss, CONFIG.OUTPUT_FOREIGN, TRADE_HEADERS, buildTradeRows_(foreign), true);
  writeSheet_(ss, CONFIG.OUTPUT_CASH_JPY, CASH_HEADERS, buildCashRows_(cashJpy), false);
  writeSheet_(ss, CONFIG.OUTPUT_CASH_USD, CASH_HEADERS, buildCashRows_(cashUsd), false);

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName(),
    sourceSheetName: sourceSheet.getName(),
    counts: {
      all: records.length,
      domestic: domestic.length,
      foreign: foreign.length,
      cashJpy: cashJpy.length,
      cashUsd: cashUsd.length,
    }
  };
}

function normalizeCsvUrl_(url) {
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
  }

  const openMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch && url.includes('drive.google.com')) {
    return `https://drive.google.com/uc?export=download&id=${openMatch[1]}`;
  }

  return url;
}

function fetchCsvText_(url) {
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(`CSV取得に失敗しました。HTTP ${code}`);
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
  let rows = Utilities.parseCsv(csvText);
  if (containsReplacementChar_(rows)) {
    return rows;
  }
  return rows;
}

function buildSpreadsheetName_(sourceName) {
  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  const now = Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmmss');
  const cleanName = (sourceName || 'CSV').replace(/\.[^.]+$/, '');
  return `取引履歴_自動生成_${cleanName}_${now}`;
}

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

function buildTradeRows_(records) {
  const rows = [];
  const stateBySymbol = {};
  let prevSymbol = null;

  records.forEach(r => {
    const symbol = r['銘柄名'];

    if (prevSymbol !== null && prevSymbol !== symbol) {
      rows.push(new Array(TRADE_HEADERS.length).fill(''));
    }
    prevSymbol = symbol;

    const st = stateBySymbol[symbol] || { holding: 0, balance: 0 };

    const qty = r['数量'];
    const price = r['単価'];
    const amount = r['受渡金額/決済損益'];
    const fee = r['手数料（税込）'];
    const tx = r['取引区分'];
    const product = r['商品'];

    const prevHolding = st.holding;
    const prevBalance = st.balance;

    let holdingDelta = 0;
    if (['現物買付', '現物再投', '入庫（増減資）'].includes(tx)) {
      holdingDelta = qty;
    } else if (['現物売却', '現物買取'].includes(tx)) {
      holdingDelta = -qty;
    }

    const holding = prevHolding + holdingDelta;

    let feeTax = '';
    if (tx === '現物買付') {
      feeTax = Math.floor((fee / 1.1) * 0.1);
    } else if (tx === '現物再投') {
      feeTax = 0;
    }

    let sellNet = '';
    if (['現物売却', '現物買取'].includes(tx)) {
      sellNet = product === '投信' ? qty * price / 10000 : qty * price;
    }

    let acquisitionPrice = '';
    if (['現物売却', '現物買取'].includes(tx) && prevHolding !== 0) {
      acquisitionPrice = (prevBalance / prevHolding) * qty;
    }

    let bookValue = '';
    if (['現物買付', '現物再投', '入庫（増減資）'].includes(tx)) {
      const tax = feeTax === '' ? 0 : feeTax;
      bookValue = amount - tax;
    } else if (['現物売却', '現物買取'].includes(tx) && acquisitionPrice !== '') {
      bookValue = -acquisitionPrice;
    }

    const symbolBalance = prevBalance + (bookValue === '' ? 0 : bookValue);

    let avgUnitPrice = '';
    if (['現物買付', '現物再投'].includes(tx) && prevHolding > 0 && holding !== 0) {
      avgUnitPrice = product === '投信'
        ? Math.ceil((symbolBalance / holding) * 10000)
        : Math.ceil(symbolBalance / holding);
    }

    let realizedGain = '';
    if (sellNet !== '' && acquisitionPrice !== '') {
      realizedGain = sellNet - acquisitionPrice;
    }

    stateBySymbol[symbol] = { holding, balance: symbolBalance };

    rows.push([
      r['約定日'],
      r['受渡日'],
      r['商品'],
      r['銘柄コード'],
      r['銘柄名'],
      r['摘要'],
      r['取引区分'],
      r['預り区分'],
      r['発行通貨'],
      displayValue_(qty),
      displayValue_(price),
      displayValue_(amount),
      displayValue_(fee),
      displayValue_(r['レート']),
      r['決済通貨'],
      displayValue_(r['売買損益（円）']),
      holding,
      feeTax,
      sellNet,
      acquisitionPrice,
      realizedGain,
      bookValue,
      symbolBalance,
      avgUnitPrice,
      ''
    ]);
  });

  return rows;
}

function buildCashRows_(records) {
  const rows = [];
  let runningBalance = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const next = records[i + 1] || null;

    const amount = r['受渡金額/決済損益'];
    const tx = r['取引区分'];

    let delta = 0;
    if (['現物買付', '現物再投', '出金（振込）', '現物募集'].includes(tx)) {
      delta = -amount;
    } else if (['現物売却', '入金（利金）', '入金（配当金）', '償還', '入金（振込）'].includes(tx)) {
      delta = amount;
    }

    runningBalance += delta;

    const monthEndBalance =
      !next || !sameYearMonth_(r['受渡日'], next['受渡日']) ? runningBalance : '';

    rows.push([
      r['約定日'],
      r['受渡日'],
      r['商品'],
      r['銘柄コード'],
      r['銘柄名'],
      r['摘要'],
      r['取引区分'],
      r['預り区分'],
      r['発行通貨'],
      displayValue_(r['数量']),
      displayValue_(r['単価']),
      displayValue_(amount),
      displayValue_(r['手数料（税込）']),
      displayValue_(r['レート']),
      r['決済通貨'],
      displayValue_(r['売買損益（円）']),
      runningBalance,
      monthEndBalance
    ]);
  }

  return rows;
}

function writeSheet_(ss, sheetName, headers, rows, isTradeSheet) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear();
  }

  const values = [headers, ...rows];
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);

  styleSheet_(sheet, headers, values.length);
  sheet.setFrozenRows(1);

  if (values.length > 1) {
    sheet.getRange(2, 1, values.length - 1, 2).setNumberFormat('yyyy/MM/dd');
  }

  if (isTradeSheet && rows.length > 0) {
    const col = headers.indexOf('保有数') + 1;
    const range = sheet.getRange(2, col, rows.length, 1);
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberEqualTo(0)
      .setFontColor('#d93025')
      .setRanges([range])
      .build();
    sheet.setConditionalFormatRules([rule]);
  }

  const filterRange = sheet.getRange(1, 1, Math.max(values.length, 2), headers.length);
  if (sheet.getFilter()) {
    sheet.getFilter().remove();
  }
  filterRange.createFilter();
}

function styleSheet_(sheet, headers, rowCount) {
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#1f4e78')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  if (rowCount > 1) {
    sheet.getRange(2, 1, rowCount - 1, headers.length)
      .setVerticalAlignment('middle');
  }

  headers.forEach((h, i) => {
    let width = 110;
    if (['約定日', '受渡日'].includes(h)) width = 95;
    if (h === '銘柄名') width = 280;
    if (['取引区分', '摘要', '預り区分'].includes(h)) width = 120;
    if (['商品', '銘柄コード', '発行通貨', '決済通貨'].includes(h)) width = 90;
    if (['数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '売買損益（円）'].includes(h)) width = 120;
    if (['保有数', '手数料の消費税額', '手数料抜き売値', '取得価格', '売却損益', '簿価', '銘柄ごとの残高', '平均取得単価', 'FX2の期末簿価', '残高', '月次残高'].includes(h)) width = 140;
    sheet.setColumnWidth(i + 1, width);
  });

  const currencyLike = new Set([
    '単価', '受渡金額/決済損益', '手数料（税込）', '売買損益（円）',
    '手数料の消費税額', '手数料抜き売値', '取得価格', '売却損益',
    '簿価', '銘柄ごとの残高', '平均取得単価', '残高', '月次残高'
  ]);

  const qtyLike = new Set(['数量', '保有数']);

  headers.forEach((h, i) => {
    if (rowCount <= 1) return;
    const range = sheet.getRange(2, i + 1, rowCount - 1, 1);

    if (currencyLike.has(h)) {
      range.setNumberFormat('#,##0;[Red]-#,##0;');
    } else if (qtyLike.has(h)) {
      range.setNumberFormat('#,##0;[Red]-#,##0;');
    } else if (h === 'レート') {
      range.setNumberFormat('#,##0.00');
    }
  });
}

function sortTradeRows_(a, b) {
  return compareText_(a['商品'], b['商品']) ||
         compareText_(a['銘柄名'], b['銘柄名']) ||
         compareDate_(a['受渡日'], b['受渡日']) ||
         compareDate_(a['約定日'], b['約定日']);
}

function sortCashRows_(a, b) {
  return compareDate_(a['受渡日'], b['受渡日']) ||
         compareDate_(a['約定日'], b['約定日']) ||
         compareText_(a['銘柄名'], b['銘柄名']);
}

function compareText_(a, b) {
  return text_(a).localeCompare(text_(b), 'ja');
}

function compareDate_(a, b) {
  const ta = a instanceof Date ? a.getTime() : 0;
  const tb = b instanceof Date ? b.getTime() : 0;
  return ta - tb;
}

function parseDate_(v) {
  if (v instanceof Date) return v;
  const s = text_(v);
  if (!s) return '';

  const normalized = s
    .replace(/年/g, '/')
    .replace(/月/g, '/')
    .replace(/日/g, '')
    .replace(/\./g, '/')
    .replace(/-/g, '/');

  const d = new Date(normalized);
  return isNaN(d.getTime()) ? '' : d;
}

function normalizeCurrency_(v) {
  const s = text_(v).toUpperCase();
  if (s === '円') return 'JPY';
  if (s === 'ドル') return 'USD';
  if (s === 'ＵＳＤ') return 'USD';
  if (s === 'ＵＳドル') return 'USD';
  return s;
}

function toNumber_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/,/g, '').trim();
  if (!s) return 0;
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function text_(v) {
  return String(v || '').trim();
}

function displayValue_(n) {
  return n === 0 ? '' : n;
}

function sameYearMonth_(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isEmptyRow_(row) {
  return row.every(v => v === '' || v === null || v === undefined);
}

function padRows_(rows) {
  const maxCols = Math.max(...rows.map(r => r.length));
  return rows.map(row => {
    const newRow = row.slice();
    while (newRow.length < maxCols) {
      newRow.push('');
    }
    return newRow;
  });
}

function looksLikeHtml_(text) {
  if (!text) return false;
  const head = String(text).slice(0, 500).toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
}

function hasCsvLikeHeader_(text) {
  if (!text) return false;
  const head = String(text).slice(0, 3000);
  return head.includes('約定日') || head.includes('受渡日') || head.includes('取引区分');
}

function containsReplacementChar_(rows) {
  return rows.some(row => row.some(cell => String(cell).includes('�')));
}