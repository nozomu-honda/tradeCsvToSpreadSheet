#!/usr/bin/env bash
set -Eeuo pipefail

readonly SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-}"
readonly CLASP_RC_PATH="${HOME}/.clasprc.json"
readonly CI_REPO_ROOT="${GITHUB_WORKSPACE:-${PWD}}"
readonly CLASP_PROJECT_PATH="${CI_REPO_ROOT}/.clasp.ci.json"
readonly RESOLVED_GAS_TEST_SELECTION_PATH="${RUNNER_TEMP:-/tmp}/gas-test-selection-resolved.json"
readonly CLASP_IGNORE_PATH="${CI_REPO_ROOT}/.claspignore"
readonly CLASP_BIN="${CI_REPO_ROOT}/node_modules/.bin/clasp"
readonly DEPLOYMENT_DESCRIPTION="GAS CI ${GITHUB_SHA:-local} ${GITHUB_RUN_ID:-manual}"
readonly GAS_TEST_FAILURE_PATTERN='(^|[[:space:]])NG([[:space:]]|$)|Exception|(^|[[:space:]])Error:|Exceeded maximum execution time'
export CLASP_PROJECT_PATH

test_functions=()
declare -A expected_test_counts=()
selection_mode=""
selection_test_count=0
selection_summary=""
clasp_push_ms=0
apps_script_wall_ms=0
actual_test_ms=0
reported_test_count=0
script_started_ms=0
clasp_command=("${CLASP_BIN}" --project "${CLASP_PROJECT_PATH}" --ignore "${CLASP_IGNORE_PATH}")
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

now_ms() {
  date +%s%3N
}

format_duration_ms() {
  local duration_ms="${1:-0}"
  node -e "const value=Number(process.argv[1]); process.stdout.write((value / 1000).toFixed(3) + ' s');" "${duration_ms}"
}

load_test_selection() {
  local selection_path="${GAS_TEST_SELECTION_PATH:-}"
  if [[ -z "${selection_path}" ]]; then
    selection_path="${RUNNER_TEMP:-/tmp}/gas-test-selection-default.json"
    GAS_TEST_SELECTION_PATH="${selection_path}" node <<'NODE'
const fs = require('fs');
const { selectGasTestsByChangedFiles } = require('./scripts/ci/gas-test-selection');
const result = selectGasTestsByChangedFiles(['scripts/ci/run-gas-tests.sh'], { forceFull: true });
fs.writeFileSync(process.env.GAS_TEST_SELECTION_PATH, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
NODE
  fi
  if [[ ! -f "${selection_path}" ]]; then
    echo "::error title=Missing GAS test selection::The selection JSON file was not found."
    return 1
  fi

  node - "${selection_path}" "${RESOLVED_GAS_TEST_SELECTION_PATH}" <<'NODE'
const fs = require('fs');
const { validateAndResolveGasTestSelection } = require('./scripts/ci/gas-test-selection');

try {
  let untrustedSelection;
  try {
    untrustedSelection = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  } catch (error) {
    throw new Error('GAS test selection validation failed: JSON is invalid');
  }
  const resolvedSelection = validateAndResolveGasTestSelection(untrustedSelection);
  fs.writeFileSync(process.argv[3], `${JSON.stringify(resolvedSelection, null, 2)}\n`, { mode: 0o600 });
} catch (error) {
  const message = error && /^GAS test selection validation failed: /.test(error.message || '')
    ? error.message
    : 'GAS test selection validation failed: unexpected validation error';
  console.error(`::error title=Invalid GAS test selection::${message}`);
  process.exit(1);
}
NODE
  selection_path="${RESOLVED_GAS_TEST_SELECTION_PATH}"

  selection_mode="$(node -e "const s=require(process.argv[1]); process.stdout.write(s.mode);" "${selection_path}")"
  selection_test_count="$(node -e "const s=require(process.argv[1]); process.stdout.write(String(s.testCount));" "${selection_path}")"
  while IFS=$'\t' read -r entry_point test_count; do
    test_functions+=("${entry_point}")
    expected_test_counts["${entry_point}"]="${test_count}"
  done < <(node - "${selection_path}" <<'NODE'
const fs = require('fs');
const selection = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const detail of selection.suiteDetails) console.log(`${detail.entryPoint}\t${detail.testCount}`);
NODE
  )

  selection_summary="$(node - "${selection_path}" <<'NODE'
const fs = require('fs');
const selection = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const markdownCode = (value) => {
  const text = String(value).replace(/`/g, "'");
  return `\`${text}\``;
};
const list = (values) => values.length ? values.map(markdownCode).join(', ') : '(none)';
const lines = [
  '### GAS Tests selection',
  `- Mode: \`${selection.mode}\``,
  `- Changed files: ${list(selection.changedFiles)}`,
  `- Impact areas: ${list(selection.impactAreas)}`,
  `- Suites: ${list(selection.suites)}`,
  `- Expected tests: \`${selection.testCount}\``,
  `- Omitted areas: ${list(selection.omittedAreas)}`,
  `- Full fallback reason: ${selection.fullFallbackReason || '(none)'}`,
  '',
];
process.stdout.write(lines.join('\n'));
NODE
  )"
}

