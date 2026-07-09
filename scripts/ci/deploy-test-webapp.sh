#!/usr/bin/env bash
set -Eeuo pipefail

readonly SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-}"
readonly CLASP_RC_PATH="${HOME}/.clasprc.json"
readonly CLASP_PROJECT_PATH=".clasp.json"
readonly DEPLOYMENT_DESCRIPTION="GAS Web E2E ${GITHUB_SHA:-local} ${GITHUB_RUN_ID:-manual}"
readonly WEBAPP_PROBE_PATH="${RUNNER_TEMP:-/tmp}/gas-webapp-probe.html"
readonly CLASP_DEPLOY_LOG="${RUNNER_TEMP:-/tmp}/clasp-deploy.log"
readonly CLASP_DEPLOYMENTS_LOG="${RUNNER_TEMP:-/tmp}/clasp-deployments.log"
readonly WEBAPP_DEPLOY_MODE="${GAS_WEB_E2E_DEPLOY_MODE:-dynamic-public}"
readonly MANIFEST_BACKUP_PATH="${RUNNER_TEMP:-/tmp}/gas-web-e2e-appsscript.json.bak"

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

redact_sensitive_log() {
  local file="$1"
  local output
  output="$(sed -E 's#https://[^[:space:]]+#<redacted-url>#g' "${file}")"
  for value in \
    "${GAS_TEST_SCRIPT_ID:-}" \
    "${GAS_TEST_WEBAPP_DEPLOYMENT_ID:-}" \
    "${GAS_TEST_WEBAPP_URL:-}"; do
    if [[ -n "${value}" ]]; then
      output="${output//${value}/<redacted>}"
    fi
  done
  printf '%s\n' "${output}"
}

read_json_field_from_file() {
  local file="$1"
  local field="$2"
  node - "${file}" "${field}" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const field = process.argv[3];
const raw = fs.readFileSync(file, 'utf8');
const start = raw.indexOf('{');
const end = raw.lastIndexOf('}');
if (start < 0 || end < start) {
  process.exit(0);
}
const parsed = JSON.parse(raw.slice(start, end + 1));
process.stdout.write(String(parsed[field] || ''));
NODE
}

cleanup() {
  rm -f "${CLASP_RC_PATH}"
  rm -f "${CLASP_PROJECT_PATH}"
  rm -f "${WEBAPP_PROBE_PATH}"
  rm -f "${CLASP_DEPLOY_LOG}"
  rm -f "${CLASP_DEPLOYMENTS_LOG}"
  if [[ -f "${MANIFEST_BACKUP_PATH}" ]]; then
    cp "${MANIFEST_BACKUP_PATH}" appsscript.json
    rm -f "${MANIFEST_BACKUP_PATH}"
  fi
}
trap cleanup EXIT

require_secret "CLASPRC_JSON"
require_secret "GAS_TEST_SCRIPT_ID"

if [[ "${WEBAPP_DEPLOY_MODE}" == "fixed-url" ]]; then
  require_secret "GAS_TEST_WEBAPP_DEPLOYMENT_ID"
  require_secret "GAS_TEST_WEBAPP_URL"
fi

echo "::add-mask::${GAS_TEST_SCRIPT_ID}"
if [[ -n "${GAS_TEST_WEBAPP_DEPLOYMENT_ID:-}" ]]; then
  echo "::add-mask::${GAS_TEST_WEBAPP_DEPLOYMENT_ID}"
fi
if [[ -n "${GAS_TEST_WEBAPP_URL:-}" ]]; then
  echo "::add-mask::${GAS_TEST_WEBAPP_URL}"
fi
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

cp appsscript.json "${MANIFEST_BACKUP_PATH}"

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

