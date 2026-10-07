"""
Men of Hironeiden: Gerald and the infantryman. Proportions follow the procedural models of the game (shoulder
pivots at ±0.27 / 1.42 m, hips at 0.92 m, head about 1.66 m) so both read the same from the tactic camera.
Their look is ours: no reference picture of the original models was available (see docs/CRUSADERS.md).
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


def heater(m: Model, w: float, h: float, rim: int, fine: bool = True):
    """Heater shield on the shield arm, facing forward, with the faction colour on its face."""
    outline = [(-w / 2, h / 2), (w / 2, h / 2), (w / 2, h * 0.08), (w * 0.38, -h * 0.22), (w * 0.2, -h * 0.4), (0, -h / 2), (-w * 0.2, -h * 0.4), (-w * 0.38, -h * 0.22), (-w / 2, h * 0.08)]
    inner = [(x * 0.86, y * 0.88 + h * 0.01) for x, y in outline]
    m.slab(outline, 0.045, (-0.33, 1.08, 0.2), rim, "ShieldArm", bevel=0.008 if fine else 0.0)
    m.slab(inner, 0.012, (-0.33, 1.08, 0.228), m.material("Team", TEAM, roughness=0.8), "ShieldArm")


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


def gerald() -> Model:
    """Captain of the Eastern Defence Force: plate, faction cape and surcoat skirt, longsword and heater."""
    m = Model("hero_gerald")
    plate = m.material("Plate", PLATE, metallic=0.85, roughness=0.32)
    dark = m.material("DarkMetal", DARK_METAL, metallic=0.7, roughness=0.45)
    gold = m.material("Gold", GOLD, metallic=0.9, roughness=0.3)
    team = m.material("Team", TEAM, roughness=0.8)
    leather = m.material("Leather", LEATHER, roughness=0.75)
    under = m.material("Gambeson", 0x2b3550, roughness=0.85)
    hair = m.material("Hair", 0x5a3a20, roughness=0.8)

    # Torso: breastplate over the gambeson, gold rim at the neck, faction cross.
    m.loft([(0.94, 0, 0, 0.2, 0.138), (1.12, 0, 0.004, 0.212, 0.146), (1.3, 0, 0.01, 0.236, 0.162), (1.42, 0, 0, 0.238, 0.15), (1.48, 0, 0, 0.16, 0.11)], plate, "Body", segments=8)
    m.loft([(1.12, 0, 0.145, 0.018, 0.012), (1.38, 0, 0.17, 0.016, 0.014)], plate, "Body", segments=4, phase=0.0, smooth=False)
    m.loft([(1.43, 0, 0, 0.17, 0.122), (1.47, 0, 0, 0.165, 0.117)], gold, "Body", segments=8, smooth=False)
    m.box((0.05, 0.2, 0.014), (0, 1.22, 0.172), gold, "Body")
    m.box((0.15, 0.045, 0.014), (0, 1.27, 0.17), gold, "Body")
    # Gorget and neck.
    m.loft([(1.44, 0, 0, 0.1, 0.09), (1.52, 0, 0, 0.074, 0.07)], plate, "Body", segments=8, smooth=False)
    m.loft([(1.5, 0, 0.005, 0.056, 0.056), (1.58, 0, 0.005, 0.052, 0.052)], m.material("Skin", SKIN, roughness=0.7), "Body", segments=6)
    # Belt, faulds, surcoat skirt in the faction colour front and back.
    m.loft([(0.84, 0, 0, 0.205, 0.145), (0.98, 0, 0, 0.212, 0.15)], under, "Body", segments=8)
    m.loft([(0.93, 0, 0, 0.222, 0.158), (0.99, 0, 0, 0.222, 0.158)], leather, "Body", segments=8, smooth=False)
    m.box((0.06, 0.05, 0.02), (0, 0.96, 0.162), gold, "Body", bevel=0.005)
    for side in (-1, 1):
        m.box((0.13, 0.17, 0.03), (side * 0.165, 0.86, 0.1), plate, "Body", rot=(0.12, side * 0.35, 0), bevel=0.008)
    m.loft([(0.6, 0, 0, 0.24, 0.176), (0.97, 0, 0, 0.217, 0.155)], team, "Body", segments=8, caps=(False, False))
    # Cape from the shoulders, gold clasps.
    m.slab([(-0.22, 0), (0.22, 0), (0.32, -1.02), (0, -1.06), (-0.32, -1.02)], 0.024, (0, 1.47, -0.17), team, "Body", rot=(0.1, 0, 0))
    for side in (-1, 1):
        m.ball((0.03, 0.03, 0.02), (side * 0.17, 1.46, 0.11), gold, "Body", segments=(6, 4), smooth=False)

    # Head: brown hair swept back.
    face(m, SKIN, 0x4a2e18, fine=True)
    m.ball((0.118, 0.11, 0.128), (0, 1.692, -0.014), hair, "Body", segments=(10, 7))
    m.box((0.19, 0.13, 0.06), (0, 1.6, -0.095), hair, "Body", bevel=0.02)
    for side in (-1, 1):
        m.box((0.03, 0.1, 0.11), (side * 0.104, 1.665, -0.015), hair, "Body", bevel=0.01)
    for x, tilt in ((-0.05, 0.3), (0.0, 0.2), (0.05, 0.3)):
        m.cone(0.03, 0.004, 0.08, (x, 1.75, 0.085), hair, "Body", rot=(1.9, 0, x * 3), segments=4)

    # Arms: pauldrons in two lames, couters, vambraces, gauntlets.
    arms(m, plate, plate, dark, cuff=plate)
    for side, bone in ((1, "WeaponArm"), (-1, "ShieldArm")):
        m.ball((0.13, 0.085, 0.14), (side * 0.305, 1.45, 0), plate, bone, segments=(8, 5), smooth=False)
        m.ball((0.124, 0.05, 0.132), (side * 0.325, 1.37, 0), plate, bone, segments=(8, 4), smooth=False)
        m.loft([(1.462, side * 0.305, 0, 0.12, 0.13), (1.475, side * 0.305, 0, 0.1, 0.11)], gold, bone, segments=8, smooth=False)
        m.ball((0.05, 0.05, 0.045), (side * 0.29, 1.17, -0.035), plate, bone, segments=(6, 4), smooth=False)

    # Legs: cuisses, poleyns, greaves, sabatons.
    legs(m, under, plate, dark, knee=plate)
    for side, bone in ((-1, "LeftLeg"), (1, "RightLeg")):
        m.loft([(0.84, side * 0.11, 0.04, 0.08, 0.06), (0.6, side * 0.11, 0.05, 0.068, 0.05)], plate, bone, segments=6, smooth=False)

    # Longsword with a gilt hilt; heater shield with a gold cross.
    sword(m, 0.95, m.material("Blade", STEEL, metallic=0.95, roughness=0.2), gold, gold, leather, guard_width=0.22)
    heater(m, 0.5, 0.66, plate)
    m.box((0.06, 0.4, 0.016), (-0.33, 1.1, 0.24), gold, "ShieldArm")
    m.box((0.3, 0.06, 0.016), (-0.33, 1.2, 0.24), gold, "ShieldArm")
    return m


# ---------------------------------------------------------------------------------------------- infantry


def footman() -> Model:
    """Infantryman of Hironeiden: nasal helm, mail, faction tabard, arming sword and heater shield."""
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
    m.loft([(1.42, 0, 0, 0.17, 0.125), (1.5, 0, 0, 0.12, 0.1), (1.58, 0, -0.005, 0.112, 0.108)], mail, "Body", segments=8, caps=(False, False))
    m.box((0.22, 0.13, 0.05), (0, 1.62, -0.088), mail, "Body")
    for side in (-1, 1):
        m.box((0.03, 0.12, 0.13), (side * 0.112, 1.625, -0.012), mail, "Body")

    # Head: face, moustache, nasal helm.
    face(m, SKIN, 0x3a2614, fine=False)
    m.box((0.075, 0.016, 0.012), (0, 1.618, 0.118), m.material("Beard", 0x4a3020), "Body")
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
    heater(m, 0.5, 0.64, dark, fine=False)
    m.box((0.05, 0.56, 0.016), (-0.33, 1.08, 0.24), steel, "ShieldArm")
    m.ball((0.06, 0.06, 0.035), (-0.33, 1.14, 0.24), steel, "ShieldArm", segments=(6, 3), smooth=False)
    return m


MODELS = {"hero_gerald": gerald, "human_footman": footman}
