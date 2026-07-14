#!/usr/bin/env node
'use strict';

const assert = require('assert');

const { createInitialProductionDeployState, markProductionDeployState } = require('./production-deploy-state');
const { renderProductionStatusIssue } = require('./production-status-renderer');
const {
  resolveNextStatus,
  runProductionStatusSync,
} = require('./production-status-sync');

const shaA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const shaB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const shaC = 'cccccccccccccccccccccccccccccccccccccccc';

function bodyFor(state) {
  return renderProductionStatusIssue(state);
}

function baseEnv() {
  return {
    GITHUB_TOKEN: 'token',
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_RUN_ID: '123',
    PRODUCTION_STATUS_ISSUE_NUMBER: '44',
  };
}

function issueWithBody(body, overrides = {}) {
  return {
    number: 44,
    title: '本番反映ステータス',
    state: 'open',
    body,
    ...overrides,
  };
}

function deployedIssueBody({ currentSha = shaA, latestSha = shaA } = {}) {
  return bodyFor(markProductionDeployState(createInitialProductionDeployState({
    targetSha: currentSha,
    latestDevelopSha: latestSha,
    currentProductionSha: currentSha,
    previousProductionSha: currentSha,
    commitsBehindDevelop: currentSha === latestSha ? '0 commits' : '1 commits',
    lastSuccessfulDeploymentAt: '2026-07-14T00:00:00.000Z',
  }), 'deployed', {
    currentProductionSha: currentSha,
    lastSuccessfulDeploymentAt: '2026-07-14T00:00:00.000Z',
  }));
}

function failedIssueBody() {
  const state = createInitialProductionDeployState({
    targetSha: shaA,
    latestDevelopSha: shaA,
    currentProductionSha: shaA,
    commitsBehindDevelop: '0 commits',
    status: 'failed',
    lastSuccessfulDeploymentAt: '2026-07-13T00:00:00.000Z',
  });
  state.sourcePush = 'success';
  state.deploymentUpdate = 'failed';
  state.smokeTest = 'not-started';
  state.lastFailureStage = 'deployment-update';
  state.failureMessage = 'safe failure';
  return bodyFor(state);
}

function createAdapters(options = {}) {
  const calls = [];
  const state = {
    patchedBody: '',
  };
  const adapters = {
    calls,
    state,
    fetchDevelop() {
      calls.push('fetch-develop');
    },
    getHeadSha() {
      return options.latestDevelopSha || shaB;
    },
    isAncestor(ancestor, descendant) {
      calls.push(`is-ancestor:${ancestor}:${descendant}`);
      return options.isAncestor !== false;
    },
    commitCount(range) {
      calls.push(`commit-count:${range}`);
      return options.commitCount === undefined ? 1 : options.commitCount;
    },
    async githubRequest(method, apiPath, body) {
      calls.push(`github:${method}:${apiPath}`);
      if (method === 'GET' && apiPath === '/repos/owner/repo/issues/44') {
        return issueWithBody(options.body || deployedIssueBody({ currentSha: shaA, latestSha: shaA }), options.issueOverrides);
      }
      if (method === 'PATCH' && apiPath === '/repos/owner/repo/issues/44') {
        state.patchedBody = body.body;
        if (options.failPatch) {
          throw new Error('status issue update failed');
        }
        return {};
      }
      throw new Error(`unexpected GitHub call: ${method} ${apiPath}`);
    },
    writeStepSummary(markdown) {
      calls.push(`summary:${markdown.split('\n')[0]}`);
    },
    runProductionSourcePush() {
      throw new Error('status sync must not push production source');
    },
    updateAppsScriptDeployment() {
      throw new Error('status sync must not update deployments');
    },
  };
  return adapters;
}

