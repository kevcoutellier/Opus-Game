"""
Builds the clone's Blender models and exports them for the game (public/models/<model>.glb).

    bash tools/blender/models/build.sh                # all models
    bash tools/blender/models/build.sh hero_gerald    # one model
    bash tools/blender/models/build.sh --preview DIR  # also renders previews (Cycles, CPU) into DIR

Runs Blender headless (the `bpy` module of tools/blender/setup.sh); the Blender MCP can run the same code.
"""
from __future__ import annotations

import argparse
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from humans import MODELS  # noqa: E402
from kuf import BONES, export_glb, linear, to_blender, triangle_count  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
# Budget per soldier: hundreds of them are drawn twice a frame (colour and shadow passes).
BUDGET = {"hero_gerald": 3000, "human_footman": 1000}


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build(name: str):
    model = MODELS[name]()
    obj, rig = model.finish()
    return obj, rig


def pose(rig, attack: bool) -> None:
    """
    The top of an overhead swing, posed like the game's vertex shader does it (rotations about the x axis
    through each bone's pivot): checks that every part follows its bone.
    """
    angles = {"WeaponArm": -2.4, "Weapon": 0.5, "ShieldArm": -0.4, "LeftLeg": 0.5, "RightLeg": -0.5} if attack else {}
    bones = rig.pose.bones
    for b in bones:
        b.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    for name in BONES:  # parents first
        b = bones[name]
        rest = b.bone.matrix_local
        parent = b.parent.matrix @ b.parent.bone.matrix_local.inverted() if b.parent else Matrix.Identity(4)
        head = rest.to_translation()
        turn = Matrix.Translation(head) @ Matrix.Rotation(angles.get(name, 0.0), 4, "X") @ Matrix.Translation(-head)
        b.matrix = parent @ turn @ rest
        bpy.context.view_layer.update()


def stage() -> None:
    """Sky, grass, sun and camera (once per scene)."""
    scene = bpy.context.scene
    if "Ground" in bpy.data.objects:
        return
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = linear(0x8fa3b8)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    scene.world = world
    ground = bpy.data.meshes.new("Ground")
    ground.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
    ground_obj = bpy.data.objects.new("Ground", ground)
    mat = bpy.data.materials.new("GroundMat")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = linear(0x6b7a4a)
    ground.materials.append(mat)
    scene.collection.objects.link(ground_obj)
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
    scene.collection.objects.link(sun)


def preview(path: str, objects, attack: bool) -> None:
    scene = bpy.context.scene
    for _, rig in objects:
        pose(rig, attack)
    stage()
    cam = bpy.data.objects.get("Camera") or bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    target = to_blender((0, 1.0, 0))
    cam.location = to_blender((2.6, 1.7, 3.6) if len(objects) == 1 else (3.0, 1.8, 5.2))
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50
    scene.camera = cam
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 900 if len(objects) > 1 else 600
    scene.render.resolution_y = 700
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("models", nargs="*", default=list(MODELS))
    parser.add_argument("--out", default=os.path.join(ROOT, "public", "models"))
    parser.add_argument("--preview", default=None)
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    for name in args.models:
        reset()
        obj, rig = build(name)
        tris = triangle_count(obj)
        if tris > BUDGET[name]:
            sys.exit(f"{name}: {tris} triangles, over its budget of {BUDGET[name]}")
        path = os.path.join(args.out, f"{name}.glb")
        export_glb([obj, rig], path)
        print(f"{name}: {tris} triangles, {len(obj.data.materials)} materials -> {os.path.relpath(path, ROOT)}", flush=True)
        if args.preview:
            os.makedirs(args.preview, exist_ok=True)
            for attack in (False, True):
                preview(os.path.join(args.preview, f"{name}{'_attack' if attack else ''}.png"), [(obj, rig)], attack)

    if args.preview and len(args.models) > 1:
        # Side by side, as on the battlefield.
        reset()
        objects = []
        for i, name in enumerate(args.models):
            obj, rig = build(name)
            rig.location = Vector((i * 1.1 - (len(args.models) - 1) * 0.55, 0, 0))
            objects.append((obj, rig))
        preview(os.path.join(args.preview, "lineup.png"), objects, False)


if __name__ == "__main__":
    main()
