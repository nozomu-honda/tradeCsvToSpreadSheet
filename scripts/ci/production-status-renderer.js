'use strict';

const { shortSha } = require('./production-deploy-state');

function formatValue(value) {
  if (value === undefined || value === null || value === '') {
    return 'unknown';
  }
  return String(value);
}

function latestDevelopDeploymentStatus(state) {
  if (state.status === 'failed') {
    return 'failed';
  }
  const productionSha = formatValue(state.currentProductionSha);
  const latestDevelopSha = formatValue(state.latestDevelopSha);
  if (productionSha === 'unknown' || latestDevelopSha === 'unknown') {
    return 'unknown';
  }
  if (
    productionSha === latestDevelopSha
    && state.sourcePush === 'success'
    && state.deploymentUpdate === 'success'
    && state.smokeTest === 'success'
  ) {
    return 'deployed';
  }
  return 'pending';
}

function renderProductionStatusIssue(state) {
  const status = formatValue(state.status);
  const productionSha = formatValue(state.currentProductionSha);
  const targetSha = formatValue(state.targetSha);
  const latestDevelopSha = formatValue(state.latestDevelopSha);
  const previousProductionSha = formatValue(state.previousProductionSha);
  const commitsBehindDevelop = formatValue(state.commitsBehindDevelop);
  const workflowRunUrl = formatValue(state.workflowRunUrl);
  const dryRun = state.dryRun ? 'true' : 'false';
  const force = state.force ? 'true' : 'false';
  const updatedAt = formatValue(state.updatedAt);
  const lastFailureStage = formatValue(state.lastFailureStage || 'none');
  const failureMessage = formatValue(state.failureMessage || 'none');
  const developAdvancedAfterSourcePush = state.developAdvancedAfterSourcePush ? 'true' : 'false';
  const lastSuccessfulDeploymentSha = formatValue(state.lastSuccessfulDeploymentSha || 'unknown');
  const lastSuccessfulDeploymentAt = formatValue(state.lastSuccessfulDeploymentAt || 'unknown');
  const lastDeploymentWorkflowUrl = formatValue(state.lastDeploymentWorkflowUrl || 'unknown');
  const lastStatusSyncWorkflowUrl = formatValue(state.lastStatusSyncWorkflowUrl || 'unknown');
  const latestDevelopStatus = latestDevelopDeploymentStatus(state);

  return [
    '# 本番反映ステータス',
    '',
    'このIssueは、GitHub Actionsによる本番反映の状態を機械的に追跡するための固定Issueです。',
    'Secret、Script ID、Deployment ID、Web App URL、Spreadsheet IDなどの実値は記載しません。',
    '',
    '## 現在の状態',
    '',
    `- 状態: \`${status}\``,
    `- 本番commit: \`${productionSha}\``,
    `- 本番commit短縮: \`${shortSha(productionSha)}\``,
    `- 反映対象commit: \`${targetSha}\``,
    `- 反映対象commit短縮: \`${shortSha(targetSha)}\``,
    `- 最新develop: \`${latestDevelopSha}\``,
    `- 最新develop短縮: \`${shortSha(latestDevelopSha)}\``,
    `- 前回本番commit: \`${previousProductionSha}\``,
    `- developとの差分: \`${commitsBehindDevelop}\``,
    `- 最新develop反映: \`${latestDevelopStatus}\``,
    `- 最終本番反映 source push: \`${formatValue(state.sourcePush)}\``,
    `- 最終本番反映 deployment update: \`${formatValue(state.deploymentUpdate)}\``,
    `- 最終本番反映 smoke test: \`${formatValue(state.smokeTest)}\``,
    `- 最終成功本番反映commit: \`${lastSuccessfulDeploymentSha}\``,
    `- 最終成功本番反映commit短縮: \`${shortSha(lastSuccessfulDeploymentSha)}\``,
    `- 最終成功deployment日時: \`${lastSuccessfulDeploymentAt}\``,
    `- dry_run: \`${dryRun}\``,
    `- force: \`${force}\``,
    `- source push後にdevelop進行: \`${developAdvancedAfterSourcePush}\``,
    `- 最終失敗ステージ: \`${lastFailureStage}\``,
    `- 失敗内容: \`${failureMessage}\``,
    `- 更新日時: \`${updatedAt}\``,
    `- 最終本番反映workflow: ${lastDeploymentWorkflowUrl === 'unknown' ? 'unknown' : lastDeploymentWorkflowUrl}`,
    `- 最終status同期workflow: ${lastStatusSyncWorkflowUrl === 'unknown' ? 'unknown' : lastStatusSyncWorkflowUrl}`,
    `- 現在のworkflow run: ${workflowRunUrl === 'unknown' ? 'unknown' : workflowRunUrl}`,
    '',
    '## 状態の意味',
    '',
    '- `unknown`: 本番状態をまだ特定していない。',
    '- `not-deployed`: 最新developが現在の本番commitへまだ反映されていない。前回本番反映が成功していても、最新develop未反映ならこの状態。',
    '- `preflight`: 事前確認中。',
    '- `source-pushed`: Apps Scriptソースpush済み。',
    '- `deployment-updated`: 既存Webアプリdeployment更新済み。',
    '- `verifying`: smoke確認中。',
    '- `deployed`: 本番commitが最新developと一致し、source push / deployment update / smoke testがすべて成功済み。',
    '- `failed`: いずれかの段階で失敗。',
    '',
    '<!-- production-status:managed-by-github-actions -->',
  ].join('\n');
}

function renderDryRunSummary(state) {
  return [
    '## Production deploy dry-run summary',
    '',
    `- target_sha: \`${formatValue(state.targetSha)}\``,
    `- latest develop: \`${formatValue(state.latestDevelopSha)}\``,
    `- previous production: \`${formatValue(state.previousProductionSha)}\``,
    `- duplicate guard: \`${formatValue(state.duplicateGuard || 'passed')}\``,
    `- source push: \`${state.dryRun ? 'skipped by dry_run' : formatValue(state.sourcePush)}\``,
    `- deployment update: \`${state.dryRun ? 'skipped by dry_run' : formatValue(state.deploymentUpdate)}\``,
    `- status issue update: \`${state.dryRun ? 'skipped by dry_run' : 'enabled'}\``,
    '',
    'dry-runでは本番Apps Scriptへのpush、Webアプリdeployment更新、Production Status Issue更新は行いません。',
  ].join('\n');
}

module.exports = {
  renderDryRunSummary,
  renderProductionStatusIssue,
};
