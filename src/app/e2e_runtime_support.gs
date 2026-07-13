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

  if (actual !== expected) {
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
  if (!text_(payload && payload.ciE2eToken) || !isCiE2eTokenConfigured_()) {
    return false;
  }

  assertConfiguredCiE2eTokenForPayload_(payload);
  PropertiesService.getScriptProperties().setProperty('CI_E2E_DISABLE_DB_FOLDER', '1');
  return true;
}
