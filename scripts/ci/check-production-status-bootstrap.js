#!/usr/bin/env node
'use strict';

const assert = require('assert');

const {
  resolveStatusIssueNumber,
  runProductionStatusSync,
} = require('./production-status-sync');

const sha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const validBody = [
  '# 本番反映ステータス',
  '',
  '- 状態: `unknown`',
  '- 本番commit: `unknown`',
  `- 最新develop: \`${sha}\``,
  '<!-- production-status:managed-by-github-actions -->',
].join('\n');

function baseEnv(overrides = {}) {
  return {
    GITHUB_TOKEN: 'token',
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_RUN_ID: '123',
    ...overrides,
  };
}

function createAdapters(options = {}) {
  const calls = [];
  return {
    calls,
    fetchDevelop() {
      calls.push('fetch-develop');
    },
    getHeadSha() {
      return sha;
    },
    isAncestor() {
      return true;
    },
    commitCount() {
      return 0;
    },
    async githubRequest(method, apiPath, body) {
      calls.push(`github:${method}:${apiPath}`);
      if (method === 'GET' && apiPath === '/repos/owner/repo/issues/44') {
        if (options.issueMissing) {
          throw new Error('GitHub API GET /repos/owner/repo/issues/44 failed with 404: not found');
        }
        return {
          number: 44,
          title: options.badTitle ? '別Issue' : '本番反映ステータス',
          state: options.closed ? 'closed' : 'open',
          pull_request: options.isPullRequest ? { url: 'https://api.example/pulls/44' } : undefined,
          body: options.missingMarker ? '# 本番反映ステータス' : validBody,
        };
      }
      if (method === 'PATCH' && apiPath === '/repos/owner/repo/issues/44') {
        calls.push(`patch-body:${body.body.length}`);
        return {};
      }
      throw new Error(`unexpected GitHub call: ${method} ${apiPath}`);
    },
    writeStepSummary(markdown) {
      calls.push(`summary:${markdown}`);
    },
  };
}

assert.deepStrictEqual(resolveStatusIssueNumber({}), {
  configured: false,
  reason: 'PRODUCTION_STATUS_ISSUE_NUMBER is not configured',
});
assert.deepStrictEqual(resolveStatusIssueNumber({ PRODUCTION_STATUS_ISSUE_NUMBER: '  ' }), {
  configured: false,
  reason: 'PRODUCTION_STATUS_ISSUE_NUMBER is not configured',
});
assert.throws(() => resolveStatusIssueNumber({ PRODUCTION_STATUS_ISSUE_NUMBER: 'abc' }), /positive issue number/);
assert.throws(() => resolveStatusIssueNumber({ PRODUCTION_STATUS_ISSUE_NUMBER: '0' }), /positive issue number/);

(async () => {
  for (const value of [undefined, '']) {
    const adapters = createAdapters();
    const env = value === undefined
      ? baseEnv()
      : baseEnv({ PRODUCTION_STATUS_ISSUE_NUMBER: value });
    const result = await runProductionStatusSync({ env, adapters });
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, 'PRODUCTION_STATUS_ISSUE_NUMBER is not configured');
    assert.ok(!adapters.calls.some((call) => call.startsWith('github:')), 'unconfigured status issue must not call GitHub');
    assert.ok(adapters.calls.some((call) => call.includes('status: `skipped`')));
  }

  for (const invalidValue of ['abc', '-1', '0']) {
    await assert.rejects(
      () => runProductionStatusSync({
        env: baseEnv({ PRODUCTION_STATUS_ISSUE_NUMBER: invalidValue }),
        adapters: createAdapters(),
      }),
      /positive issue number/,
    );
  }

  await assert.rejects(
    () => runProductionStatusSync({
      env: baseEnv({ PRODUCTION_STATUS_ISSUE_NUMBER: '44' }),
      adapters: createAdapters({ issueMissing: true }),
    }),
    /404/,
  );
  await assert.rejects(
    () => runProductionStatusSync({
      env: baseEnv({ PRODUCTION_STATUS_ISSUE_NUMBER: '44' }),
      adapters: createAdapters({ isPullRequest: true }),
    }),
    /normal Issue/,
  );
  await assert.rejects(
    () => runProductionStatusSync({
      env: baseEnv({ PRODUCTION_STATUS_ISSUE_NUMBER: '44' }),
      adapters: createAdapters({ missingMarker: true }),
    }),
    /managed marker/,
  );
  await assert.rejects(
    () => runProductionStatusSync({
      env: baseEnv({ PRODUCTION_STATUS_ISSUE_NUMBER: '44' }),
      adapters: createAdapters({ badTitle: true }),
    }),
    /expected title/,
  );
  await assert.rejects(
    () => runProductionStatusSync({
      env: baseEnv({ PRODUCTION_STATUS_ISSUE_NUMBER: '44' }),
      adapters: createAdapters({ closed: true }),
    }),
    /must be open/,
  );

  console.log('production status bootstrap checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
