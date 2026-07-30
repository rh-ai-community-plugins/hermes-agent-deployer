#!/bin/bash
set -euo pipefail

HERMES_HOME="${HERMES_HOME:-/home/hermes/.hermes}"
CONFIG_FILE="${HERMES_HOME}/config.yaml"
ENV_FILE="${HERMES_HOME}/.env"

mkdir -p "${HERMES_HOME}/logs" "${HERMES_HOME}/webui"

echo "=== Hermes Sandbox Startup ==="
echo "HERMES_HOME: ${HERMES_HOME}"
echo "HOSTNAME:    $(hostname)"

# --- Base config.yaml from standard env vars ---
cat > "${CONFIG_FILE}" <<EOF
model:
  default: ${HERMES_INFERENCE_MODEL:-}
  provider: custom
  base_url: ${OPENAI_BASE_URL:-http://localhost:8000/v1}
  api_key: ${OPENAI_API_KEY:-no-key-required}

compression:
  enabled: false
EOF

# --- Base .env from standard env vars ---
{
  [ -n "${OPENAI_API_KEY:-}" ]     && echo "OPENAI_API_KEY=${OPENAI_API_KEY}"
  [ -n "${OPENROUTER_API_KEY:-}" ] && echo "OPENROUTER_API_KEY=${OPENROUTER_API_KEY}"
} > "${ENV_FILE}" || true

# --- HERMES_ENV_* injection ---
# Any env var prefixed HERMES_ENV_ gets its suffix written into .env (upsert)
for var in $(env | grep "^HERMES_ENV_" | cut -d= -f1); do
    key="${var#HERMES_ENV_}"
    val="${!var}"
    echo "Injecting env: ${key}"
    if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${val}|" "${ENV_FILE}"
    else
        echo "${key}=${val}" >> "${ENV_FILE}"
    fi
done

# --- HERMES_CONFIG_* injection ---
# Any env var prefixed HERMES_CONFIG_ gets merged into config.yaml via dot-path keys
# Example: HERMES_CONFIG_web.backend=duckduckgo → config.yaml: web: { backend: duckduckgo }
PY="/opt/hermes/venv/bin/python"
if [ -x "${PY}" ]; then
    env | grep "^HERMES_CONFIG_" | while IFS='=' read -r var val; do
        key="${var#HERMES_CONFIG_}"
        echo "Injecting config: ${key}=${val}"
        CONFIG_PATH="${CONFIG_FILE}" CFG_KEY="${key}" CFG_VAL="${val}" \
        "${PY}" -c "
import yaml, os
path = os.environ['CONFIG_PATH']
with open(path, 'r') as f:
    cfg = yaml.safe_load(f) or {}
keys = os.environ['CFG_KEY'].split('.')
d = cfg
for k in keys[:-1]:
    d = d.setdefault(k, {})
d[keys[-1]] = yaml.safe_load(os.environ['CFG_VAL'])
with open(path, 'w') as f:
    yaml.dump(cfg, f, default_flow_style=False)
" 2>/dev/null || echo "WARN: Could not inject config ${key}"
    done || true
fi

# --- Chromium discovery ---
if [ -d "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
    CHROME_BIN=$(find "${PLAYWRIGHT_BROWSERS_PATH}" \
        -name "chrome" -o -name "headless_shell" -o -name "chrome-headless-shell" \
        2>/dev/null | head -1)
    if [ -n "${CHROME_BIN}" ] && [ -x "${CHROME_BIN}" ]; then
        export AGENT_BROWSER_EXECUTABLE_PATH="${CHROME_BIN}"
        echo "Chromium: ${CHROME_BIN}"
    else
        echo "WARNING: No Chromium binary in ${PLAYWRIGHT_BROWSERS_PATH}"
    fi
else
    echo "WARNING: PLAYWRIGHT_BROWSERS_PATH not set or missing"
fi

# --- WebUI defaults ---
export HERMES_WEBUI_AGENT_DIR="/opt/hermes/src"
export HERMES_WEBUI_DEFAULT_MODEL="${HERMES_INFERENCE_MODEL:-}"

# --- Default auth ---
if [ "${HERMES_WEBUI_NO_AUTH:-}" = "true" ]; then
    echo "Auth: disabled (HERMES_WEBUI_NO_AUTH=true)"
    unset HERMES_WEBUI_PASSWORD
elif [ -z "${HERMES_WEBUI_PASSWORD:-}" ]; then
    export HERMES_WEBUI_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 16)
    echo "Generated WebUI password: ${HERMES_WEBUI_PASSWORD}"
    echo "(Set HERMES_WEBUI_PASSWORD env var to use your own)"
fi

echo "=== Config Summary ==="
echo "Model:    ${HERMES_INFERENCE_MODEL:-not set}"
echo "Base URL: ${OPENAI_BASE_URL:-configured in config.yaml}"
echo "Chromium: ${AGENT_BROWSER_EXECUTABLE_PATH:-not found}"
echo "Sessions: ${HERMES_WEBUI_SESSIONS_MAX:-default}"
echo "======================"

exec "/opt/hermes/venv/bin/python" server.py
