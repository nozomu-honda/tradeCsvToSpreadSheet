#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_PROJECT = {
  scriptExtensions: ['.js', '.gs'],
  htmlExtensions: ['.html'],
  jsonExtensions: ['.json'],
  filePushOrder: [],
  skipSubdirectories: false,
};

if (require.main === module) {
  main();
}

function main() {
  const env = process.env;
  const projectPath = env.CLASP_PROJECT_PATH;
  const scriptId = env.GAS_TEST_SCRIPT_ID;
  const clasprcJson = env.CLASPRC_JSON || '';
  const projectJson = env.CLASP_PROJECT_JSON || '';
  const repoRoot = resolveRepositoryRoot(env, process.cwd());

  if (!projectPath) {
    fail('Missing CI project path', 'CLASP_PROJECT_PATH is not set.');
  }
  if (!scriptId) {
    fail('Missing GAS test script ID', 'GAS_TEST_SCRIPT_ID is not set.');
  }

  writeJsonFile(path.join(os.homedir(), '.clasprc.json'), parseJson(clasprcJson, 'CLASPRC_JSON'));
  writeJsonFile(projectPath, normalizeCiClaspProject(projectJson, {
    scriptId,
    repoRoot,
    projectPath,
  }));
}

function resolveRepositoryRoot(env, cwd) {
  const workspace = env.GITHUB_WORKSPACE && env.GITHUB_WORKSPACE.trim();
  return path.resolve(workspace || cwd);
}

function normalizeCiClaspProject(rawProjectJson, options) {
  const { scriptId, repoRoot, projectPath } = options;
  const project = rawProjectJson.trim()
    ? parseJson(rawProjectJson, 'CLASP_PROJECT_JSON')
    : { ...DEFAULT_PROJECT };

  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    fail('Invalid CLASP_PROJECT_JSON', 'Project config must be a JSON object.');
  }

  const normalizedRepoRoot = path.resolve(repoRoot);
  const projectDir = path.dirname(path.resolve(projectPath || path.join(repoRoot, '.clasp.ci.json')));
  if (projectDir !== normalizedRepoRoot) {
    fail('Invalid CI project path', 'CI clasp project config must be located at the repository root.');
  }

  const normalized = {
    ...DEFAULT_PROJECT,
    ...project,
    scriptId,
    rootDir: '.',
  };

  delete normalized.srcDir;
  return normalized;
}

function resolveClaspSourceRoot(project, projectPath) {
  const projectDir = path.dirname(path.resolve(projectPath));
  const rootDir = project.rootDir || '.';
  return path.resolve(projectDir, rootDir);
}

function listRepresentativePushFiles(project, projectPath) {
  const sourceRoot = resolveClaspSourceRoot(project, projectPath);
  const representativeFiles = [
    'appsscript.json',
    'Index.html',
    path.join('src', 'app', 'web.gs'),
  ];

  return representativeFiles
    .map((relativePath) => ({
      relativePath: relativePath.replace(/\\/g, '/'),
      absolutePath: path.join(sourceRoot, relativePath),
    }))
    .filter((item) => fs.existsSync(item.absolutePath));
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`Invalid ${label}`, error.message);
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

function fail(title, message) {
  console.error(`::error title=${title}::${message}`);
  process.exit(1);
}

module.exports = {
  normalizeCiClaspProject,
  resolveClaspSourceRoot,
  resolveRepositoryRoot,
  listRepresentativePushFiles,
};
