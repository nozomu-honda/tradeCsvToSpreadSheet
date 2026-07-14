'use strict';

const { shortSha } = require('./production-deploy-state');

function formatValue(value) {
  if (value === undefined || value === null || value === '') {
    return 'unknown';
  }
  return String(value);
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
    `- source push: \`${formatValue(state.sourcePush)}\``,
    `- deployment update: \`${formatValue(state.deploymentUpdate)}\``,
    `- smoke test: \`${formatValue(state.smokeTest)}\``,
    `- dry_run: \`${dryRun}\``,
    `- force: \`${force}\``,
    `- source push後にdevelop進行: \`${developAdvancedAfterSourcePush}\``,
    `- 最終失敗ステージ: \`${lastFailureStage}\``,
    `- 失敗内容: \`${failureMessage}\``,
    `- 更新日時: \`${updatedAt}\``,
    `- workflow run: ${workflowRunUrl === 'unknown' ? 'unknown' : workflowRunUrl}`,
    '',
    '## 状態の意味',
    '',
    '- `unknown`: 本番状態をまだ特定していない。',
    '- `not-deployed`: 本番反映履歴がまだない。',
    '- `preflight`: 事前確認中。',
    '- `source-pushed`: Apps Scriptソースpush済み。',
    '- `deployment-updated`: 既存Webアプリdeployment更新済み。',
    '- `verifying`: smoke確認中。',
    '- `deployed`: 本番反映と確認が完了。',
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
