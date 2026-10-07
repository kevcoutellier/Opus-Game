"""
Men of Hironeiden: Gerald and the infantryman. Proportions follow the procedural models of the game (shoulder
pivots at ±0.27 / 1.42 m, hips at 0.92 m, head about 1.66 m) so both read the same from the tactic camera.

No picture of the original models was available (see docs/CRUSADERS.md). Gerald follows the art direction of
a concept sheet given by the project's author (an illustration, not the original game's design): shoulder-length
wavy brown hair, silver plate with gold trim, layered pauldrons, blue tabard and cape, gold lions on the chest,
the cape and the shield, brown leather belts with brass buckles, a long straight sword. The infantry takes the
same palette. Blue is the faction colour (material `Team`).
"""
from __future__ import annotations

import math

from kuf import Model

SKIN = 0xc99c76
EYES = 0x221d1a
LIPS = 0x94605a
PLATE = 0xc3c8d0
STEEL = 0xe4e9f0
DARK_METAL = 0x55585f
MAIL = 0x7f848c
GOLD = 0xd6b25a
LEATHER = 0x5e4630
DARK_LEATHER = 0x3b2c1e
TEAM = 0xffffff

# Heraldic lion rampant (facing the viewer's left) in a unit box: chest, shield and cape.
LION = [
    (-0.10, 0.50), (0.02, 0.47), (0.09, 0.38), (0.07, 0.24), (0.17, 0.12), (0.21, -0.04),
    (0.29, 0.03), (0.35, 0.18), (0.31, 0.33), (0.40, 0.31), (0.44, 0.15), (0.36, -0.03),
    (0.25, -0.15), (0.21, -0.30), (0.27, -0.45), (0.13, -0.47), (0.09, -0.31), (0.03, -0.36),
    (-0.03, -0.50), (-0.16, -0.50), (-0.09, -0.33), (-0.05, -0.17), (-0.11, -0.03), (-0.26, 0.03),
    (-0.35, -0.05), (-0.38, 0.04), (-0.25, 0.14), (-0.13, 0.14), (-0.23, 0.23), (-0.35, 0.25),
    (-0.36, 0.33), (-0.21, 0.33), (-0.17, 0.36), (-0.27, 0.40), (-0.23, 0.46), (-0.16, 0.48),
]


def face(m: Model, skin: int, brows: int, fine: bool):
    """Head, nose and eyes; a hero's (`fine`) also has ears, brows and lips and a rounder skull."""
    s = m.material("Skin", skin, roughness=0.7)
    m.ball((0.104, 0.124, 0.114), (0, 1.655, 0.012), s, "Body", segments=(10, 8) if fine else (8, 6))
    m.cone(0.02, 0.004, 0.05, (0, 1.648, 0.122), s, "Body", rot=(math.pi / 2 - 0.25, 0, 0), segments=4)
    for side in (-1, 1):
        m.box((0.024, 0.013, 0.01), (side * 0.041, 1.674, 0.114), m.material("Eyes", EYES, roughness=0.3), "Body")
        if fine:
            m.box((0.026, 0.07, 0.04), (side * 0.104, 1.655, 0.0), s, "Body")
            m.box((0.036, 0.011, 0.012), (side * 0.041, 1.693, 0.113), m.material("Brows", brows), "Body", rot=(0, 0, side * -0.12))
    if fine:
        m.box((0.042, 0.008, 0.008), (0, 1.603, 0.116), m.material("Lips", LIPS), "Body")


def arms(m: Model, upper: int, lower: int, glove: int, cuff: int | None = None, fine: bool = True):
    for side, bone in ((1, "WeaponArm"), (-1, "ShieldArm")):
        x = side * 0.275
        # Tube ends hidden in the shoulder, the forearm or the glove stay open.
        m.loft([(1.43, x, 0, 0.062, 0.066), (1.3, x + side * 0.006, 0, 0.058, 0.062), (1.17, x + side * 0.01, 0, 0.052, 0.056)], upper, bone, segments=6, caps=(False, False))
        m.loft([(1.18, x + side * 0.01, 0.0, 0.05, 0.053), (1.0, x + side * 0.015, 0.02, 0.044, 0.046)], lower, bone, segments=6, caps=(False, False))
        if cuff is not None:
            m.loft([(1.04, x + side * 0.015, 0.02, 0.055, 0.057), (0.98, x + side * 0.015, 0.025, 0.05, 0.052)], cuff, bone, segments=6, smooth=False)
        m.box((0.07, 0.095, 0.095), (side * 0.29, 0.925, 0.045), glove, bone, bevel=0.012 if fine else 0.0)


