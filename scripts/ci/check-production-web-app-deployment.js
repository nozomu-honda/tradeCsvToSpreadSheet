#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  EXPECTED_WEB_APP_ACCESS,
  EXPECTED_WEB_APP_EXECUTE_AS,
  PRODUCTION_WEB_APP_ERROR_CODE,
  PRODUCTION_WEB_APP_REASONS: REASONS,
  PRODUCTION_WEB_APP_SNAPSHOT_MODES: SNAPSHOT_MODES,
  createComparableProductionWebAppDeploymentSnapshot,
  createProductionWebAppDeploymentSnapshot,
  fetchProductionWebAppDeploymentSnapshot,
  formatProductionWebAppErrorMessage,
  validateProductionWebAppManifest,
  verifyProductionWebAppDeploymentUpdate,
} = require('./production-web-app-deployment');
const { createNodeAdapters } = require('./production-deploy-adapters');

const deploymentId = 'deployment_fixture_value';
const scriptId = 'script_sensitive_fixture_value';
const webAppUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
const changedWebAppUrl = 'https://script.google.com/macros/s/changed_deployment_fixture/exec';
const sensitiveValues = [
  scriptId,
  deploymentId,
  webAppUrl,
  changedWebAppUrl,
  'ya29.sensitive_access_token',
  'sensitive_refresh_token',
  'sensitive_client_secret',
  'sensitive_api_response_body',
  'sensitive_google_error_detail',
];

function validDeployment() {
  return {
    deploymentId,
    deploymentConfig: {
      scriptId,
      versionNumber: 8,
      manifestFileName: 'appsscript',
      description: 'fixture',
    },
    entryPoints: [{
      entryPointType: 'WEB_APP',
      webApp: {
        url: webAppUrl,
        entryPointConfig: {
          access: EXPECTED_WEB_APP_ACCESS,
          executeAs: EXPECTED_WEB_APP_EXECUTE_AS,
        },
      },
    }],
  };
}

function modifyDeployment(mutator) {
  const deployment = validDeployment();
  mutator(deployment);
  return deployment;
}

function updatedDeployment(mutator = () => {}) {
  return modifyDeployment((deployment) => {
    deployment.deploymentConfig.versionNumber = 9;
    mutator(deployment);
  });
}

function snapshot(deployment = validDeployment(), deploymentCount = 2, expectedWebAppUrl = webAppUrl) {
  return createProductionWebAppDeploymentSnapshot({
    deployment,
    deploymentCount,
    expectedDeploymentId: deploymentId,
    expectedWebAppUrl,
  });
}

function comparableSnapshot(deployment = validDeployment(), deploymentCount = 2) {
  return createComparableProductionWebAppDeploymentSnapshot({
    deployment,
    deploymentCount,
    expectedDeploymentId: deploymentId,
  });
}

function assertNoSensitiveValues(error) {
  const rendered = `${error.message}\n${error.stack || ''}\n${error.reason || ''}`;
  for (const sensitive of sensitiveValues) {
    assert.ok(!rendered.includes(sensitive), 'safe error must not expose a sensitive fixture value');
  }
}

function assertSafeError(error, reason, kind = 'verification', detailPattern) {
  assert.ok(error, `expected safe error for ${reason}`);
  assert.strictEqual(error.code, PRODUCTION_WEB_APP_ERROR_CODE);
  assert.strictEqual(error.reason, reason);
  assert.strictEqual(error.message, formatProductionWebAppErrorMessage(reason, kind));
  if (detailPattern) {
    assert.match(error.message, detailPattern);
  }
  assertNoSensitiveValues(error);
}

function assertSafeFailure(fn, reason, kind = 'verification', detailPattern) {
  let caught;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assertSafeError(caught, reason, kind, detailPattern);
}

async function assertSafeRejection(promiseFactory, reason, kind = 'verification', detailPattern) {
  let caught;
  try {
    await promiseFactory();
  } catch (error) {
    caught = error;
  }
  assertSafeError(caught, reason, kind, detailPattern);
}

