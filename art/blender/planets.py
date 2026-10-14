"""Procedural planet models for Planet Drop.

Run with the Blender Python module (bpy) or Blender itself:

    python art/blender/planets.py            # bpy wheel
    blender -b -P art/blender/planets.py     # full Blender

Every planet is a real 3D sphere with a procedural node material. For each
planet we render two orthographic passes through Cycles:

  * albedo  - the unlit surface colour (RGB) and coverage (A)
  * normal  - the bumped surface normal in camera space (RGB) and a
              specular mask (A, oceans on Earth)

The game lights these in a shader, so planets can roll freely while the
light stays fixed at the top-left of the screen. Saturn's rings are rendered
fully lit as a separate, non-rotating overlay.
"""

import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets", "planets")
TMP = os.path.join(ROOT, "art", "build")
RES = 512
SAMPLES = 64

# Light direction used by both the ring render and the in-game shader
# (camera space: +x right, +y up, +z towards the viewer).
LIGHT_DIR = (-0.55, 0.62, 0.56)


# --------------------------------------------------------------------------
# Tiny node-graph helper
# --------------------------------------------------------------------------
class Graph:
    def __init__(self, material):
        self.nt = material.node_tree
        self.nt.nodes.clear()
        self._coord = None

    def node(self, kind, **props):
        n = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def link(self, value, socket):
        if hasattr(value, "is_output"):
            self.nt.links.new(value, socket)
        elif isinstance(value, (tuple, list)):
            v = list(value)
            if len(socket.default_value) == 4 and len(v) == 3:
                v.append(1.0)
            socket.default_value = v
        else:
            socket.default_value = value

    @staticmethod
    def inp(node, name, kind=None):
        for s in node.inputs:
            if s.name == name and s.enabled and (kind is None or s.type == kind):
                return s
        raise KeyError(f"{node.bl_idname} has no input {name}")

    @staticmethod
    def out(node, *names):
        for name in names:
            for s in node.outputs:
                if s.name == name and s.enabled:
                    return s
        return node.outputs[0]

    def coord(self):
        if self._coord is None:
            tc = self.node("ShaderNodeTexCoord")
            self._coord = tc.outputs["Object"]
        return self._coord

    def xyz(self, vec=None):
        n = self.node("ShaderNodeSeparateXYZ")
        self.link(vec or self.coord(), n.inputs[0])
        return n.outputs[0], n.outputs[1], n.outputs[2]

    def combine(self, x, y, z):
        n = self.node("ShaderNodeCombineXYZ")
        for i, v in enumerate((x, y, z)):
            self.link(v, n.inputs[i])
        return n.outputs[0]

    def noise(self, vec=None, scale=1.0, detail=4.0, rough=0.5, distortion=0.0, lac=2.0):
        n = self.node("ShaderNodeTexNoise")
        n.noise_dimensions = "3D"
        self.link(vec or self.coord(), self.inp(n, "Vector"))
        self.link(scale, self.inp(n, "Scale"))
        self.link(detail, self.inp(n, "Detail"))
        self.link(rough, self.inp(n, "Roughness"))
        self.link(lac, self.inp(n, "Lacunarity"))
        self.link(distortion, self.inp(n, "Distortion"))
        return self.out(n, "Factor", "Fac")

    def noise_vec(self, vec=None, scale=1.0, detail=3.0, rough=0.5):
        n = self.node("ShaderNodeTexNoise")
        self.link(vec or self.coord(), self.inp(n, "Vector"))
        self.link(scale, self.inp(n, "Scale"))
        self.link(detail, self.inp(n, "Detail"))
        self.link(rough, self.inp(n, "Roughness"))
        return self.out(n, "Color")

    def voronoi(self, vec=None, scale=5.0, rand=1.0):
        n = self.node("ShaderNodeTexVoronoi")
        n.voronoi_dimensions = "3D"
        n.feature = "F1"
        self.link(vec or self.coord(), self.inp(n, "Vector"))
        self.link(scale, self.inp(n, "Scale"))
        self.link(rand, self.inp(n, "Randomness"))
        return self.out(n, "Distance")

    def math(self, op, a, b=0.0, c=0.0, clamp=False):
        n = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.link(a, n.inputs[0])
        self.link(b, n.inputs[1])
        self.link(c, n.inputs[2])
        return n.outputs[0]

    def vmath(self, op, a, b=(0, 0, 0), c=(0, 0, 0)):
        n = self.node("ShaderNodeVectorMath", operation=op)
        self.link(a, n.inputs[0])
        self.link(b, n.inputs[1])
        self.link(c, n.inputs[2])
        return self.out(n, "Vector", "Value")

    def vadd(self, a, b):
        return self.vmath("ADD", a, b)

    def vscale(self, a, s):
        n = self.node("ShaderNodeVectorMath", operation="SCALE")
        self.link(a, n.inputs[0])
        self.link(s, self.inp(n, "Scale"))
        return n.outputs[0]

    def maprange(self, v, a, b, c=0.0, d=1.0, clamp=True):
        n = self.node("ShaderNodeMapRange", clamp=clamp)
        self.link(v, self.inp(n, "Value"))
        self.link(a, self.inp(n, "From Min"))
        self.link(b, self.inp(n, "From Max"))
        self.link(c, self.inp(n, "To Min"))
        self.link(d, self.inp(n, "To Max"))
        return self.out(n, "Result")

    def ramp(self, fac, stops, interp="LINEAR"):
        n = self.node("ShaderNodeValToRGB")
        cr = n.color_ramp
        cr.interpolation = interp
        while len(cr.elements) > 1:
            cr.elements.remove(cr.elements[-1])
        for i, (pos, col) in enumerate(stops):
            if isinstance(col, (int, float)):
                col = (col, col, col)
            el = cr.elements[0] if i == 0 else cr.elements.new(pos)
            el.position = pos
            el.color = (col[0], col[1], col[2], 1.0)
        self.link(fac, self.inp(n, "Factor"))
        return self.out(n, "Color")

    def mix(self, fac, a, b, blend="MIX"):
        n = self.node("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_result=True)
        self.link(fac, self.inp(n, "Factor", "VALUE"))
        self.link(a, self.inp(n, "A", "RGBA"))
        self.link(b, self.inp(n, "B", "RGBA"))
        return self.out(n, "Result")

    def fmix(self, fac, a, b):
        """Linear interpolation of two floats."""
        n = self.node("ShaderNodeMix", data_type="FLOAT", clamp_factor=True)
        self.link(fac, self.inp(n, "Factor", "VALUE"))
        self.link(a, self.inp(n, "A", "VALUE"))
        self.link(b, self.inp(n, "B", "VALUE"))
        return self.out(n, "Result")

    def gray(self, color):
        n = self.node("ShaderNodeRGBToBW")
        self.link(color, n.inputs[0])
        return n.outputs[0]

    # ---- reusable features ------------------------------------------------
    def craters(self, scale, size=0.5, density=0.5, seed=0.0):
        """Height field with bowl-shaped craters and raised rims (0.5 = flat)."""
        p = self.vadd(self.coord(), (seed, seed * 1.7, seed * 0.3))
        warp = self.vscale(self.noise_vec(p, scale * 0.6, 2.0), 0.18 / scale)
        d = self.voronoi(self.vadd(p, warp), scale)
        prof = self.gray(self.ramp(d, [
            (0.0, 0.18),
            (size * 0.55, 0.26),
            (size * 0.86, 0.86),
            (size * 1.0, 0.56),
            (size * 1.25, 0.5),
            (1.0, 0.5),
        ], "EASE"))
        # Only some cells get a crater.
        m = self.noise(self.vadd(p, (3.1, 1.2, 7.7)), scale * 0.9, 1.0)
        mask = self.maprange(m, density - 0.04, density + 0.04, 1.0, 0.0)
        return self.math("ADD", self.math("MULTIPLY", self.math("SUBTRACT", prof, 0.5), mask), 0.5)

    def combine_heights(self, *hs):
        acc = hs[0]
        for h in hs[1:]:
            acc = self.math("ADD", acc, self.math("SUBTRACT", h, 0.5))
        return acc

    def bands(self, freq, warp, warp_scale=2.0, freq2=0.0, amp2=0.0, seed=0.0, detail=4.0):
        """Latitude bands (sin of y) warped by noise, returned in 0..1."""
        x, y, z = self.xyz()
        n = self.noise(self.vadd(self.coord(), (seed, 0, seed)), warp_scale, detail, 0.55)
        v = self.math("MULTIPLY_ADD", self.math("SUBTRACT", n, 0.5), warp, y)
        s1 = self.math("SINE", self.math("MULTIPLY", v, freq))
        if freq2:
            s2 = self.math("SINE", self.math("MULTIPLY", v, freq2))
            s1 = self.math("MULTIPLY_ADD", s2, amp2, s1)
            s1 = self.math("DIVIDE", s1, 1.0 + amp2)
        return self.math("MULTIPLY_ADD", s1, 0.5, 0.5)

    def ellipse(self, cx, cy, rx, ry, soft=0.2):
        """1 inside an ellipse on the visible (+z) hemisphere, 0 outside."""
        x, y, z = self.xyz()
        dx = self.math("DIVIDE", self.math("SUBTRACT", x, cx), rx)
        dy = self.math("DIVIDE", self.math("SUBTRACT", y, cy), ry)
        r = self.math("ADD", self.math("MULTIPLY", dx, dx), self.math("MULTIPLY", dy, dy))
        inside = self.maprange(r, 1.0 - soft, 1.0, 1.0, 0.0)
        front = self.maprange(z, 0.0, 0.2, 0.0, 1.0)
        return self.math("MULTIPLY", inside, front)

    def polar(self, start, end=None, warp=0.05):
        """Mask for polar caps (|y| beyond start), slightly ragged."""
        x, y, z = self.xyz()
        ay = self.math("ABSOLUTE", y)
        n = self.noise(None, 6.0, 4.0, 0.6)
        ay = self.math("MULTIPLY_ADD", self.math("SUBTRACT", n, 0.5), warp, ay)
        return self.maprange(ay, start, end or start + 0.03, 0.0, 1.0)


# --------------------------------------------------------------------------
# Planet definitions. Each returns dict(color, height, spec, bump)
# Colours are authored directly in display (sRGB) values.
# --------------------------------------------------------------------------
def p_asteroid(g):
    base = g.noise(None, 2.5, 6.0, 0.6)
    col = g.ramp(base, [(0.3, (0.30, 0.26, 0.23)), (0.55, (0.47, 0.41, 0.36)), (0.75, (0.58, 0.52, 0.45))])
    h = g.combine_heights(g.craters(3.0, 0.55, 0.32, 1.0), g.craters(7.0, 0.5, 0.38, 4.0))
    rough = g.noise(None, 9.0, 8.0, 0.65)
    h = g.math("MULTIPLY_ADD", g.math("SUBTRACT", rough, 0.5), 0.6, h)
    shade = g.ramp(h, [(0.25, (0.78, 0.78, 0.78)), (0.5, (1, 1, 1)), (0.8, (1.08, 1.08, 1.08))])
    col = g.mix(1.0, col, shade, "MULTIPLY")
    return dict(color=col, height=h, bump=0.9)


def p_moon(g):
    maria = g.noise(g.vadd(g.coord(), (2.0, 0, 1.0)), 1.3, 4.0, 0.55)
    fine = g.noise(None, 12.0, 8.0, 0.6)
    tone = g.math("MULTIPLY_ADD", g.math("SUBTRACT", fine, 0.5), 0.25, maria)
    col = g.ramp(tone, [(0.42, (0.38, 0.39, 0.42)), (0.50, (0.50, 0.50, 0.52)), (0.56, (0.78, 0.77, 0.75)), (0.8, (0.90, 0.89, 0.87))])
    h = g.combine_heights(g.craters(2.6, 0.5, 0.26, 2.0), g.craters(6.0, 0.45, 0.30, 5.0), g.craters(13.0, 0.4, 0.34, 9.0))
    shade = g.ramp(h, [(0.2, (0.85, 0.85, 0.85)), (0.5, (1, 1, 1)), (0.85, (1.08, 1.08, 1.08))])
    col = g.mix(1.0, col, shade, "MULTIPLY")
    return dict(color=col, height=h, bump=0.4)


def p_mercury(g):
    tone = g.noise(None, 2.2, 6.0, 0.6)
    col = g.ramp(tone, [(0.35, (0.50, 0.38, 0.30)), (0.55, (0.68, 0.54, 0.42)), (0.7, (0.78, 0.65, 0.52))])
    h = g.combine_heights(g.craters(3.2, 0.5, 0.30, 3.0), g.craters(7.5, 0.45, 0.36, 6.0), g.craters(16.0, 0.4, 0.4, 11.0))
    shade = g.ramp(h, [(0.2, (0.78, 0.76, 0.74)), (0.5, (1, 1, 1)), (0.85, (1.1, 1.1, 1.1))])
    col = g.mix(1.0, col, shade, "MULTIPLY")
    return dict(color=col, height=h, bump=0.45)


def p_mars(g):
    tone = g.noise(None, 1.8, 6.0, 0.6)
    col = g.ramp(tone, [(0.35, (0.50, 0.20, 0.10)), (0.5, (0.76, 0.35, 0.17)), (0.65, (0.88, 0.50, 0.27)), (0.8, (0.92, 0.60, 0.36))])
    dark_n = g.noise(g.vadd(g.coord(), (5.0, 1.0, 3.0)), 1.2, 5.0, 0.6)
    dark = g.maprange(dark_n, 0.55, 0.68, 0.0, 0.55)
    col = g.mix(dark, col, (0.36, 0.15, 0.09))
    canyon = g.ellipse(-0.05, -0.12, 0.55, 0.05, 0.85)
    col = g.mix(g.math("MULTIPLY", canyon, 0.3), col, (0.40, 0.15, 0.08))
    caps = g.polar(0.84, 0.88)
    col = g.mix(caps, col, (0.97, 0.95, 0.93))
    h = g.combine_heights(g.craters(4.0, 0.5, 0.26, 7.0), g.craters(10.0, 0.45, 0.32, 2.0))
    h = g.math("SUBTRACT", h, g.math("MULTIPLY", canyon, 0.12))
    dust = g.noise(None, 7.0, 8.0, 0.6)
    h = g.math("MULTIPLY_ADD", g.math("SUBTRACT", dust, 0.5), 0.35, h)
    return dict(color=col, height=h, bump=0.45)


def p_venus(g):
    b = g.bands(9.0, 1.6, 2.2, 23.0, 0.35, 3.0, 6.0)
    swirl = g.noise(None, 4.0, 6.0, 0.6, 1.5)
    t = g.math("MULTIPLY_ADD", g.math("SUBTRACT", swirl, 0.5), 0.7, b)
    col = g.ramp(t, [(0.0, (0.90, 0.62, 0.30)), (0.35, (0.97, 0.80, 0.45)), (0.7, (0.99, 0.92, 0.64)), (1.0, (1.0, 0.98, 0.86))])
    return dict(color=col, height=t, bump=0.08)


def p_earth(g):
    p = g.coord()
    land_n = g.noise(g.vadd(p, (11.0, 3.0, 5.0)), 1.45, 9.0, 0.58)
    land = g.maprange(land_n, 0.555, 0.57, 0.0, 1.0)
    depth = g.ramp(land_n, [(0.3, (0.03, 0.15, 0.40)), (0.50, (0.06, 0.27, 0.60)), (0.56, (0.12, 0.45, 0.72))])
    biome_n = g.noise(g.vadd(p, (1.0, 8.0, 2.0)), 3.0, 6.0, 0.6)
    x, y, z = g.xyz()
    lat = g.math("ABSOLUTE", y)
    dry = g.math("MULTIPLY_ADD", g.math("SUBTRACT", biome_n, 0.5), 0.9, g.maprange(lat, 0.05, 0.45, 0.65, 0.2))
    land_col = g.ramp(dry, [(0.25, (0.16, 0.42, 0.16)), (0.45, (0.30, 0.55, 0.22)), (0.6, (0.62, 0.55, 0.32)), (0.75, (0.80, 0.68, 0.45))])
    col = g.mix(land, depth, land_col)
    caps = g.polar(0.80, 0.84, 0.08)
    col = g.mix(caps, col, (0.95, 0.97, 1.0))
    cloud_n = g.noise(g.vadd(p, (4.0, 9.0, 1.0)), 2.6, 8.0, 0.62, 0.6)
    clouds = g.maprange(cloud_n, 0.53, 0.68, 0.0, 0.92)
    col = g.mix(clouds, col, (1.0, 1.0, 1.0))
    h = g.math("ADD", g.math("MULTIPLY", land, 0.25), g.math("MULTIPLY", clouds, 0.35))
    rough = g.noise(None, 10.0, 8.0, 0.6)
    h = g.math("MULTIPLY_ADD", g.math("SUBTRACT", rough, 0.5), g.math("MULTIPLY", land, 0.3), h)
    spec = g.math("MULTIPLY", g.math("SUBTRACT", 1.0, land), g.math("SUBTRACT", 1.0, clouds))
    spec = g.math("MULTIPLY", spec, g.math("SUBTRACT", 1.0, caps))
    return dict(color=col, height=h, spec=spec, bump=0.35)


def p_neptune(g):
    b = g.bands(11.0, 0.35, 2.5, 27.0, 0.4, 5.0)
    col = g.ramp(b, [(0.0, (0.12, 0.24, 0.72)), (0.5, (0.20, 0.37, 0.88)), (0.85, (0.30, 0.50, 0.96)), (1.0, (0.42, 0.62, 0.99))])
    spot = g.ellipse(0.30, -0.28, 0.24, 0.13, 0.5)
    col = g.mix(g.math("MULTIPLY", spot, 0.85), col, (0.06, 0.10, 0.38))
    streak_n = g.noise(g.vadd(g.coord(), (3.0, 2.0, 0.0)), 3.0, 6.0, 0.6)
    _, y, _ = g.xyz()
    streak = g.math("MULTIPLY", g.maprange(streak_n, 0.62, 0.72, 0.0, 0.85),
                    g.maprange(g.math("ABSOLUTE", g.math("SUBTRACT", y, -0.05)), 0.07, 0.03, 0.0, 1.0))
    streak2 = g.math("MULTIPLY", g.maprange(streak_n, 0.6, 0.7, 0.0, 0.7),
                     g.maprange(g.math("ABSOLUTE", g.math("SUBTRACT", y, -0.45)), 0.05, 0.02, 0.0, 1.0))
    col = g.mix(g.math("ADD", streak, streak2), col, (0.85, 0.92, 1.0))
    return dict(color=col, height=b, bump=0.05)


def p_uranus(g):
    b = g.bands(7.0, 0.25, 2.0, 19.0, 0.3, 8.0)
    col = g.ramp(b, [(0.0, (0.48, 0.80, 0.84)), (0.5, (0.58, 0.87, 0.89)), (1.0, (0.70, 0.93, 0.94))])
    caps = g.polar(0.55, 0.95, 0.02)
    col = g.mix(g.math("MULTIPLY", caps, 0.5), col, (0.85, 0.98, 0.98))
    return dict(color=col, height=b, bump=0.04)


def p_saturn(g):
    b = g.bands(14.0, 0.25, 2.5, 33.0, 0.45, 2.0)
    col = g.ramp(b, [(0.0, (0.72, 0.56, 0.34)), (0.35, (0.84, 0.70, 0.46)), (0.65, (0.92, 0.81, 0.58)), (1.0, (0.97, 0.89, 0.70))])
    _, y, _ = g.xyz()
    pole = g.maprange(g.math("ABSOLUTE", y), 0.7, 0.95, 0.0, 0.5)
    col = g.mix(pole, col, (0.62, 0.62, 0.55))
    return dict(color=col, height=b, bump=0.05)


def p_jupiter(g):
    b = g.bands(13.0, 0.55, 3.0, 31.0, 0.5, 6.0, 7.0)
    turb = g.noise(None, 6.0, 8.0, 0.65, 2.0)
    t = g.math("MULTIPLY_ADD", g.math("SUBTRACT", turb, 0.5), 0.35, b)
    col = g.ramp(t, [(0.0, (0.48, 0.30, 0.19)), (0.25, (0.70, 0.46, 0.28)), (0.5, (0.86, 0.68, 0.48)),
                     (0.75, (0.95, 0.88, 0.74)), (1.0, (0.99, 0.95, 0.86))])
    spot = g.ellipse(0.32, -0.36, 0.27, 0.15, 0.55)
    spot_core = g.ellipse(0.32, -0.36, 0.19, 0.10, 0.6)
    col = g.mix(g.math("MULTIPLY", spot, 0.7), col, (0.95, 0.85, 0.72))
    col = g.mix(g.math("MULTIPLY", spot_core, 0.95), col, (0.80, 0.36, 0.20))
    return dict(color=col, height=t, bump=0.08)


def p_sun(g):
    gran = g.voronoi(None, 13.0, 1.0)
    big = g.noise(None, 2.5, 6.0, 0.55, 0.8)
    t = g.math("MULTIPLY_ADD", g.math("SUBTRACT", gran, 0.4), 0.22, big)
    col = g.ramp(t, [(0.25, (0.98, 0.50, 0.08)), (0.45, (1.0, 0.72, 0.18)), (0.65, (1.0, 0.88, 0.40)), (0.85, (1.0, 0.97, 0.75))])
    spots = g.math("ADD", g.ellipse(-0.35, 0.18, 0.08, 0.05, 0.7), g.ellipse(0.42, -0.3, 0.06, 0.04, 0.7))
    col = g.mix(g.math("MULTIPLY", spots, 0.8), col, (0.62, 0.22, 0.04))
    return dict(color=col, height=t, bump=0.15)


PLANETS = [
    ("asteroid", p_asteroid),
    ("moon", p_moon),
    ("mercury", p_mercury),
    ("mars", p_mars),
    ("venus", p_venus),
    ("earth", p_earth),
    ("neptune", p_neptune),
    ("uranus", p_uranus),
    ("saturn", p_saturn),
    ("jupiter", p_jupiter),
    ("sun", p_sun),
]


# --------------------------------------------------------------------------
# Scene setup and rendering
# --------------------------------------------------------------------------
def reset_scene(res, ortho):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = SAMPLES
    s.cycles.use_denoising = False
    s.cycles.max_bounces = 4
    s.render.resolution_x = s.render.resolution_y = res
    s.render.resolution_percentage = 100
    s.render.film_transparent = True
    s.render.filter_size = 1.2
    s.view_settings.view_transform = "Standard"
    s.render.image_settings.file_format = "OPEN_EXR"
    s.render.image_settings.color_depth = "32"
    s.render.image_settings.color_management = "FOLLOW_SCENE"
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.ortho_scale = ortho
    cam_obj = bpy.data.objects.new("cam", cam)
    cam_obj.location = (0, 0, 20)
    s.collection.objects.link(cam_obj)
    s.camera = cam_obj
    world = bpy.data.worlds.new("w")
    s.world = world
    return s


def make_sphere(name, lumpy=False):
    if lumpy:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=6, radius=1.0)
        obj = bpy.context.object
        tex = bpy.data.textures.new("lump", "CLOUDS")
        tex.noise_scale = 0.75
        tex.noise_depth = 2
        mod = obj.modifiers.new("disp", "DISPLACE")
        mod.texture = tex
        mod.texture_coords = "OBJECT"
        mod.strength = 0.42
        mod.mid_level = 0.5
        bpy.ops.object.modifier_apply(modifier="disp")
        # Fit the rock inside the unit circle as seen by the camera.
        r = max(math.hypot(v.co.x, v.co.y) for v in obj.data.vertices)
        obj.scale = (1 / r, 1 / r, 1 / r)
        bpy.ops.object.transform_apply(scale=True)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=1.0)
        obj = bpy.context.object
    bpy.ops.object.shade_smooth()
    obj.name = name
    return obj


