function reorderOutputSheets_(ss) {
  moveOutputSheetsInOrder_(ss, [
    CONFIG.SOURCE_SHEET_NAME,
    CONFIG.OUTPUT_JAPAN_STOCK,
    CONFIG.OUTPUT_US_STOCK,
    CONFIG.OUTPUT_FOREIGN_BOND,
    CONFIG.OUTPUT_FUND,
    CONFIG.OUTPUT_CASH_JPY,
    CONFIG.OUTPUT_CASH_USD
  ]);
}

function reorderRakutenOutputSheets_(ss) {
  moveOutputSheetsInOrder_(ss, [
    CONFIG.SOURCE_SHEET_NAME,
    CONFIG.RAKUTEN_OUTPUT_JAPAN_STOCK,
    CONFIG.RAKUTEN_OUTPUT_US_STOCK,
    CONFIG.OUTPUT_FOREIGN_BOND,
    CONFIG.RAKUTEN_OUTPUT_FUND,
    CONFIG.OUTPUT_CASH_JPY,
    CONFIG.OUTPUT_CASH_USD
  ]);
}

function moveOutputSheetsInOrder_(ss, desiredOrder) {
  desiredOrder.forEach(function(sheetName, index) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    sheet.activate();
    ss.moveActiveSheet(index + 1);
  });
}
