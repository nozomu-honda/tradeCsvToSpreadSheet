#!/usr/bin/env node
'use strict';

const assert = require('assert');

const {
  createInitialProductionDeployState,
  failProductionDeployState,
  markProductionDeployState,
} = require('./production-deploy-state');
const { renderProductionStatusIssue } = require('./production-status-renderer');
const {
  resolveStatusIssueNumber,
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
    lastSuccessfulDeploymentSha: currentSha,
    lastSuccessfulDeploymentAt: '2026-07-14T00:00:00.000Z',
    lastDeploymentWorkflowUrl: 'https://github.com/owner/repo/actions/runs/100',
    lastStatusSyncWorkflowUrl: 'https://github.com/owner/repo/actions/runs/99',
  }), 'deployed', {
    currentProductionSha: currentSha,
    lastSuccessfulDeploymentSha: currentSha,
    lastSuccessfulDeploymentAt: '2026-07-14T00:00:00.000Z',
    lastDeploymentWorkflowUrl: 'https://github.com/owner/repo/actions/runs/100',
  }));
}

function failedIssueBody() {
  const state = createInitialProductionDeployState({
    targetSha: shaA,
    latestDevelopSha: shaA,
    currentProductionSha: shaA,
    commitsBehindDevelop: '0 commits',
    status: 'failed',
    lastSuccessfulDeploymentSha: shaA,
    lastSuccessfulDeploymentAt: '2026-07-13T00:00:00.000Z',
    lastDeploymentWorkflowUrl: 'https://github.com/owner/repo/actions/runs/90',
    lastStatusSyncWorkflowUrl: 'https://github.com/owner/repo/actions/runs/91',
  });
  state.sourcePush = 'success';
  state.deploymentUpdate = 'failed';
  state.smokeTest = 'not-started';
  state.lastFailureStage = 'deployment-update';
  state.failureMessage = 'safe failure';
  return bodyFor(state);
}

function smokeFailedIssueBody() {
  const state = markProductionDeployState(
    markProductionDeployState(createInitialProductionDeployState({
      targetSha: shaA,
      latestDevelopSha: shaA,
      currentProductionSha: shaC,
      previousProductionSha: shaC,
      lastSuccessfulDeploymentSha: shaC,
      lastSuccessfulDeploymentAt: '2026-07-13T00:00:00.000Z',
    }), 'source-pushed'),
    'deployment-updated',
  );
  return bodyFor(failProductionDeployState(state, 'smoke-test', new Error('smoke failed')));
}

