#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEPLOYMENT_CONFIG_ERROR,
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

try {
  const validRoot = createProductionBundleFixture('valid');
  const validSummary = verifyProductionRuntimeBundle(validRoot);
  assert.strictEqual(validSummary.runtimeAssertionCount, 1);
  assert.strictEqual(validSummary.webFunctionCount, 6);

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

  assertPullAndCleanup({ versionNumber: undefined, removeRuntime: false, shouldFail: false });
  assertPullAndCleanup({ versionNumber: 9, removeRuntime: false, shouldFail: false });
  assertPullAndCleanup({ versionNumber: 9, removeRuntime: true, shouldFail: true });

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

function assertPullAndCleanup({ versionNumber, removeRuntime, shouldFail }) {
  let generatedProjectPath = '';
  let generatedSourceRoot = '';
  const runPull = () => pullAndVerifyProductionRuntimeBundle({
    projectTemplatePath: path.join(repoRoot, '.clasp.production.example.json'),
    scriptId: 'script_fixture_value',
    versionNumber,
    tempBaseDir: tempRoot,
    runClasp(args) {
      generatedProjectPath = args[args.indexOf('--project') + 1];
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
      copyDirectoryContents(createProductionBundleFixture(`pull-source-${versionNumber || 'head'}-${removeRuntime}`), generatedSourceRoot);
      if (removeRuntime) {
        fs.rmSync(path.join(generatedSourceRoot, 'src', 'app', 'e2e_runtime_support.gs'));
      }
      return '[]';
    },
  });

  if (shouldFail) {
    assert.throws(runPull, /runtime boundary verification failed/);
  } else {
    runPull();
  }
  assert.ok(generatedProjectPath, 'temporary project config must be generated');
  assert.ok(!fs.existsSync(path.dirname(generatedProjectPath)), 'temporary pull directory must be deleted');
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
