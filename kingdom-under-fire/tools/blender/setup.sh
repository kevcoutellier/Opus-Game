#!/usr/bin/env bash
# Installs Blender as a Python module (bpy, headless) and the Blender MCP server, from PyPI, in their own
# environment. In a Claude Code cloud environment, add this line to the environment's setup script:
#   bash kingdom-under-fire/tools/blender/setup.sh
set -euo pipefail

ENV_DIR="${KUF_BLENDER_ENV:-$HOME/.cache/kuf-blender}"
# bpy 4.5 LTS needs Python 3.11 exactly.
if [ ! -x "$ENV_DIR/bin/python" ]; then
  if command -v uv >/dev/null; then
    uv venv "$ENV_DIR" --python 3.11 -q
  else
    python3.11 -m venv "$ENV_DIR"
  fi
fi
if command -v uv >/dev/null; then
  VIRTUAL_ENV="$ENV_DIR" uv pip install -q "bpy==4.5.14" "blender-mcp==2.0.0"
else
  "$ENV_DIR/bin/pip" install -q "bpy==4.5.14" "blender-mcp==2.0.0"
fi
"$ENV_DIR/bin/python" -c "import bpy, blender_mcp; print('Blender', bpy.app.version_string, '+ blender-mcp ready in $ENV_DIR')"
