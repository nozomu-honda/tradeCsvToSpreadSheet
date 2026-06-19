function assertCiE2eTokenForPayload_(payload) {
  const expected = text_(PropertiesService.getScriptProperties().getProperty('CI_E2E_TOKEN'));
  if (!expected) {
    return;
  }

  const actual = text_(payload && payload.ciE2eToken);
  if (!actual || actual !== expected) {
    throw new Error('E2E token is invalid.');
  }
}

function assertConfiguredCiE2eTokenForPayload_(payload) {
  const expected = text_(PropertiesService.getScriptProperties().getProperty('CI_E2E_TOKEN'));
  if (!expected) {
    throw new Error('CI_E2E_TOKEN Script Property is required for E2E cleanup.');
  }

  const actual = text_(payload && payload.ciE2eToken);
  if (!actual || actual !== expected) {
    throw new Error('E2E token is invalid.');
  }
}

function cleanupE2EImportFromWebApp(payload) {
  assertConfiguredCiE2eTokenForPayload_(payload);

  const targetDbKey = text_(payload && payload.targetDbKey);
  const importId = text_(payload && payload.importId);
  const outputSpreadsheetId = text_(payload && payload.outputSpreadsheetId);
  const outputSpreadsheetMode = text_(payload && payload.outputSpreadsheetMode);
  const insertedCount = toNumber_(payload && payload.insertedCount);

  if (!isTestDbTarget_(targetDbKey)) {
    throw new Error('E2E cleanup is limited to test DB targets.');
  }

  const result = {
    ok: true,
    targetDbKey: targetDbKey,
    importId: importId,
    insertedCount: insertedCount,
    rollback: null,
    outputCleanup: {
      skipped: true,
      reason: 'no output spreadsheet id'
    },
    errors: []
  };

  if (importId && insertedCount > 0) {
    try {
      result.rollback = rollbackImport_(targetDbKey, importId);
    } catch (e) {
      result.ok = false;
      result.errors.push('rollback: ' + (e && e.message ? e.message : String(e)));
    }
  } else if (importId) {
    result.rollback = {
      skipped: true,
      reason: 'no inserted records in this import'
    };
  }

  if (outputSpreadsheetId) {
    if (outputSpreadsheetMode === 'fixed_id' || outputSpreadsheetMode === 'fixed_name') {
      result.outputCleanup = {
        skipped: true,
        reason: 'fixed test output spreadsheet is reused'
      };
    } else {
      try {
        DriveApp.getFileById(outputSpreadsheetId).setTrashed(true);
        result.outputCleanup = {
          skipped: false,
          trashed: true
        };
      } catch (e) {
        result.ok = false;
        result.errors.push('output cleanup: ' + (e && e.message ? e.message : String(e)));
      }
    }
  }

  return result;
}
