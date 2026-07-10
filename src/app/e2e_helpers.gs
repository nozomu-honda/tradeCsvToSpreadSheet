function getConfiguredCiE2eToken_() {
  return text_(PropertiesService.getScriptProperties().getProperty('CI_E2E_TOKEN'));
}

function isCiE2eTokenConfigured_() {
  return !!getConfiguredCiE2eToken_();
}

function assertConfiguredCiE2eTokenForPayload_(payload) {
  const actual = text_(payload && payload.ciE2eToken);
  if (!actual) {
    throw new Error('E2E token is required.');
  }

  const props = PropertiesService.getScriptProperties();
  const expected = text_(props.getProperty('CI_E2E_TOKEN'));
  if (!expected) {
    props.setProperty('CI_E2E_TOKEN', actual);
    return;
  }

  if (!actual || actual !== expected) {
    throw new Error('E2E token is invalid.');
  }
}

function assertCiE2eTokenForWebAppIfConfigured_(payload) {
  if (isCiE2eTokenConfigured_()) {
    assertConfiguredCiE2eTokenForPayload_(payload);
  }
}

function shouldUseCiE2eRootDbFolder_(target) {
  const key = text_(target && target.key);
  if (!isTestDbTarget_(key)) {
    return false;
  }

  return text_(PropertiesService.getScriptProperties().getProperty('CI_E2E_DISABLE_DB_FOLDER')) === '1';
}

function enableCiE2eRootDbFolderForPayload_(payload) {
  if (!text_(payload && payload.ciE2eToken)) {
    return;
  }

  PropertiesService.getScriptProperties().setProperty('CI_E2E_DISABLE_DB_FOLDER', '1');
}

function prepareE2EWebAppRun(payload) {
  assertConfiguredCiE2eTokenForPayload_(payload);
  enableCiE2eRootDbFolderForPayload_(payload);

  const targetDbKey = text_(payload && payload.targetDbKey) || 'rakuten_test';
  if (!isTestDbTarget_(targetDbKey)) {
    throw new Error('E2E preparation is limited to test DB targets.');
  }

  return {
    ok: true,
    targetDbKey: targetDbKey,
    dbFolderMode: 'root',
  };
}

function cleanupE2EImportFromWebApp(payload) {
  assertConfiguredCiE2eTokenForPayload_(payload);
  enableCiE2eRootDbFolderForPayload_(payload);

  const targetDbKey = text_(payload && payload.targetDbKey);
  const importId = text_(payload && payload.importId);
  const insertedCount = toNumber_(payload && payload.insertedCount);

  if (!isTestDbTarget_(targetDbKey)) {
    throw new Error('E2E cleanup is limited to test DB targets.');
  }

  if (!importId) {
    throw new Error('E2E cleanup requires importId.');
  }

  const result = {
    ok: true,
    targetDbKey: targetDbKey,
    importId: importId,
    insertedCount: insertedCount,
    rollback: null,
    errors: []
  };

  if (insertedCount <= 0) {
    result.rollback = {
      skipped: true,
      reason: 'no inserted records in this import'
    };
    return result;
  }

  try {
    const rollbackResult = rollbackImport_(targetDbKey, importId);
    if (rollbackResult.rolledBackAt instanceof Date) {
      rollbackResult.rolledBackAt = rollbackResult.rolledBackAtText;
    }
    result.rollback = rollbackResult;
  } catch (e) {
    result.ok = false;
    result.errors.push('rollback: ' + (e && e.message ? e.message : String(e)));
  }

  return result;
}

function inspectE2EOutputSpreadsheetFromWebApp(payload) {
  assertConfiguredCiE2eTokenForPayload_(payload);
  enableCiE2eRootDbFolderForPayload_(payload);

  const targetDbKey = text_(payload && payload.targetDbKey);
  const spreadsheetId = text_(payload && payload.spreadsheetId);
  const requestedSheetNames = Array.isArray(payload && payload.sheetNames)
    ? payload.sheetNames.map(text_).filter(function(name) { return !!name; })
    : [];
  const maxRows = Math.min(Math.max(toNumber_(payload && payload.maxRows) || 25, 1), 100);
  const maxColumns = Math.min(Math.max(toNumber_(payload && payload.maxColumns) || 40, 1), 80);

  if (!isTestDbTarget_(targetDbKey)) {
    throw new Error('E2E output inspection is limited to test DB targets.');
  }

  if (!spreadsheetId) {
    throw new Error('E2E output inspection requires spreadsheetId.');
  }

  const allowedSheetNames = [
    CONFIG.SOURCE_SHEET_NAME,
    CONFIG.RAKUTEN_OUTPUT_JAPAN_STOCK,
    CONFIG.RAKUTEN_OUTPUT_US_STOCK,
    CONFIG.RAKUTEN_OUTPUT_FUND,
    CONFIG.OUTPUT_CASH_JPY,
    CONFIG.OUTPUT_CASH_USD,
    CONFIG.OUTPUT_JAPAN_STOCK,
    CONFIG.OUTPUT_US_STOCK,
    CONFIG.OUTPUT_FUND
  ];

  requestedSheetNames.forEach(function(sheetName) {
    if (allowedSheetNames.indexOf(sheetName) < 0) {
      throw new Error('E2E output inspection cannot read sheet: ' + sheetName);
    }
  });

  const ss = SpreadsheetApp.openById(spreadsheetId);
  if (ss.getName() !== '株管理ツール_E2E_TEST_OUTPUT') {
    throw new Error('E2E output inspection is limited to the E2E test output spreadsheet.');
  }

  const allSheetNames = ss.getSheets().map(function(sheet) {
    return sheet.getName();
  });
  const sheetNamesToRead = requestedSheetNames.length > 0 ? requestedSheetNames : allSheetNames.filter(function(name) {
    return allowedSheetNames.indexOf(name) >= 0;
  });
  const sheets = {};

  sheetNamesToRead.forEach(function(sheetName) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheets[sheetName] = {
        exists: false,
        rowCount: 0,
        columnCount: 0,
        values: []
      };
      return;
    }

    const rowCount = sheet.getLastRow();
    const columnCount = sheet.getLastColumn();
    const readRows = Math.min(rowCount, maxRows);
    const readColumns = Math.min(columnCount, maxColumns);
    const values = readRows > 0 && readColumns > 0
      ? sheet.getRange(1, 1, readRows, readColumns).getDisplayValues()
      : [];

    sheets[sheetName] = {
      exists: true,
      rowCount: rowCount,
      columnCount: columnCount,
      values: values
    };
  });

  return {
    ok: true,
    spreadsheetName: ss.getName(),
    sheetNames: allSheetNames,
    sheets: sheets
  };
}