def legs(m: Model, thigh: int, shin: int, boot: int, knee: int | None = None, fine: bool = True):
    for side, bone in ((-1, "LeftLeg"), (1, "RightLeg")):
        x = side * 0.11
        m.loft([(0.92, x, 0, 0.088, 0.092), (0.74, x, 0.005, 0.078, 0.082), (0.57, x, 0.01, 0.066, 0.07)], thigh, bone, segments=6, caps=(False, False))
        m.loft([(0.58, x, 0.01, 0.06, 0.065), (0.42, x, 0.005, 0.058, 0.066), (0.2, x, 0.0, 0.05, 0.056)], shin, bone, segments=6, caps=(False, False))
        if knee is not None:
            m.ball((0.058, 0.05, 0.04), (x, 0.565, 0.06), knee, bone, segments=(6, 4), smooth=False)
        m.loft([(0.24, x, 0.0, 0.058, 0.064), (0.12, x, 0.0, 0.062, 0.07)], boot, bone, segments=6, smooth=False, caps=(False, True))
        m.box((0.12, 0.12, 0.27), (x, 0.06, 0.04), boot, bone, bevel=0.018 if fine else 0.0)


def heater(m: Model, w: float, h: float, rim: int, fine: bool = True, lion: int | None = None, studs: int | None = None):
    """Heater shield on the shield arm, facing forward: rim, faction field, a gold lion, studs."""
    outline = [
        (-w / 2, h * 0.4), (-w * 0.25, h * 0.47), (0, h / 2), (w * 0.25, h * 0.47), (w / 2, h * 0.4), (w / 2, h * 0.08),
        (w * 0.42, -h * 0.16), (w * 0.27, -h * 0.36), (0, -h / 2), (-w * 0.27, -h * 0.36), (-w * 0.42, -h * 0.16), (-w / 2, h * 0.08),
    ]
    centre = (-0.33, 1.07, 0.2)
    m.slab(outline, 0.045, centre, rim, "ShieldArm", bevel=0.009 if fine else 0.0)
    m.slab(outline, 0.012, (centre[0], centre[1] + h * 0.01, centre[2] + 0.026), m.material("Team", TEAM, roughness=0.8), "ShieldArm", scale=(0.87, 0.88))
    if lion is not None:
        m.slab(LION, 0.008, (centre[0], centre[1] + h * 0.03, centre[2] + 0.034), lion, "ShieldArm", scale=(w * 0.62, h * 0.55))
    if studs is not None:
        for x, y in outline[::1 if fine else 2]:
            m.ball((0.011, 0.011, 0.008), (centre[0] + x * 0.935, centre[1] + y * 0.94 + h * 0.005, centre[2] + 0.027), studs, "ShieldArm", segments=(5, 3), smooth=False)


def sword(m: Model, length: float, blade: int, guard: int, pommel: int, grip: int, guard_width=0.2):
    with m.hand():
        m.loft([(-0.075, 0, 0, 0.017, 0.017), (0.075, 0, 0, 0.016, 0.016)], grip, "Weapon", segments=6)
        m.ball((0.026, 0.026, 0.022), (0, -0.09, 0), pommel, "Weapon", segments=(6, 4), smooth=False)
        m.box((guard_width, 0.028, 0.034), (0, 0.088, 0), guard, "Weapon", bevel=0.006)
        m.loft(
            [(0.1, 0, 0, 0.03, 0.008), (0.1 + length * 0.86, 0, 0, 0.025, 0.007), (0.1 + length, 0, 0, 0.002, 0.002)],
            blade,
            "Weapon",
            segments=4,
            phase=0.0,
            smooth=False,
        )


# ---------------------------------------------------------------------------------------------- Gerald


