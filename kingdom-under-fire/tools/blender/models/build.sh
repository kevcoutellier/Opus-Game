#!/usr/bin/env bash
# Builds the Blender models of the game (see build.py), installing headless Blender first if needed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_DIR="${KUF_BLENDER_ENV:-$HOME/.cache/kuf-blender}"
if ! [ -x "$ENV_DIR/bin/python" ] || ! "$ENV_DIR/bin/python" -c "import bpy" 2>/dev/null; then
  bash "$HERE/../setup.sh" >&2
fi
exec "$ENV_DIR/bin/python" "$HERE/build.py" "$@"