def render_exr(path):
    s = bpy.context.scene
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    bpy.data.images.remove(img)
    return px


def unpremultiply(px):
    a = px[..., 3:4]
    rgb = np.where(a > 1e-4, px[..., :3] / np.maximum(a, 1e-4), 0.0)
    return rgb, a[..., 0]


def save_png(path, rgba):
    from PIL import Image
    data = np.clip(rgba * 255.0 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(data, "RGBA").save(path, optimize=True)


def emission_material(name, builder, mode):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    g = Graph(mat)
    info = builder(g)
    em = g.node("ShaderNodeEmission")
    out = g.node("ShaderNodeOutputMaterial")
    g.link(em.outputs[0], out.inputs["Surface"])
    if mode == "albedo":
        g.link(info["color"], em.inputs["Color"])
    elif mode == "normal":
        bump = g.node("ShaderNodeBump")
        g.link(info.get("bump", 0.3), bump.inputs["Strength"])
        g.link(0.08, bump.inputs["Distance"])
        g.link(info["height"], bump.inputs["Height"])
        enc = g.vmath("MULTIPLY_ADD", bump.outputs["Normal"], (0.5, 0.5, 0.5), (0.5, 0.5, 0.5))
        g.link(enc, em.inputs["Color"])
    elif mode == "spec":
        g.link(info.get("spec", 0.0), em.inputs["Color"])
    return mat


def render_planet(name, builder):
    passes = {}
    for mode in ("albedo", "normal", "spec"):
        if mode == "spec" and name != "earth":
            continue
        reset_scene(RES, 2.0)
        obj = make_sphere(name, lumpy=(name == "asteroid"))
        obj.data.materials.append(emission_material(f"{name}_{mode}", builder, mode))
        passes[mode] = render_exr(os.path.join(TMP, f"{name}_{mode}.exr"))

    albedo, alpha = unpremultiply(passes["albedo"])
    normal, _ = unpremultiply(passes["normal"])
    # Re-normalise the decoded normal and re-encode.
    n = normal * 2.0 - 1.0
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-5)
    normal = n * 0.5 + 0.5
    spec = np.zeros_like(alpha)
    if "spec" in passes:
        spec_rgb, _ = unpremultiply(passes["spec"])
        spec = spec_rgb[..., 0]
    a = alpha[..., None]
    save_png(os.path.join(OUT, f"{name}.png"), np.concatenate([albedo, a], -1))
    # Normal maps are fully opaque (coverage comes from the albedo) so texture
    # importers never touch the RGB of transparent texels.
    flat = np.array([0.5, 0.5, 1.0], dtype=np.float32)
    normal = np.where(a > 0.02, normal, flat)
    save_png(os.path.join(OUT, f"{name}_n.png"), np.concatenate([normal, np.ones_like(a)], -1))
    if "spec" in passes:
        s3 = np.repeat(spec[..., None], 3, -1)
        save_png(os.path.join(OUT, f"{name}_s.png"), np.concatenate([s3, np.ones_like(a)], -1))
    print(f"[planets] {name} done")