def hair_lock(m: Model, mat: int, angle: float, root_y: float, tip_y: float, tip_out: float, width=0.042, sweep=0.0):
    """A lock of hair from the scalp down to `tip_y`, on the side of the head at `angle` (0 = the face)."""
    with m.frame(rot=(0, angle, 0)):
        mid = (root_y + tip_y) / 2
        m.loft(
            [
                (root_y, 0, 0.098, width * 0.8, 0.018),
                (mid + 0.03, sweep * 0.4, 0.128, width, 0.024),
                (mid - 0.03, sweep * 0.8, 0.128 + tip_out * 0.5, width * 0.9, 0.022),
                (tip_y, sweep, 0.13 + tip_out, 0.008, 0.006),
            ],
            mat,
            "Body",
            segments=4,
            phase=0.0,
        )


def gerald() -> Model:
    """Knight commander of Hironeiden, after the author's concept sheet (see the module docstring)."""
    m = Model("hero_gerald")
    plate = m.material("Plate", 0xc9cdd4, metallic=0.88, roughness=0.3)
    gold = m.material("Gold", 0xc9a24a, metallic=0.9, roughness=0.32)
    brass = m.material("Brass", 0xb08638, metallic=0.85, roughness=0.4)
    team = m.material("Team", TEAM, roughness=0.8)
    leather = m.material("Leather", 0x6a4a2e, roughness=0.75)
    dark_leather = m.material("DarkLeather", 0x3e2c1c, roughness=0.8)
    collar = m.material("Gambeson", 0x1f2a4a, roughness=0.85)
    skin = m.material("Skin", 0xd4a582, roughness=0.7)
    hair = m.material("Hair", 0x6a4528, roughness=0.85)
    hair_light = m.material("HairLight", 0x87603a, roughness=0.85)
    steel = m.material("Steel", 0xb5bcc6, metallic=0.9, roughness=0.3)

    # Breastplate, sculpted, gold rims at the neck and the waist, gold lion on the chest.
    m.loft(
        [(0.95, 0, 0, 0.2, 0.14), (1.05, 0, 0.006, 0.206, 0.146), (1.18, 0, 0.016, 0.226, 0.162), (1.3, 0, 0.02, 0.238, 0.168), (1.4, 0, 0.006, 0.236, 0.152), (1.47, 0, 0, 0.17, 0.115)],
        plate,
        "Body",
        segments=12,
        caps=(False, False),
    )
    m.loft([(1.435, 0, 0.002, 0.2, 0.135), (1.465, 0, 0, 0.176, 0.12)], gold, "Body", segments=12, caps=(False, False))
    m.loft([(0.95, 0, 0, 0.205, 0.145), (0.975, 0, 0.002, 0.207, 0.147)], gold, "Body", segments=12, caps=(False, False))
    m.slab(LION, 0.012, (0, 1.235, 0.188), gold, "Body", scale=(0.17, 0.19))
    # Gorget over a dark blue collar.
    m.loft([(1.46, 0, 0, 0.082, 0.08), (1.57, 0, 0.006, 0.07, 0.068)], collar, "Body", segments=8, caps=(False, False))
    m.loft([(1.43, 0, 0, 0.122, 0.105), (1.5, 0, 0.002, 0.092, 0.084)], plate, "Body", segments=10, caps=(False, False))
    m.loft([(1.5, 0, 0.002, 0.093, 0.085), (1.515, 0, 0.002, 0.09, 0.082)], gold, "Body", segments=10, caps=(False, False))
    # Faulds at the hips, belts with brass buckles, a pouch.
    for y0, rx, rz in ((0.9, 0.214, 0.153), (0.85, 0.222, 0.16), (0.8, 0.23, 0.167)):
        m.loft([(y0, 0, 0, rx, rz), (y0 + 0.058, 0, 0, rx - 0.009, rz - 0.007)], plate, "Body", segments=12, caps=(False, False))
    m.loft([(0.958, 0, 0, 0.217, 0.158), (1.0, 0, 0, 0.215, 0.156)], leather, "Body", segments=12, smooth=False, caps=(False, False))
    m.box((0.056, 0.048, 0.014), (0, 0.979, 0.165), brass, "Body", bevel=0.004)
    with m.frame(at=(0, 0.875, 0), rot=(0, 0, 0.14)):
        m.loft([(-0.02, 0, 0, 0.238, 0.175), (0.02, 0, 0, 0.238, 0.175)], dark_leather, "Body", segments=12, smooth=False, caps=(False, False))
        m.box((0.05, 0.044, 0.014), (0.0, 0.0, 0.182), brass, "Body", bevel=0.004)
    m.box((0.08, 0.09, 0.05), (0.205, 0.83, 0.07), leather, "Body", rot=(0, 0.95, 0), bevel=0.01)

    # Blue tabard to the knees, front and back over a blue skirt, gold hems.
    m.loft([(0.5, 0, 0, 0.245, 0.19), (0.97, 0, 0, 0.214, 0.154)], team, "Body", segments=12, caps=(False, False))
    for centre in (0.0, math.pi):
        arc = (centre - 0.62, centre + 0.62)
        m.shell([(0.97, 0, 0, 0.226, 0.166), (0.7, 0, 0, 0.24, 0.188), (0.43, 0, 0, 0.246, 0.205)], arc, team, "Body", cols=6, thickness=0.014)
        m.shell([(0.415, 0, 0, 0.25, 0.209), (0.455, 0, 0, 0.249, 0.207)], arc, gold, "Body", cols=6, thickness=0.014, smooth=False)

    # Long blue cape from the shoulders to the calves, gold hem and lion; clasps at the collarbones.
    # Wider than deep: it hangs flat across the back.
    cape = [(1.47, 0, -0.01, 0.2, 0.16), (1.32, 0, -0.06, 0.27, 0.17), (1.0, 0, -0.12, 0.3, 0.18), (0.62, 0, -0.16, 0.33, 0.2), (0.34, 0, -0.19, 0.35, 0.21)]
    back = (math.pi / 2 + 0.25, 3 * math.pi / 2 - 0.25)
    m.shell(cape, back, team, "Body", cols=12, thickness=0.018, wave=0.04, waves=3)
    m.shell([(0.32, 0, -0.19, 0.356, 0.216), (0.37, 0, -0.185, 0.353, 0.213)], back, gold, "Body", cols=12, thickness=0.022, smooth=False)
    m.slab(LION, 0.01, (0, 0.85, -0.33), gold, "Body", rot=(0, math.pi, 0), scale=(0.24, 0.3))
    for side in (-1, 1):
        m.ball((0.03, 0.03, 0.02), (side * 0.15, 1.455, 0.115), gold, "Body", segments=(8, 4), smooth=False)

    # Head: square jaw, blue-grey eyes, shoulder-length wavy hair parted in the middle.
    m.ball((0.1, 0.122, 0.112), (0, 1.655, 0.012), skin, "Body", segments=(12, 9))
    m.ball((0.08, 0.055, 0.085), (0, 1.588, 0.028), skin, "Body", segments=(8, 5))
    m.cone(0.02, 0.004, 0.05, (0, 1.648, 0.122), skin, "Body", rot=(math.pi / 2 - 0.25, 0, 0), segments=4)
    for side in (-1, 1):
        m.box((0.024, 0.012, 0.01), (side * 0.04, 1.672, 0.113), m.material("Eyes", 0x34404f, roughness=0.3), "Body")
        m.box((0.038, 0.011, 0.012), (side * 0.041, 1.691, 0.113), m.material("Brows", 0x4a3020), "Body", rot=(0, 0, side * -0.12))
    m.box((0.042, 0.008, 0.008), (0, 1.602, 0.118), m.material("Lips", LIPS), "Body")
    m.ball((0.116, 0.108, 0.126), (0, 1.703, -0.012), hair, "Body", segments=(12, 7))
    for i, (angle, tip, out) in enumerate([(62, 1.56, 0.0), (85, 1.5, 0.01), (108, 1.47, 0.02), (132, 1.46, 0.025), (156, 1.46, 0.025)]):
        for side in (-1, 1):
            hair_lock(m, hair_light if (i + (side > 0)) % 2 else hair, math.radians(angle) * side, 1.76, tip, out, sweep=0.012 * side)
    hair_lock(m, hair, math.pi, 1.76, 1.46, 0.025)
    for angle, sweep in ((16, 0.035), (36, 0.03)):
        for side in (-1, 1):
            with m.frame(rot=(0, math.radians(angle) * side, 0)):
                m.loft(
                    [(1.8, 0, 0.03, 0.03, 0.014), (1.765, side * 0.012, 0.1, 0.042, 0.02), (1.725, side * 0.024, 0.124, 0.036, 0.016), (1.696, side * sweep, 0.122, 0.008, 0.006)],
                    hair_light if angle == 16 else hair,
                    "Body",
                    segments=4,
                    phase=0.0,
                )

    # Arms: three-lame pauldrons with gold edges, rerebraces, couters, vambraces, gauntlets.
    arms(m, plate, plate, m.material("Gauntlet", 0x9aa0a9, metallic=0.85, roughness=0.35), cuff=plate)
    for side, bone in ((1, "WeaponArm"), (-1, "ShieldArm")):
        for (rx, ry, rz), (x, y), segs in (((0.15, 0.1, 0.16), (0.31, 1.46), (12, 7)), ((0.146, 0.064, 0.154), (0.33, 1.37), (12, 5)), ((0.136, 0.05, 0.144), (0.345, 1.3), (10, 4))):
            m.ball((rx, ry, rz), (side * x, y, 0), plate, bone, segments=segs)
            m.loft([(y - 0.006, side * x, 0, rx + 0.004, rz + 0.004), (y + 0.008, side * x, 0, rx + 0.003, rz + 0.003)], gold, bone, segments=12, smooth=False, caps=(False, False))
        m.ball((0.056, 0.054, 0.05), (side * 0.29, 1.17, -0.03), plate, bone, segments=(8, 5), smooth=False)
        m.ball((0.012, 0.05, 0.05), (side * 0.335, 1.17, -0.015), plate, bone, segments=(6, 4), smooth=False)

    # Legs: blue under the skirt, poleyns with side wings, greaves, sabatons.
    for side, bone in ((-1, "LeftLeg"), (1, "RightLeg")):
        x = side * 0.11
        m.loft([(0.92, x, 0, 0.088, 0.092), (0.57, x, 0.01, 0.066, 0.07)], team, bone, segments=6, caps=(False, False))
        m.loft([(0.58, x, 0.012, 0.066, 0.07), (0.4, x, 0.008, 0.062, 0.07), (0.2, x, 0.0, 0.054, 0.06), (0.12, x, 0.0, 0.058, 0.064)], plate, bone, segments=8, caps=(False, False))
        m.ball((0.06, 0.055, 0.045), (x, 0.56, 0.062), plate, bone, segments=(8, 5), smooth=False)
        m.ball((0.012, 0.05, 0.05), (x + side * 0.056, 0.56, 0.02), plate, bone, segments=(6, 4), smooth=False)
        m.box((0.12, 0.1, 0.2), (x, 0.055, 0.015), plate, bone, bevel=0.016)
        m.ball((0.056, 0.045, 0.075), (x, 0.045, 0.12), plate, bone, segments=(8, 5), smooth=False)

    # Long sword: fullered blade, straight guard with drooping tips, leather grip, wheel pommel.
    with m.hand():
        blade = m.material("Blade", STEEL, metallic=0.95, roughness=0.2)
        length = 1.0
        m.loft([(0.1, 0, 0, 0.034, 0.009), (0.1 + length * 0.8, 0, 0, 0.028, 0.008), (0.1 + length, 0, 0, 0.002, 0.002)], blade, "Weapon", segments=4, phase=0.0, smooth=False)
        for side in (-1, 1):
            m.box((0.012, length * 0.62, 0.003), (0, 0.1 + length * 0.34, side * 0.0075), m.material("Fuller", 0x8d939c, metallic=0.9, roughness=0.3), "Weapon")
        m.box((0.2, 0.026, 0.03), (0, 0.083, 0), steel, "Weapon", bevel=0.005)
        for side in (-1, 1):
            m.box((0.05, 0.022, 0.026), (side * 0.12, 0.07, 0), steel, "Weapon", rot=(0, 0, side * 0.5), bevel=0.004)
        m.box((0.046, 0.04, 0.038), (0, 0.083, 0), gold, "Weapon", bevel=0.005)
        m.loft([(-0.085, 0, 0, 0.016, 0.016), (0.07, 0, 0, 0.015, 0.015)], dark_leather, "Weapon", segments=8)
        m.cone(0.036, 0.036, 0.022, (0, -0.11, 0), steel, "Weapon", rot=(math.pi / 2, 0, 0), segments=10)
        m.ball((0.012, 0.012, 0.016), (0, -0.11, 0), gold, "Weapon", segments=(6, 3), smooth=False)

    # Heater shield: silver rim, blue field, gold lion rampant and studs.
    heater(m, 0.54, 0.76, plate, lion=gold, studs=gold)
    return m