const manifestPath = 'appsscript.json';
const manifest = parseJson(fs.readFileSync(manifestPath, 'utf8'), 'appsscript.json');
manifest.webapp = {
  access: 'ANYONE_ANONYMOUS',
  executeAs: 'USER_DEPLOYING'
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
NODE

append_summary \
  "## GAS Web app E2E deployment" \
  "" \
  "- Target: test-only Apps Script project from \`GAS_TEST_SCRIPT_ID\`" \
  "- Deploy mode: \`${WEBAPP_DEPLOY_MODE}\`" \
  "- Test manifest: injects \`webapp.access = ANYONE_ANONYMOUS\` and \`webapp.executeAs = USER_DEPLOYING\` before push" \
  "- Push: \`clasp push --force\`" \
  "- Optional clasp user: ${clasp_user_status}" \
  ""

echo "::group::clasp push"
"${clasp_command[@]}" push --force
echo "::endgroup::"
cleanup_manifest_backup() {
  if [[ -f "${MANIFEST_BACKUP_PATH}" ]]; then
    cp "${MANIFEST_BACKUP_PATH}" appsscript.json
    rm -f "${MANIFEST_BACKUP_PATH}"
  fi
}
cleanup_manifest_backup

echo "::group::clasp deployments"
set +e
"${clasp_command[@]}" deployments --json > "${CLASP_DEPLOYMENTS_LOG}" 2>&1
deployments_exit=$?
set -e
if [[ "${deployments_exit}" -eq 0 ]]; then
  deployment_count="$(
    node - "${CLASP_DEPLOYMENTS_LOG}" <<'NODE'
const fs = require('fs');
const raw = fs.readFileSync(process.argv[2], 'utf8');
const start = raw.lastIndexOf('[');
const end = raw.lastIndexOf(']');
const parsed = start >= 0 && end >= start ? JSON.parse(raw.slice(start, end + 1)) : [];
console.log(Array.isArray(parsed) ? parsed.length : 0);
NODE
  )"
  fixed_deployment_found="not checked"
  if [[ -n "${GAS_TEST_WEBAPP_DEPLOYMENT_ID:-}" ]]; then
    fixed_deployment_found="$(
      node - "${CLASP_DEPLOYMENTS_LOG}" "${GAS_TEST_WEBAPP_DEPLOYMENT_ID}" <<'NODE'
const fs = require('fs');
const raw = fs.readFileSync(process.argv[2], 'utf8');
const id = process.argv[3];
const start = raw.lastIndexOf('[');
const end = raw.lastIndexOf(']');
const parsed = start >= 0 && end >= start ? JSON.parse(raw.slice(start, end + 1)) : [];
console.log(Array.isArray(parsed) && parsed.some((item) => item.deploymentId === id) ? 'yes' : 'no');
NODE
    )"
  fi
  echo "Found ${deployment_count} deployment(s) in the test Apps Script project."
  echo "Configured fixed deployment belongs to this project: ${fixed_deployment_found}."
  append_summary "### Deployment inventory" "- Result: PASS" "- Deployment count: ${deployment_count}" "- Configured fixed deployment belongs to this project: ${fixed_deployment_found}" ""
else
  echo "::warning title=Deployment inventory unavailable::Could not list deployments before deploying. Continuing without printing IDs."
  redact_sensitive_log "${CLASP_DEPLOYMENTS_LOG}"
  append_summary "### Deployment inventory" "- Result: WARN (could not list deployments)" ""
fi
echo "::endgroup::"

webapp_url=""
dynamic_deployment_id=""

if [[ "${WEBAPP_DEPLOY_MODE}" == "dynamic-public" ]]; then
  echo "::group::clasp deploy dynamic public Web app"
  set +e
  "${clasp_command[@]}" deploy \
    --json \
    --description "${DEPLOYMENT_DESCRIPTION}" > "${CLASP_DEPLOY_LOG}" 2>&1
  deploy_exit=$?
  set -e

  if [[ "${deploy_exit}" -ne 0 ]]; then
    redact_sensitive_log "${CLASP_DEPLOY_LOG}"
    echo "::endgroup::"
    exit "${deploy_exit}"
  fi

  dynamic_deployment_id="$(read_json_field_from_file "${CLASP_DEPLOY_LOG}" "deploymentId")"
  if [[ -z "${dynamic_deployment_id}" ]]; then
    echo "::error title=Dynamic deployment missing ID::clasp deploy succeeded but did not return a deployment ID."
    echo "Raw clasp deploy output was withheld because it can contain a newly created deployment ID."
    echo "::endgroup::"
    exit 1
  fi

  webapp_url="https://script.google.com/macros/s/${dynamic_deployment_id}/exec"
  echo "::add-mask::${dynamic_deployment_id}"
  echo "::add-mask::${webapp_url}"
  set_github_output "dynamic_deployment_id" "${dynamic_deployment_id}"
  set_github_output "webapp_url" "${webapp_url}"
  echo "Dynamic public Web app deployment was created for this E2E run."
  append_summary "### Web app deployment" "- Result: created dynamic public deployment" "- Cleanup: deployment will be deleted after the job" ""
  echo "::endgroup::"