function createApi({
  deployment = validDeployment(),
  pages,
  getResponse,
  getError,
  listError,
} = {}) {
  const calls = [];
  const listPages = pages || [{ deployments: [deployment] }];
  let pageIndex = 0;
  return {
    calls,
    projects: {
      deployments: {
        async list(args) {
          calls.push({ method: 'list', args });
          if (listError) {
            throw listError;
          }
          const data = listPages[Math.min(pageIndex, listPages.length - 1)];
          pageIndex += 1;
          return { data };
        },
        async get(args) {
          calls.push({ method: 'get', args });
          if (getError) {
            throw getError;
          }
          return getResponse === undefined ? { data: deployment } : getResponse;
        },
      },
    },
  };
}

function webAppConfig(deployment) {
  return deployment.entryPoints[0].webApp.entryPointConfig;
}

(async () => {
  assert.strictEqual(EXPECTED_WEB_APP_ACCESS, 'ANYONE');
  assert.strictEqual(EXPECTED_WEB_APP_EXECUTE_AS, 'USER_ACCESSING');

  const repoRoot = path.resolve(__dirname, '..', '..');
  assert.strictEqual(validateProductionWebAppManifest(repoRoot), true);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'production-web-app-deployment-'));
  try {
    const manifestCases = [
      [{}, REASONS.MANIFEST_CONFIGURATION_INVALID],
      [{ webapp: { executeAs: EXPECTED_WEB_APP_EXECUTE_AS } }, REASONS.ACCESS_VALUE_MISSING],
      [{ webapp: { access: 'DOMAIN', executeAs: EXPECTED_WEB_APP_EXECUTE_AS } }, REASONS.ACCESS_MISMATCH],
      [{ webapp: { access: EXPECTED_WEB_APP_ACCESS } }, REASONS.EXECUTE_AS_VALUE_MISSING],
      [{ webapp: { access: EXPECTED_WEB_APP_ACCESS, executeAs: 'USER_DEPLOYING' } }, REASONS.EXECUTE_AS_MISMATCH],
    ];
    for (const [manifest, reason] of manifestCases) {
      fs.writeFileSync(path.join(tempRoot, 'appsscript.json'), JSON.stringify(manifest));
      assertSafeFailure(() => validateProductionWebAppManifest(tempRoot), reason, 'manifest');
    }
    fs.writeFileSync(path.join(tempRoot, 'appsscript.json'), '{ malformed');
    assertSafeFailure(
      () => validateProductionWebAppManifest(tempRoot),
      REASONS.MANIFEST_CONFIGURATION_INVALID,
      'manifest',
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const before = snapshot();
  assert.strictEqual(before.deploymentCount, 2);
  assert.strictEqual(before.versionNumber, 8);
  assert.strictEqual(before.webAppEntryPointCount, 1);
  assert.deepStrictEqual(before.entryPointTypes, ['WEB_APP']);
  assert.match(before.deploymentIdFingerprint, /^[0-9a-f]{64}$/);
  assert.strictEqual(before.webAppUrlPresent, true);
  assert.strictEqual(before.webAppObjectPresent, true);
  assert.strictEqual(before.entryPointConfigPresent, true);
  assert.strictEqual(before.webAppAccess, 'ANYONE');
  assert.strictEqual(before.webAppExecuteAs, 'USER_ACCESSING');
  assert.match(before.deploymentDescriptionFingerprint, /^[0-9a-f]{64}$/);
  assert.match(before.webAppUrlFingerprint, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(before).includes(webAppUrl), 'snapshot must not retain the Web App URL');
  assert.ok(!JSON.stringify(before).includes(deploymentId), 'snapshot must not retain the deployment ID');
  assert.ok(!JSON.stringify(before).includes(scriptId), 'snapshot must not retain the Script ID');

  const deploymentCases = [
    {
      deployment: null,
      reason: REASONS.DEPLOYMENTS_GET_RESPONSE_INVALID,
      detail: /deployments\.get response invalid/,
    },
    {
      deployment: modifyDeployment((value) => { value.deploymentId = 'different_fixture_value'; }),
      reason: REASONS.DEPLOYMENT_ID_MISMATCH,
      detail: /deployment ID mismatch/,
    },
    { deployment: validDeployment(), deploymentCount: 0, reason: REASONS.INVALID_DEPLOYMENT_COUNT },
    { deployment: validDeployment(), deploymentCount: 1.5, reason: REASONS.INVALID_DEPLOYMENT_COUNT },
    {
      deployment: modifyDeployment((value) => { delete value.deploymentConfig; }),
      reason: REASONS.VERSION_NUMBER_MISSING,
    },
    {
      deployment: modifyDeployment((value) => { delete value.deploymentConfig.versionNumber; }),
      reason: REASONS.VERSION_NUMBER_MISSING,
    },
    {
      deployment: modifyDeployment((value) => { value.deploymentConfig.versionNumber = 0; }),
      reason: REASONS.VERSION_NUMBER_NOT_POSITIVE_INTEGER,
    },
    {
      deployment: modifyDeployment((value) => { value.deploymentConfig.versionNumber = -1; }),
      reason: REASONS.VERSION_NUMBER_NOT_POSITIVE_INTEGER,
    },
    {
      deployment: modifyDeployment((value) => { value.deploymentConfig.versionNumber = 1.5; }),
      reason: REASONS.VERSION_NUMBER_NOT_POSITIVE_INTEGER,
    },
    {
      deployment: modifyDeployment((value) => { value.deploymentConfig.versionNumber = '8'; }),
      reason: REASONS.VERSION_NUMBER_INVALID,
    },
    {
      deployment: modifyDeployment((value) => { value.deploymentConfig.versionNumber = 'invalid'; }),
      reason: REASONS.VERSION_NUMBER_INVALID,
    },
    {
      deployment: modifyDeployment((value) => { delete value.entryPoints; }),
      reason: REASONS.ENTRY_POINTS_MISSING,
    },
    {
      deployment: modifyDeployment((value) => { value.entryPoints = {}; }),
      reason: REASONS.ENTRY_POINTS_NOT_ARRAY,
    },
    {
      deployment: modifyDeployment((value) => { value.entryPoints = [null]; }),
      reason: REASONS.ENTRY_POINT_RECORD_INVALID,
    },
    {
      deployment: modifyDeployment((value) => { value.entryPoints = [{}]; }),
      reason: REASONS.ENTRY_POINT_TYPE_MISSING,
    },
    {
      deployment: modifyDeployment((value) => {
        value.entryPoints = [{ entryPointType: 'ENTRY_POINT_TYPE_UNSPECIFIED' }];
      }),
      reason: REASONS.ENTRY_POINT_TYPE_UNSPECIFIED,
    },
    {
      deployment: modifyDeployment((value) => { value.entryPoints = []; }),
      reason: REASONS.WEB_APP_ENTRY_POINT_MISSING,
      detail: /WEB_APP entry point missing/,
    },
    {
      deployment: modifyDeployment((value) => {
        value.entryPoints = [{ entryPointType: 'EXECUTION_API', executionApi: {} }];
      }),
      reason: REASONS.WEB_APP_ENTRY_POINT_MISSING,
    },
    {
      deployment: modifyDeployment((value) => { value.entryPoints.push(value.entryPoints[0]); }),
      reason: REASONS.MULTIPLE_WEB_APP_ENTRY_POINTS,
      detail: /multiple WEB_APP entry points/,
    },
    {
      deployment: modifyDeployment((value) => { delete value.entryPoints[0].webApp; }),
      reason: REASONS.WEB_APP_OBJECT_MISSING,
    },
    {
      deployment: modifyDeployment((value) => { delete value.entryPoints[0].webApp.entryPointConfig; }),
      reason: REASONS.ENTRY_POINT_CONFIG_MISSING,
    },
    {
      deployment: modifyDeployment((value) => { delete value.entryPoints[0].webApp.url; }),
      reason: REASONS.WEB_APP_URL_MISSING,
    },
    {
      deployment: modifyDeployment((value) => { value.entryPoints[0].webApp.url = 123; }),
      reason: REASONS.WEB_APP_URL_INVALID,
    },
    {
      deployment: modifyDeployment((value) => { value.entryPoints[0].webApp.url = 'not a URL'; }),
      reason: REASONS.WEB_APP_URL_INVALID,
    },
    {
      deployment: modifyDeployment((value) => {
        value.entryPoints[0].webApp.url = `http://script.google.com/macros/s/${deploymentId}/exec`;
      }),
      reason: REASONS.WEB_APP_URL_PROTOCOL_MISMATCH,
    },
    {
      deployment: modifyDeployment((value) => {
        value.entryPoints[0].webApp.url = `https://example.invalid/macros/s/${deploymentId}/exec`;
      }),
      reason: REASONS.WEB_APP_URL_HOST_MISMATCH,
    },
    {
      deployment: modifyDeployment((value) => {
        value.entryPoints[0].webApp.url = `https://script.google.com:8443/macros/s/${deploymentId}/exec`;
      }),
      reason: REASONS.WEB_APP_URL_HOST_MISMATCH,
    },
    {
      deployment: modifyDeployment((value) => {
        value.entryPoints[0].webApp.url = `https://script.google.com/macros/s/${deploymentId}/dev`;
      }),
      reason: REASONS.WEB_APP_URL_PATH_MISMATCH,
    },
    {
      deployment: modifyDeployment((value) => {
        value.entryPoints[0].webApp.url = 'https://script.google.com/unexpected';
      }),
      reason: REASONS.WEB_APP_URL_PATH_MISMATCH,
    },
    {
      deployment: modifyDeployment((value) => { value.entryPoints[0].webApp.url = `${webAppUrl}?unexpected=true`; }),
      reason: REASONS.WEB_APP_URL_UNEXPECTED_COMPONENTS,
    },
    {
      deployment: modifyDeployment((value) => { value.entryPoints[0].webApp.url = `${webAppUrl}#unexpected`; }),
      reason: REASONS.WEB_APP_URL_UNEXPECTED_COMPONENTS,
    },
    {
      deployment: modifyDeployment((value) => {
        value.entryPoints[0].webApp.url = `https://user:password@script.google.com/macros/s/${deploymentId}/exec`;
      }),
      reason: REASONS.WEB_APP_URL_UNEXPECTED_COMPONENTS,
    },
    {
      deployment: modifyDeployment((value) => {
        value.entryPoints[0].webApp.url = 'https://script.google.com/macros/s/different_fixture_value/exec';
      }),
      reason: REASONS.WEB_APP_URL_DEPLOYMENT_ID_MISMATCH,
    },
    {
      deployment: validDeployment(),
      expectedWebAppUrl: 'https://script.google.com/macros/s/different_fixture_value/exec',
      reason: REASONS.CONFIGURED_WEB_APP_URL_MISMATCH,
      detail: /configured Web App URL mismatch/,
    },
    {
      deployment: modifyDeployment((value) => { delete webAppConfig(value).access; }),
      reason: REASONS.ACCESS_VALUE_MISSING,
    },
    {
      deployment: modifyDeployment((value) => { webAppConfig(value).access = 'DOMAIN'; }),
      reason: REASONS.ACCESS_MISMATCH,
      detail: /access mismatch/,
    },
    {
      deployment: modifyDeployment((value) => { delete webAppConfig(value).executeAs; }),
      reason: REASONS.EXECUTE_AS_VALUE_MISSING,
    },
    {
      deployment: modifyDeployment((value) => { webAppConfig(value).executeAs = 'USER_DEPLOYING'; }),
      reason: REASONS.EXECUTE_AS_MISMATCH,
      detail: /executeAs mismatch/,
    },
  ];

  for (const testCase of deploymentCases) {
    assertSafeFailure(
      () => snapshot(
        testCase.deployment,
        testCase.deploymentCount === undefined ? 2 : testCase.deploymentCount,
        testCase.expectedWebAppUrl || webAppUrl,
      ),
      testCase.reason,
      'verification',
      testCase.detail,
    );
  }

  const comparisonDeployments = {
    noWebApp: updatedDeployment((value) => { value.entryPoints = []; }),
    multipleWebApps: updatedDeployment((value) => {
      value.entryPoints.push(JSON.parse(JSON.stringify(value.entryPoints[0])));
    }),
    entryPointTypeAdded: updatedDeployment((value) => {
      value.entryPoints.push({ entryPointType: 'EXECUTION_API', executionApi: {} });
    }),
    urlChanged: updatedDeployment((value) => { value.entryPoints[0].webApp.url = changedWebAppUrl; }),
    accessChanged: updatedDeployment((value) => { webAppConfig(value).access = 'DOMAIN'; }),
    executeAsChanged: updatedDeployment((value) => { webAppConfig(value).executeAs = 'USER_DEPLOYING'; }),
  };
  const comparisonSnapshots = Object.fromEntries(Object.entries(comparisonDeployments).map(([name, deployment]) => (
    [name, comparableSnapshot(deployment)]
  )));

  assert.strictEqual(comparisonSnapshots.noWebApp.webAppEntryPointCount, 0);
  assert.strictEqual(comparisonSnapshots.noWebApp.webAppUrlFingerprint, null);
  assert.strictEqual(comparisonSnapshots.noWebApp.webAppUrlPresent, false);
  assert.strictEqual(comparisonSnapshots.noWebApp.webAppAccess, null);
  assert.strictEqual(comparisonSnapshots.noWebApp.webAppExecuteAs, null);
  assert.strictEqual(comparisonSnapshots.noWebApp.webAppObjectPresent, false);
  assert.strictEqual(comparisonSnapshots.noWebApp.entryPointConfigPresent, false);
  assert.strictEqual(comparisonSnapshots.multipleWebApps.webAppEntryPointCount, 2);
  assert.strictEqual(comparisonSnapshots.multipleWebApps.webAppUrlFingerprint, null);
  assert.strictEqual(comparisonSnapshots.multipleWebApps.webAppUrlPresent, false);
  assert.strictEqual(comparisonSnapshots.multipleWebApps.webAppObjectPresent, false);
  assert.strictEqual(comparisonSnapshots.multipleWebApps.entryPointConfigPresent, false);
  assert.deepStrictEqual(
    comparisonSnapshots.entryPointTypeAdded.entryPointTypes,
    ['EXECUTION_API', 'WEB_APP'],
  );
  assert.notStrictEqual(comparisonSnapshots.urlChanged.webAppUrlFingerprint, before.webAppUrlFingerprint);
  assert.strictEqual(comparisonSnapshots.accessChanged.webAppAccess, 'DOMAIN');
  assert.strictEqual(comparisonSnapshots.executeAsChanged.webAppExecuteAs, 'USER_DEPLOYING');
  for (const comparable of Object.values(comparisonSnapshots)) {
    const rendered = JSON.stringify(comparable);
    assert.ok(!rendered.includes(deploymentId), 'comparison snapshot must not retain the deployment ID');
    assert.ok(!rendered.includes(scriptId), 'comparison snapshot must not retain the Script ID');
    assert.ok(!rendered.includes(webAppUrl), 'comparison snapshot must not retain the configured Web App URL');
    assert.ok(!rendered.includes(changedWebAppUrl), 'comparison snapshot must not retain the changed Web App URL');
  }

  await assertSafeRejection(
    () => fetchProductionWebAppDeploymentSnapshot({
      api: null,
      scriptId,
      deploymentId,
      expectedWebAppUrl: webAppUrl,
    }),
    REASONS.API_CLIENT_UNAVAILABLE,
    'verification',
    /API client unavailable/,
  );

  await assertSafeRejection(
    () => fetchProductionWebAppDeploymentSnapshot({
      api: createApi(),
      scriptId: '',
      deploymentId,
      expectedWebAppUrl: webAppUrl,
    }),
    REASONS.SCRIPT_ID_UNAVAILABLE,
  );

  await assertSafeRejection(
    () => fetchProductionWebAppDeploymentSnapshot({
      api: createApi(),
      scriptId,
      deploymentId: '',
      expectedWebAppUrl: webAppUrl,
    }),
    REASONS.DEPLOYMENT_ID_UNAVAILABLE,
  );

  await assertSafeRejection(
    () => fetchProductionWebAppDeploymentSnapshot({
      api: createApi({ listError: new Error('sensitive_google_error_detail') }),
      scriptId,
      deploymentId,
      expectedWebAppUrl: webAppUrl,
    }),
    REASONS.DEPLOYMENTS_LIST_FAILED,
    'verification',
    /deployments\.list failed/,
  );

  await assertSafeRejection(
    () => fetchProductionWebAppDeploymentSnapshot({
      api: createApi({ getError: new Error('sensitive_google_error_detail') }),
      scriptId,
      deploymentId,
      expectedWebAppUrl: webAppUrl,
    }),
    REASONS.DEPLOYMENTS_GET_FAILED,
    'verification',
    /deployments\.get failed/,
  );

  for (const invalidPage of [{}, { deployments: 'invalid' }]) {
    await assertSafeRejection(
      () => fetchProductionWebAppDeploymentSnapshot({
        api: createApi({ pages: [invalidPage] }),
        scriptId,
        deploymentId,
        expectedWebAppUrl: webAppUrl,
      }),
      REASONS.DEPLOYMENTS_LIST_RESPONSE_INVALID,
    );
  }

  await assertSafeRejection(
    () => fetchProductionWebAppDeploymentSnapshot({
      api: createApi({ getResponse: { data: null } }),
      scriptId,
      deploymentId,
      expectedWebAppUrl: webAppUrl,
    }),
    REASONS.DEPLOYMENTS_GET_RESPONSE_INVALID,
  );

  await assertSafeRejection(
    () => fetchProductionWebAppDeploymentSnapshot({
      api: createApi({ pages: [{ deployments: [validDeployment()], nextPageToken: 123 }] }),
      scriptId,
      deploymentId,
      expectedWebAppUrl: webAppUrl,
    }),
    REASONS.DEPLOYMENT_PAGINATION_INVALID,
  );

  await assertSafeRejection(
    () => fetchProductionWebAppDeploymentSnapshot({
      api: createApi({
        pages: [
          { deployments: [{ deploymentId: 'other_fixture_value' }], nextPageToken: 'page-2' },
          { deployments: [validDeployment()], nextPageToken: 'page-2' },
        ],
      }),
      scriptId,
      deploymentId,
      expectedWebAppUrl: webAppUrl,
    }),
    REASONS.DUPLICATE_PAGE_TOKEN_DETECTED,
  );

  await assertSafeRejection(
    () => fetchProductionWebAppDeploymentSnapshot({
      api: createApi({ pages: [{ deployments: [{ deploymentId: 'other_fixture_value' }] }] }),
      scriptId,
      deploymentId,
      expectedWebAppUrl: webAppUrl,
    }),
    REASONS.CONFIGURED_DEPLOYMENT_NOT_FOUND,
  );

  await assertSafeRejection(
    () => fetchProductionWebAppDeploymentSnapshot({
      api: createApi({ pages: [{ deployments: [validDeployment(), validDeployment()] }] }),
      scriptId,
      deploymentId,
      expectedWebAppUrl: webAppUrl,
    }),
    REASONS.CONFIGURED_DEPLOYMENT_APPEARED_MULTIPLE_TIMES,
  );

  const paginatedApi = createApi({
    pages: [
      { deployments: [{ deploymentId: 'other_fixture_value' }], nextPageToken: 'page-2' },
      { deployments: [validDeployment()] },
    ],
  });
  const fetched = await fetchProductionWebAppDeploymentSnapshot({
    api: paginatedApi,
    scriptId,
    deploymentId,
    expectedWebAppUrl: webAppUrl,
  });
  assert.strictEqual(fetched.deploymentCount, 2);
  assert.deepStrictEqual(paginatedApi.calls.map((call) => call.method), ['list', 'list', 'get']);
  assert.ok(paginatedApi.calls.every((call) => call.args.fields));

  await assertSafeRejection(
    () => fetchProductionWebAppDeploymentSnapshot({
      api: createApi(),
      scriptId,
      deploymentId,
      expectedWebAppUrl: webAppUrl,
      mode: 'unsupported',
    }),
    REASONS.SNAPSHOT_MODE_INVALID,
  );

  const comparisonFetched = await fetchProductionWebAppDeploymentSnapshot({
    api: createApi({ deployment: comparisonDeployments.noWebApp }),
    scriptId,
    deploymentId,
    expectedWebAppUrl: webAppUrl,
    mode: SNAPSHOT_MODES.COMPARISON,
  });
  assert.strictEqual(comparisonFetched.webAppEntryPointCount, 0);
  assert.strictEqual(comparisonFetched.webAppUrlPresent, false);

  const adapterEnv = {
    CLASP_PRODUCTION_CREDENTIALS: JSON.stringify({
      tokens: {
        production: {
          type: 'authorized_user',
          client_id: 'fixture-client-id',
          client_secret: 'sensitive_client_secret',
          refresh_token: 'sensitive_refresh_token',
        },
      },
    }),
    PRODUCTION_SCRIPT_ID: scriptId,
    PRODUCTION_DEPLOYMENT_ID: deploymentId,
    PRODUCTION_WEB_APP_URL: webAppUrl,
  };
  const failedFactoryAdapters = createNodeAdapters({
    env: adapterEnv,
    appsScriptApiFactory() {
      throw new Error('sensitive_google_error_detail');
    },
  });
  await assertSafeRejection(
    () => failedFactoryAdapters.getProductionDeploymentSnapshot(),
    REASONS.API_CLIENT_UNAVAILABLE,
  );

  let mutableDeployment = validDeployment();
  const mutableApi = {
    projects: {
      deployments: {
        async list() {
          return { data: { deployments: [{ deploymentId }] } };
        },
        async get() {
          return { data: mutableDeployment };
        },
      },
    },
  };
  const adapterComparison = createNodeAdapters({
    env: adapterEnv,
    appsScriptApiFactory() {
      return mutableApi;
    },
  });
  const adapterBefore = await adapterComparison.getProductionDeploymentSnapshot();
  mutableDeployment = comparisonDeployments.noWebApp;
  await assertSafeRejection(
    () => adapterComparison.verifyProductionDeploymentUpdate(
      adapterBefore,
      { versionNumber: 9 },
      [],
    ),
    REASONS.WEB_APP_ENTRY_POINT_DISAPPEARED,
    'update',
    /WEB_APP entry point disappeared/,
  );

  const validUpdatedDeployment = updatedDeployment();
  const after = comparableSnapshot(validUpdatedDeployment);
  assert.strictEqual(verifyProductionWebAppDeploymentUpdate({
    before,
    after,
    update: { versionNumber: 9 },
  }), true);

  const updateCases = [
    {
      after: comparableSnapshot(validUpdatedDeployment, 3),
      update: { versionNumber: 9 },
      reason: REASONS.DEPLOYMENT_COUNT_CHANGED,
    },
    {
      after: comparableSnapshot(updatedDeployment((value) => {
        value.deploymentId = 'different_fixture_value';
      })),
      update: { versionNumber: 9 },
      reason: REASONS.DEPLOYMENT_ID_CHANGED,
    },
    {
      after: comparableSnapshot(validDeployment()),
      update: { versionNumber: 8 },
      reason: REASONS.VERSION_DID_NOT_CHANGE,
    },
    {
      after,
      update: { versionNumber: 10 },
      reason: REASONS.UPDATED_VERSION_MISMATCH,
    },
    {
      after: comparisonSnapshots.noWebApp,
      update: { versionNumber: 9 },
      reason: REASONS.WEB_APP_ENTRY_POINT_DISAPPEARED,
      detail: /WEB_APP entry point disappeared/,
    },
    {
      after: comparisonSnapshots.multipleWebApps,
      update: { versionNumber: 9 },
      reason: REASONS.WEB_APP_ENTRY_POINT_COUNT_CHANGED,
    },
    {
      after: comparisonSnapshots.entryPointTypeAdded,
      update: { versionNumber: 9 },
      reason: REASONS.ENTRY_POINT_TYPES_CHANGED,
    },
    {
      after: comparisonSnapshots.urlChanged,
      update: { versionNumber: 9 },
      reason: REASONS.WEB_APP_URL_CHANGED,
      detail: /Web App URL changed/,
    },
    {
      after: comparisonSnapshots.accessChanged,
      update: { versionNumber: 9 },
      reason: REASONS.ACCESS_CHANGED,
    },
    {
      after: comparisonSnapshots.executeAsChanged,
      update: { versionNumber: 9 },
      reason: REASONS.EXECUTE_AS_CHANGED,
    },
  ];

  for (const testCase of updateCases) {
    assertSafeFailure(
      () => verifyProductionWebAppDeploymentUpdate({
        before,
        after: testCase.after,
        update: testCase.update,
      }),
      testCase.reason,
      'update',
      testCase.detail,
    );
  }

  console.log('production Web App deployment checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
