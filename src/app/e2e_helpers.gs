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

  const request = normalizeE2EOutputInspectionPayload_(payload);

  if (!isTestDbTarget_(request.targetDbKey)) {
    throw new Error('E2E output inspection is limited to test DB targets.');
  }

  const ss = SpreadsheetApp.openById(request.spreadsheetId);
  if (ss.getName() !== '株管理ツール_E2E_TEST_OUTPUT') {
    throw new Error('E2E output inspection is limited to the E2E test output spreadsheet.');
  }

  const allSheetNames = ss.getSheets().map(function(sheet) {
    return sheet.getName();
  });

  const requiredSheetResults = request.requiredSheets.map(function(sheetName) {
    return {
      sheetName: sheetName,
      exists: allSheetNames.indexOf(sheetName) >= 0
    };
  });

  const absentSheetResults = request.absentSheets.map(function(sheetName) {
    const exists = allSheetNames.indexOf(sheetName) >= 0;
    return {
      sheetName: sheetName,
      exists: exists,
      absent: !exists
    };
  });

  const checkResults = request.checks.map(function(check, index) {
    return inspectE2EOutputSpreadsheetCheck_(ss, check, index);
  });

  return {
    ok: true,
    spreadsheetName: ss.getName(),
    sheetNames: allSheetNames,
    requiredSheetResults: requiredSheetResults,
    absentSheetResults: absentSheetResults,
    checkResults: checkResults
  };
}

function normalizeE2EOutputInspectionPayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('E2E output inspection payload must be an object.');
  }

  const request = {
    targetDbKey: requireE2EStringField_(payload.targetDbKey, 'targetDbKey', 32, true),
    spreadsheetId: requireE2EStringField_(payload.spreadsheetId, 'spreadsheetId', 128, true),
    requiredSheets: normalizeE2EStringList_(payload.requiredSheets, 'requiredSheets', 10, 80),
    absentSheets: normalizeE2EStringList_(payload.absentSheets, 'absentSheets', 10, 80),
    checks: normalizeE2EOutputInspectionChecks_(payload.checks)
  };

  const allowedSheetNames = getAllowedE2EOutputInspectionSheetNames_();
  request.requiredSheets.concat(request.absentSheets).forEach(function(sheetName) {
    assertAllowedE2EOutputInspectionSheetName_(sheetName, allowedSheetNames);
  });
  request.checks.forEach(function(check) {
    assertAllowedE2EOutputInspectionSheetName_(check.sheetName, allowedSheetNames);
  });

  return request;
}

function getAllowedE2EOutputInspectionSheetNames_() {
  return [
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
}

function assertAllowedE2EOutputInspectionSheetName_(sheetName, allowedSheetNames) {
  if (allowedSheetNames.indexOf(sheetName) < 0) {
    throw new Error('E2E output inspection cannot read sheet: ' + sheetName);
  }
}

function normalizeE2EStringList_(value, fieldName, maxItems, maxLength) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(fieldName + ' must be an array.');
  }

  if (value.length > maxItems) {
    throw new Error(fieldName + ' must contain at most ' + maxItems + ' items.');
  }

  const result = [];
  const seen = {};
  value.forEach(function(item, index) {
    const normalized = requireE2EStringField_(item, fieldName + '[' + index + ']', maxLength, true);
    if (!seen[normalized]) {
      seen[normalized] = true;
      result.push(normalized);
    }
  });
  return result;
}

function normalizeE2EOutputInspectionChecks_(value) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error('checks must be an array.');
  }

  if (value.length > 20) {
    throw new Error('checks must contain at most 20 items.');
  }

  const result = [];
  const seen = {};
  value.forEach(function(check, index) {
    if (!check || typeof check !== 'object' || Array.isArray(check)) {
      throw new Error('checks[' + index + '] must be an object.');
    }

    const normalized = {
      sheetName: requireE2EStringField_(check.sheetName, 'checks[' + index + '].sheetName', 80, true),
      headerName: requireE2EStringField_(check.headerName, 'checks[' + index + '].headerName', 120, true),
      expectedValue: requireE2EStringField_(check.expectedValue, 'checks[' + index + '].expectedValue', 500, false)
    };
    const key = normalized.sheetName + '\n' + normalized.headerName + '\n' + normalized.expectedValue;
    if (!seen[key]) {
      seen[key] = true;
      result.push(normalized);
    }
  });

  return result;
}

function requireE2EStringField_(value, fieldName, maxLength, trimValue) {
  if (typeof value !== 'string') {
    throw new Error(fieldName + ' must be a string.');
  }

  const result = trimValue ? text_(value) : value;
  if (result === '') {
    throw new Error(fieldName + ' is required.');
  }

  if (result.length > maxLength) {
    throw new Error(fieldName + ' must be at most ' + maxLength + ' characters.');
  }

  return result;
}

function inspectE2EOutputSpreadsheetCheck_(ss, check, checkIndex) {
  const result = {
    checkIndex: checkIndex,
    sheetName: check.sheetName,
    headerName: check.headerName,
    sheetExists: false,
    headerFound: false,
    headerColumn: null,
    found: false,
    rowNumber: null
  };

  const sheet = ss.getSheetByName(check.sheetName);
  if (!sheet) {
    return result;
  }
  result.sheetExists = true;

  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastColumn <= 0 || lastRow <= 0) {
    return result;
  }

  const headerRow = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const headerIndex = headerRow.indexOf(check.headerName);
  if (headerIndex < 0) {
    return result;
  }

  result.headerFound = true;
  result.headerColumn = headerIndex + 1;

  if (lastRow <= 1) {
    return result;
  }

  const foundRange = sheet
    .getRange(2, result.headerColumn, lastRow - 1, 1)
    .createTextFinder(check.expectedValue)
    .useRegularExpression(false)
    .matchCase(true)
    .matchEntireCell(true)
    .findNext();

  if (foundRange) {
    result.found = true;
    result.rowNumber = foundRange.getRow();
  }

  return result;
}
