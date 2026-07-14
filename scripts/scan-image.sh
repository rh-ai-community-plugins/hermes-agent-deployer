#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="${IMAGE_TAG:-latest}"
BUILDER="${BUILDER:-podman}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
    cat <<EOF
Usage: $(basename "$0") [TARGET] [SEVERITY]

Build and scan container images for vulnerabilities using Trivy.

Arguments:
  TARGET    Which image to scan: frontend, bff, or all (default: all)
  SEVERITY  Trivy severity filter (default: HIGH,CRITICAL)
EOF
}

frontend_image_name="hermes-agent-deployer"
frontend_containerfile="Containerfile"
frontend_context="."

bff_image_name="hermes-agent-deployer-bff"
bff_containerfile="bff/Containerfile"
bff_context="bff/"

process_target() {
    local target="$1" severity="$2"
    local image_name containerfile context
    if [[ "${target}" == "frontend" ]]; then
        image_name="${frontend_image_name}"; containerfile="${frontend_containerfile}"; context="${frontend_context}"
    else
        image_name="${bff_image_name}"; containerfile="${bff_containerfile}"; context="${bff_context}"
    fi
    local full_image="${image_name}:${IMAGE_TAG}"
    echo ""
    log_info "--- ${target} ---"
    log_info "Building image: ${full_image}"
    ${BUILDER} build -t "${full_image}" -f "${containerfile}" "${context}"
    log_success "Image built: ${full_image}"
    log_info "Scanning image: ${full_image}"
    trivy image --severity "${severity}" --format table "${full_image}"
}

main() {
    local target="${1:-all}" severity="${2:-HIGH,CRITICAL}"
    if [[ "${target}" == "-h" || "${target}" == "--help" ]]; then usage; exit 0; fi
    case "${target}" in frontend|bff|all) ;; *) log_error "Unknown target: ${target}"; usage; exit 1;; esac

    local targets=()
    if [[ "${target}" == "all" ]]; then targets=("frontend" "bff"); else targets=("${target}"); fi

    echo "============================================"
    echo "  Container Image Build & Vulnerability Scan"
    echo "============================================"
    log_info "Target: ${target}"
    log_info "Builder: ${BUILDER}"
    log_info "Severity: ${severity}"

    for t in "${targets[@]}"; do process_target "${t}" "${severity}"; done
}

main "$@"
