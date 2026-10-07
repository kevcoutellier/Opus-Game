#!/usr/bin/env bash
# Launched by Claude Code (.mcp.json at the repository root): starts the headless Blender host if it is not
# running yet, then the Blender MCP server on stdio. Nothing may be printed on stdout but the MCP protocol.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_DIR="${KUF_BLENDER_ENV:-$HOME/.cache/kuf-blender}"
PY="$ENV_DIR/bin/python"
PORT="${BLENDER_PORT:-9876}"
LOG="${TMPDIR:-/tmp}/kuf-blender-host.log"

if ! [ -x "$PY" ] || ! "$PY" -c "import bpy, blender_mcp" 2>/dev/null; then
  # First start without the environment's setup script: install now (about 400 MB from PyPI).
  bash "$HERE/setup.sh" >&2 || { echo "Blender MCP: setup failed (bash kingdom-under-fire/tools/blender/setup.sh)" >&2; exit 1; }
fi

# Telemetry of blender-mcp is opt-in; keep it off whatever its preferences say.
export DISABLE_TELEMETRY=true BLENDER_MCP_DISABLE_TELEMETRY=true MCP_DISABLE_TELEMETRY=true
# And do not ask for it: an unanswered consent dialog holds the first tool call until it times out.
CONSENT="${XDG_CONFIG_HOME:-$HOME/.config}/blender-mcp/consent_prompt.json"
if [ ! -f "$CONSENT" ]; then
  mkdir -p "$(dirname "$CONSENT")"
  echo '{"action": "decline", "consent": false, "via": "kuf-launcher", "prompt_version": 2}' >"$CONSENT"
fi

listening() { "$PY" -c "import socket,sys; s=socket.socket(); s.settimeout(0.5); sys.exit(s.connect_ex(('localhost', $PORT)))"; }

if ! listening; then
  # A Blender already open with the MCP addon (on your own machine) is used as is. Otherwise the headless host
  # starts, and starts again if it dies (Workbench and EEVEE need a GPU and take the process down without
  # one: render with Cycles on the CPU).
  nohup bash -c 'while :; do "$0" "$1"; sleep 1; done' "$PY" "$HERE/host.py" >>"$LOG" 2>&1 </dev/null &
  for _ in $(seq 1 60); do
    listening && break
    sleep 0.5
  done
  listening || { echo "Blender MCP: the Blender host did not start (see $LOG)" >&2; exit 1; }
fi

exec "$ENV_DIR/bin/blender-mcp" --host localhost --port "$PORT"
