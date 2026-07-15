#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEPLOYMENT_CONFIG_ERROR,
  LOCAL_BUNDLE_ERROR,
  REMOTE_BUNDLE_MISMATCH_ERROR,
  buildLocalProductionBundleManifest,
  buildPulledProductionBundleManifest,
  compareProductionBundleManifests,
  parseDeploymentListOutput,
  parseDeploymentUpdateOutput,
  pullAndVerifyProductionRuntimeBundle,
  validateProductionDeploymentConfiguration,
  verifyDeploymentUpdate,
  verifyProductionRuntimeBundle,
} = require('./production-runtime-verification');
const {
  validateProductionSourcePushOutput,
} = require('./production-deploy-adapters');

const repoRoot = path.resolve(__dirname, '..', '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'production-runtime-check-'));
const fakeDeploymentId = 'deployment_fixture_value';
const fakeWebAppUrl = `https://script.google.com/macros/s/${fakeDeploymentId}/exec`;
const sensitiveFixtureValues = [
  'script_sensitive_fixture_value',
  'deployment_sensitive_fixture_value',
  'https://script.google.com/macros/s/sensitive_fixture_value/exec',
  'ya29.sensitive_fixture_value',
  'refresh_token_sensitive_fixture_value',
  'client_secret_sensitive_fixture_value',
  'SENSITIVE_FILE_BODY_FIXTURE',
];

try {
  const validRoot = createProductionBundleFixture('valid');
  const validSummary = verifyProductionRuntimeBundle(validRoot);
  assert.strictEqual(validSummary.runtimeAssertionCount, 1);
  assert.strictEqual(validSummary.webFunctionCount, 6);

  const expectedManifest = createManifest(validRoot);
  const pulledManifest = buildPulledProductionBundleManifest(validRoot);
  assert.strictEqual(compareProductionBundleManifests(expectedManifest, pulledManifest), true);
  assert.strictEqual(
    compareProductionBundleManifests(expectedManifest, [...pulledManifest].reverse()),
    true,
    'manifest order must not affect comparison',
  );

  const crlfRoot = createProductionBundleFixture('crlf-normalized');
  const crlfBuilderPath = path.join(crlfRoot, 'src', 'app', 'builder.gs');
  const crlfBuilder = fs.readFileSync(crlfBuilderPath, 'utf8').replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n');
  fs.writeFileSync(crlfBuilderPath, `\uFEFF${crlfBuilder}`, 'utf8');
  assert.strictEqual(
    compareProductionBundleManifests(expectedManifest, buildPulledProductionBundleManifest(crlfRoot)),
    true,
    'UTF-8 BOM and line-ending differences must be normalized',
  );

  const jsExtensionRoot = createProductionBundleFixture('js-extension-normalized');
  fs.renameSync(
    path.join(jsExtensionRoot, 'src', 'app', 'builder.gs'),
    path.join(jsExtensionRoot, 'src', 'app', 'builder.js'),
  );
  assert.strictEqual(
    compareProductionBundleManifests(createManifest(jsExtensionRoot), pulledManifest),
    true,
    'clasp server-side .js to .gs extension conversion must be normalized',
  );

  for (const relativePath of [
    'src/app/builder.gs',
    'src/app/db.gs',
    'src/app/import.gs',
    'Index.html',
  ]) {
    assertRemoteManifestMismatch(`missing-${path.basename(relativePath)}`, (rootDir) => {
      fs.rmSync(path.join(rootDir, ...relativePath.split('/')));
    });
  }

  assertRemoteManifestMismatch('changed-builder', (rootDir) => {
    fs.appendFileSync(path.join(rootDir, 'src', 'app', 'builder.gs'), '\n// changed fixture\n');
  });
  assertRemoteManifestMismatch('changed-index', (rootDir) => {
    fs.appendFileSync(path.join(rootDir, 'Index.html'), '\n<!-- stale fixture -->\n');
  });
  assertRemoteManifestMismatch('extra-file', (rootDir) => {
    fs.writeFileSync(path.join(rootDir, 'src', 'app', 'extra_fixture.gs'), 'function extraFixture_() {}\n');
  });

  const binaryRoot = createProductionBundleFixture('binary-local');
  const binaryPath = path.join(binaryRoot, 'src', 'app', 'binary_fixture.gs');
  fs.writeFileSync(binaryPath, Buffer.from([0xff, 0xfe, 0x00, 0x01]));
  assert.throws(
    () => buildLocalProductionBundleManifest({ rootDir: binaryRoot, trackedFiles: listFiles(binaryRoot) }),
    (error) => error.message === LOCAL_BUNDLE_ERROR,
  );

  const missingRuntimeRoot = createProductionBundleFixture('missing-runtime');
  fs.rmSync(path.join(missingRuntimeRoot, 'src', 'app', 'e2e_runtime_support.gs'));
  assert.throws(
    () => verifyProductionRuntimeBundle(missingRuntimeRoot),
    /runtime boundary verification failed/,
  );

  const duplicateRuntimeRoot = createProductionBundleFixture('duplicate-runtime');
  fs.appendFileSync(
    path.join(duplicateRuntimeRoot, 'src', 'app', 'web.gs'),
    '\nfunction assertCiE2eTokenForWebAppIfConfigured_(payload) {}\n',
  );
  assert.throws(
    () => verifyProductionRuntimeBundle(duplicateRuntimeRoot),
    /runtime boundary verification failed/,
  );

  const publicHelperRoot = createProductionBundleFixture('public-helper');
  fs.copyFileSync(
    path.join(repoRoot, 'src', 'app', 'e2e_helpers.gs'),
    path.join(publicHelperRoot, 'src', 'app', 'e2e_helpers.gs'),
  );
  assert.throws(
    () => verifyProductionRuntimeBundle(publicHelperRoot),
    /runtime boundary verification failed/,
  );

  const testSourceRoot = createProductionBundleFixture('test-source');
  fs.mkdirSync(path.join(testSourceRoot, 'src', 'test'), { recursive: true });
  fs.writeFileSync(path.join(testSourceRoot, 'src', 'test', 'fixture.gs'), 'function testFixture() {}\n');
  assert.throws(
    () => verifyProductionRuntimeBundle(testSourceRoot),
    /runtime boundary verification failed/,
  );

  assert.strictEqual(validateProductionDeploymentConfiguration({
    webAppUrl: fakeWebAppUrl,
    deploymentId: fakeDeploymentId,
  }), true);
  assert.strictEqual(validateProductionSourcePushOutput('Pushed 12 files at 12:00:00.'), true);
  assert.strictEqual(validateProductionSourcePushOutput('Script is already up to date.'), true);
  assert.throws(
    () => validateProductionSourcePushOutput('Skipping push.'),
    /source push was skipped/,
  );

  for (const invalid of [
    { webAppUrl: `http://script.google.com/macros/s/${fakeDeploymentId}/exec`, deploymentId: fakeDeploymentId },
    { webAppUrl: `https://example.invalid/macros/s/${fakeDeploymentId}/exec`, deploymentId: fakeDeploymentId },
    { webAppUrl: `https://script.google.com/macros/s/${fakeDeploymentId}/dev`, deploymentId: fakeDeploymentId },
    { webAppUrl: fakeWebAppUrl, deploymentId: 'different_fixture_value' },
  ]) {
    assert.throws(
      () => validateProductionDeploymentConfiguration(invalid),
      (error) => error.message === DEPLOYMENT_CONFIG_ERROR
        && !error.message.includes(fakeDeploymentId)
        && !error.message.includes(invalid.webAppUrl),
    );
  }

  const before = parseDeploymentListOutput(JSON.stringify([
    { deploymentId: fakeDeploymentId, versionNumber: 8, description: 'before' },
    { deploymentId: 'other_fixture_value', versionNumber: 2, description: 'other' },
  ]), fakeDeploymentId);
  const update = parseDeploymentUpdateOutput(JSON.stringify({
    deploymentId: fakeDeploymentId,
    versionNumber: 9,
    description: 'updated',
  }), fakeDeploymentId);
  const after = parseDeploymentListOutput(JSON.stringify([
    { deploymentId: fakeDeploymentId, versionNumber: 9, description: 'updated' },
    { deploymentId: 'other_fixture_value', versionNumber: 2, description: 'other' },
  ]), fakeDeploymentId);
  assert.strictEqual(verifyDeploymentUpdate({ before, after, update }), true);
  assert.throws(
    () => verifyDeploymentUpdate({ before, after: { ...after, deploymentCount: 3 }, update }),
    /deployment update verification failed/,
  );
  assert.throws(
    () => parseDeploymentListOutput(JSON.stringify([]), fakeDeploymentId),
    /deployment verification failed/,
  );

  assertPullAndCleanup({ name: 'head-match', versionNumber: undefined, shouldFail: false });
  assertPullAndCleanup({ name: 'version-match', versionNumber: 9, shouldFail: false });
  assertPullAndCleanup({
    name: 'head-up-to-date-but-stale',
    versionNumber: undefined,
    mutateRemote(rootDir) {
      fs.appendFileSync(path.join(rootDir, 'src', 'app', 'builder.gs'), '\n// stale HEAD fixture\n');
    },
    shouldFail: true,
  });
  assertPullAndCleanup({
    name: 'version-stale',
    versionNumber: 9,
    mutateRemote(rootDir) {
      fs.appendFileSync(path.join(rootDir, 'src', 'app', 'builder.gs'), '\n// stale version fixture\n');
    },
    shouldFail: true,
  });
  assertPullAndCleanup({
    name: 'missing-runtime-cleanup',
    versionNumber: 9,
    mutateRemote(rootDir) {
      fs.rmSync(path.join(rootDir, 'src', 'app', 'e2e_runtime_support.gs'));
    },
    shouldFail: true,
  });

  console.log('production runtime verification checks passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function createProductionBundleFixture(name) {
  const destination = path.join(tempRoot, name);
  fs.mkdirSync(path.join(destination, 'src', 'app'), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, 'appsscript.json'), path.join(destination, 'appsscript.json'));
  fs.copyFileSync(path.join(repoRoot, 'Index.html'), path.join(destination, 'Index.html'));
  for (const fileName of fs.readdirSync(path.join(repoRoot, 'src', 'app'))) {
    if (!fileName.endsWith('.gs') || fileName === 'e2e_helpers.gs') {
      continue;
    }
    fs.copyFileSync(
      path.join(repoRoot, 'src', 'app', fileName),
      path.join(destination, 'src', 'app', fileName),
    );
  }
  return destination;
}

function listFiles(rootDir, currentDir = rootDir, out = []) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      listFiles(rootDir, absolutePath, out);
    } else if (entry.isFile()) {
      out.push(path.relative(rootDir, absolutePath).replace(/\\/g, '/'));
    }
  }
  return out;
}

