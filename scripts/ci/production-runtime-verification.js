'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

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

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
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
    return verifyProductionRuntimeBundle(sourceRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

module.exports = {
  DEPLOYMENT_CONFIG_ERROR,
  PUBLIC_E2E_HELPERS,
  REQUIRED_REMOTE_FILES,
  RUNTIME_ASSERTION,
  WEB_APP_FUNCTIONS,
  parseDeploymentListOutput,
  parseDeploymentUpdateOutput,
  pullAndVerifyProductionRuntimeBundle,
  validateProductionDeploymentConfiguration,
  verifyDeploymentUpdate,
  verifyProductionRuntimeBundle,
};
