function writeSheet_(ss, sheetName, headers, rows, isTradeSheet) {
  let actualHeaders = headers.slice();
  let valuesRows = rows;

  if (isTradeSheet) {
    actualHeaders = headers.concat(['__highlight_symbol__']);
  }

  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear();
  }

  const values = [actualHeaders].concat(valuesRows);
  sheet.getRange(1, 1, values.length, actualHeaders.length).setValues(values);

  styleSheet_(sheet, actualHeaders, values.length);
  sheet.setFrozenRows(1);

  if (values.length > 1) {
    sheet.getRange(2, 1, values.length - 1, 2).setNumberFormat('yyyy/MM/dd');
  }

  if (isTradeSheet && rows.length > 0) {
    const holdingCol = actualHeaders.indexOf('保有数') + 1;
    const symbolCol = actualHeaders.indexOf('銘柄名') + 1;
    const helperCol = actualHeaders.indexOf('__highlight_symbol__') + 1;

    const zeroRule = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberEqualTo(0)
      .setFontColor('#d93025')
      .setRanges([sheet.getRange(2, holdingCol, rows.length, 1)])
      .build();

    const positiveHoldingLastTradeRule = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + columnToLetter_(helperCol) + '2="YES"')
      .setBackground('#d9f0ff')
      .setRanges([sheet.getRange(2, symbolCol, rows.length, 1)])
      .build();

    sheet.setConditionalFormatRules([zeroRule, positiveHoldingLastTradeRule]);
  }

  hideColumnsByName_(sheet, actualHeaders, sheetName);

  const helperIndex = actualHeaders.indexOf('__highlight_symbol__');
  if (helperIndex >= 0) {
    sheet.hideColumns(helperIndex + 1);
  }

  const filterRange = sheet.getRange(1, 1, Math.max(values.length, 2), actualHeaders.length);
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

  headers.forEach(function(h, i) {
    let width = 110;
    if (['約定日', '受渡日'].includes(h)) width = 95;
    if (h === '銘柄名') width = 280;
    if (['取引区分', '摘要', '預り区分'].includes(h)) width = 120;
    if (['商品', '銘柄コード', '発行通貨', '決済通貨', '元本払戻金'].includes(h)) width = 100;
    if ([
      '数量', '単価', '受渡金額/決済損益', '手数料（税込）', 'レート', '売買損益（円）',
      '国内消費税等（円）', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）',
      '国内手数料（円）', '現地手数料（円）'
    ].includes(h)) {
      width = 120;
    }
    if ([
      '保有数', '手数料の消費税額', '平均取得単価', '手数料抜き売値', '取得価格',
      '売却損益', '簿価', '銘柄ごとの残高', 'FX2の期末簿価', '残高', '月次残高'
    ].includes(h)) {
      width = 140;
    }
    if (h === '__highlight_symbol__') width = 40;
    sheet.setColumnWidth(i + 1, width);
  });

  const currencyLike = new Set([
    '単価', '受渡金額/決済損益', '手数料（税込）', '売買損益（円）',
    '国内消費税等（円）', '現地源泉税（円）', '国内源泉所得税（円）', '国内源泉地方税（円）',
    '国内手数料（円）', '現地手数料（円）',
    '手数料の消費税額', '手数料抜き売値', '取得価格', '売却損益',
    '簿価', '銘柄ごとの残高', '残高', '月次残高'
  ]);

  const qtyLike = new Set(['数量', '保有数']);

  headers.forEach(function(h, i) {
    if (rowCount <= 1) return;
    const range = sheet.getRange(2, i + 1, rowCount - 1, 1);

    if (currencyLike.has(h)) {
      range.setNumberFormat('#,##0;[Red]-#,##0;0');
    } else if (qtyLike.has(h)) {
      range.setNumberFormat('#,##0;[Red]-#,##0;0');
    } else if (h === '平均取得単価') {
      range.setNumberFormat('#,##0;[Red]-#,##0;0');
    } else if (h === 'レート') {
      range.setNumberFormat('#,##0.00');
    }
  });
}

function hideColumnsByName_(sheet, headers, sheetName) {
  const hideMap = {};
  hideMap[CONFIG.OUTPUT_JAPAN_STOCK] = ['摘要', '発行通貨', 'レート', '決済通貨'];
  hideMap[CONFIG.OUTPUT_US_STOCK] = ['摘要'];
  hideMap[CONFIG.OUTPUT_FOREIGN_BOND] = ['摘要'];
  hideMap[CONFIG.OUTPUT_FUND] = ['摘要', '発行通貨', 'レート', '決済通貨'];

  const targetNames = hideMap[sheetName] || [];
  targetNames.forEach(function(name) {
    const idx = headers.indexOf(name);
    if (idx >= 0) {
      sheet.hideColumns(idx + 1);
    }
  });
}
