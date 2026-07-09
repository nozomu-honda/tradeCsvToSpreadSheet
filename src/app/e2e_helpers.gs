function getConfiguredCiE2eToken_() {
  return text_(PropertiesService.getScriptProperties().getProperty('CI_E2E_TOKEN'));
}

function isCiE2eTokenConfigured_() {
  return !!getConfiguredCiE2eToken_();
}

function assertConfiguredCiE2eTokenForPayload_(payload) {
  const expected = getConfiguredCiE2eToken_();
  if (!expected) {
    throw new Error('CI_E2E_TOKEN Script Property is required for E2E operations.');
  }

  const actual = text_(payload && payload.ciE2eToken);
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

function prepareE2EWebAppRun(payload) {
  assertConfiguredCiE2eTokenForPayload_(payload);

  const targetDbKey = text_(payload && payload.targetDbKey) || 'rakuten_test';
  if (!isTestDbTarget_(targetDbKey)) {
    throw new Error('E2E preparation is limited to test DB targets.');
  }

  PropertiesService.getScriptProperties().setProperty('CI_E2E_DISABLE_DB_FOLDER', '1');

  return {
    ok: true,
    targetDbKey: targetDbKey,
    dbFolderMode: 'root',
  };
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
