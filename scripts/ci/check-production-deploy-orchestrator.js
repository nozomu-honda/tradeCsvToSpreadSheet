#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runProductionDeploy } = require('./production-deploy-orchestrator');

const targetSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const prHeadSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const previousSha = 'cccccccccccccccccccccccccccccccccccccccc';
const validStatusOutput = JSON.stringify({
  filesToPush: [
    'appsscript.json',
    'Index.html',
    'src/app/import.gs',
    'src/app/e2e_runtime_support.gs',
  ],
  untrackedFiles: [
    'src/app/e2e_helpers.gs',
    'src/test/test_runner.gs',
  ],
});

function baseEnv(overrides = {}) {
  return {
    GITHUB_TOKEN: 'token',
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_RUN_ID: '1',
    TARGET_SHA: targetSha,
    DRY_RUN: 'true',
    DRY_RUN_MODE: 'static',
    FORCE: 'false',
    PRODUCTION_SCRIPT_ID: 'script_id_for_test_only',
    PRODUCTION_DEPLOYMENT_ID: 'deployment_id_for_test_only',
    PRODUCTION_WEB_APP_URL: 'https://script.google.com/macros/s/test/exec',
    PRODUCTION_STATUS_ISSUE_NUMBER: '123',
    CLASP_PRODUCTION_CREDENTIALS: JSON.stringify({
      tokens: {
        production: {
          type: 'authorized_user',
          client_id: 'client',
          client_secret: 'secret',
          refresh_token: 'refresh',
        },
      },
    }),
    ...overrides,
  };
}

