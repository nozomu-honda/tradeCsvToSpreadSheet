'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TextDecoder } = require('util');

const REQUIRED_REMOTE_FILES = [
  'appsscript.json',
  'Index.html',
  'src/app/web.gs',
  'src/app/e2e_runtime_support.gs',
];

const WEB_APP_FUNCTIONS = [
  'runFromWebApp',
  'resetDbFromWebApp',
  'getDbSpreadsheetFromWebApp',
  'listRecentImportsFromWebApp',
  'rollbackImportFromWebApp',
  'runStagingSheetFromWebApp',
];

const PUBLIC_E2E_HELPERS = [
  'prepareE2EWebAppRun',
  'cleanupE2EImportFromWebApp',
  'inspectE2EOutputSpreadsheetFromWebApp',
];

const RUNTIME_ASSERTION = 'assertCiE2eTokenForWebAppIfConfigured_';
const DEPLOYMENT_CONFIG_ERROR = 'Production Web App URL and Deployment ID configuration do not match.';
const LOCAL_BUNDLE_ERROR = 'Local production bundle manifest generation failed.';
const REMOTE_BUNDLE_MISMATCH_ERROR = 'Remote production source does not match the target production bundle.';
const ALLOWED_TEXT_EXTENSIONS = new Set(['.gs', '.js', '.html', '.json']);

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizeManifestPath(value, errorMessage) {
  const normalized = normalizePath(value);
  const segments = normalized.split('/');
  if (
    !normalized
    || normalized.startsWith('/')
    || /^[A-Za-z]:\//.test(normalized)
    || segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(errorMessage);
  }
  return normalized;
}

function canonicalizeManifestPath(relativePath) {
  return relativePath.endsWith('.js') ? `${relativePath.slice(0, -3)}.gs` : relativePath;
}

function normalizeTextForManifest(buffer, errorMessage) {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (decoded.includes('\u0000')) {
      throw new Error(errorMessage);
    }
    return decoded.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  } catch (error) {
    throw new Error(errorMessage);
  }
}

function buildProductionBundleManifest({ rootDir, relativePaths, errorMessage }) {
  try {
    if (!Array.isArray(relativePaths) || relativePaths.length === 0) {
      throw new Error(errorMessage);
    }
    const root = path.resolve(rootDir);
    const normalizedPaths = relativePaths
      .map((relativePath) => {
        const sourcePath = normalizeManifestPath(relativePath, errorMessage);
        return {
          sourcePath,
          relativePath: canonicalizeManifestPath(sourcePath),
        };
      })
      .sort((left, right) => comparePaths(left.relativePath, right.relativePath));
    if (new Set(normalizedPaths.map((entry) => entry.relativePath)).size !== normalizedPaths.length) {
      throw new Error(errorMessage);
    }

    return normalizedPaths.map(({ sourcePath, relativePath }) => {
      if (!ALLOWED_TEXT_EXTENSIONS.has(path.posix.extname(sourcePath).toLowerCase())) {
        throw new Error(errorMessage);
      }
      const absolutePath = path.resolve(root, ...sourcePath.split('/'));
      const relativeToRoot = path.relative(root, absolutePath);
      if (!relativeToRoot || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
        throw new Error(errorMessage);
      }
      const stat = fs.lstatSync(absolutePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(errorMessage);
      }
      const normalizedSource = normalizeTextForManifest(fs.readFileSync(absolutePath), errorMessage);
      return {
        relativePath,
        sha256: crypto.createHash('sha256').update(normalizedSource, 'utf8').digest('hex'),
      };
    });
  } catch (error) {
    throw new Error(errorMessage);
  }
}

function buildLocalProductionBundleManifest({ rootDir, trackedFiles }) {
  return buildProductionBundleManifest({
    rootDir,
    relativePaths: trackedFiles,
    errorMessage: LOCAL_BUNDLE_ERROR,
  });
}

function buildPulledProductionBundleManifest(rootDir) {
  const relativePaths = collectFiles(rootDir).map((entry) => entry.relativePath);
  return buildProductionBundleManifest({
    rootDir,
    relativePaths,
    errorMessage: REMOTE_BUNDLE_MISMATCH_ERROR,
  });
}

