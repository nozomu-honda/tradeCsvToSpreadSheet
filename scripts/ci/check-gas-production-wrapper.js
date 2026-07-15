#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..', '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-production-wrapper-'));

try {
  const validWorkspace = createWorkspace('valid', [
    'src/test/**',
    'src/app/e2e_helpers.gs',
  ]);

  const result = runWrapper(validWorkspace, 'status');

  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.stderr.write(`fake bin: ${validWorkspace.fakeBinDir}\n`);
    process.stderr.write(`fake log exists: ${fs.existsSync(validWorkspace.fakeLogPath)}\n`);
    if (fs.existsSync(validWorkspace.fakeLogPath)) {
      process.stderr.write(fs.readFileSync(validWorkspace.fakeLogPath, 'utf8'));
    }
    fail(`gas-production status wrapper exited with ${result.status}`);
  }

  const calls = readFakeClaspCalls(validWorkspace.fakeLogPath);

  assertDeepEqual(calls[0], ['--user', 'production', 'show-authorized-user'], 'authorization check args');
  assertDeepEqual(
    calls[1],
    [
      '--user',
      'production',
      '--project',
      '.clasp.production.json',
      '--ignore',
      '.clasp.productionignore',
      'show-file-status',
    ],
    'production status args'
  );

  if (calls.length !== 2) {
    fail(`expected exactly 2 fake clasp calls, got ${calls.length}`);
  }

  const jsonStatusWorkspace = createWorkspace('status-json', [
    'src/test/**',
    'src/app/e2e_helpers.gs',
  ]);
  const jsonStatusResult = runWrapper(jsonStatusWorkspace, 'status', ['--json']);
  if (jsonStatusResult.status !== 0) {
    process.stderr.write(jsonStatusResult.stdout || '');
    process.stderr.write(jsonStatusResult.stderr || '');
    fail('gas-production status --json wrapper failed');
  }
  const jsonStatusCalls = readFakeClaspCalls(jsonStatusWorkspace.fakeLogPath);
  assertDeepEqual(
    jsonStatusCalls[1],
    [
      '--user',
      'production',
      '--project',
      '.clasp.production.json',
      '--ignore',
      '.clasp.productionignore',
      'show-file-status',
      '--json',
    ],
    'production status --json args'
  );

  for (const command of ['status', 'open', 'push']) {
    assertMissingIgnorePatternFails(command, 'src/test/**');
    assertMissingIgnorePatternFails(command, 'src/app/e2e_helpers.gs');
  }

  assertPushCleanWorkingTreeBoundary();

  console.log('gas-production wrapper args ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function createWorkspace(name, productionIgnoreLines) {
  const workspaceRoot = path.join(tempRoot, name);
  const tempScriptsDir = path.join(workspaceRoot, 'scripts');
  const fakeBinDir = path.join(workspaceRoot, 'bin');
  const fakeLogPath = path.join(workspaceRoot, 'fake-clasp-args.jsonl');

  fs.mkdirSync(tempScriptsDir, { recursive: true });
  fs.mkdirSync(fakeBinDir, { recursive: true });
  fs.copyFileSync(
    path.join(rootDir, 'scripts', 'gas-production.js'),
    path.join(tempScriptsDir, 'gas-production.js')
  );
  fs.writeFileSync(
    path.join(workspaceRoot, '.clasp.productionignore'),
    `${productionIgnoreLines.join('\n')}\n`
  );
  fs.writeFileSync(
    path.join(workspaceRoot, '.clasp.production.json'),
    JSON.stringify({
      scriptId: 'TEST_PRODUCTION_SCRIPT_ID_FOR_WRAPPER_CHECK',
      rootDir: '.',
      scriptExtensions: ['.js', '.gs'],
      htmlExtensions: ['.html'],
      jsonExtensions: ['.json'],
      filePushOrder: [],
      skipSubdirectories: false,
    }, null, 2) + '\n'
  );
  writeFakeClasp(fakeBinDir);

  return {
    workspaceRoot,
    fakeBinDir,
    fakeLogPath,
  };
}

function runWrapper(workspace, command, extraArgs = [], input = '') {
  const childEnv = withPrependedPath(process.env, workspace.fakeBinDir);
  return spawnSync(
    process.execPath,
    [path.join(workspace.workspaceRoot, 'scripts', 'gas-production.js'), command, ...extraArgs],
    {
      cwd: workspace.workspaceRoot,
      encoding: 'utf8',
      env: {
        ...childEnv,
        FAKE_CLASP_LOG: workspace.fakeLogPath,
      },
      input,
    }
  );
}

