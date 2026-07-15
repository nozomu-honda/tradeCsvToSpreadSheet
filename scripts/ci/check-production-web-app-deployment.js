#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  EXPECTED_WEB_APP_ACCESS,
  EXPECTED_WEB_APP_EXECUTE_AS,
  MANIFEST_CONFIGURATION_ERROR,
  WEB_APP_CONFIGURATION_ERROR,
  WEB_APP_ENTRY_POINT_ERROR,
  WEB_APP_UPDATE_ERROR,
  WEB_APP_VERIFICATION_ERROR,
  createProductionWebAppDeploymentSnapshot,
  fetchProductionWebAppDeploymentSnapshot,
  validateProductionWebAppManifest,
  verifyProductionWebAppDeploymentUpdate,
} = require('./production-web-app-deployment');
const {
  createNodeAdapters,
} = require('./production-deploy-adapters');

const deploymentId = 'deployment_fixture_value';
const scriptId = 'script_sensitive_fixture_value';
const webAppUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
const sensitiveValues = [
  scriptId,
  deploymentId,
  webAppUrl,
  'ya29.sensitive_access_token',
  'sensitive_refresh_token',
  'sensitive_client_secret',
  'sensitive_api_response_body',
];

function validDeployment(overrides = {}) {
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
    ...overrides,
  };
}

function snapshot(deployment = validDeployment(), deploymentCount = 2) {
  return createProductionWebAppDeploymentSnapshot({
    deployment,
    deploymentCount,
    expectedDeploymentId: deploymentId,
    expectedWebAppUrl: webAppUrl,
  });
}

function assertSafeFailure(fn, expectedMessage) {
  let caught;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `expected failure: ${expectedMessage}`);
  assert.strictEqual(caught.message, expectedMessage);
  for (const sensitive of sensitiveValues) {
    assert.ok(!caught.message.includes(sensitive), `error must not expose ${sensitive}`);
  }
}

async function assertSafeRejection(promiseFactory, expectedMessage) {
  let caught;
  try {
    await promiseFactory();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `expected rejection: ${expectedMessage}`);
  assert.strictEqual(caught.message, expectedMessage);
  for (const sensitive of sensitiveValues) {
    assert.ok(!caught.message.includes(sensitive), `error must not expose ${sensitive}`);
  }
}

function createApi({ deployment = validDeployment(), pages, getError, listError } = {}) {
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
          const data = listPages[pageIndex];
          pageIndex += 1;
          return { data };
        },
        async get(args) {
          calls.push({ method: 'get', args });
          if (getError) {
            throw getError;
          }
          return { data: deployment };
        },
      },
    },
  };
}