append_timing_summary() {
  local script_finished_ms
  local script_elapsed_ms
  local job_elapsed_ms
  local apps_script_wait_ms=$((apps_script_wall_ms - actual_test_ms))
  if [[ ${apps_script_wait_ms} -lt 0 ]]; then apps_script_wait_ms=0; fi
  script_finished_ms="$(now_ms)"
  script_elapsed_ms=$((script_finished_ms - script_started_ms))
  if [[ -n "${GAS_CI_JOB_STARTED_AT_EPOCH_SECONDS:-}" ]]; then
    job_elapsed_ms=$((script_finished_ms - GAS_CI_JOB_STARTED_AT_EPOCH_SECONDS * 1000))
  else
    job_elapsed_ms=${script_elapsed_ms}
  fi
  append_summary \
    "### Timing" \
    "- Checkout: $(format_duration_ms "$((${GAS_CI_CHECKOUT_SECONDS:-0} * 1000))")" \
    "- Setup and selection: $(format_duration_ms "$((${GAS_CI_SETUP_SECONDS:-0} * 1000))")" \
    "- clasp push: $(format_duration_ms "${clasp_push_ms}")" \
    "- Apps Script wait: $(format_duration_ms "${apps_script_wait_ms}")" \
    "- Actual GAS tests: $(format_duration_ms "${actual_test_ms}")" \
    "- GAS Tests job through test completion: $(format_duration_ms "${job_elapsed_ms}")" \
    ""
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

run_source_syntax_check() {
  echo "::group::.gs Node VM syntax check"
  set +e
  local output
  output="$(
    node <<'NODE'
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules']);

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

const files = walk(root).sort((a, b) => a.localeCompare(b));
if (files.length === 0) {
  console.log('No .gs files found.');
  process.exit(0);
}

for (const file of files) {
  const relativePath = path.relative(root, file).replace(/\\/g, '/');
  const source = fs.readFileSync(file, 'utf8');
  new vm.Script(source, { filename: relativePath });
  console.log(`OK ${relativePath}`);
}
NODE
  )"
  local exit_code=$?
  set -e

  printf '%s\n' "${output}"
  echo "::endgroup::"

  if [[ ${exit_code} -ne 0 ]]; then
    echo "::error title=GAS source syntax check failed::.gs Node VM syntax check failed before clasp push."
    append_summary "### Source syntax check" "- Result: FAIL" "- Checked source-controlled \`.gs\` files with Node VM parser before \`clasp push\`." ""
    if [[ -n "${SUMMARY_FILE}" ]]; then
      {
        printf '```text\n'
        printf '%s\n' "${output}" | sed 's/```/` ` `/g'
        printf '```\n\n'
      } >> "${SUMMARY_FILE}"
    fi
    return "${exit_code}"
  fi

  append_summary "### Source syntax check" "- Result: PASS" "- Checked source-controlled \`.gs\` files with Node VM parser before \`clasp push\`." ""
}

fail_on_no_credentials() {
  local output="$1"
  local context="$2"

  if printf '%s\n' "${output}" | grep -qi 'No credentials found'; then
    echo "::error title=No clasp credentials::${context} could not find clasp credentials. If CLASPRC_JSON was created with clasp login --user, set CLASP_USER to the same user."
    append_summary "### ${context}" "- Result: FAIL (No clasp credentials found)" "- If \`CLASPRC_JSON\` was created with \`clasp login --user\`, set \`CLASP_USER\` to the same user." ""
    return 1
  fi

  return 0
}

run_clasp_step() {
  local group_name="$1"
  shift

  echo "::group::${group_name}"
  set +e
  local output
  output="$("${clasp_command[@]}" "$@" 2>&1)"
  local exit_code=$?
  set -e

  printf '%s\n' "${output}"

  if ! fail_on_no_credentials "${output}" "${group_name}"; then
    echo "::endgroup::"
    return 1
  fi

  echo "::endgroup::"
  return "${exit_code}"
}

