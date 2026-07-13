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

  const outputReset = resetE2EOutputSpreadsheetForTarget_(targetDbKey);

  return {
    ok: true,
    targetDbKey: targetDbKey,
    dbFolderMode: 'root',
    outputReset: outputReset,
  };
}

function resetE2EOutputSpreadsheetForTarget_(targetDbKey) {
  if (!isTestDbTarget_(targetDbKey)) {
    throw new Error('E2E output reset is limited to test DB targets.');
  }

  const outputMeta = getManagedOutputSpreadsheet_(targetDbKey, 'e2e-output-reset', {
    e2eUseRootStorage: true,
  });
  const resetResult = resetE2EOutputSpreadsheet_(outputMeta.ss);
  resetResult.outputSpreadsheetReused = outputMeta.reused;
  resetResult.outputSpreadsheetMode = outputMeta.mode;
  return resetResult;
}

function resetE2EOutputSpreadsheet_(ss) {
  const expectedName = getE2EOutputSpreadsheetName_();
  if (!ss || ss.getName() !== expectedName) {
    throw new Error('E2E output reset is limited to the E2E test output spreadsheet.');
  }

  const resetSheetNames = getE2EOutputSheetNamesToReset_();
  const resetTargetsByName = {};
  resetSheetNames.forEach(function(sheetName) {
    resetTargetsByName[sheetName] = true;
  });

  const beforeSheets = ss.getSheets();
  const sheetsToDelete = beforeSheets.filter(function(sheet) {
    return resetTargetsByName[sheet.getName()] === true;
  });
  let placeholderCreated = false;

  if (sheetsToDelete.length === beforeSheets.length) {
    ss.insertSheet('__E2E_EMPTY__');
    placeholderCreated = true;
  }

  const deletedSheetNames = [];
  sheetsToDelete.forEach(function(sheet) {
    const sheetName = sheet.getName();
    ss.deleteSheet(sheet);
    deletedSheetNames.push(sheetName);
  });

  SpreadsheetApp.flush();

  return {
    ok: true,
    spreadsheetName: ss.getName(),
    deletedSheetNames: deletedSheetNames,
    remainingSheetNames: ss.getSheets().map(function(sheet) {
      return sheet.getName();
    }),
    placeholderCreated: placeholderCreated,
  };
}

function getE2EOutputSpreadsheetName_() {
  return '株管理ツール_E2E_TEST_OUTPUT';
}

