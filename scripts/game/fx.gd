class_name Fx
## One-shot visual effects: particle bursts, shockwaves, floating text.

static var _dot: Texture2D
static var _spark: Texture2D


static func dot_texture() -> Texture2D:
	if _dot == null:
		var g := Gradient.new()
		g.offsets = PackedFloat32Array([0.0, 0.35, 1.0])
		g.colors = PackedColorArray([Color(1, 1, 1, 1), Color(1, 1, 1, 0.7), Color(1, 1, 1, 0)])
		var t := GradientTexture2D.new()
		t.gradient = g
		t.fill = GradientTexture2D.FILL_RADIAL
		t.fill_from = Vector2(0.5, 0.5)
		t.fill_to = Vector2(1.0, 0.5)
		t.width = 32
		t.height = 32
		_dot = t
	return _dot


## Colourful particle burst.
static func burst(parent: Node, pos: Vector2, color: Color, amount: int = 24,
		speed: float = 260.0, size: float = 1.0, lifetime: float = 0.7) -> void:
	var p := CPUParticles2D.new()
	p.position = pos
	p.one_shot = true
	p.explosiveness = 0.95
	p.amount = amount
	p.lifetime = lifetime
	p.texture = dot_texture()
	p.direction = Vector2(0, -1)
	p.spread = 180.0
	p.gravity = Vector2(0, 280)
	p.initial_velocity_min = speed * 0.35
	p.initial_velocity_max = speed
	p.damping_min = speed * 0.6
	p.damping_max = speed * 1.1
	p.scale_amount_min = 0.25 * size
	p.scale_amount_max = 0.7 * size
	var curve := Curve.new()
	curve.add_point(Vector2(0, 1))
	curve.add_point(Vector2(1, 0))
	p.scale_amount_curve = curve
	var ramp := Gradient.new()
	ramp.offsets = PackedFloat32Array([0.0, 0.2, 1.0])
	ramp.colors = PackedColorArray([Color.WHITE, color.lightened(0.25), Color(color, 0.0)])
	p.color_ramp = ramp
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	p.material = mat
	parent.add_child(p)
	p.emitting = true
	p.finished.connect(p.queue_free)


static func shockwave(parent: Node, pos: Vector2, radius: float, color: Color,
		width: float = 6.0, duration: float = 0.45) -> void:
	var s := Shockwave.new()
	s.position = pos
	s.max_radius = radius
	s.color = color
	s.width = width
	parent.add_child(s)
	var t := s.create_tween()
	t.tween_property(s, "progress", 1.0, duration).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	t.tween_callback(s.queue_free)


static func float_text(parent: Node, pos: Vector2, text: String, color: Color,
		font_size: int = 34, rise: float = 70.0, duration: float = 0.9) -> Label:
	var l := Label.new()
	l.text = text
	l.label_settings = Ui.label_settings(font_size, color, 700, 8, Color(0.06, 0.03, 0.14, 0.9))
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.size = Vector2(400, font_size * 1.6)
	l.position = pos - l.size * 0.5
	l.pivot_offset = l.size * 0.5
	l.scale = Vector2(0.4, 0.4)
	l.z_index = 50
	parent.add_child(l)
	var t := l.create_tween().set_parallel(true)
	t.tween_property(l, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(l, "position:y", l.position.y - rise, duration).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	t.tween_property(l, "modulate:a", 0.0, duration * 0.4).set_delay(duration * 0.6)
	t.chain().tween_callback(l.queue_free)
	return l


class Shockwave extends Node2D:
	var max_radius := 100.0
	var color := Color.WHITE
	var width := 6.0
	var progress := 0.0:
		set(v):
			progress = v
			queue_redraw()

	func _draw() -> void:
		var r := max_radius * (0.25 + 0.75 * progress)
		var c := color
		c.a *= 1.0 - progress
		draw_arc(Vector2.ZERO, r, 0.0, TAU, 64, c, maxf(width * (1.0 - progress), 1.0), true)
		var inner := c
		inner.a *= 0.35
		draw_arc(Vector2.ZERO, r * 0.82, 0.0, TAU, 64, inner, maxf(width * 0.5 * (1.0 - progress), 1.0), true)


## Swirling black hole used by the Black Hole power-up.
class BlackHole extends Node2D:
	var radius := 60.0
	var spin := 0.0
	var strength := 0.0:
		set(v):
			strength = v
			queue_redraw()

	func _process(delta: float) -> void:
		spin += delta * 7.0
		queue_redraw()

	func _draw() -> void:
		var r := radius * strength
		if r < 0.5:
			return
		# Glow.
		for i in 6:
			var k := 1.0 + i * 0.22
			draw_circle(Vector2.ZERO, r * k, Color(0.55, 0.25, 0.95, 0.10 * (1.0 - i / 6.0)), true, -1.0, true)
		# Accretion arms.
		for arm in 3:
			var pts := PackedVector2Array()
			for i in 24:
				var t := i / 23.0
				var a := spin + arm * TAU / 3.0 + t * 4.2
				var rr := r * lerpf(1.35, 0.45, t)
				pts.append(Vector2(cos(a), sin(a)) * rr)
			draw_polyline(pts, Color(1.0, 0.62, 0.3, 0.75), maxf(r * 0.09, 1.5), true)
		draw_circle(Vector2.ZERO, r * 0.55, Color(0.02, 0.0, 0.05), true, -1.0, true)
		draw_arc(Vector2.ZERO, r * 0.58, 0.0, TAU, 48, Color(1.0, 0.85, 0.6, 0.9), maxf(r * 0.05, 1.0), true)