is_clasp_run_permission_unavailable() {
  local output="$1"

  if printf '%s\n' "${output}" | grep -Eqi 'Unable to run script function|not authorized to execute the function|clasp was not authorized'; then
    return 0
  fi

  return 1
}

cleanup() {
  rm -f "${CLASP_RC_PATH}"
  rm -f "${CLASP_PROJECT_PATH}"
  rm -f "${RESOLVED_GAS_TEST_SELECTION_PATH}"
}
trap cleanup EXIT

script_started_ms="$(now_ms)"

require_secret "CLASPRC_JSON"
require_secret "GAS_TEST_SCRIPT_ID"

echo "::add-mask::${GAS_TEST_SCRIPT_ID}"
if [[ -n "${GAS_TEST_DEPLOYMENT_ID:-}" ]]; then
  echo "::add-mask::${GAS_TEST_DEPLOYMENT_ID}"
fi
if [[ -n "${CLASP_USER:-}" ]]; then
  echo "::add-mask::${CLASP_USER}"
fi

if [[ ! -f "appsscript.json" ]]; then
  echo "::error title=Missing appsscript.json::Run from the Apps Script source root."
  exit 1
fi

load_test_selection
append_summary "${selection_summary}"

for function_name in "${test_functions[@]}"; do
  ensure_source_function "${function_name}"
done

run_source_syntax_check

node scripts/ci/write-ci-clasp-config.js

node <<'NODE'
const fs = require('fs');

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`::error title=Invalid ${label}::${error.message}`);
    process.exit(1);
  }
}

const manifestPath = 'appsscript.json';
const manifest = parseJson(fs.readFileSync(manifestPath, 'utf8'), 'appsscript.json');
manifest.executionApi = { access: 'ANYONE' };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
NODE

append_summary "## GAS CI" "" "- Target: test-only Apps Script project from \`GAS_TEST_SCRIPT_ID\`" "- Source entry points: verified before push" "- Test manifest: injects \`executionApi\` in CI before push" "- Project config: temporary file in the repository workspace via \`clasp --project\`, with repository-relative \`rootDir\`" "- Clasp: lockfile-pinned repository binary" "- Ignore: repository \`.claspignore\` via \`clasp --ignore\`" "- Push: \`clasp --project <ci-project> --ignore <repo .claspignore> push --force\`" "- Deployment: update only when \`GAS_TEST_DEPLOYMENT_ID\` is set; otherwise skip creating a new versioned deployment" "- Execution: \`clasp --project <ci-project> run\` in devMode, using the latest pushed code" "- Optional clasp user: ${clasp_user_status}" "- Selection mode: \`${selection_mode}\`" "- Tests: \`${test_functions[*]}\`" ""

push_started_ms="$(now_ms)"
run_clasp_step "clasp --project push" push --force
clasp_push_ms=$(($(now_ms) - push_started_ms))

if [[ -n "${GAS_TEST_DEPLOYMENT_ID:-}" ]]; then
  run_clasp_step "clasp --project API executable deployment" create-deployment --deploymentId "${GAS_TEST_DEPLOYMENT_ID}" --description "${DEPLOYMENT_DESCRIPTION}"
else
  echo "::notice title=Skipping deployment creation::GAS_TEST_DEPLOYMENT_ID is not set, so CI will not create a new versioned deployment. The test Apps Script project must already have API executable access configured for clasp run."
  append_summary "### API executable deployment" "- Result: SKIP" "- \`GAS_TEST_DEPLOYMENT_ID\` is not set, so CI did not create a new versioned deployment." "- The test Apps Script project must already have API executable access configured for \`clasp run\`." ""
fi

failures=()
unavailable_functions=()