function createAdapters(options = {}) {
  const calls = [];
  const state = {
    fetchCount: 0,
    sourcePushCount: 0,
    cleanupCount: 0,
    envFailureCount: 0,
    issuePatchBodies: [],
    stepSummaries: [],
    originalStatusIssueBody: '',
    statusIssueBody: '',
  };
  const adapters = {
    validationScripts: [
      'test:gas-production-wrapper',
      'test:production-e2e-boundary',
      'test:production-deploy-workflow',
      'test:production-status-renderer',
      'test:production-deploy-state',
      'test:production-deploy-orchestrator',
      'test:production-status-parser',
      'test:production-smoke-test',
      'test:production-deploy-control',
      'test:production-status-sync',
      'test:production-required-checks',
      'test:production-state-concurrency',
      'test:production-status-bootstrap',
    ],
    addMasksFromEnv() {
      calls.push('mask');
    },
    log(message) {
      calls.push(`log:${message}`);
    },
    warn(message) {
      calls.push(`warn:${message}`);
    },
    writeStepSummary(markdown) {
      state.stepSummaries.push(markdown);
      calls.push(`summary:${markdown.split('\n')[0]}`);
    },
    fetchDevelop() {
      state.fetchCount += 1;
      calls.push('git-fetch');
    },
    getHeadSha() {
      return targetSha;
    },
    getOriginDevelopSha() {
      if (options.developAdvancesBeforePush && state.fetchCount > 1) {
        return 'dddddddddddddddddddddddddddddddddddddddd';
      }
      if (options.developAdvancesAfterSourcePush && state.sourcePushCount > 0) {
        return options.latestDevelopShaAfterSourcePush || 'dddddddddddddddddddddddddddddddddddddddd';
      }
      return targetSha;
    },
    isAncestor() {
      return options.developDivergesAfterSourcePush ? false : true;
    },
    commitCount() {
      return options.commitsBehindAfterSourcePush === undefined ? 1 : options.commitsBehindAfterSourcePush;
    },
    runNpmCi() {
      calls.push('npm-ci');
      if (options.failNpmCi) {
        throw new Error('npm ci failed');
      }
    },
    runValidationScript(script) {
      calls.push(`npm:${script}`);
      if (options.failValidationScript === true || options.failValidationScript === script) {
        throw new Error(`validation failed: ${script}`);
      }
    },
    writeProductionClaspFiles() {
      calls.push('write-clasp');
      return { rcPath: 'fake-rc', projectPath: 'fake-project' };
    },
    cleanupProductionClaspFiles() {
      state.cleanupCount += 1;
      calls.push('cleanup');
    },
    runProductionStatusCheck() {
      calls.push('production-status');
      return options.badStatusOutput || validStatusOutput;
    },
    runProductionSourcePush() {
      calls.push('source-push');
      state.sourcePushCount += 1;
      if (options.failSourcePush) {
        throw new Error('source push failed');
      }
    },
    updateAppsScriptDeployment() {
      calls.push('deployment-update');
      if (options.failDeploymentUpdate) {
        throw new Error('deployment update failed');
      }
    },
    async runSmokeTest() {
      calls.push('smoke-test');
      if (options.failSmokeTest) {
        throw new Error('smoke failed');
      }
    },
    async recordEnvironmentFailure() {
      state.envFailureCount += 1;
      calls.push('environment-failure');
      if (options.failEnvironmentFailure) {
        throw new Error('environment failure update failed');
      }
    },
    async githubRequest(method, apiPath, body) {
      calls.push(`github:${method}:${apiPath}`);
      if (apiPath === '/repos/owner/repo/pulls/10') {
        return {
          number: 10,
          merged_at: '2026-07-14T00:00:00Z',
          merge_commit_sha: targetSha,
          head: { sha: prHeadSha },
        };
      }
      if (apiPath.includes('/pulls?')) {
        return [{
          number: 10,
          merged_at: '2026-07-14T00:00:00Z',
          merge_commit_sha: targetSha,
          head: { sha: prHeadSha },
        }];
      }
      if (apiPath === `/repos/owner/repo/commits/${prHeadSha}/check-runs?per_page=100`) {
        return {
          check_runs: options.requiredCheckFails ? [] : [{
            name: 'Push test GAS project and run tests',
            status: 'completed',
            conclusion: 'success',
          }],
        };
      }
      if (apiPath === `/repos/owner/repo/commits/${prHeadSha}/status`) {
        return { statuses: [] };
      }
      if (apiPath === '/repos/owner/repo/issues/123' && method === 'GET') {
        if (options.statusIssueReadFails) {
          throw new Error('status issue read failed');
        }
        const currentProductionSha = options.duplicateDeployed ? targetSha : previousSha;
        const lastSuccessfulDeploymentSha = options.duplicateDeployed ? targetSha : previousSha;
        const issueBody = options.statusIssueMissingMarker
          ? '# unrelated'
          : [
            '# 本番反映ステータス',
            '',
            '- 状態: `deployed`',
            `- 本番commit: \`${currentProductionSha}\``,
            `- 最新develop: \`${targetSha}\``,
            '- developとの差分: `1 commits`',
            '- 最終本番反映 source push: `success`',
            '- 最終本番反映 deployment update: `success`',
            '- 最終本番反映 smoke test: `success`',
            `- 最終成功本番反映commit: \`${lastSuccessfulDeploymentSha}\``,
            '- 最終成功deployment日時: `2026-07-13T00:00:00.000Z`',
            '- 最終本番反映workflow: https://github.com/owner/repo/actions/runs/999',
            '- 最終status同期workflow: https://github.com/owner/repo/actions/runs/888',
            '<!-- production-status:managed-by-github-actions -->',
          ].join('\n');
        if (!state.originalStatusIssueBody) {
          state.originalStatusIssueBody = issueBody;
        }
        state.statusIssueBody = issueBody;
        return {
          title: '本番反映ステータス',
          state: 'open',
          body: issueBody,
        };
      }
      if (apiPath === '/repos/owner/repo/issues/123' && method === 'PATCH') {
        calls.push('status-issue-update');
        state.issuePatchBodies.push(body.body);
        state.statusIssueBody = body.body;
        if (options.failStatusIssueUpdate) {
          throw new Error('status issue update failed');
        }
        return {};
      }
      throw new Error(`unexpected GitHub call: ${method} ${apiPath}`);
    },
  };
  adapters.calls = calls;
  adapters.state = state;
  return adapters;
}