function createAdapters(options = {}) {
  const calls = [];
  const state = {
    patchedBody: '',
    getIssueCount: 0,
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
        const bodies = options.bodies || [options.body || deployedIssueBody({ currentSha: shaA, latestSha: shaA })];
        const body = bodies[Math.min(state.getIssueCount, bodies.length - 1)];
        state.getIssueCount += 1;
        return issueWithBody(body, options.issueOverrides);
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
  parsed: {
    currentProductionSha: shaA,
    productionStatus: 'deployed',
    sourcePush: 'success',
    remoteSourceVerification: 'success',
    deploymentUpdate: 'success',
    deploymentVerification: 'success',
    webAccessGateVerification: 'success',
    smokeTest: 'success',
  },
  latestDevelopSha: shaA,
}), 'deployed');
assert.strictEqual(resolveNextStatus({
  parsed: {
    currentProductionSha: shaA,
    productionStatus: 'deployed',
    sourcePush: 'success',
    deploymentUpdate: 'success',
    smokeTest: 'success',
  },
  latestDevelopSha: shaA,
}), 'unknown', 'legacy success fields alone must not certify the runtime boundary');
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
    assert.ok(adapters.state.patchedBody.includes('- 最新develop反映: `deployed`'));
    assert.ok(adapters.state.patchedBody.includes('- 最終成功deployment日時: `2026-07-14T00:00:00.000Z`'));
    assert.ok(adapters.state.patchedBody.includes('- 最終本番反映workflow: https://github.com/owner/repo/actions/runs/100'));
    assert.ok(adapters.state.patchedBody.includes('- 最終status同期workflow: https://github.com/owner/repo/actions/runs/123'));
  }

  {
    const adapters = createAdapters({ latestDevelopSha: shaB, commitCount: 1 });
    const result = await runProductionStatusSync({ env: baseEnv(), adapters });
    assert.strictEqual(result.status, 'not-deployed');
    assert.ok(adapters.state.patchedBody.includes('- 状態: `not-deployed`'));
    assert.ok(adapters.state.patchedBody.includes(`- 本番commit: \`${shaA}\``));
    assert.ok(adapters.state.patchedBody.includes(`- 最新develop: \`${shaB}\``));
    assert.ok(adapters.state.patchedBody.includes('- developとの差分: `1 commits`'));
    assert.ok(adapters.state.patchedBody.includes('- 最新develop反映: `pending`'));
    assert.ok(adapters.state.patchedBody.includes('- 最終本番反映 source push: `success`'));
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
    assert.ok(adapters.state.patchedBody.includes('- 最新develop反映: `failed`'));
    assert.ok(adapters.state.patchedBody.includes('- 最終本番反映workflow: https://github.com/owner/repo/actions/runs/90'));
  }

  {
    const adapters = createAdapters({ latestDevelopSha: shaA, body: smokeFailedIssueBody(), commitCount: 0 });
    const result = await runProductionStatusSync({ env: baseEnv(), adapters });
    assert.strictEqual(result.status, 'failed');
    assert.ok(adapters.state.patchedBody.includes(`- 本番commit: \`${shaA}\``));
    assert.ok(adapters.state.patchedBody.includes('- 最終本番反映 source push: `success`'));
    assert.ok(adapters.state.patchedBody.includes('- 最終本番反映 deployment update: `success`'));
    assert.ok(adapters.state.patchedBody.includes('- 最終本番反映 smoke test: `failed`'));
    assert.ok(adapters.state.patchedBody.includes(`- 最終成功本番反映commit: \`${shaC}\``));
    assert.ok(adapters.state.patchedBody.includes('- 最終失敗ステージ: `smoke-test`'));
  }

  for (const inProgressStatus of ['preflight', 'source-pushed', 'deployment-updated', 'verifying']) {
    const inProgressBody = bodyFor(createInitialProductionDeployState({
      targetSha: shaB,
      latestDevelopSha: shaB,
      currentProductionSha: shaA,
      status: inProgressStatus,
    }));
    const adapters = createAdapters({ body: inProgressBody });
    const result = await runProductionStatusSync({ env: baseEnv(), adapters });
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, 'deploy-in-progress');
    assert.ok(!adapters.calls.some((call) => call.startsWith('github:PATCH')), `${inProgressStatus} deploy must not be overwritten`);
  }

  {
    const adapters = createAdapters({
      bodies: [
        deployedIssueBody({ currentSha: shaA, latestSha: shaA }),
        bodyFor(createInitialProductionDeployState({
          targetSha: shaB,
          latestDevelopSha: shaB,
          currentProductionSha: shaA,
          status: 'verifying',
        })),
      ],
    });
    const result = await runProductionStatusSync({ env: baseEnv(), adapters });
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, 'deploy-in-progress');
    assert.ok(!adapters.calls.some((call) => call.startsWith('github:PATCH')), 'second read in-progress state must not be overwritten');
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
  assert.deepStrictEqual(
    resolveStatusIssueNumber({}),
    {
      configured: false,
      reason: 'PRODUCTION_STATUS_ISSUE_NUMBER is not configured',
    },
  );
  assert.throws(
    () => resolveStatusIssueNumber({ PRODUCTION_STATUS_ISSUE_NUMBER: 'abc' }),
    /positive issue number/,
  );
  assert.throws(
    () => resolveStatusIssueNumber({ PRODUCTION_STATUS_ISSUE_NUMBER: '0' }),
    /positive issue number/,
  );

  {
    const adapters = createAdapters();
    const result = await runProductionStatusSync({
      env: { ...baseEnv(), PRODUCTION_STATUS_ISSUE_NUMBER: '' },
      adapters,
    });
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, 'PRODUCTION_STATUS_ISSUE_NUMBER is not configured');
    assert.ok(!adapters.calls.some((call) => call.startsWith('github:GET')), 'unconfigured status issue must not call GitHub');
  }

  console.log('production status sync checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