(async () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  assert.strictEqual(validateProductionWebAppManifest(repoRoot), true);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'production-web-app-deployment-'));
  try {
    for (const manifest of [
      {},
      { webapp: { access: 'ANYONE_ANONYMOUS', executeAs: 'USER_DEPLOYING' } },
      { webapp: { access: EXPECTED_WEB_APP_ACCESS } },
    ]) {
      fs.writeFileSync(path.join(tempRoot, 'appsscript.json'), JSON.stringify(manifest));
      assertSafeFailure(() => validateProductionWebAppManifest(tempRoot), MANIFEST_CONFIGURATION_ERROR);
    }
    fs.writeFileSync(path.join(tempRoot, 'appsscript.json'), '{ malformed');
    assertSafeFailure(() => validateProductionWebAppManifest(tempRoot), MANIFEST_CONFIGURATION_ERROR);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const before = snapshot();
  assert.strictEqual(before.deploymentCount, 2);
  assert.strictEqual(before.versionNumber, 8);
  assert.strictEqual(before.webAppEntryPointCount, 1);
  assert.deepStrictEqual(before.entryPointTypes, ['WEB_APP']);
  assert.match(before.deploymentDescriptionFingerprint, /^[0-9a-f]{64}$/);
  assert.strictEqual(before.webAppAccess, EXPECTED_WEB_APP_ACCESS);
  assert.strictEqual(before.webAppExecuteAs, EXPECTED_WEB_APP_EXECUTE_AS);
  assert.match(before.webAppUrlFingerprint, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(before).includes(webAppUrl), 'snapshot must not retain the Web App URL');

  const invalidDeploymentCases = [
    [null, WEB_APP_VERIFICATION_ERROR],
    [validDeployment({ deploymentId: 'different_fixture_value' }), WEB_APP_VERIFICATION_ERROR],
    [validDeployment({ deploymentConfig: { versionNumber: 0 } }), WEB_APP_VERIFICATION_ERROR],
    [validDeployment({ deploymentConfig: {} }), WEB_APP_VERIFICATION_ERROR],
    [validDeployment({ entryPoints: undefined }), WEB_APP_VERIFICATION_ERROR],
    [validDeployment({ entryPoints: [{ entryPointType: 'ENTRY_POINT_TYPE_UNSPECIFIED' }] }), WEB_APP_VERIFICATION_ERROR],
    [validDeployment({ entryPoints: [] }), WEB_APP_ENTRY_POINT_ERROR],
    [validDeployment({ entryPoints: [{ entryPointType: 'EXECUTION_API', executionApi: {} }] }), WEB_APP_ENTRY_POINT_ERROR],
    [validDeployment({ entryPoints: [validDeployment().entryPoints[0], validDeployment().entryPoints[0]] }), WEB_APP_ENTRY_POINT_ERROR],
    [validDeployment({ entryPoints: [{ entryPointType: 'WEB_APP', webApp: {} }] }), WEB_APP_ENTRY_POINT_ERROR],
    [validDeployment({ entryPoints: [{ entryPointType: 'WEB_APP', webApp: { url: webAppUrl } }] }), WEB_APP_ENTRY_POINT_ERROR],
  ];
  for (const [deployment, message] of invalidDeploymentCases) {
    assertSafeFailure(() => snapshot(deployment), message);
  }

  const invalidUrls = [
    'http://script.google.com/macros/s/deployment_fixture_value/exec',
    'https://example.invalid/macros/s/deployment_fixture_value/exec',
    'https://script.google.com/macros/s/deployment_fixture_value/dev',
    'https://script.google.com/macros/s/different_fixture_value/exec',
    `${webAppUrl}?unexpected=true`,
  ];
  for (const url of invalidUrls) {
    const deployment = validDeployment();
    deployment.entryPoints[0].webApp.url = url;
    assertSafeFailure(() => snapshot(deployment), WEB_APP_CONFIGURATION_ERROR);
  }
  assertSafeFailure(() => createProductionWebAppDeploymentSnapshot({
    deployment: validDeployment(),
    deploymentCount: 1,
    expectedDeploymentId: deploymentId,
    expectedWebAppUrl: 'https://script.google.com/macros/s/different_fixture_value/exec',
  }), WEB_APP_CONFIGURATION_ERROR);

  for (const config of [
    { access: 'UNKNOWN_ACCESS', executeAs: EXPECTED_WEB_APP_EXECUTE_AS },
    { access: EXPECTED_WEB_APP_ACCESS, executeAs: 'UNKNOWN_EXECUTE_AS' },
    { access: 'DOMAIN', executeAs: EXPECTED_WEB_APP_EXECUTE_AS },
    { access: EXPECTED_WEB_APP_ACCESS, executeAs: 'USER_DEPLOYING' },
  ]) {
    const deployment = validDeployment();
    deployment.entryPoints[0].webApp.entryPointConfig = config;
    assertSafeFailure(() => snapshot(deployment), WEB_APP_CONFIGURATION_ERROR);
  }

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
  assert.strictEqual(paginatedApi.calls[1].args.pageToken, 'page-2');
  assert.strictEqual(paginatedApi.calls[0].args.fields, 'deployments(deploymentId),nextPageToken');
  assert.ok(paginatedApi.calls[2].args.fields.includes('entryPoints'));

  let receivedCredentials;
  const adapterApi = createApi();
  const adapters = createNodeAdapters({
    env: {
      CLASP_PRODUCTION_CREDENTIALS: JSON.stringify({
        tokens: {
          production: {
            type: 'authorized_user',
            client_id: 'fixture_client',
            client_secret: 'fixture_secret',
            refresh_token: 'fixture_refresh',
          },
        },
      }),
      PRODUCTION_SCRIPT_ID: scriptId,
      PRODUCTION_DEPLOYMENT_ID: deploymentId,
      PRODUCTION_WEB_APP_URL: webAppUrl,
    },
    appsScriptApiFactory(credentials) {
      receivedCredentials = credentials;
      return adapterApi;
    },
  });
  const adapterSnapshot = await adapters.getProductionDeploymentSnapshot();
  assert.strictEqual(adapterSnapshot.versionNumber, 8);
  assert.strictEqual(receivedCredentials.tokens.production.type, 'authorized_user');
  assert.deepStrictEqual(adapterApi.calls.map((call) => call.method), ['list', 'get']);

  await assertSafeRejection(() => fetchProductionWebAppDeploymentSnapshot({
    api: createApi({ pages: [{ deployments: [] }] }),
    scriptId,
    deploymentId,
    expectedWebAppUrl: webAppUrl,
  }), WEB_APP_VERIFICATION_ERROR);
  await assertSafeRejection(() => fetchProductionWebAppDeploymentSnapshot({
    api: createApi({ pages: [{ malformed: true }] }),
    scriptId,
    deploymentId,
    expectedWebAppUrl: webAppUrl,
  }), WEB_APP_VERIFICATION_ERROR);
  await assertSafeRejection(() => fetchProductionWebAppDeploymentSnapshot({
    api: createApi({ getError: new Error(sensitiveValues.join(' ')) }),
    scriptId,
    deploymentId,
    expectedWebAppUrl: webAppUrl,
  }), WEB_APP_VERIFICATION_ERROR);
  await assertSafeRejection(() => fetchProductionWebAppDeploymentSnapshot({
    api: createApi({ listError: new Error(sensitiveValues.join(' ')) }),
    scriptId,
    deploymentId,
    expectedWebAppUrl: webAppUrl,
  }), WEB_APP_VERIFICATION_ERROR);

  const updatedDeployment = validDeployment({
    deploymentConfig: {
      ...validDeployment().deploymentConfig,
      versionNumber: 9,
    },
  });
  const after = snapshot(updatedDeployment);
  assert.strictEqual(verifyProductionWebAppDeploymentUpdate({
    before,
    after,
    update: { versionNumber: 9 },
  }), true);

  const invalidUpdateCases = [
    { after: { ...after, deploymentCount: 3 }, update: { versionNumber: 9 } },
    { after: { ...after, deploymentId: 'different_fixture_value' }, update: { versionNumber: 9 } },
    { after: { ...after, webAppEntryPointCount: 0 }, update: { versionNumber: 9 } },
    { after: { ...after, webAppUrlFingerprint: '0'.repeat(64) }, update: { versionNumber: 9 } },
    { after: { ...after, entryPointTypes: ['EXECUTION_API', 'WEB_APP'] }, update: { versionNumber: 9 } },
    { after: { ...after, webAppAccess: 'DOMAIN' }, update: { versionNumber: 9 } },
    { after: { ...after, webAppExecuteAs: 'USER_DEPLOYING' }, update: { versionNumber: 9 } },
    { after: { ...after, versionNumber: 8 }, update: { versionNumber: 8 } },
    { after, update: { versionNumber: 10 } },
  ];
  for (const invalid of invalidUpdateCases) {
    assertSafeFailure(() => verifyProductionWebAppDeploymentUpdate({
      before,
      after: invalid.after,
      update: invalid.update,
    }), WEB_APP_UPDATE_ERROR);
  }

  console.log('production Web App deployment checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
