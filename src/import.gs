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
  const alerts = [];

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

  writeSheet_(ss, CONFIG.OUTPUT_DOMESTIC, TRADE_HEADERS, buildTradeRows_(domestic, alerts), true);
  writeSheet_(ss, CONFIG.OUTPUT_FOREIGN, TRADE_HEADERS, buildTradeRows_(foreign, alerts), true);
  writeSheet_(ss, CONFIG.OUTPUT_CASH_JPY, CASH_HEADERS, buildCashRows_(cashJpy), false);
  writeSheet_(ss, CONFIG.OUTPUT_CASH_USD, CASH_HEADERS, buildCashRows_(cashUsd), false);

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName(),
    sourceSheetName: sourceSheet.getName(),
    alerts,
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
    headers: { 'User-Agent': 'Mozilla/5.0' },
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
  return Utilities.parseCsv(csvText);
}

function buildSpreadsheetName_(sourceName) {
  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  const now = Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmmss');
  const cleanName = (sourceName || 'CSV').replace(/\.[^.]+$/, '');
  return `取引履歴_自動生成_${cleanName}_${now}`;
}