def render_rings():
    """Lit Saturn ring overlay; the planet is a holdout so the far side is hidden."""
    ortho = 3.9
    res = int(round(RES * ortho / 2.0))
    s = reset_scene(res, ortho)
    s.cycles.samples = 128
    s.world.use_nodes = True
    bg = s.world.node_tree.nodes.get("Background")
    bg.inputs[1].default_value = 0.0

    planet = make_sphere("saturn_holdout")
    hold = bpy.data.materials.new("holdout")
    hold.use_nodes = True
    hnt = hold.node_tree
    hnt.nodes.clear()
    h = hnt.nodes.new("ShaderNodeHoldout")
    o = hnt.nodes.new("ShaderNodeOutputMaterial")
    hnt.links.new(h.outputs[0], o.inputs["Surface"])
    planet.data.materials.append(hold)

    # Flat annulus in the XY plane.
    seg = 256
    verts, faces = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        verts.append((1.85 * math.cos(a), 1.85 * math.sin(a), 0.0))
        verts.append((1.24 * math.cos(a), 1.24 * math.sin(a), 0.0))
    for i in range(seg):
        j = (i + 1) % seg
        faces.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
    mesh = bpy.data.meshes.new("ring")
    mesh.from_pydata(verts, [], faces)
    ring = bpy.data.objects.new("ring", mesh)
    s.collection.objects.link(ring)
    # Tip the ring towards the camera, then roll it slightly for a livelier silhouette.
    from mathutils import Euler
    ring.rotation_mode = "QUATERNION"
    ring.rotation_quaternion = (Euler((0, 0, math.radians(-14))).to_quaternion()
                                @ Euler((math.radians(-74), 0, 0)).to_quaternion())

    mat = bpy.data.materials.new("ring")
    mat.use_nodes = True
    g = Graph(mat)
    r = g.vmath("LENGTH", g.coord())
    t = g.maprange(r, 1.24, 1.85, 0.0, 1.0)
    fine = g.noise(g.combine(r, 0.0, 0.0), 40.0, 2.0, 0.5)
    t2 = g.math("MULTIPLY_ADD", g.math("SUBTRACT", fine, 0.5), 0.06, t)
    col = g.ramp(t2, [(0.0, (0.55, 0.47, 0.36)), (0.25, (0.80, 0.70, 0.52)), (0.55, (0.95, 0.88, 0.70)),
                      (0.62, (0.90, 0.82, 0.64)), (0.9, (0.78, 0.68, 0.52)), (1.0, (0.70, 0.62, 0.48))])
    dens = g.gray(g.ramp(t, [(0.0, 0.0), (0.04, 0.35), (0.25, 0.75), (0.56, 0.95), (0.585, 0.08),
                             (0.63, 0.05), (0.66, 0.85), (0.9, 0.8), (0.955, 0.5), (1.0, 0.0)]))
    dens = g.math("MULTIPLY_ADD", g.math("SUBTRACT", fine, 0.5), 0.35, dens)
    dens = g.math("MULTIPLY", dens, 1.0, clamp=True)
    diff = g.node("ShaderNodeBsdfDiffuse")
    g.link(col, diff.inputs["Color"])
    em = g.node("ShaderNodeEmission")
    g.link(col, em.inputs["Color"])
    g.link(0.32, em.inputs["Strength"])
    add = g.node("ShaderNodeAddShader")
    g.link(diff.outputs[0], add.inputs[0])
    g.link(em.outputs[0], add.inputs[1])
    tr = g.node("ShaderNodeBsdfTransparent")
    mix = g.node("ShaderNodeMixShader")
    g.link(dens, mix.inputs[0])
    g.link(tr.outputs[0], mix.inputs[1])
    g.link(add.outputs[0], mix.inputs[2])
    out = g.node("ShaderNodeOutputMaterial")
    g.link(mix.outputs[0], out.inputs["Surface"])
    ring.data.materials.append(mat)

    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    sun.angle = math.radians(3)
    sun_obj = bpy.data.objects.new("sun", sun)
    s.collection.objects.link(sun_obj)
    from mathutils import Vector
    d = Vector(LIGHT_DIR).normalized()
    sun_obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()

    px = render_exr(os.path.join(TMP, "saturn_ring.exr"))
    rgb, a = unpremultiply(px)
    # Standard view transform: linear -> sRGB.
    srgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(np.maximum(rgb, 0), 1 / 2.4) - 0.055)
    save_png(os.path.join(OUT, "saturn_ring.png"), np.concatenate([srgb, a[..., None]], -1))
    print("[planets] saturn ring done")


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    for name, builder in PLANETS:
        if not only or name in only:
            render_planet(name, builder)
    if not only or "ring" in only:
        render_rings()


if __name__ == "__main__":
    main()
