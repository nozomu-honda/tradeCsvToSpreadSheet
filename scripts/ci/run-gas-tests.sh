#!/usr/bin/env bash
set -Eeuo pipefail

readonly SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-}"
readonly CLASP_RC_PATH="${HOME}/.clasprc.json"
readonly CLASP_PROJECT_PATH=".clasp.json"

test_functions=("runSmokeTests" "runAllTests")

append_summary() {
  if [[ -n "${SUMMARY_FILE}" ]]; then
    printf '%s\n' "$@" >> "${SUMMARY_FILE}"
  fi
}

require_secret() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    echo "::error title=Missing GitHub secret::${name} is required for GAS CI."
    append_summary "### Missing configuration" "- \`${name}\` is not set."
    return 1
  fi
}

ensure_source_function() {
  local function_name="$1"

  if grep -R \
    --include='*.gs' \
    --include='*.js' \
    --exclude-dir='.git' \
    --exclude-dir='node_modules' \
    -E "function[[:space:]]+${function_name}[[:space:]]*\\(" . >/dev/null; then
    return 0
  fi

  echo "::error title=Missing GAS test entry point::${function_name} is not defined in source-controlled .gs/.js files."
  append_summary "### Missing test entry point" "- \`${function_name}\` is not defined in source-controlled .gs/.js files."
  return 1
}

cleanup() {
  rm -f "${CLASP_RC_PATH}"
  rm -f "${CLASP_PROJECT_PATH}"
}
trap cleanup EXIT

require_secret "CLASPRC_JSON"
require_secret "GAS_TEST_SCRIPT_ID"

echo "::add-mask::${GAS_TEST_SCRIPT_ID}"

if [[ ! -f "appsscript.json" ]]; then
  echo "::error title=Missing appsscript.json::Run from the Apps Script source root."
  exit 1
fi

for function_name in "${test_functions[@]}"; do
  ensure_source_function "${function_name}"
done

node <<'NODE'
const fs = require('fs');
const os = require('os');

function writeJsonFile(path, raw, label) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(`::error title=Invalid ${label}::${error.message}`);
    process.exit(1);
  }
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

append_summary "## GAS CI" "" "- Target: test-only Apps Script project from \`GAS_TEST_SCRIPT_ID\`" "- Source entry points: verified before push" "- Push: \`clasp push --force\`" "- Tests: \`${test_functions[*]}\`" ""

echo "::group::clasp push"
clasp push --force
echo "::endgroup::"

failures=()

for function_name in "${test_functions[@]}"; do
  echo "::group::${function_name}"
  set +e
  output="$(clasp run "${function_name}" 2>&1)"
  exit_code=$?
  set -e

  printf '%s\n' "${output}"

  function_not_found=0
  if printf '%s\n' "${output}" | grep -qi 'Script function not found'; then
    function_not_found=1
    exit_code=1
    echo "::error title=GAS test function missing::${function_name} was not found after clasp push."
  fi

  append_summary "### ${function_name}"
  if [[ ${function_not_found} -eq 1 ]]; then
    append_summary "- Result: FAIL (Script function not found)" ""
    failures+=("${function_name}")
  elif [[ ${exit_code} -eq 0 ]]; then
    append_summary "- Result: PASS" ""
  else
    append_summary "- Result: FAIL (exit ${exit_code})" ""
    failures+=("${function_name}")
  fi

  if [[ -n "${SUMMARY_FILE}" ]]; then
    {
      printf '```text\n'
      printf '%s\n' "${output}" | sed 's/```/` ` `/g'
      printf '```\n\n'
    } >> "${SUMMARY_FILE}"
  fi

  echo "::endgroup::"
done

if [[ ${#failures[@]} -gt 0 ]]; then
  echo "::error title=GAS tests failed::Failed functions: ${failures[*]}"
  append_summary "### Failed functions" "- ${failures[*]}"
  exit 1
fi

append_summary "### Result" "All GAS test functions passed."
