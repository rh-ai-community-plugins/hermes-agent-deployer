#!/usr/bin/env bash
set -euo pipefail

REGISTRY="quay.io/rh-ai-community-plugins"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
    cat <<EOF
Usage: $(basename "$0") [TARGET] [VERSION]

Build and push container images to Quay.io.

Arguments:
  TARGET    Which image to build: frontend, bff, or all (default: all)
  VERSION   Version tag for the images. If omitted, auto-computed from git tags.

Examples:
  $(basename "$0")                  # Build+push both, auto-version
  $(basename "$0") frontend 0.2.0   # Build+push frontend with explicit version
  $(basename "$0") all 0.2.0        # Build+push both with explicit version
EOF
}

frontend_image_name="hermes-agent-deployer"
frontend_containerfile="Containerfile"
frontend_context="."

bff_image_name="hermes-agent-deployer-bff"
bff_containerfile="bff/Containerfile"
bff_context="bff/"

get_next_version() {
    local max_version="0.0.0"
    local remote_tags
    remote_tags=$(git ls-remote --tags origin 2>/dev/null | sed -nE 's|.*/(v?[0-9]+\.[0-9]+\.[0-9]+)$|\1|p' || true)

    if [[ -n "$remote_tags" ]]; then
        while IFS= read -r tag; do
            tag="${tag#v}"
            local major minor patch
            IFS='.' read -r major minor patch <<< "$tag"
            local max_major max_minor max_patch
            IFS='.' read -r max_major max_minor max_patch <<< "$max_version"
            if [[ "$major" -gt "$max_major" ]] || \
               [[ "$major" -eq "$max_major" && "$minor" -gt "$max_minor" ]] || \
               [[ "$major" -eq "$max_major" && "$minor" -eq "$max_minor" && "$patch" -gt "$max_patch" ]]; then
                max_version="$tag"
            fi
        done <<< "$remote_tags"
    fi

    local major minor patch
    IFS='.' read -r major minor patch <<< "$max_version"
    echo "$major.$((minor + 1)).0"
}

check_prerequisites() {
    local targets=("$@")
    local missing=0
    if ! command -v podman &> /dev/null; then
        log_error "podman is not installed or not in PATH"
        missing=1
    fi
    for target in "${targets[@]}"; do
        local containerfile
        if [[ "${target}" == "frontend" ]]; then containerfile="${frontend_containerfile}"; else containerfile="${bff_containerfile}"; fi
        if [[ ! -f "${containerfile}" ]]; then
            log_error "Containerfile not found: ${containerfile}"
            missing=1
        fi
    done
    if [[ ${missing} -eq 1 ]]; then exit 1; fi
}

process_target() {
    local target="$1" version="$2"
    local image_name containerfile context
    if [[ "${target}" == "frontend" ]]; then
        image_name="${frontend_image_name}"; containerfile="${frontend_containerfile}"; context="${frontend_context}"
    else
        image_name="${bff_image_name}"; containerfile="${bff_containerfile}"; context="${bff_context}"
    fi
    local full_image="${REGISTRY}/${image_name}:${version}"
    echo ""
    log_info "--- ${target} ---"
    log_info "Building image: ${full_image}"
    podman build --platform linux/amd64 -t "${full_image}" -f "${containerfile}" "${context}"
    log_success "Image built: ${full_image}"
    log_info "Pushing image: ${full_image}"
    podman push "${full_image}"
    log_success "Image pushed: ${full_image}"
}

main() {
    local target="${1:-all}" version="${2:-}"
    if [[ "${target}" == "-h" || "${target}" == "--help" ]]; then usage; exit 0; fi
    case "${target}" in frontend|bff|all) ;; *) log_error "Unknown target: ${target}"; usage; exit 1;; esac

    if [[ -z "${version}" ]]; then
        version=$(get_next_version)
        echo ""
        log_info "Proposed version: ${version}"
        read -rp "Proceed with version ${version}? [y/N] " confirm
        if [[ "${confirm}" != [yY] ]]; then log_warn "Aborted."; exit 0; fi
    fi

    local targets=()
    if [[ "${target}" == "all" ]]; then targets=("frontend" "bff"); else targets=("${target}"); fi

    echo ""
    echo "========================================"
    echo "  Container Image Build & Push"
    echo "========================================"
    log_info "Target: ${target}"
    log_info "Version: ${version}"
    log_info "Registry: ${REGISTRY}"

    check_prerequisites "${targets[@]}"
    log_info "Logging in to quay.io..."
    podman login quay.io

    for t in "${targets[@]}"; do process_target "${t}" "${version}"; done

    echo ""
    log_success "Done! Images pushed for version ${version}:"
    for t in "${targets[@]}"; do
        local image_name
        if [[ "${t}" == "frontend" ]]; then image_name="${frontend_image_name}"; else image_name="${bff_image_name}"; fi
        log_success "  ${REGISTRY}/${image_name}:${version}"
    done
}

main "$@"