function createManifest(rootDir) {
  return buildLocalProductionBundleManifest({ rootDir, trackedFiles: listFiles(rootDir) });
}

function assertRemoteManifestMismatch(name, mutateRemote) {
  const expectedRoot = createProductionBundleFixture(`${name}-expected`);
  const remoteRoot = createProductionBundleFixture(`${name}-remote`);
  mutateRemote(remoteRoot);
  let caught;
  try {
    compareProductionBundleManifests(
      createManifest(expectedRoot),
      buildPulledProductionBundleManifest(remoteRoot),
    );
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${name} must fail manifest comparison`);
  assert.strictEqual(caught.message, REMOTE_BUNDLE_MISMATCH_ERROR);
  for (const sensitiveValue of sensitiveFixtureValues) {
    assert.ok(!caught.message.includes(sensitiveValue), `${name} error must not expose sensitive values`);
  }
}

function assertPullAndCleanup({ name, versionNumber, mutateRemote, shouldFail }) {
  const expectedRoot = createProductionBundleFixture(`${name}-expected`);
  const expectedManifest = createManifest(expectedRoot);
  let generatedProjectPath = '';
  let generatedIgnorePath = '';
  let generatedSourceRoot = '';
  const runPull = () => pullAndVerifyProductionRuntimeBundle({
    expectedManifest,
    projectTemplatePath: path.join(repoRoot, '.clasp.production.example.json'),
    scriptId: sensitiveFixtureValues[0],
    versionNumber,
    tempBaseDir: tempRoot,
    runClasp(args) {
      generatedProjectPath = args[args.indexOf('--project') + 1];
      generatedIgnorePath = args[args.indexOf('--ignore') + 1];
      const project = JSON.parse(fs.readFileSync(generatedProjectPath, 'utf8'));
      generatedSourceRoot = project.rootDir;
      assert.ok(path.isAbsolute(generatedSourceRoot), 'temporary pull rootDir must be absolute');
      assert.ok(generatedProjectPath.startsWith(tempRoot), 'temporary project config must stay outside the repository');
      assert.deepStrictEqual(project.scriptExtensions, ['.gs', '.js']);
      assert.deepStrictEqual(project.htmlExtensions, ['.html']);
      assert.deepStrictEqual(project.jsonExtensions, ['.json']);
      assert.ok(args.includes('--json'));
      assert.ok(args.includes('pull'));
      assert.ok(args.includes('--force'));
      if (versionNumber === undefined) {
        assert.ok(!args.includes('--versionNumber'));
      } else {
        assert.strictEqual(args[args.indexOf('--versionNumber') + 1], String(versionNumber));
      }
      copyDirectoryContents(createProductionBundleFixture(`${name}-remote`), generatedSourceRoot);
      if (mutateRemote) {
        mutateRemote(generatedSourceRoot);
      }
      return '[]';
    },
  });

  let caught;
  try {
    runPull();
  } catch (error) {
    caught = error;
  }
  if (shouldFail) {
    assert.ok(caught, `${name} pull verification must fail`);
    assert.strictEqual(caught.message, REMOTE_BUNDLE_MISMATCH_ERROR);
    for (const sensitiveValue of sensitiveFixtureValues) {
      assert.ok(!caught.message.includes(sensitiveValue), `${name} pull error must not expose sensitive values`);
    }
  } else {
    assert.ifError(caught);
  }
  assert.ok(generatedProjectPath, 'temporary project config must be generated');
  assert.ok(generatedIgnorePath, 'temporary ignore file must be generated');
  assert.ok(!fs.existsSync(path.dirname(generatedProjectPath)), 'temporary pull directory must be deleted');
  assert.ok(!fs.existsSync(generatedProjectPath), 'temporary project config must be deleted');
  assert.ok(!fs.existsSync(generatedIgnorePath), 'temporary ignore file must be deleted');
  assert.ok(!fs.existsSync(generatedSourceRoot), 'temporary remote source must be deleted');
}

function copyDirectoryContents(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}