assert.strictEqual(resolveNextStatus({
  parsed: { currentProductionSha: shaA, productionStatus: 'deployed', smokeTest: 'success' },
  latestDevelopSha: shaA,
}), 'deployed');
assert.strictEqual(resolveNextStatus({
  parsed: { currentProductionSha: shaA, productionStatus: 'deployed', smokeTest: 'success' },
  latestDevelopSha: shaB,
}), 'not-deployed');
assert.strictEqual(resolveNextStatus({
  parsed: { currentProductionSha: shaA, productionStatus: 'failed', smokeTest: 'failed' },
  latestDevelopSha: shaB,
}), 'failed');
assert.strictEqual(resolveNextStatus({
  parsed: { currentProductionSha: 'unknown', productionStatus: 'unknown', smokeTest: 'not-started' },
  latestDevelopSha: shaB,
}), 'unknown');

(async () => {
  {
    const adapters = createAdapters({ latestDevelopSha: shaA, commitCount: 0 });
    const result = await runProductionStatusSync({ env: baseEnv(), adapters });
    assert.strictEqual(result.status, 'deployed');
    assert.ok(adapters.state.patchedBody.includes('- 状態: `deployed`'));
    assert.ok(adapters.state.patchedBody.includes('- developとの差分: `0 commits`'));
    assert.ok(adapters.state.patchedBody.includes('- 最終成功deployment日時: `2026-07-14T00:00:00.000Z`'));
  }

  {
    const adapters = createAdapters({ latestDevelopSha: shaB, commitCount: 1 });
    const result = await runProductionStatusSync({ env: baseEnv(), adapters });
    assert.strictEqual(result.status, 'not-deployed');
    assert.ok(adapters.state.patchedBody.includes('- 状態: `not-deployed`'));
    assert.ok(adapters.state.patchedBody.includes(`- 本番commit: \`${shaA}\``));
    assert.ok(adapters.state.patchedBody.includes(`- 最新develop: \`${shaB}\``));
    assert.ok(adapters.state.patchedBody.includes('- developとの差分: `1 commits`'));
  }

  {
    const adapters = createAdapters({
      latestDevelopSha: shaC,
      body: deployedIssueBody({ currentSha: shaA, latestSha: shaA }),
      commitCount: 3,
    });
    const result = await runProductionStatusSync({ env: baseEnv(), adapters });
    assert.strictEqual(result.commitsBehindDevelop, '3 commits');
    assert.ok(adapters.state.patchedBody.includes('- developとの差分: `3 commits`'));
  }

  {
    const adapters = createAdapters({ latestDevelopSha: shaB, isAncestor: false });
    const result = await runProductionStatusSync({ env: baseEnv(), adapters });
    assert.strictEqual(result.commitsBehindDevelop, 'unknown-diverged');
  }

  {
    const adapters = createAdapters({ latestDevelopSha: shaB, body: failedIssueBody() });
    const result = await runProductionStatusSync({ env: baseEnv(), adapters });
    assert.strictEqual(result.status, 'failed');
    assert.ok(adapters.state.patchedBody.includes('- 最終失敗ステージ: `deployment-update`'));
    assert.ok(adapters.state.patchedBody.includes('- 失敗内容: `safe failure`'));
  }

  {
    const adapters = createAdapters({
      body: '# 本番反映ステータス\n\n- 状態: `deployed`',
    });
    await assert.rejects(
      () => runProductionStatusSync({ env: baseEnv(), adapters }),
      /managed marker/,
    );
    assert.ok(!adapters.calls.some((call) => call.startsWith('github:PATCH')), 'marker failure must not update issue');
  }

  {
    const adapters = createAdapters({
      issueOverrides: { pull_request: { url: 'https://api.example/pulls/1' } },
    });
    await assert.rejects(
      () => runProductionStatusSync({ env: baseEnv(), adapters }),
      /normal Issue/,
    );
  }

  {
    const adapters = createAdapters({ failPatch: true });
    await assert.rejects(
      () => runProductionStatusSync({ env: baseEnv(), adapters }),
      /status issue update failed/,
    );
  }

  assert.throws(
    () => require('./production-status-sync').requireStatusSyncConfig({}),
    /Missing required production status sync configuration/,
  );

  console.log('production status sync checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
