#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="hermesAgentDeployer"
DASHBOARD_NS="${DASHBOARD_NS:-redhat-ods-applications}"
DASHBOARD_DEPLOY="${DASHBOARD_DEPLOY:-rhods-dashboard}"
PLUGIN_NS="${PLUGIN_NS:-hermes-deployer}"
FRONTEND_SVC="${FRONTEND_SVC:-hermes-agent-deployer}"
FRONTEND_PORT="${FRONTEND_PORT:-8080}"
BFF_SVC="${BFF_SVC:-hermes-agent-deployer-bff}"
BFF_PORT="${BFF_PORT:-3000}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1" >&2; }

usage() {
    cat <<EOF
Usage: $(basename "$0") [register|unregister|status]

Register or unregister the Hermes Agent Deployer plugin with the RHOAI dashboard.

Commands:
  register     Add the plugin to MODULE_FEDERATION_CONFIG (idempotent)
  unregister   Remove the plugin from MODULE_FEDERATION_CONFIG
  status       Show whether the plugin is currently registered

Environment variables:
  DASHBOARD_NS      Dashboard namespace       (default: redhat-ods-applications)
  PLUGIN_NS         Plugin namespace          (default: hermes-deployer)
  FRONTEND_SVC      Frontend service name     (default: hermes-agent-deployer)
  BFF_SVC           BFF service name          (default: hermes-agent-deployer-bff)

Examples:
  $(basename "$0") register
  $(basename "$0") unregister
  PLUGIN_NS=my-ns $(basename "$0") register
EOF
}

check_prerequisites() {
    if ! command -v oc &>/dev/null; then
        log_error "oc CLI not found"
        exit 1
    fi
    if ! command -v python3 &>/dev/null; then
        log_error "python3 not found"
        exit 1
    fi
    if ! oc whoami &>/dev/null; then
        log_error "Not logged in to OpenShift. Run 'oc login' first."
        exit 1
    fi
    if ! oc get deployment/"${DASHBOARD_DEPLOY}" -n "${DASHBOARD_NS}" &>/dev/null; then
        log_error "Dashboard deployment '${DASHBOARD_DEPLOY}' not found in namespace '${DASHBOARD_NS}'"
        exit 1
    fi
}

get_current_config() {
    local raw
    raw=$(oc get deployment/"${DASHBOARD_DEPLOY}" -n "${DASHBOARD_NS}" \
        -o jsonpath='{.spec.template.spec.containers[0].env}' 2>/dev/null)

    python3 -c "
import json, sys
envs = json.loads(sys.stdin.read())
for e in envs:
    if e['name'] == 'MODULE_FEDERATION_CONFIG':
        print(e['value'])
        sys.exit(0)
print('[]')
" <<< "${raw}"
}

do_status() {
    local config
    config=$(get_current_config)
    local found
    found=$(python3 -c "
import json, sys
config = json.loads(sys.stdin.read())
names = [e['name'] for e in config]
if '${PLUGIN_NAME}' in names:
    print('registered')
else:
    print('not_registered')
" <<< "${config}")

    if [[ "${found}" == "registered" ]]; then
        log_success "${PLUGIN_NAME} is registered"
        return 0
    else
        log_warn "${PLUGIN_NAME} is not registered"
        return 1
    fi
}

do_register() {
    local config
    config=$(get_current_config)

    local new_config
    new_config=$(python3 -c "
import json, sys

config = json.loads(sys.stdin.read())
names = [e['name'] for e in config]

if '${PLUGIN_NAME}' in names:
    print('ALREADY_REGISTERED')
    sys.exit(0)

config.append({
    'name': '${PLUGIN_NAME}',
    'backend': {
        'remoteEntry': '/remoteEntry.js',
        'authorize': False,
        'tls': False,
        'service': {
            'name': '${FRONTEND_SVC}',
            'namespace': '${PLUGIN_NS}',
            'port': ${FRONTEND_PORT}
        }
    },
    'proxyService': [{
        'path': '/hermes-agent-deployer/api',
        'pathRewrite': '/api',
        'authorize': True,
        'tls': False,
        'service': {
            'name': '${BFF_SVC}',
            'namespace': '${PLUGIN_NS}',
            'port': ${BFF_PORT}
        }
    }]
})

print(json.dumps(config))
" <<< "${config}")

    if [[ "${new_config}" == "ALREADY_REGISTERED" ]]; then
        log_success "${PLUGIN_NAME} is already registered — no changes made"
        return 0
    fi

    log_info "Backing up current config..."
    local backup_file="/tmp/mf-config-backup-$(date +%s).json"
    echo "${config}" > "${backup_file}"
    log_info "Backup saved to ${backup_file}"

    log_warn "Scaling down RHOAI operator to prevent reconciliation..."
    oc scale deployment/rhods-operator -n redhat-ods-operator --replicas=0 2>/dev/null || true

    log_info "Updating MODULE_FEDERATION_CONFIG..."
    if ! oc set env deployment/"${DASHBOARD_DEPLOY}" -n "${DASHBOARD_NS}" --containers='*' \
        "MODULE_FEDERATION_CONFIG=${new_config}" 2>/dev/null; then
        log_error "Failed to update dashboard env var"
        log_error "Restore with: oc set env deployment/${DASHBOARD_DEPLOY} -n ${DASHBOARD_NS} \"MODULE_FEDERATION_CONFIG=\$(cat ${backup_file})\""
        exit 1
    fi

    log_success "Plugin registered. Dashboard pods will restart (~2 minutes)."
    log_warn "RHOAI operator is scaled down. Re-enable with:"
    log_warn "  oc scale deployment/rhods-operator -n redhat-ods-operator --replicas=1"
    log_info "Backup at ${backup_file} — restore with:"
    log_info "  oc set env deployment/${DASHBOARD_DEPLOY} -n ${DASHBOARD_NS} --containers='*' \"MODULE_FEDERATION_CONFIG=\$(cat ${backup_file})\""
}

do_unregister() {
    local config
    config=$(get_current_config)

    local new_config
    new_config=$(python3 -c "
import json, sys

config = json.loads(sys.stdin.read())
original_len = len(config)
config = [e for e in config if e['name'] != '${PLUGIN_NAME}']

if len(config) == original_len:
    print('NOT_FOUND')
    sys.exit(0)

print(json.dumps(config))
" <<< "${config}")

    if [[ "${new_config}" == "NOT_FOUND" ]]; then
        log_warn "${PLUGIN_NAME} is not registered — nothing to remove"
        return 0
    fi

    log_info "Removing ${PLUGIN_NAME} from MODULE_FEDERATION_CONFIG..."
    if ! oc set env deployment/"${DASHBOARD_DEPLOY}" -n "${DASHBOARD_NS}" \
        "MODULE_FEDERATION_CONFIG=${new_config}" 2>/dev/null; then
        log_error "Failed to update dashboard env var"
        exit 1
    fi

    log_success "Plugin unregistered. Dashboard pods will restart (~2 minutes)."
}

main() {
    local command="${1:-}"
    case "${command}" in
        register|unregister|status) ;;
        -h|--help) usage; exit 0 ;;
        "") log_error "No command specified"; usage; exit 1 ;;
        *) log_error "Unknown command: ${command}"; usage; exit 1 ;;
    esac

    check_prerequisites

    case "${command}" in
        register)   do_register ;;
        unregister) do_unregister ;;
        status)     do_status ;;
    esac
}

main "$@"