function compareProductionBundleManifests(expectedManifest, actualManifest) {
  try {
    if (!Array.isArray(expectedManifest) || !Array.isArray(actualManifest)) {
      throw new Error(REMOTE_BUNDLE_MISMATCH_ERROR);
    }
    const normalizeManifest = (manifest) => manifest
      .map((entry) => ({
        relativePath: canonicalizeManifestPath(
          normalizeManifestPath(entry && entry.relativePath, REMOTE_BUNDLE_MISMATCH_ERROR),
        ),
        sha256: String(entry && entry.sha256 || ''),
      }))
      .sort((left, right) => comparePaths(left.relativePath, right.relativePath));
    const expected = normalizeManifest(expectedManifest);
    const actual = normalizeManifest(actualManifest);
    if (
      expected.length === 0
      || expected.length !== actual.length
      || new Set(expected.map((entry) => entry.relativePath)).size !== expected.length
      || new Set(actual.map((entry) => entry.relativePath)).size !== actual.length
    ) {
      throw new Error(REMOTE_BUNDLE_MISMATCH_ERROR);
    }
    for (let index = 0; index < expected.length; index += 1) {
      if (
        expected[index].relativePath !== actual[index].relativePath
        || !/^[a-f0-9]{64}$/.test(expected[index].sha256)
        || expected[index].sha256 !== actual[index].sha256
      ) {
        throw new Error(REMOTE_BUNDLE_MISMATCH_ERROR);
      }
    }
  } catch (error) {
    throw new Error(REMOTE_BUNDLE_MISMATCH_ERROR);
  }
  return true;
}

function countFunctionDefinitions(source, functionName) {
  const pattern = new RegExp(`\\bfunction\\s+${functionName}\\s*\\(`, 'g');
  return (String(source || '').match(pattern) || []).length;
}

function findFunctionDefinitions(source) {
  const definitions = new Set();
  const pattern = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    definitions.add(match[1]);
  }
  return definitions;
}

function findPrivateFunctionCalls(source) {
  const calls = new Set();
  const pattern = /\b([A-Za-z_$][\w$]*_)\s*\(/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    calls.add(match[1]);
  }
  return calls;
}

function extractFunction(source, functionName) {
  const marker = `function ${functionName}`;
  const start = String(source || '').indexOf(marker);
  if (start < 0) {
    throw new Error('Remote production runtime boundary verification failed.');
  }
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error('Remote production runtime boundary verification failed.');
}

function collectFiles(rootDir, currentDir = rootDir, entries = []) {
  for (const dirent of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, dirent.name);
    if (dirent.isDirectory()) {
      collectFiles(rootDir, absolutePath, entries);
    } else if (dirent.isFile()) {
      entries.push({
        absolutePath,
        relativePath: normalizePath(path.relative(rootDir, absolutePath)),
      });
    }
  }
  return entries;
}