function getE2EOutputSheetNamesToReset_() {
  return unique_([
    CONFIG.SOURCE_SHEET_NAME,
    CONFIG.OUTPUT_JAPAN_STOCK,
    CONFIG.OUTPUT_US_STOCK,
    CONFIG.OUTPUT_FOREIGN_BOND,
    CONFIG.OUTPUT_FUND,
    CONFIG.OUTPUT_CASH_JPY,
    CONFIG.OUTPUT_CASH_USD,
    CONFIG.RAKUTEN_OUTPUT_JAPAN_STOCK,
    CONFIG.RAKUTEN_OUTPUT_US_STOCK,
    CONFIG.RAKUTEN_OUTPUT_FUND
  ]);
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
  if (ss.getName() !== getE2EOutputSpreadsheetName_()) {
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
  const rowCheckResults = request.rowChecks.map(function(rowCheck, index) {
    return inspectE2EOutputSpreadsheetRowCheck_(ss, rowCheck, index);
  });

  return {
    ok: true,
    spreadsheetName: ss.getName(),
    sheetNames: allSheetNames,
    requiredSheetResults: requiredSheetResults,
    absentSheetResults: absentSheetResults,
    checkResults: checkResults,
    rowCheckResults: rowCheckResults
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
    checks: normalizeE2EOutputInspectionChecks_(payload.checks),
    rowChecks: normalizeE2EOutputInspectionRowChecks_(payload.rowChecks)
  };

  const allowedSheetNames = getAllowedE2EOutputInspectionSheetNames_();
  request.requiredSheets.concat(request.absentSheets).forEach(function(sheetName) {
    assertAllowedE2EOutputInspectionSheetName_(sheetName, allowedSheetNames);
  });
  request.checks.forEach(function(check) {
    assertAllowedE2EOutputInspectionSheetName_(check.sheetName, allowedSheetNames);
  });
  request.rowChecks.forEach(function(rowCheck) {
    assertAllowedE2EOutputInspectionSheetName_(rowCheck.sheetName, allowedSheetNames);
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

function normalizeE2EOutputInspectionRowChecks_(value) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error('rowChecks must be an array.');
  }

  if (value.length > 10) {
    throw new Error('rowChecks must contain at most 10 items.');
  }

  const result = [];
  const seen = {};
  value.forEach(function(rowCheck, index) {
    if (!rowCheck || typeof rowCheck !== 'object' || Array.isArray(rowCheck)) {
      throw new Error('rowChecks[' + index + '] must be an object.');
    }

    const anchor = rowCheck.anchor;
    if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) {
      throw new Error('rowChecks[' + index + '].anchor must be an object.');
    }

    if (!Array.isArray(rowCheck.checks)) {
      throw new Error('rowChecks[' + index + '].checks must be an array.');
    }

    if (rowCheck.checks.length === 0) {
      throw new Error('rowChecks[' + index + '].checks must contain at least 1 item.');
    }

    if (rowCheck.checks.length > 10) {
      throw new Error('rowChecks[' + index + '].checks must contain at most 10 items.');
    }

    const normalizedChecks = [];
    rowCheck.checks.forEach(function(check, checkIndex) {
      if (!check || typeof check !== 'object' || Array.isArray(check)) {
        throw new Error('rowChecks[' + index + '].checks[' + checkIndex + '] must be an object.');
      }

      normalizedChecks.push({
        headerName: requireE2EStringField_(check.headerName, 'rowChecks[' + index + '].checks[' + checkIndex + '].headerName', 120, true),
        expectedValue: requireE2EStringField_(check.expectedValue, 'rowChecks[' + index + '].checks[' + checkIndex + '].expectedValue', 500, false, true)
      });
    });

    const normalized = {
      sheetName: requireE2EStringField_(rowCheck.sheetName, 'rowChecks[' + index + '].sheetName', 80, true),
      anchor: {
        headerName: requireE2EStringField_(anchor.headerName, 'rowChecks[' + index + '].anchor.headerName', 120, true),
        expectedValue: requireE2EStringField_(anchor.expectedValue, 'rowChecks[' + index + '].anchor.expectedValue', 500, false)
      },
      checks: normalizedChecks
    };
    const key = normalized.sheetName + '\n' + normalized.anchor.headerName + '\n' + normalized.anchor.expectedValue + '\n' +
      normalized.checks.map(function(check) {
        return check.headerName + '\n' + check.expectedValue;
      }).join('\n');
    if (!seen[key]) {
      seen[key] = true;
      result.push(normalized);
    }
  });

  return result;
}

function requireE2EStringField_(value, fieldName, maxLength, trimValue, allowEmpty) {
  if (typeof value !== 'string') {
    throw new Error(fieldName + ' must be a string.');
  }

  const result = trimValue ? text_(value) : value;
  if (result === '' && !allowEmpty) {
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

function inspectE2EOutputSpreadsheetRowCheck_(ss, rowCheck, rowCheckIndex) {
  const result = {
    rowCheckIndex: rowCheckIndex,
    sheetName: rowCheck.sheetName,
    sheetExists: false,
    anchor: {
      headerName: rowCheck.anchor.headerName,
      headerFound: false,
      headerColumn: null,
      found: false,
      candidateCount: 0
    },
    found: false,
    rowNumber: null,
    checks: []
  };

  const sheet = ss.getSheetByName(rowCheck.sheetName);
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
  const anchorIndex = headerRow.indexOf(rowCheck.anchor.headerName);
  if (anchorIndex < 0) {
    return result;
  }

  result.anchor.headerFound = true;
  result.anchor.headerColumn = anchorIndex + 1;
  result.checks = buildE2EOutputSpreadsheetRowCheckResults_(headerRow, rowCheck.checks, null);

  if (lastRow <= 1) {
    return result;
  }

  const anchorRanges = sheet
    .getRange(2, result.anchor.headerColumn, lastRow - 1, 1)
    .createTextFinder(rowCheck.anchor.expectedValue)
    .useRegularExpression(false)
    .matchCase(true)
    .matchEntireCell(true)
    .findAll();
  const candidateRows = anchorRanges.map(function(range) {
    return range.getRow();
  });
  result.anchor.found = candidateRows.length > 0;
  result.anchor.candidateCount = candidateRows.length;

  let firstCandidateCheckResults = null;
  for (let i = 0; i < candidateRows.length; i += 1) {
    const rowNumber = candidateRows[i];
    const checkResults = buildE2EOutputSpreadsheetRowCheckResults_(headerRow, rowCheck.checks, function(headerColumn) {
      return sheet.getRange(rowNumber, headerColumn).getDisplayValue();
    });
    const allMatched = checkResults.every(function(checkResult) {
      return checkResult.matched;
    });

    if (!firstCandidateCheckResults) {
      firstCandidateCheckResults = checkResults;
    }

    if (allMatched) {
      result.found = true;
      result.rowNumber = rowNumber;
      result.checks = checkResults;
      return result;
    }
  }

  if (firstCandidateCheckResults) {
    result.checks = firstCandidateCheckResults;
  }

  return result;
}

function buildE2EOutputSpreadsheetRowCheckResults_(headerRow, checks, valueGetter) {
  return checks.map(function(check, index) {
    const headerIndex = headerRow.indexOf(check.headerName);
    const checkResult = {
      checkIndex: index,
      headerName: check.headerName,
      headerFound: headerIndex >= 0,
      headerColumn: headerIndex >= 0 ? headerIndex + 1 : null,
      matched: false
    };

    if (headerIndex < 0 || !valueGetter) {
      return checkResult;
    }

    checkResult.matched = valueGetter(headerIndex + 1) === check.expectedValue;
    return checkResult;
  });
}
