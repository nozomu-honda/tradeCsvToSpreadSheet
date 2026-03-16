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
    if (['保有数', '手数料の消費税額', '平均取得単価', '手数料抜き売値', '取得価格', '売却損益', '簿価', '銘柄ごとの残高', 'FX2の期末簿価', '残高', '月次残高'].includes(h)) {
      width = 140;
    }
    sheet.setColumnWidth(i + 1, width);
  });

  const currencyLike = new Set([
    '単価', '受渡金額/決済損益', '手数料（税込）', '売買損益（円）',
    '手数料の消費税額', '平均取得単価', '手数料抜き売値', '取得価格', '売却損益',
    '簿価', '銘柄ごとの残高', '残高', '月次残高'
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