function assertPreservedProductionInfo(body, {
  currentSha = previousSha,
  lastSuccessfulSha = currentSha,
  lastFailureStage,
} = {}) {
  assert.ok(body.includes(`- 本番commit: \`${currentSha}\``), 'current production SHA should be preserved');
  assert.ok(!body.includes('- 本番commit: `unknown`'), 'current production SHA must not become unknown');
  assert.ok(body.includes(`- 最終成功本番反映commit: \`${lastSuccessfulSha}\``), 'last successful deployment SHA should be preserved');
  assert.ok(!body.includes('- 最終成功本番反映commit: `unknown`'), 'last successful deployment SHA must not become unknown');
  assert.ok(body.includes('- 最終成功deployment日時: `2026-07-13T00:00:00.000Z`'), 'last successful deployment timestamp should be preserved');
  assert.ok(body.includes('- 最終本番反映workflow: https://github.com/owner/repo/actions/runs/999'), 'last deployment workflow URL should be preserved');
  assert.ok(body.includes('- 最終status同期workflow: https://github.com/owner/repo/actions/runs/888'), 'last status sync workflow URL should be preserved');
  assert.ok(body.includes('- 最終本番反映 source push: `success`'), 'last source push result should be preserved');
  assert.ok(body.includes('- 最終本番反映 deployment update: `success`'), 'last deployment update result should be preserved');
  assert.ok(body.includes('- 最終本番反映 smoke test: `success`'), 'last smoke test result should be preserved');
  if (lastFailureStage) {
    assert.ok(body.includes(`- 最終失敗ステージ: \`${lastFailureStage}\``), `failure stage should be ${lastFailureStage}`);
  }
}

async function assertRejectsWith(fn, pattern) {
  await assert.rejects(fn, pattern);
}

