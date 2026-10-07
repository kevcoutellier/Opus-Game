"""
Building blocks for the clone's unit models in Blender (run with the `bpy` of tools/blender/setup.sh).

Coordinates are the engine's (src/renderer/UnitMeshes.ts): metres, y up, the unit faces +z, its weapon hand
on +x, about 1.8 m tall before the per-type scale. They are converted to Blender's (z up, facing -y); the glTF
exporter converts them back.

The skeleton is the engine's: six bones whose heads are the vertex shader's pivots (hips, shoulders, wrist).
Every vertex belongs to one bone with weight 1 (the shader poses whole parts, see UnitRenderer). A material
named `Team` takes the faction colour in the game.
"""
from __future__ import annotations

import math
from contextlib import contextmanager

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# Engine (x, y, z) -> Blender (x, -z, y).
TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))

# Order = the engine's BONE ids.
BONES = ["Body", "LeftLeg", "RightLeg", "WeaponArm", "ShieldArm", "Weapon"]
WRIST = (0.29, 0.93, 0.05)
# Weapons are modelled along +y from the hand, then tilted forward into the grip (rotation x = 1.05).
GRIP_TILT = 1.05
RIG = {
    # name: (head, tail, parent) — the heads are the shader's pivots.
    "Body": ((0, 0.92, 0), (0, 1.55, 0), None),
    "LeftLeg": ((-0.11, 0.92, 0), (-0.11, 0.1, 0.02), "Body"),
    "RightLeg": ((0.11, 0.92, 0), (0.11, 0.1, 0.02), "Body"),
    "WeaponArm": ((0.27, 1.42, 0), WRIST, "Body"),
    "ShieldArm": ((-0.27, 1.42, 0), (-0.29, 0.93, 0.02), "Body"),
    "Weapon": (WRIST, (0.29, 0.93 + 0.4 * math.cos(GRIP_TILT), 0.05 + 0.4 * math.sin(GRIP_TILT)), "WeaponArm"),
}


def linear(hex_rgb: int) -> tuple[float, float, float, float]:
    """sRGB hex -> linear RGBA (Blender colours and glTF factors are linear)."""
    out = []
    for shift in (16, 8, 0):
        c = ((hex_rgb >> shift) & 255) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def to_blender(p) -> Vector:
    return (TO_BLENDER @ Vector((*p, 1.0))).to_3d()


def _trs(at=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)) -> Matrix:
    return Matrix.Translation(at) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1.0))


