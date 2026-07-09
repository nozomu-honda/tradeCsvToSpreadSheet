#!/usr/bin/env bash
set -Eeuo pipefail

readonly SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-}"
readonly CLASP_RC_PATH="${HOME}/.clasprc.json"
readonly CLASP_PROJECT_PATH=".clasp.json"
readonly DEPLOYMENT_DESCRIPTION="GAS Web E2E ${GITHUB_SHA:-local} ${GITHUB_RUN_ID:-manual}"
readonly WEBAPP_PROBE_PATH="${RUNNER_TEMP:-/tmp}/gas-webapp-probe.html"

clasp_command=(clasp)
clasp_user_status="not configured"
if [[ -n "${CLASP_USER:-}" ]]; then
  clasp_command+=(--user "${CLASP_USER}")
  clasp_user_status="configured"
fi

append_summary() {
  if [[ -n "${SUMMARY_FILE}" ]]; then
    printf '%s\n' "$@" >> "${SUMMARY_FILE}"
  fi
}

require_secret() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    echo "::error title=Missing GitHub secret::${name} is required for GAS Web E2E."
    append_summary "### Missing configuration" "- \`${name}\` is not set."
    return 1
  fi
}

cleanup() {
  rm -f "${CLASP_RC_PATH}"
  rm -f "${CLASP_PROJECT_PATH}"
  rm -f "${WEBAPP_PROBE_PATH}"
}
trap cleanup EXIT

require_secret "CLASPRC_JSON"
require_secret "GAS_TEST_SCRIPT_ID"
require_secret "GAS_TEST_WEBAPP_DEPLOYMENT_ID"
require_secret "GAS_TEST_WEBAPP_URL"

echo "::add-mask::${GAS_TEST_SCRIPT_ID}"
echo "::add-mask::${GAS_TEST_WEBAPP_DEPLOYMENT_ID}"
echo "::add-mask::${GAS_TEST_WEBAPP_URL}"
if [[ -n "${CLASP_USER:-}" ]]; then
  echo "::add-mask::${CLASP_USER}"
fi

if [[ ! -f "appsscript.json" ]]; then
  echo "::error title=Missing appsscript.json::Run from the Apps Script source root."
  exit 1
fi

echo "::group::.gs Node VM syntax check"
node <<'NODE'
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', 'tests']);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...walk(absolutePath));
      }
    } else if (entry.isFile() && entry.name.endsWith('.gs')) {
      files.push(absolutePath);
    }
  }

  return files;
}

for (const file of walk(root).sort((a, b) => a.localeCompare(b))) {
  const relativePath = path.relative(root, file).replace(/\\/g, '/');
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: relativePath });
  console.log(`OK ${relativePath}`);
}
NODE
echo "::endgroup::"

node <<'NODE'
const fs = require('fs');
const os = require('os');

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`::error title=Invalid ${label}::${error.message}`);
    process.exit(1);
  }
}

function writeJsonFile(path, raw, label) {
  const parsed = parseJson(raw, label);
  fs.writeFileSync(path, JSON.stringify(parsed, null, 2) + '\n', { mode: 0o600 });
}

writeJsonFile(`${os.homedir()}/.clasprc.json`, process.env.CLASPRC_JSON || '', 'CLASPRC_JSON');

if ((process.env.CLASP_PROJECT_JSON || '').trim()) {
  writeJsonFile('.clasp.json', process.env.CLASP_PROJECT_JSON, 'CLASP_PROJECT_JSON');
} else {
  writeJsonFile('.clasp.json', JSON.stringify({
    scriptId: process.env.GAS_TEST_SCRIPT_ID,
    rootDir: '.',
    scriptExtensions: ['.js', '.gs'],
    htmlExtensions: ['.html'],
    jsonExtensions: ['.json'],
    filePushOrder: [],
    skipSubdirectories: false
  }), 'generated .clasp.json');
}
NODE

append_summary "## GAS Web app E2E deployment" "" "- Target: test-only Apps Script project from \`GAS_TEST_SCRIPT_ID\`" "- Deployment: fixed Web app deployment from \`GAS_TEST_WEBAPP_DEPLOYMENT_ID\`" "- Push: \`clasp push --force\`" "- Optional clasp user: ${clasp_user_status}" ""

echo "::group::clasp push"
"${clasp_command[@]}" push --force
echo "::endgroup::"

echo "::group::clasp deploy"
"${clasp_command[@]}" deploy \
  --deploymentId "${GAS_TEST_WEBAPP_DEPLOYMENT_ID}" \
  --description "${DEPLOYMENT_DESCRIPTION}"
echo "::endgroup::"

echo "::group::wait for Web app"
for attempt in $(seq 1 12); do
  http_code="$(curl -L -sS -o "${WEBAPP_PROBE_PATH}" -w '%{http_code}' "${GAS_TEST_WEBAPP_URL}" || true)"
  if [[ "${http_code}" =~ ^[23] ]] && grep -q 'CSV / スプレッドシートから6シート生成' "${WEBAPP_PROBE_PATH}"; then
    echo "Web app is reachable after attempt ${attempt}."
    append_summary "### Web app probe" "- Result: reachable" ""
    echo "::endgroup::"
    exit 0
  fi

  echo "Web app is not ready yet. attempt=${attempt} http=${http_code}"
  sleep $((attempt * 5))
done

echo "::endgroup::"
echo "::error title=Web app not reachable::The test Web app did not serve the expected top page after deployment."
append_summary "### Web app probe" "- Result: FAIL" ""
exit 1
