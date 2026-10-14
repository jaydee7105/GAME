"""Deep-space nebula backdrop for Planet Drop (portrait, 1080x1920).

    python art/blender/background.py

A flat emission plane shaded with layered procedural noise: a dark indigo
gradient, two soft nebula clouds and a sprinkle of faint stars. Kept dim on
purpose so the planets always pop. Bright twinkling stars are added in-game.
"""

import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from planets import Graph, ROOT, TMP, render_exr, save_png  # noqa: E402

W, H = 1080, 1920


def build(g):
    x, y, z = g.xyz()
    # Vertical gradient: slightly lighter, warmer at the top.
    grad = g.maprange(y, -0.9, 0.9, 0.0, 1.0)
    col = g.mix(grad, (0.035, 0.030, 0.095), (0.085, 0.050, 0.175))

    p = g.coord()
    warp = g.vscale(g.noise_vec(p, 0.9, 4.0, 0.55), 0.45)
    pw = g.vadd(p, warp)

    neb1 = g.noise(g.vadd(pw, (3.0, 1.0, 0.0)), 1.1, 8.0, 0.62)
    m1 = g.maprange(neb1, 0.46, 0.74, 0.0, 1.0)
    m1 = g.math("MULTIPLY", m1, g.maprange(y, -0.2, 0.7, 0.25, 1.0))
    col = g.mix(g.math("MULTIPLY", m1, 0.85), col, (0.50, 0.14, 0.55), "SCREEN")

    neb2 = g.noise(g.vadd(pw, (9.0, 4.0, 2.0)), 1.4, 8.0, 0.6)
    m2 = g.maprange(neb2, 0.47, 0.76, 0.0, 1.0)
    m2 = g.math("MULTIPLY", m2, g.maprange(y, 0.5, -0.8, 0.2, 1.0))
    col = g.mix(g.math("MULTIPLY", m2, 0.8), col, (0.06, 0.36, 0.58), "SCREEN")

    # Dark dust lanes add depth.
    dust = g.noise(g.vadd(pw, (1.0, 7.0, 5.0)), 2.6, 8.0, 0.6)
    dm = g.maprange(dust, 0.58, 0.78, 0.0, 0.45)
    col = g.mix(dm, col, (0.01, 0.01, 0.03))

    # Faint stars: tiny voronoi cells, kept sparse.
    for scale, thr, bright in ((70.0, 0.11, 0.9), (140.0, 0.12, 0.55)):
        d = g.voronoi(g.vadd(p, (scale, 0, 0)), scale, 1.0)
        star = g.maprange(d, thr, 0.0, 0.0, bright)
        keep = g.maprange(g.noise(None, scale * 0.37, 0.0, 0.5), 0.58, 0.6, 0.0, 1.0)
        col = g.mix(g.math("MULTIPLY", star, keep), col, (0.9, 0.92, 1.0), "ADD")
    return col


def main():
    os.makedirs(TMP, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = 16
    s.render.resolution_x, s.render.resolution_y = W, H
    s.render.film_transparent = False
    s.view_settings.view_transform = "Standard"
    s.render.image_settings.file_format = "OPEN_EXR"
    s.render.image_settings.color_depth = "32"
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.ortho_scale = 2.0  # spans y in [-1, 1]
    cam_obj = bpy.data.objects.new("cam", cam)
    cam_obj.location = (0, 0, 5)
    s.collection.objects.link(cam_obj)
    s.camera = cam_obj
    s.world = bpy.data.worlds.new("w")

    bpy.ops.mesh.primitive_plane_add(size=2.0)
    plane = bpy.context.object
    plane.scale = (W / H, 1.0, 1.0)
    bpy.ops.object.transform_apply(scale=True)  # keep the noise isotropic
    mat = bpy.data.materials.new("bg")
    mat.use_nodes = True
    g = Graph(mat)
    em = g.node("ShaderNodeEmission")
    out = g.node("ShaderNodeOutputMaterial")
    g.link(build(g), em.inputs["Color"])
    g.link(em.outputs[0], out.inputs["Surface"])
    plane.data.materials.append(mat)

    px = render_exr(os.path.join(TMP, "background.exr"))
    rgb = np.clip(px[..., :3], 0, 1)
    out_dir = os.path.join(ROOT, "public", "assets", "bg")
    os.makedirs(out_dir, exist_ok=True)
    from PIL import Image
    Image.fromarray((rgb * 255 + 0.5).astype(np.uint8), "RGB").save(
        os.path.join(out_dir, "space.jpg"), quality=92)
    print("[background] done")


if __name__ == "__main__":
    main()
