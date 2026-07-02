#!/bin/bash
set -e

CONFIG_DIR="${HOME}/.hermes"
CONFIG_FILE="${CONFIG_DIR}/config.yaml"
ENV_FILE="${CONFIG_DIR}/.env"

mkdir -p "${CONFIG_DIR}"

cat > "${CONFIG_FILE}" <<EOF
model:
  default: ${HERMES_INFERENCE_MODEL:-}
  provider: custom
  base_url: ${OPENAI_BASE_URL:-http://localhost:8000/v1}
  api_key: ${OPENAI_API_KEY:-no-key-required}

compression:
  enabled: false
EOF

{
  [ -n "${OPENAI_API_KEY}" ]   && echo "OPENAI_API_KEY=${OPENAI_API_KEY}"
  [ -n "${OPENROUTER_API_KEY}" ] && echo "OPENROUTER_API_KEY=${OPENROUTER_API_KEY}"
} > "${ENV_FILE}"

export HERMES_WEBUI_DEFAULT_MODEL="${HERMES_INFERENCE_MODEL:-}"

exec python server.py