(async () => {
  {
    const adapters = createAdapters();
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ TARGET_SHA: '' }),
      adapters,
    }), /TARGET_SHA must be provided/);
    assert.ok(!adapters.calls.includes('npm-ci'));
  }

  {
    const adapters = createAdapters();
    await runProductionDeploy({
      env: baseEnv({ SOURCE_PR_NUMBER: '10' }),
      adapters,
    });
    assert.ok(!adapters.calls.includes('write-clasp'), 'static dry-run must not write clasp config');
    assert.ok(!adapters.calls.includes('source-push'), 'static dry-run must not push');
    assert.ok(!adapters.calls.includes('deployment-update'), 'static dry-run must not deploy');
    assert.ok(!adapters.calls.includes('smoke-test'), 'static dry-run must not smoke test');
    assert.ok(!adapters.calls.includes('status-issue-update'), 'static dry-run must not update status issue');
    assert.ok(!adapters.calls.some((call) => call.includes('/issues/123')), 'static dry-run must not read the status issue');
    assert.strictEqual(adapters.state.cleanupCount, 1, 'cleanup should always run');
  }

  {
    const adapters = createAdapters();
    await runProductionDeploy({
      env: baseEnv({ DRY_RUN_MODE: 'authenticated', SOURCE_PR_NUMBER: '10' }),
      adapters,
    });
    assert.ok(adapters.calls.indexOf('github:GET:/repos/owner/repo/issues/123') < adapters.calls.indexOf('github:GET:/repos/owner/repo/pulls/10'));
    assert.ok(adapters.calls.includes('write-clasp'));
    assert.ok(adapters.calls.includes('production-status'));
    assert.ok(!adapters.calls.includes('source-push'));
    assert.ok(!adapters.calls.includes('deployment-update'));
    assert.ok(!adapters.calls.includes('status-issue-update'));
  }

  {
    const adapters = createAdapters();
    await runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    });
    assert.ok(adapters.calls.indexOf('source-push') < adapters.calls.indexOf('deployment-update'));
    assert.ok(adapters.calls.indexOf('deployment-update') < adapters.calls.indexOf('smoke-test'));
    assert.ok(!adapters.calls.some((call) => call.includes('/deployments')), 'orchestrator must not create GitHub Deployments');
    assert.ok(adapters.state.issuePatchBodies.some((body) => body.includes('- 状態: `deployed`')));
    assert.ok(adapters.state.issuePatchBodies.some((body) => body.includes('- developとの差分: `0 commits`')));
    assert.ok(adapters.state.issuePatchBodies.some((body) => body.includes('- 最終本番反映workflow: https://github.com/owner/repo/actions/runs/1')));
  }

  {
    const adapters = createAdapters({ failSourcePush: true });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /source push failed/);
    assert.ok(!adapters.calls.includes('deployment-update'));
    assert.ok(!adapters.calls.includes('smoke-test'));
    assert.ok(adapters.state.issuePatchBodies.some((body) => body.includes('- 最終本番反映 source push: `failed`')));
  }

  {
    const adapters = createAdapters({ failDeploymentUpdate: true });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /deployment update failed/);
    assert.ok(!adapters.calls.includes('smoke-test'));
    assert.ok(adapters.state.issuePatchBodies.some((body) => body.includes('- 最終本番反映 deployment update: `failed`')));
  }

  {
    const adapters = createAdapters({ failSmokeTest: true });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /smoke failed/);
    assert.ok(adapters.state.issuePatchBodies.some((body) => body.includes('- 最終本番反映 smoke test: `failed`')));
    assert.ok(!adapters.state.issuePatchBodies.some((body) => body.includes('- 状態: `not-deployed`')), 'smoke failure must remain failed, not not-deployed');
  }

  {
    const adapters = createAdapters({ developAdvancesBeforePush: true });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /develop advanced/);
    assert.ok(!adapters.calls.includes('source-push'));
  }

  {
    const adapters = createAdapters({ developAdvancesAfterSourcePush: true, commitsBehindAfterSourcePush: 1 });
    await runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    });
    assert.ok(adapters.calls.includes('source-push'));
    assert.ok(adapters.calls.includes('deployment-update'));
    assert.ok(adapters.calls.includes('smoke-test'));
    const finalBody = adapters.state.issuePatchBodies.at(-1);
    assert.ok(finalBody.includes('- 状態: `not-deployed`'));
    assert.ok(finalBody.includes(`- 本番commit: \`${targetSha}\``));
    assert.ok(finalBody.includes('- developとの差分: `1 commits`'));
    assert.ok(finalBody.includes('- source push後にdevelop進行: `true`'));
    assert.ok(finalBody.includes('- 最新develop反映: `pending`'));
    assert.ok(finalBody.includes('- 最終本番反映 source push: `success`'));
    assert.ok(finalBody.includes('- 最終本番反映 deployment update: `success`'));
    assert.ok(finalBody.includes('- 最終本番反映 smoke test: `success`'));
  }

  {
    const adapters = createAdapters({ developAdvancesAfterSourcePush: true, commitsBehindAfterSourcePush: 3 });
    await runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    });
    assert.ok(adapters.state.issuePatchBodies.at(-1).includes('- developとの差分: `3 commits`'));
  }

  {
    const adapters = createAdapters({ developAdvancesAfterSourcePush: true, developDivergesAfterSourcePush: true });
    await runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    });
    assert.ok(adapters.state.issuePatchBodies.at(-1).includes('- developとの差分: `unknown-diverged`'));
  }

  {
    const adapters = createAdapters({ requiredCheckFails: true });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /Required checks/);
    assert.ok(!adapters.calls.includes('write-clasp'));
    assert.ok(!adapters.calls.some((call) => call.includes('/issues/123')), 'static dry-run required check failure must not read the status issue');
  }

  {
    const adapters = createAdapters({ requiredCheckFails: true });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /Required checks/);
    assert.ok(!adapters.calls.includes('write-clasp'));
    assert.ok(!adapters.calls.includes('npm-ci'));
    assert.ok(!adapters.calls.includes('source-push'));
    assert.ok(!adapters.calls.includes('deployment-update'));
    assert.ok(!adapters.calls.includes('smoke-test'));
    const finalBody = adapters.state.issuePatchBodies.at(-1);
    assert.ok(finalBody.includes('- 状態: `failed`'));
    assertPreservedProductionInfo(finalBody, { lastFailureStage: 'required-checks' });
  }

  {
    const adapters = createAdapters({ failNpmCi: true });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /npm ci failed/);
    assert.ok(!adapters.calls.includes('write-clasp'));
    assert.ok(!adapters.calls.includes('source-push'));
    assert.ok(!adapters.calls.includes('deployment-update'));
    assert.ok(!adapters.calls.includes('smoke-test'));
    const finalBody = adapters.state.issuePatchBodies.at(-1);
    assertPreservedProductionInfo(finalBody, { lastFailureStage: 'local-validation' });
  }

  {
    const adapters = createAdapters({ failValidationScript: 'test:production-status-parser' });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /validation failed: test:production-status-parser/);
    assert.ok(!adapters.calls.includes('write-clasp'));
    assert.ok(!adapters.calls.includes('source-push'));
    assert.ok(!adapters.calls.includes('deployment-update'));
    assert.ok(!adapters.calls.includes('smoke-test'));
    const finalBody = adapters.state.issuePatchBodies.at(-1);
    assertPreservedProductionInfo(finalBody, { lastFailureStage: 'local-validation' });
  }

  {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'production-ignore-missing-'));
    try {
      fs.writeFileSync(path.join(tmpDir, '.clasp.productionignore'), 'src/test/**\n');
      const adapters = createAdapters();
      await assertRejectsWith(() => runProductionDeploy({
        env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
        adapters,
        cwd: tmpDir,
      }), /e2e_helpers/);
      assert.ok(!adapters.calls.includes('npm-ci'));
      assert.ok(!adapters.calls.includes('write-clasp'));
      assert.ok(!adapters.calls.includes('source-push'));
      const finalBody = adapters.state.issuePatchBodies.at(-1);
      assertPreservedProductionInfo(finalBody, { lastFailureStage: 'local-validation' });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  {
    const adapters = createAdapters({
      badStatusOutput: JSON.stringify({ filesToPush: ['src/app/e2e_helpers.gs'], untrackedFiles: [] }),
    });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ DRY_RUN_MODE: 'authenticated', SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /required tracked file|forbidden/);
  }

  {
    const adapters = createAdapters({ statusIssueMissingMarker: true });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ DRY_RUN_MODE: 'authenticated', SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /managed marker/);
  }

  {
    const adapters = createAdapters({ duplicateDeployed: true });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ DRY_RUN_MODE: 'authenticated', SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /already recorded as deployed/);
    assert.ok(!adapters.calls.includes('write-clasp'));
    assert.ok(!adapters.calls.includes('npm-ci'));
    assert.ok(!adapters.calls.includes('source-push'));
    assert.ok(!adapters.calls.includes('production-status'));
    assert.ok(!adapters.calls.includes('status-issue-update'));
    assert.ok(!adapters.calls.includes('environment-failure'));
    assert.strictEqual(adapters.state.issuePatchBodies.length, 0, 'duplicate rejection must not patch the status issue');
    assert.strictEqual(adapters.state.envFailureCount, 0, 'duplicate rejection must not record environment failure');
    assert.strictEqual(adapters.state.statusIssueBody, adapters.state.originalStatusIssueBody, 'duplicate rejection must leave the existing status issue body unchanged');
    assert.ok(adapters.state.statusIssueBody.includes('- 状態: `deployed`'));
    assert.ok(adapters.state.statusIssueBody.includes(`- 本番commit: \`${targetSha}\``));
    assert.ok(adapters.state.statusIssueBody.includes('- 最終本番反映 source push: `success`'));
    assert.ok(adapters.state.stepSummaries.at(-1).includes('## Production deploy skipped'));
    assert.ok(adapters.state.stepSummaries.at(-1).includes('- reason: `already-deployed`'));
    assert.ok(adapters.state.stepSummaries.at(-1).includes(`- current production: \`${targetSha}\``));
  }

  {
    const adapters = createAdapters({ duplicateDeployed: true });
    await runProductionDeploy({
      env: baseEnv({ DRY_RUN_MODE: 'authenticated', FORCE: 'true', SOURCE_PR_NUMBER: '10' }),
      adapters,
    });
    assert.ok(adapters.calls.includes('production-status'));
  }

  {
    const adapters = createAdapters({ duplicateDeployed: true });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /already recorded as deployed/);
    assert.ok(!adapters.calls.includes('npm-ci'));
    assert.ok(!adapters.calls.includes('write-clasp'));
    assert.ok(!adapters.calls.includes('production-status'));
    assert.ok(!adapters.calls.includes('source-push'));
    assert.ok(!adapters.calls.includes('deployment-update'));
    assert.ok(!adapters.calls.includes('smoke-test'));
    assert.ok(!adapters.calls.includes('status-issue-update'));
    assert.ok(!adapters.calls.includes('environment-failure'));
    assert.strictEqual(adapters.state.issuePatchBodies.length, 0, 'duplicate rejection must not patch the status issue');
    assert.strictEqual(adapters.state.envFailureCount, 0, 'duplicate rejection must not record environment failure');
    assert.strictEqual(adapters.state.statusIssueBody, adapters.state.originalStatusIssueBody, 'duplicate rejection must leave the existing status issue body unchanged');
    assert.ok(adapters.state.statusIssueBody.includes('- 状態: `deployed`'));
    assert.ok(adapters.state.statusIssueBody.includes(`- 本番commit: \`${targetSha}\``));
    assert.ok(adapters.state.statusIssueBody.includes('- 最終本番反映 source push: `success`'));
    assert.ok(adapters.state.statusIssueBody.includes('- 最終本番反映 deployment update: `success`'));
    assert.ok(adapters.state.statusIssueBody.includes('- 最終本番反映 smoke test: `success`'));
    assert.ok(adapters.state.stepSummaries.at(-1).includes('## Production deploy skipped'));
    assert.ok(adapters.state.stepSummaries.at(-1).includes('- result: `rejected`'));
    assert.ok(adapters.state.stepSummaries.at(-1).includes('- reason: `already-deployed`'));
    assert.ok(adapters.state.stepSummaries.at(-1).includes(`- target_sha: \`${targetSha}\``));
    assert.ok(adapters.state.stepSummaries.at(-1).includes(`- current production: \`${targetSha}\``));
    assert.ok(adapters.state.stepSummaries.at(-1).includes('- force: `false`'));
  }

  {
    const adapters = createAdapters({ statusIssueReadFails: true });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /status issue read failed/);
    assert.strictEqual(adapters.state.issuePatchBodies.length, 0, 'status issue read failure must not patch any issue');
    assert.ok(!adapters.calls.includes('status-issue-update'));
    assert.ok(!adapters.calls.includes('npm-ci'));
    assert.ok(!adapters.calls.includes('write-clasp'));
    assert.ok(!adapters.calls.includes('source-push'));
    assert.ok(!adapters.calls.includes('deployment-update'));
    assert.ok(!adapters.calls.includes('smoke-test'));
    assert.strictEqual(adapters.state.cleanupCount, 1, 'cleanup should run even when status issue read fails');
  }

  {
    const adapters = createAdapters({ failStatusIssueUpdate: true, failEnvironmentFailure: false });
    await assertRejectsWith(() => runProductionDeploy({
      env: baseEnv({ DRY_RUN: 'false', SOURCE_PR_NUMBER: '10' }),
      adapters,
    }), /status issue update failed/);
    assert.ok(adapters.calls.includes('environment-failure'), 'environment failure recording should still be attempted');
  }

  console.log('production deploy orchestrator checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
