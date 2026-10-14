class_name PromoArt
extends RefCounted
## Renders the app icon and store artwork from the game's own assets.
## Used by the capture hooks in main.gd (--scene=icon / --scene=feature).


## Renders `root` inside an offscreen viewport of the given size and saves it.
static func render(host: Node, root: Node, size: Vector2i, path: String, transparent: bool = false) -> void:
	var vp := SubViewport.new()
	vp.size = size
	vp.transparent_bg = transparent
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.msaa_2d = Viewport.MSAA_4X
	host.add_child(vp)
	vp.add_child(root)
	for i in 4:
		await RenderingServer.frame_post_draw
	vp.get_texture().get_image().save_png(path)
	print("[art] saved ", path)
	vp.queue_free()


## planet_scale: Saturn's radius as a fraction of the icon size. Adaptive
## icons need a smaller planet so the rings stay inside the safe zone.
static func icon(background: bool = true, foreground: bool = true, planet_scale: float = 0.25) -> Node2D:
	var n := IconArt.new()
	n.draw_background = background
	n.draw_planet = foreground
	n.planet_scale = planet_scale
	return n


static func feature() -> Node2D:
	return FeatureArt.new()


class IconArt extends Node2D:
	var draw_background := true
	var draw_planet := true
	var planet_scale := 0.25
	const S := 1024.0

	func _ready() -> void:
		if draw_planet:
			var v := PlanetVisual.new()
			v.setup(8, S * planet_scale)
			v.position = Vector2(S * 0.5, S * (0.5 + planet_scale * 0.12))
			v.rotation = -0.12
			add_child(v)
			v.face.mood = PlanetFace.Mood.NORMAL
			v.cheer(100.0)

	func _draw() -> void:
		if not draw_background:
			return
		var c := Vector2(S, S) * 0.5
		draw_rect(Rect2(Vector2.ZERO, Vector2(S, S)), Color("120b3a"))
		for i in 40:
			var t := 1.0 - i / 40.0
			draw_circle(c + Vector2(0, -S * 0.04), S * 0.78 * t, Color("3b2aa8").lerp(Color("6a3fd0"), 1.0 - t) * Color(1, 1, 1, 0.08))
		var rng := RandomNumberGenerator.new()
		rng.seed = 11
		for i in 46:
			var p := Vector2(rng.randf() * S, rng.randf() * S)
			if p.distance_to(c) < S * 0.36:
				continue
			var r := rng.randf_range(2.0, 6.0)
			draw_circle(p, r * 2.5, Color(1, 1, 1, 0.08), true, -1.0, true)
			draw_circle(p, r, Color(1, 1, 1, rng.randf_range(0.5, 1.0)), true, -1.0, true)


class FeatureArt extends Node2D:
	const W := 2048.0
	const H := 1000.0

	func _ready() -> void:
		var bg := Sprite2D.new()
		bg.texture = load("res://assets/bg/space.jpg")
		bg.centered = false
		var k := W / bg.texture.get_width()
		bg.scale = Vector2(k, k)
		bg.position = Vector2(0, -bg.texture.get_height() * k * 0.32)
		add_child(bg)
		var specs := [
			[10, 250.0, Vector2(1530, 560)],
			[8, 136.0, Vector2(1270, 250)],
			[9, 165.0, Vector2(1880, 210)],
			[5, 100.0, Vector2(1180, 760)],
			[3, 66.0, Vector2(1880, 840)],
			[1, 44.0, Vector2(1350, 920)],
			[6, 84.0, Vector2(1000, 560)],
		]
		for sp in specs:
			var v := PlanetVisual.new()
			v.setup(sp[0], sp[1])
			v.position = sp[2]
			v.rotation = randf_range(-0.15, 0.15)
			add_child(v)
			v.cheer(100.0)
		var title := Label.new()
		title.text = "PLANET"
		title.label_settings = Ui.label_settings(230, Color("fff3d6"), 700, 40, Color("2a1466"))
		title.position = Vector2(110, 120)
		add_child(title)
		var drop := Label.new()
		drop.text = "DROP"
		drop.label_settings = Ui.label_settings(290, Ui.ORANGE, 700, 44, Color("2a1466"))
		drop.position = Vector2(100, 330)
		add_child(drop)
		var tag := Label.new()
		tag.text = "Merge planets. Grow the Sun."
		tag.label_settings = Ui.label_settings(70, Ui.GOLD, 700, 18, Color("2a1466"))
		tag.position = Vector2(120, 760)
		add_child(tag)
