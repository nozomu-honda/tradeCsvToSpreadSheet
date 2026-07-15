#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PRODUCTION_PROJECT = '.clasp.production.json';
const PRODUCTION_IGNORE = '.clasp.productionignore';
const PRODUCTION_USER = 'production';
const CONFIRMATION_PHRASE = 'PRODUCTION PUSH';
const REQUIRED_PRODUCTION_IGNORE_PATTERNS = [
  'src/test/**',
  'src/app/e2e_helpers.gs',
];
const CLASP_COMMANDS = {
  open: 'open-script',
  status: 'show-file-status',
  push: 'push',
};

const command = process.argv[2];
const extraArgs = process.argv.slice(3);
if (!['open', 'status', 'push'].includes(command)) {
  fail('Usage: node scripts/gas-production.js <open|status|push>');
}
if (extraArgs.length > 0 && !(command === 'status' && extraArgs.length === 1 && extraArgs[0] === '--json')) {
  fail('status では --json のみ追加指定できます。open / push に追加引数は指定できません。');
}

main().catch((error) => {
  fail(error.message);
});

async function main() {
  validateProductionProject();
  validateProductionIgnore();

  if (command === 'push') {
    ensureDevelopBranch();
    ensureCleanWorkingTree();
    fetchOriginDevelop();
    ensureHeadMatchesOriginDevelop();
  }

  validateProductionAuth();

  if (command === 'push') {
    await confirmProductionPush();
  }

  runClasp(command);
}

function validateProductionProject() {
  const projectPath = path.join(ROOT_DIR, PRODUCTION_PROJECT);
  if (!fs.existsSync(projectPath)) {
    fail(`本番用project設定がありません: ${PRODUCTION_PROJECT}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  } catch (error) {
    fail(`${PRODUCTION_PROJECT} が有効なJSONではありません。`);
  }

  if (!parsed || typeof parsed !== 'object') {
    fail(`${PRODUCTION_PROJECT} の内容がJSON objectではありません。`);
  }

  if (typeof parsed.scriptId !== 'string' || parsed.scriptId.trim() === '') {
    fail(`${PRODUCTION_PROJECT} に本番Apps ScriptのscriptIdが設定されていません。`);
  }

  if (/YOUR_|PLACEHOLDER|EXAMPLE|DUMMY/i.test(parsed.scriptId)) {
    fail(`${PRODUCTION_PROJECT} のscriptIdがplaceholderのままです。`);
  }
}

function validateProductionIgnore() {
  const ignorePath = path.join(ROOT_DIR, PRODUCTION_IGNORE);
  if (!fs.existsSync(ignorePath)) {
    fail(`本番専用ignoreがありません: ${PRODUCTION_IGNORE}`);
  }

  const ignoreLines = fs.readFileSync(ignorePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const requiredPattern of REQUIRED_PRODUCTION_IGNORE_PATTERNS) {
    if (!ignoreLines.includes(requiredPattern)) {
      fail(`${PRODUCTION_IGNORE} に ${requiredPattern} が含まれていません。`);
    }
  }
}

function validateProductionAuth() {
  const result = run('clasp', ['--user', PRODUCTION_USER, 'show-authorized-user'], {
    stdio: 'pipe',
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;

  if (
    result.error ||
    result.status !== 0 ||
    /Not logged in|No credentials found|unknown option|error:/i.test(output)
  ) {
    fail('clasp named user `production` の認証を確認できません。`clasp login --user production` で本番用認証を作成してください。');
  }
}

function ensureDevelopBranch() {
  const branch = git(['branch', '--show-current']).stdout.trim();
  if (branch !== 'develop') {
    fail('本番反映は develop ブランチでのみ実行できます。');
  }
}

function ensureCleanWorkingTree() {
  const status = git(['status', '--porcelain=v1', '--untracked-files=normal']).stdout.trim();
  if (status) {
    fail('working treeに未コミット変更があります。本番反映前にcommitまたはstashしてください。');
  }
}

function fetchOriginDevelop() {
  const result = run('git', ['fetch', '--no-tags', 'origin', 'develop:refs/remotes/origin/develop'], {
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    fail('origin/develop の取得に失敗しました。');
  }
}

function ensureHeadMatchesOriginDevelop() {
  const head = git(['rev-parse', 'HEAD']).stdout.trim();
  const originDevelop = git(['rev-parse', 'origin/develop']).stdout.trim();
  if (head !== originDevelop) {
    fail('HEADが最新のorigin/developと一致していません。最新developへ更新してから実行してください。');
  }
}

async function confirmProductionPush() {
  process.stderr.write([
    '本番Apps Scriptへpushします。',
    'Script ID、Deployment ID、Web App URL、OAuth tokenは表示しません。',
    `続行するには ${CONFIRMATION_PHRASE} と入力してください: `,
  ].join('\n'));

  const answer = await readLine();
  if (answer.trim() !== CONFIRMATION_PHRASE) {
    fail('確認入力が一致しないため、本番pushを中止しました。');
  }
}

function runClasp(claspCommand) {
  const args = [
    '--user',
    PRODUCTION_USER,
    '--project',
    PRODUCTION_PROJECT,
    '--ignore',
    PRODUCTION_IGNORE,
    CLASP_COMMANDS[claspCommand],
    ...(claspCommand === 'push' ? ['--force'] : []),
    ...extraArgs,
  ];

  const result = run('clasp', args, { stdio: 'inherit' });
  process.exit(result.status === null ? 1 : result.status);
}

function git(args) {
  const result = run('git', args, { stdio: 'pipe' });
  if (result.status !== 0) {
    fail('gitコマンドの実行に失敗しました。');
  }
  return result;
}

function run(bin, args, options) {
  const baseOptions = {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    ...options,
  };

  if (bin === 'clasp') {
    const executable = resolveClaspCommand();
    if (!executable) {
      return {
        status: null,
        error: new Error('clasp command was not found in PATH.'),
        stdout: '',
        stderr: '',
      };
    }

    if (process.platform !== 'win32') {
      return spawnSync(executable, args, baseOptions);
    }

    const commandLine = [executable, ...args].map(quoteWindowsShellArg).join(' ');
    return spawnSync(commandLine, {
      ...baseOptions,
      shell: true,
    });
  }

  return spawnSync(bin, args, baseOptions);
}

function resolveClaspCommand() {
  const localBin = path.join(ROOT_DIR, 'node_modules', '.bin');
  const localCommand = resolveCommandFromDirs('clasp', [localBin]);
  if (localCommand) {
    return localCommand;
  }

  return resolveWindowsCommand('clasp');
}

function resolveWindowsCommand(command) {
  const pathDirs = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  return resolveCommandFromDirs(command, pathDirs);
}

function resolveCommandFromDirs(command, pathDirs) {
  const extensions = ['.cmd', '.exe', '.bat'];
  if (process.platform !== 'win32') {
    extensions.unshift('');
  }

  for (const dir of pathDirs) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${command}${extension}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return '';
}

function quoteWindowsShellArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function readLine() {
  if (!process.stdin.isTTY) {
    try {
      return Promise.resolve(fs.readFileSync(0, 'utf8').split(/\r?\n/)[0] || '');
    } catch (error) {
      return Promise.resolve('');
    }
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question('', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