function verifyProductionRuntimeBundle(rootDir) {
  const entries = collectFiles(rootDir);
  const paths = new Set(entries.map((entry) => entry.relativePath));
  for (const requiredFile of REQUIRED_REMOTE_FILES) {
    if (!paths.has(requiredFile)) {
      throw new Error('Remote production runtime boundary verification failed.');
    }
  }
  if (entries.some((entry) => entry.relativePath.startsWith('src/test/'))) {
    throw new Error('Remote production runtime boundary verification failed.');
  }
  if (paths.has('src/app/e2e_helpers.gs')) {
    throw new Error('Remote production runtime boundary verification failed.');
  }

  const scriptEntries = entries.filter((entry) => /\.(?:gs|js)$/.test(entry.relativePath));
  const scriptSources = scriptEntries.map((entry) => fs.readFileSync(entry.absolutePath, 'utf8'));
  const combinedSource = scriptSources.join('\n');
  if (countFunctionDefinitions(combinedSource, RUNTIME_ASSERTION) !== 1) {
    throw new Error('Remote production runtime boundary verification failed.');
  }
  for (const functionName of WEB_APP_FUNCTIONS) {
    if (countFunctionDefinitions(combinedSource, functionName) !== 1) {
      throw new Error('Remote production runtime boundary verification failed.');
    }
  }
  for (const functionName of PUBLIC_E2E_HELPERS) {
    if (countFunctionDefinitions(combinedSource, functionName) !== 0) {
      throw new Error('Remote production runtime boundary verification failed.');
    }
  }

  const definitions = findFunctionDefinitions(combinedSource);
  const webSource = fs.readFileSync(path.join(rootDir, 'src', 'app', 'web.gs'), 'utf8');
  const unresolved = Array.from(findPrivateFunctionCalls(webSource))
    .filter((functionName) => !definitions.has(functionName));
  if (unresolved.length > 0) {
    throw new Error('Remote production runtime boundary verification failed.');
  }

  const listRecentImportsSource = extractFunction(webSource, 'listRecentImportsFromWebApp');
  if (!listRecentImportsSource.includes(`${RUNTIME_ASSERTION}(payload)`)) {
    throw new Error('Remote production runtime boundary verification failed.');
  }

  const indexSource = fs.readFileSync(path.join(rootDir, 'Index.html'), 'utf8');
  if (!/DOMContentLoaded[\s\S]*?loadRecentImports\s*\(\s*\)/.test(indexSource)) {
    throw new Error('Remote production runtime boundary verification failed.');
  }
  const loadRecentImportsSource = extractFunction(indexSource, 'loadRecentImports');
  if (!/\.listRecentImportsFromWebApp\s*\(/.test(loadRecentImportsSource)) {
    throw new Error('Remote production runtime boundary verification failed.');
  }

  return {
    fileCount: entries.length,
    webFunctionCount: WEB_APP_FUNCTIONS.length,
    runtimeAssertionCount: 1,
  };
}

function validateProductionDeploymentConfiguration({ webAppUrl, deploymentId }) {
  try {
    const parsed = new URL(webAppUrl);
    const match = parsed.pathname.match(/^\/macros\/s\/([A-Za-z0-9_-]+)\/exec$/);
    if (
      parsed.protocol !== 'https:'
      || parsed.hostname !== 'script.google.com'
      || parsed.port
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || !match
      || !deploymentId
      || match[1] !== deploymentId
    ) {
      throw new Error(DEPLOYMENT_CONFIG_ERROR);
    }
  } catch (error) {
    throw new Error(DEPLOYMENT_CONFIG_ERROR);
  }
  return true;
}

function parseJsonOutput(rawOutput, errorMessage) {
  try {
    return JSON.parse(String(rawOutput || '').trim());
  } catch (error) {
    throw new Error(errorMessage);
  }
}

function parseDeploymentListOutput(rawOutput, deploymentId) {
  const parsed = parseJsonOutput(rawOutput, 'Production deployment verification failed.');
  if (!Array.isArray(parsed)) {
    throw new Error('Production deployment verification failed.');
  }
  const target = parsed.find((deployment) => deployment && deployment.deploymentId === deploymentId);
  if (!target || !Number.isInteger(Number(target.versionNumber))) {
    throw new Error('Production deployment verification failed.');
  }
  return {
    deploymentCount: parsed.length,
    versionNumber: Number(target.versionNumber),
  };
}

function parseDeploymentUpdateOutput(rawOutput, deploymentId) {
  const parsed = parseJsonOutput(rawOutput, 'Production deployment update verification failed.');
  if (
    !parsed
    || parsed.deploymentId !== deploymentId
    || !Number.isInteger(Number(parsed.versionNumber))
  ) {
    throw new Error('Production deployment update verification failed.');
  }
  return {
    versionNumber: Number(parsed.versionNumber),
  };
}

function verifyDeploymentUpdate({ before, after, update }) {
  if (
    !before
    || !after
    || !update
    || before.deploymentCount !== after.deploymentCount
    || update.versionNumber !== after.versionNumber
    || update.versionNumber === before.versionNumber
  ) {
    throw new Error('Production deployment update verification failed.');
  }
  return true;
}

function pullAndVerifyProductionRuntimeBundle({
  expectedManifest,
  projectTemplatePath,
  scriptId,
  versionNumber,
  runClasp,
  tempBaseDir = os.tmpdir(),
}) {
  const tempRoot = fs.mkdtempSync(path.join(tempBaseDir, 'production-runtime-verification-'));
  const sourceRoot = path.join(tempRoot, 'source');
  const projectPath = path.join(tempRoot, '.clasp.json');
  const ignorePath = path.join(tempRoot, '.claspignore');
  try {
    fs.mkdirSync(sourceRoot, { recursive: true });
    const project = JSON.parse(fs.readFileSync(projectTemplatePath, 'utf8'));
    project.scriptId = scriptId;
    project.rootDir = sourceRoot;
    project.scriptExtensions = ['.gs', '.js'];
    project.htmlExtensions = ['.html'];
    project.jsonExtensions = ['.json'];
    delete project.srcDir;
    fs.writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`, { mode: 0o600 });
    fs.writeFileSync(ignorePath, '# remote production runtime verification\n', { mode: 0o600 });

    const args = [
      '--user',
      'production',
      '--project',
      projectPath,
      '--ignore',
      ignorePath,
      '--json',
      'pull',
      '--force',
    ];
    if (versionNumber !== undefined) {
      args.push('--versionNumber', String(versionNumber));
    }
    runClasp(args);
    const pulledManifest = buildPulledProductionBundleManifest(sourceRoot);
    compareProductionBundleManifests(expectedManifest, pulledManifest);
    const runtimeSummary = verifyProductionRuntimeBundle(sourceRoot);
    return {
      ...runtimeSummary,
      manifestFileCount: pulledManifest.length,
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

module.exports = {
  DEPLOYMENT_CONFIG_ERROR,
  LOCAL_BUNDLE_ERROR,
  PUBLIC_E2E_HELPERS,
  REMOTE_BUNDLE_MISMATCH_ERROR,
  REQUIRED_REMOTE_FILES,
  RUNTIME_ASSERTION,
  WEB_APP_FUNCTIONS,
  buildLocalProductionBundleManifest,
  buildPulledProductionBundleManifest,
  compareProductionBundleManifests,
  normalizeTextForManifest,
  parseDeploymentListOutput,
  parseDeploymentUpdateOutput,
  pullAndVerifyProductionRuntimeBundle,
  validateProductionDeploymentConfiguration,
  verifyDeploymentUpdate,
  verifyProductionRuntimeBundle,
};
