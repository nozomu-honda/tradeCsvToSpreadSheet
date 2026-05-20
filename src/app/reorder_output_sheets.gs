function reorderOutputSheets_(ss) {
  const desiredOrder = [
    CONFIG.SOURCE_SHEET_NAME,
    CONFIG.OUTPUT_JAPAN_STOCK,
    CONFIG.OUTPUT_US_STOCK,
    CONFIG.OUTPUT_FOREIGN_BOND,
    CONFIG.OUTPUT_FUND,
    CONFIG.OUTPUT_CASH_JPY,
    CONFIG.OUTPUT_CASH_USD
  ];

  desiredOrder.forEach(function(sheetName, index) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    sheet.activate();
    ss.moveActiveSheet(index + 1);
  });
}