for function_name in "${test_functions[@]}"; do
  echo "::group::${function_name}"
  run_started_ms="$(now_ms)"
  set +e
  output="$("${clasp_command[@]}" run "${function_name}" 2>&1)"
  exit_code=$?
  set -e
  run_elapsed_ms=$(($(now_ms) - run_started_ms))
  apps_script_wall_ms=$((apps_script_wall_ms + run_elapsed_ms))

  printf '%s\n' "${output}"

  unavailable=0
  unavailable_reason=""
  if printf '%s\n' "${output}" | grep -qi 'Script function not found'; then
    exit_code=1
    echo "::error title=GAS test function missing after push::${function_name} was not found after clasp push."
    append_summary "### ${function_name}" "- Result: FAIL (function was not found after clasp push)" ""
    failures+=("${function_name}")
    if [[ -n "${SUMMARY_FILE}" ]]; then
      {
        printf '```text\n'
        printf '%s\n' "${output}" | sed 's/```/` ` `/g'
        printf '```\n\n'
      } >> "${SUMMARY_FILE}"
    fi
    echo "::endgroup::"
    continue
  elif printf '%s\n' "${output}" | grep -qi 'No credentials found'; then
    exit_code=1
    echo "::error title=No clasp credentials::${function_name} could not find clasp credentials. If CLASPRC_JSON was created with clasp login --user, set CLASP_USER to the same user."
    append_summary "### ${function_name}" "- Result: FAIL (No clasp credentials found)" "- If \`CLASPRC_JSON\` was created with \`clasp login --user\`, set \`CLASP_USER\` to the same user." ""
    failures+=("${function_name}")
    if [[ -n "${SUMMARY_FILE}" ]]; then
      {
        printf '```text\n'
        printf '%s\n' "${output}" | sed 's/```/` ` `/g'
        printf '```\n\n'
      } >> "${SUMMARY_FILE}"
    fi
    echo "::endgroup::"
    continue
  elif is_clasp_run_permission_unavailable "${output}"; then
    unavailable=1
    unavailable_reason="clasp was not authorized to execute the function"
  fi

  test_failed=0
  test_failure_reason=""
  if [[ ${unavailable} -eq 0 ]] && printf '%s\n' "${output}" | grep -Eq "${GAS_TEST_FAILURE_PATTERN}"; then
    test_failed=1
    test_failure_reason="GAS test output contained NG, Exception, Error, or execution timeout"
  fi

  if [[ ${unavailable} -eq 0 && ${test_failed} -eq 0 && ${exit_code} -eq 0 ]]; then
    metric_line="$(printf '%s\n' "${output}" | grep -Eo 'GAS_TEST_METRICS testCount=[0-9]+ durationMs=[0-9]+' | tail -n 1 || true)"
    if [[ "${metric_line}" =~ testCount=([0-9]+)[[:space:]]+durationMs=([0-9]+) ]]; then
      metric_test_count="${BASH_REMATCH[1]}"
      metric_duration_ms="${BASH_REMATCH[2]}"
      if [[ "${metric_test_count}" -ne "${expected_test_counts[$function_name]}" ]]; then
        test_failed=1
        test_failure_reason="GAS test count did not match the selected suite definition"
      else
        reported_test_count=$((reported_test_count + metric_test_count))
        actual_test_ms=$((actual_test_ms + metric_duration_ms))
      fi
    else
      test_failed=1
      test_failure_reason="GAS test metrics were missing from the function result"
    fi
  fi

  if [[ ${unavailable} -eq 1 ]]; then
    exit_code=0
    echo "::warning title=clasp run unavailable::${function_name} could not be executed after clasp push: ${unavailable_reason}. Source was pushed and validated; run the GAS test batches manually in the Apps Script editor when this check gates a code PR."
  elif [[ ${test_failed} -eq 1 ]]; then
    exit_code=1
    echo "::error title=GAS test reported failures::${function_name} output contained NG, Exception, Error, or execution timeout."
  fi

  append_summary "### ${function_name}"
  if [[ ${unavailable} -eq 1 ]]; then
    append_summary "- Result: SKIP (clasp run unavailable)" "- Reason: ${unavailable_reason}" "- Follow-up: run all GAS test batch functions manually in the Apps Script editor when this check gates a code PR, and record the result in the PR body." ""
    unavailable_functions+=("${function_name}")
  elif [[ ${test_failed} -eq 1 ]]; then
    append_summary "- Result: FAIL (${test_failure_reason})" ""
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
  append_timing_summary
  exit 1
fi

if [[ ${#unavailable_functions[@]} -gt 0 ]]; then
  echo "::notice title=clasp run unavailable::clasp run was unavailable for: ${unavailable_functions[*]}. Source validation and clasp push completed."
  append_summary "### clasp run unavailable" "- Functions: ${unavailable_functions[*]}" "- CI completed after source validation and \`clasp --project <ci-project> push --force\` because clasp could not execute the pushed function." "- Manual follow-up: run all GAS test batch functions in the Apps Script editor for code PRs, then record the result in the PR body." ""
  append_summary "### Result" "GAS source validation and clasp push passed. clasp run was unavailable, so manual GAS execution is required for full runtime confirmation."
  append_timing_summary
  exit 0
fi

if [[ ${reported_test_count} -ne ${selection_test_count} ]]; then
  echo "::error title=GAS test count mismatch::The executed GAS test count did not match the selected total."
  append_summary "### Result" "GAS test count verification failed."
  append_timing_summary
  exit 1
fi

append_summary "### Result" "All selected GAS test functions passed (${reported_test_count} tests, mode: \`${selection_mode}\`)."
append_timing_summary