# ---------------------------------------------------------------------------------------------- infantry


def footman() -> Model:
    """Infantryman of Hironeiden: nasal helm, mail, faction surcoat, arming sword, heater with the gold lion."""
    m = Model("human_footman")
    mail = m.material("Mail", MAIL, metallic=0.6, roughness=0.6)
    steel = m.material("Steel", 0xb9bec6, metallic=0.85, roughness=0.35)
    dark = m.material("DarkMetal", DARK_METAL, metallic=0.7, roughness=0.45)
    team = m.material("Team", TEAM, roughness=0.8)
    leather = m.material("Leather", LEATHER, roughness=0.75)
    dark_leather = m.material("DarkLeather", DARK_LEATHER, roughness=0.8)
    cloth = m.material("Trousers", 0x4b3d2e, roughness=0.9)

    # Surcoat in the faction colour over the hauberk (its hem and shoulders show), belt.
    m.loft([(0.64, 0, 0, 0.222, 0.16), (0.74, 0, 0, 0.218, 0.157)], mail, "Body", segments=8, caps=(False, False))
    m.loft([(0.7, 0, 0, 0.226, 0.166), (0.96, 0, 0.002, 0.212, 0.152), (1.3, 0, 0.01, 0.24, 0.166), (1.43, 0, 0, 0.243, 0.155)], team, "Body", segments=8, caps=(False, False))
    m.loft([(1.42, 0, 0, 0.238, 0.15), (1.48, 0, 0, 0.16, 0.11)], mail, "Body", segments=8, caps=(False, False))
    m.loft([(0.94, 0, 0, 0.226, 0.17), (1.0, 0, 0, 0.226, 0.17)], leather, "Body", segments=8, smooth=False)
    m.box((0.05, 0.045, 0.02), (0, 0.97, 0.178), dark, "Body")
    # Mail around the neck and under the helm.
    m.loft([(1.42, 0, 0, 0.17, 0.125), (1.58, 0, -0.005, 0.112, 0.108)], mail, "Body", segments=8, caps=(False, False))
    m.box((0.22, 0.13, 0.05), (0, 1.62, -0.088), mail, "Body")
    for side in (-1, 1):
        m.box((0.03, 0.12, 0.13), (side * 0.112, 1.625, -0.012), mail, "Body")

    # Head: face and nasal helm.
    face(m, SKIN, 0x3a2614, fine=False)
    m.cone(0.13, 0.022, 0.15, (0, 1.765, 0), steel, "Body", segments=8)
    m.loft([(1.685, 0, 0, 0.134, 0.142), (1.715, 0, 0, 0.134, 0.142)], dark, "Body", segments=8, smooth=False, caps=(False, False))
    m.box((0.022, 0.085, 0.014), (0, 1.655, 0.135), steel, "Body")

    # Mail sleeves, leather bracers and gloves, small leather spaulders.
    arms(m, mail, dark_leather, leather, fine=False)
    for side, bone in ((1, "WeaponArm"), (-1, "ShieldArm")):
        m.ball((0.11, 0.065, 0.12), (side * 0.3, 1.44, 0), leather, bone, segments=(6, 3), smooth=False)

    legs(m, cloth, cloth, dark_leather, fine=False)

    # Arming sword; heater shield with an iron band and boss.
    sword(m, 0.8, m.material("Blade", STEEL, metallic=0.95, roughness=0.25), dark, dark, leather)
    heater(m, 0.5, 0.66, dark, fine=False, lion=m.material("Gold", 0xc9a24a, metallic=0.9, roughness=0.32))
    return m


MODELS = {"hero_gerald": gerald, "human_footman": footman}
