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
