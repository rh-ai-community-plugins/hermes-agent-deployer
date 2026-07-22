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

if [ -d "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
    CHROME_BIN=$(find "${PLAYWRIGHT_BROWSERS_PATH}" \
        -name "chrome" -o -name "headless_shell" -o -name "chrome-headless-shell" \
        2>/dev/null | head -1)
    if [ -n "${CHROME_BIN}" ] && [ -x "${CHROME_BIN}" ]; then
        export AGENT_BROWSER_EXECUTABLE_PATH="${CHROME_BIN}"
        echo "[entrypoint] Chromium found: ${CHROME_BIN}"
    else
        echo "[entrypoint] WARNING: No Chromium binary in ${PLAYWRIGHT_BROWSERS_PATH}"
    fi
else
    echo "[entrypoint] WARNING: PLAYWRIGHT_BROWSERS_PATH not set or directory missing"
fi

exec python server.py