elif [[ "${WEBAPP_DEPLOY_MODE}" == "fixed-url" ]]; then
  echo "::group::clasp deploy fixed Web app"
  set +e
  "${clasp_command[@]}" deploy \
    --json \
    --deploymentId "${GAS_TEST_WEBAPP_DEPLOYMENT_ID}" \
    --description "${DEPLOYMENT_DESCRIPTION}" > "${CLASP_DEPLOY_LOG}" 2>&1
  deploy_exit=$?
  set -e

  if [[ "${deploy_exit}" -eq 0 ]]; then
    echo "Fixed Web app deployment was updated."
    append_summary "### Web app deployment" "- Result: updated fixed deployment" ""
  elif grep -qi 'Requested entity was not found' "${CLASP_DEPLOY_LOG}"; then
    echo "::warning title=Fixed Web app deployment unavailable::clasp deploy could not find the configured deployment. Continuing to probe the configured Web app URL without printing IDs or URLs."
    append_summary "### Web app deployment" "- Result: SKIP (configured deployment was not found)" "- Follow-up: confirm \`GAS_TEST_WEBAPP_DEPLOYMENT_ID\` belongs to the test Apps Script project when using a fixed \`/exec\` Web app URL." ""
  else
    redact_sensitive_log "${CLASP_DEPLOY_LOG}"
    echo "::endgroup::"
    exit "${deploy_exit}"
  fi
  webapp_url="${GAS_TEST_WEBAPP_URL}"
  set_github_output "webapp_url" "${webapp_url}"
  echo "::endgroup::"
else
  echo "::error title=Invalid E2E deploy mode::GAS_WEB_E2E_DEPLOY_MODE must be dynamic-public or fixed-url."
  append_summary "### Web app deployment" "- Result: FAIL" "- Invalid deploy mode: \`${WEBAPP_DEPLOY_MODE}\`" ""
  exit 1
fi

echo "::group::wait for Web app"
last_http_code=""
for attempt in $(seq 1 12); do
  http_code="$(curl -L -sS -o "${WEBAPP_PROBE_PATH}" -w '%{http_code}' "${webapp_url}" || true)"
  last_http_code="${http_code}"
  if [[ "${http_code}" =~ ^[23] ]] && grep -q 'CSV / スプレッドシートから6シート生成' "${WEBAPP_PROBE_PATH}"; then
    echo "Web app is reachable after attempt ${attempt}."
    append_summary "### Web app probe" "- Result: reachable" "- Playwright: will run" ""
    set_github_output "webapp_probe" "ready"
    echo "::endgroup::"
    exit 0
  fi

  echo "Web app is not ready yet. attempt=${attempt} http=${http_code}"
  sleep $((attempt * 5))
done

if [[ "${last_http_code}" == "403" ]]; then
  echo "::warning title=Web app is protected::The Web app URL returned HTTP 403 from GitHub Actions. Source was pushed, deployment was attempted, and browser E2E will be skipped because the runner cannot open the Web app without Google sign-in."
  append_summary "### Web app probe" "- Result: SKIP (protected; HTTP 403 from GitHub Actions)" "- Playwright: skipped" "- Follow-up: use \`dynamic-public\` mode or a fixed test Web app URL that GitHub Actions can open without interactive Google sign-in." ""
  set_github_output "webapp_probe" "protected"
  echo "::endgroup::"
  exit 0
fi

echo "::endgroup::"
echo "::error title=Web app not reachable::The test Web app did not serve the expected top page after deployment."
append_summary "### Web app probe" "- Result: FAIL" "- Last HTTP status: ${last_http_code}" ""
set_github_output "webapp_probe" "unreachable"
exit 1