class Model:
    """A unit being built: one mesh (parts with a material and a bone each), then its armature."""

    def __init__(self, name: str):
        self.name = name
        self.bm = bmesh.new()
        self.deform = self.bm.verts.layers.deform.verify()
        self.materials: list[tuple[str, int, float, float]] = []
        self.frames = [Matrix.Identity(4)]

    # ------------------------------------------------------------------ frames and materials

    @contextmanager
    def frame(self, at=(0, 0, 0), rot=(0, 0, 0)):
        """Builds the parts inside in a local frame (e.g. the hand: weapons along +y)."""
        self.frames.append(self.frames[-1] @ _trs(at, rot))
        try:
            yield
        finally:
            self.frames.pop()

    def hand(self):
        return self.frame(WRIST, (GRIP_TILT, 0, 0))

    def material(self, name: str, hex_rgb: int, metallic=0.0, roughness=0.6) -> int:
        for i, m in enumerate(self.materials):
            if m[0] == name:
                return i
        self.materials.append((name, hex_rgb, metallic, roughness))
        return len(self.materials) - 1

    def _matrix(self, at, rot, scale) -> Matrix:
        return TO_BLENDER @ self.frames[-1] @ _trs(at, rot, scale)

    def _part(self, build, mat: int, bone: str, smooth: bool, bevel: float = 0.0, normals=True):
        """Runs `build` (which adds geometry at the end of the bmesh), then tags what it added."""
        # The part's elements are the new ones; not those past an index: a bevel frees elements and later
        # allocations reuse their slots.
        bm = self.bm
        verts_before, faces_before = set(bm.verts), set(bm.faces)
        build()
        if bevel > 0:
            edges = list({e for f in bm.faces if f not in faces_before for e in f.edges})
            bmesh.ops.bevel(bm, geom=edges, offset=bevel, offset_type="OFFSET", segments=1, profile=0.5, affect="EDGES", clamp_overlap=True)
        faces = [f for f in bm.faces if f not in faces_before]
        if normals:
            bmesh.ops.recalc_face_normals(bm, faces=faces)
        group = BONES.index(bone)
        for f in faces:
            f.material_index = mat
            f.smooth = smooth
        for v in bm.verts:
            if v not in verts_before:
                v[self.deform].clear()
                v[self.deform][group] = 1.0

    # ------------------------------------------------------------------ primitives (engine coordinates)

    def box(self, size, at, mat, bone, rot=(0, 0, 0), bevel=0.0, smooth=False):
        m = self._matrix(at, rot, size)
        self._part(lambda: bmesh.ops.create_cube(self.bm, size=1.0, matrix=m), mat, bone, smooth, bevel)

    def ball(self, radii, at, mat, bone, rot=(0, 0, 0), segments=(8, 6), smooth=True):
        m = self._matrix(at, rot, radii)
        self._part(lambda: bmesh.ops.create_uvsphere(self.bm, u_segments=segments[0], v_segments=segments[1], radius=1.0, matrix=m), mat, bone, smooth)

    def cone(self, r_bottom, r_top, height, at, mat, bone, rot=(0, 0, 0), segments=8, smooth=False):
        """Along +y (before `rot`), centred on `at`."""
        m = self._matrix(at, rot, (1, 1, 1)) @ Euler((-math.pi / 2, 0, 0)).to_matrix().to_4x4()
        self._part(
            lambda: bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segments, radius1=r_bottom, radius2=r_top, depth=height, matrix=m),
            mat,
            bone,
            smooth,
        )

    def loft(self, sections, mat, bone, segments=8, phase=None, smooth=True, caps=(True, True)):
        """
        A tube through elliptic sections (y, cx, cz, rx, rz) — limbs, torso, neck, blades. With `phase` None,
        a square tube (segments=4) has flat faces front and back; a diamond needs phase=0.
        """
        if phase is None:
            phase = math.pi / segments
        m = self._matrix((0, 0, 0), (0, 0, 0), (1, 1, 1))

        def build():
            rings = []
            for y, cx, cz, rx, rz in sections:
                ring = []
                for i in range(segments):
                    a = phase + 2 * math.pi * i / segments
                    ring.append(self.bm.verts.new(m @ Vector((cx + rx * math.sin(a), y, cz + rz * math.cos(a)))))
                rings.append(ring)
            for lower, upper in zip(rings, rings[1:]):
                for i in range(segments):
                    j = (i + 1) % segments
                    self.bm.faces.new((lower[i], lower[j], upper[j], upper[i]))
            if caps[0]:
                self.bm.faces.new(list(reversed(rings[0])))
            if caps[1]:
                self.bm.faces.new(rings[-1])

        self._part(build, mat, bone, smooth)

    def slab(self, outline, depth, at, mat, bone, rot=(0, 0, 0), smooth=False, bevel=0.0):
        """A flat convex shape (outline in the local x, y plane), `depth` thick along local z."""
        m = self._matrix(at, rot, (1, 1, 1))

        def build():
            front = [self.bm.verts.new(m @ Vector((x, y, depth / 2))) for x, y in outline]
            back = [self.bm.verts.new(m @ Vector((x, y, -depth / 2))) for x, y in outline]
            self.bm.faces.new(front)
            self.bm.faces.new(list(reversed(back)))
            n = len(outline)
            for i in range(n):
                j = (i + 1) % n
                self.bm.faces.new((back[i], back[j], front[j], front[i]))

        self._part(build, mat, bone, smooth, bevel)

    # ------------------------------------------------------------------ to Blender objects

    def finish(self) -> tuple[bpy.types.Object, bpy.types.Object]:
        """Creates the mesh object, its materials and the armature it is bound to."""
        mesh = bpy.data.meshes.new(self.name)
        bmesh.ops.triangulate(self.bm, faces=[f for f in self.bm.faces if len(f.verts) > 4])
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for name, hex_rgb, metallic, roughness in self.materials:
            mat = bpy.data.materials.new(name)
            mat.use_nodes = True
            bsdf = mat.node_tree.nodes["Principled BSDF"]
            bsdf.inputs["Base Color"].default_value = linear(hex_rgb)
            bsdf.inputs["Metallic"].default_value = metallic
            bsdf.inputs["Roughness"].default_value = roughness
            mat.diffuse_color = linear(hex_rgb)
            mesh.materials.append(mat)
        for bone in BONES:
            obj.vertex_groups.new(name=bone)

        arm_data = bpy.data.armatures.new(f"{self.name}_rig")
        rig = bpy.data.objects.new(f"{self.name}_rig", arm_data)
        bpy.context.scene.collection.objects.link(rig)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode="EDIT")
        for bone in BONES:
            head, tail, parent = RIG[bone]
            eb = arm_data.edit_bones.new(bone)
            eb.head = to_blender(head)
            eb.tail = to_blender(tail)
            if parent:
                eb.parent = arm_data.edit_bones[parent]
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.parent = rig
        modifier = obj.modifiers.new("Armature", "ARMATURE")
        modifier.object = rig
        return obj, rig

    @property
    def triangles(self) -> int:
        return sum(len(f.verts) - 2 for f in self.bm.faces)


def export_glb(objects, path: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_skins=True,
        export_animations=False,
        export_extras=False,
    )


def triangle_count(obj) -> int:
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)
