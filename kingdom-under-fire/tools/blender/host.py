"""
Headless Blender for the Blender MCP server (blender-mcp on PyPI).

The MCP server talks over a socket (localhost:9876) to an addon running inside Blender. That addon refuses to
start in background mode: it relies on `bpy.app.timers`, which only fire in Blender's event loop. Here
Blender is the `bpy` Python module (no window, no GPU), so this host starts the addon's socket server itself
and runs its command queue on the main thread.

Run with the Python of the environment where `bpy` and `blender-mcp` are installed (see setup.sh).
"""
import importlib.util
import os
import socket
import sys
import threading
import time

import bpy  # noqa: F401  (Blender as a Python module)

HOST = os.environ.get("BLENDER_HOST", "localhost")
PORT = int(os.environ.get("BLENDER_PORT", "9876"))


def load_addon():
    spec = importlib.util.find_spec("blender_mcp.bundled.addon")
    if spec is None:
        sys.exit("blender-mcp is not installed in this Python (see tools/blender/setup.sh)")
    addon = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(addon)
    try:
        # Scene properties and preferences the commands read; the auto-start it schedules never fires here.
        addon.register()
    except Exception as e:  # UI classes may fail to register without a window: the commands do not need them.
        print(f"blender-host: addon.register() incomplete: {e}", flush=True)
    return addon


def main():
    addon = load_addon()
    server = addon.BlenderMCPServer(host=HOST, port=PORT)
    # What BlenderMCPServer.start() does, minus its refusal to run in background mode and its timer.
    server.running = True
    server.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.socket.bind((HOST, PORT))
    server.socket.listen(5)
    server.server_thread = threading.Thread(target=server._server_loop, daemon=True)
    server.server_thread.start()
    print(f"blender-host: Blender {bpy.app.version_string} listening on {HOST}:{PORT}", flush=True)
    try:
        while server.running:
            interval = server._drain_command_queue()
            time.sleep(interval or 0.05)
    except KeyboardInterrupt:
        pass
    finally:
        server.stop()


if __name__ == "__main__":
    main()
