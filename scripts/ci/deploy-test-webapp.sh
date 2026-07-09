#!/usr/bin/env bash
set -Eeuo pipefail

readonly SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-}"
readonly CLASP_RC_PATH="${HOME}/.clasprc.json"
readonly CLASP_PROJECT_PATH=".clasp.json"
readonly DEPLOYMENT_DESCRIPTION="GAS Web E2E ${GITHUB_SHA:-local} ${GITHUB_RUN_ID:-manual}"
readonly WEBAPP_PROBE_PATH="${RUNNER_TEMP:-/tmp}/gas-webapp-probe.html"
readonly CLASP_DEPLOY_LOG="${RUNNER_TEMP:-/tmp}/clasp-deploy.log"

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

set_github_output() {
  local name="$1"
  local value="$2"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    printf '%s=%s\n' "${name}" "${value}" >> "${GITHUB_OUTPUT}"
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
  rm -f "${CLASP_DEPLOY_LOG}"
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
set +e
"${clasp_command[@]}" deploy \
  --deploymentId "${GAS_TEST_WEBAPP_DEPLOYMENT_ID}" \
  --description "${DEPLOYMENT_DESCRIPTION}" > "${CLASP_DEPLOY_LOG}" 2>&1
deploy_exit=$?
set -e

if [[ "${deploy_exit}" -eq 0 ]]; then
  echo "Fixed Web app deployment was updated."
  append_summary "### Fixed Web app deployment" "- Result: updated" ""
elif grep -qi 'Requested entity was not found' "${CLASP_DEPLOY_LOG}"; then
  echo "::warning title=Fixed Web app deployment unavailable::clasp deploy could not find the configured deployment. Continuing to probe the configured Web app URL without printing IDs or URLs."
  append_summary "### Fixed Web app deployment" "- Result: SKIP (configured deployment was not found)" "- Follow-up: confirm \`GAS_TEST_WEBAPP_DEPLOYMENT_ID\` belongs to the test Apps Script project when using a fixed \`/exec\` Web app URL." ""
else
  sed -E \
    -e 's#https://[^[:space:]]+#<redacted-url>#g' \
    -e "s#${GAS_TEST_SCRIPT_ID}#<redacted-script-id>#g" \
    -e "s#${GAS_TEST_WEBAPP_DEPLOYMENT_ID}#<redacted-deployment-id>#g" \
    -e "s#${GAS_TEST_WEBAPP_URL}#<redacted-webapp-url>#g" \
    "${CLASP_DEPLOY_LOG}"
  echo "::endgroup::"
  exit "${deploy_exit}"
fi
echo "::endgroup::"

echo "::group::wait for Web app"
last_http_code=""
for attempt in $(seq 1 12); do
  http_code="$(curl -L -sS -o "${WEBAPP_PROBE_PATH}" -w '%{http_code}' "${GAS_TEST_WEBAPP_URL}" || true)"
  last_http_code="${http_code}"
  if [[ "${http_code}" =~ ^[23] ]] && grep -q 'CSV / スプレッドシートから6シート生成' "${WEBAPP_PROBE_PATH}"; then
    echo "Web app is reachable after attempt ${attempt}."
    append_summary "### Web app probe" "- Result: reachable" ""
    set_github_output "webapp_probe" "ready"
    echo "::endgroup::"
    exit 0
  fi

  echo "Web app is not ready yet. attempt=${attempt} http=${http_code}"
  sleep $((attempt * 5))
done

if [[ "${last_http_code}" == "403" ]]; then
  echo "::warning title=Web app is protected::The configured Web app URL returned HTTP 403 from GitHub Actions. Source was pushed, deployment update was attempted, and browser E2E will be skipped because the runner cannot open the protected Web app without Google sign-in."
  append_summary "### Web app probe" "- Result: SKIP (protected; HTTP 403 from GitHub Actions)" "- Follow-up: use a test Web app URL that GitHub Actions can open without interactive Google sign-in to run the browser E2E." ""
  set_github_output "webapp_probe" "protected"
  echo "::endgroup::"
  exit 0
fi

echo "::endgroup::"
echo "::error title=Web app not reachable::The test Web app did not serve the expected top page after deployment."
append_summary "### Web app probe" "- Result: FAIL" ""
set_github_output "webapp_probe" "unreachable"
exit 1