function readFakeClaspCalls(fakeLogPath) {
  return fs.readFileSync(fakeLogPath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assertMissingIgnorePatternFails(command, missingPattern) {
  const ignoreLines = [
    'src/test/**',
    'src/app/e2e_helpers.gs',
  ].filter((line) => line !== missingPattern);
  const workspace = createWorkspace(`${command}-${missingPattern.replace(/[^A-Za-z0-9_-]/g, '-')}`, ignoreLines);
  const result = runWrapper(workspace, command);
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;

  if (result.status === 0) {
    fail(`${command} must fail when ${missingPattern} is missing from .clasp.productionignore`);
  }
  if (!output.includes(missingPattern)) {
    fail(`${command} failure did not mention missing ignore pattern ${missingPattern}`);
  }
  if (fs.existsSync(workspace.fakeLogPath) && fs.readFileSync(workspace.fakeLogPath, 'utf8').trim() !== '') {
    fail(`${command} should stop before invoking clasp when ${missingPattern} is missing`);
  }
}

function assertPushCleanWorkingTreeBoundary() {
  const ignoredProjectWorkspace = createWorkspace('push-ignored-project', [
    'src/test/**',
    'src/app/e2e_helpers.gs',
  ]);
  initializeGitWorkspace(ignoredProjectWorkspace);

  const ignoredCheck = runGit(
    ignoredProjectWorkspace.workspaceRoot,
    ['check-ignore', '.clasp.production.json'],
  );
  if (ignoredCheck.status !== 0) {
    fail('.clasp.production.json must remain ignored by the production wrapper fixture');
  }

  const cleanBeforePush = runGit(
    ignoredProjectWorkspace.workspaceRoot,
    ['status', '--porcelain=v1', '--untracked-files=normal'],
  );
  if (cleanBeforePush.stdout.trim() !== '') {
    fail('ignored .clasp.production.json must not dirty the production wrapper fixture');
  }

  const cleanPush = runWrapper(
    ignoredProjectWorkspace,
    'push',
    [],
    'PRODUCTION PUSH\n',
  );
  if (cleanPush.status !== 0) {
    process.stderr.write(cleanPush.stdout || '');
    process.stderr.write(cleanPush.stderr || '');
    fail('production push fixture with only ignored clasp config must pass the clean working tree check');
  }

  const unexpectedWorkspace = createWorkspace('push-unexpected-file', [
    'src/test/**',
    'src/app/e2e_helpers.gs',
  ]);
  initializeGitWorkspace(unexpectedWorkspace);
  fs.writeFileSync(
    path.join(unexpectedWorkspace.workspaceRoot, 'unexpected-production-file.txt'),
    'unexpected\n',
  );

  const unexpectedPush = runWrapper(
    unexpectedWorkspace,
    'push',
    [],
    'PRODUCTION PUSH\n',
  );
  const output = `${unexpectedPush.stdout || ''}\n${unexpectedPush.stderr || ''}`;
  if (unexpectedPush.status === 0) {
    fail('production push must fail when a real untracked file exists');
  }
  if (!output.includes('working treeに未コミット変更があります')) {
    fail('unexpected untracked file failure must come from the clean working tree guard');
  }
  if (fs.existsSync(unexpectedWorkspace.fakeLogPath)) {
    fail('production push must stop before clasp authentication when a real untracked file exists');
  }
}

function initializeGitWorkspace(workspace) {
  fs.writeFileSync(
    path.join(workspace.workspaceRoot, '.gitignore'),
    '.clasp.production.json\nnode_modules/\n',
  );

  assertGitSuccess(workspace.workspaceRoot, ['init']);
  assertGitSuccess(workspace.workspaceRoot, ['checkout', '-B', 'develop']);
  assertGitSuccess(workspace.workspaceRoot, ['config', 'user.email', 'ci@example.invalid']);
  assertGitSuccess(workspace.workspaceRoot, ['config', 'user.name', 'CI Fixture']);
  assertGitSuccess(workspace.workspaceRoot, ['add', '.']);
  assertGitSuccess(workspace.workspaceRoot, ['commit', '-m', 'fixture']);

  const remotePath = path.join(tempRoot, `${path.basename(workspace.workspaceRoot)}-origin.git`);
  const cloneResult = spawnSync(
    'git',
    ['clone', '--bare', workspace.workspaceRoot, remotePath],
    { encoding: 'utf8' },
  );
  if (cloneResult.status !== 0) {
    process.stderr.write(cloneResult.stdout || '');
    process.stderr.write(cloneResult.stderr || '');
    fail('failed to create local origin for production wrapper fixture');
  }
  assertGitSuccess(workspace.workspaceRoot, ['remote', 'add', 'origin', remotePath]);
}

function runGit(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

function assertGitSuccess(cwd, args) {
  const result = runGit(cwd, args);
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`git ${args.join(' ')} failed in production wrapper fixture`);
  }
}

function writeFakeClasp(fakeBinDir) {
  const fakeClaspJs = path.join(fakeBinDir, 'clasp.js');
  fs.writeFileSync(
    fakeClaspJs,
    `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_CLASP_LOG, JSON.stringify(args) + '\\n');
const command = args[args.length - 1];
const hasCommand = (name) => args.includes(name);
if (command === 'show-authorized-user') {
  console.log('production@example.invalid');
  process.exit(0);
}
if (hasCommand('show-file-status')) {
  console.log('fake file status');
  process.exit(0);
}
if (command === 'open-script') {
  console.log('fake open script');
  process.exit(0);
}
if (command === 'push') {
  console.log('fake push');
  process.exit(0);
}
console.error('unexpected fake clasp command: ' + args.join(' '));
process.exit(2);
`
  );

  const fakeClaspSh = path.join(fakeBinDir, 'clasp');
  fs.writeFileSync(
    fakeClaspSh,
    `#!/usr/bin/env sh
exec node "$(dirname "$0")/clasp.js" "$@"
`
  );
  fs.chmodSync(fakeClaspSh, 0o755);

  const fakeClaspCmd = path.join(fakeBinDir, 'clasp.cmd');
  fs.writeFileSync(
    fakeClaspCmd,
    `@echo off
node "%~dp0clasp.js" %*
`,
    'ascii'
  );
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} mismatch\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`);
  }
}

function withPrependedPath(sourceEnv, firstPath) {
  const env = {};
  let originalPath = '';

  for (const [key, value] of Object.entries(sourceEnv)) {
    if (key.toLowerCase() === 'path') {
      originalPath = originalPath || value;
    } else {
      env[key] = value;
    }
  }

  env.PATH = `${firstPath}${path.delimiter}${originalPath}`;
  env.Path = env.PATH;
  return env;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
