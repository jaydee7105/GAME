class_name UiIcon
extends Control
## Crisp vector icons drawn in code, so they look sharp on any screen.

@export var kind := "pause":
	set(v):
		kind = v
		queue_redraw()
@export var color := Color.WHITE:
	set(v):
		color = v
		queue_redraw()
## Icon size as a fraction of the control's smaller side.
@export var fill := 0.46


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)


func _draw() -> void:
	var c := size * 0.5
	var s := minf(size.x, size.y) * fill * 0.5
	var w := maxf(s * 0.2, 2.0)
	match kind:
		"pause":
			_rrect(Rect2(c + Vector2(-s * 0.62, -s * 0.8), Vector2(s * 0.42, s * 1.6)), s * 0.14)
			_rrect(Rect2(c + Vector2(s * 0.2, -s * 0.8), Vector2(s * 0.42, s * 1.6)), s * 0.14)
		"play":
			_poly([c + Vector2(-s * 0.55, -s * 0.85), c + Vector2(s * 0.85, 0), c + Vector2(-s * 0.55, s * 0.85)])
		"close":
			draw_line(c + Vector2(-s, -s) * 0.7, c + Vector2(s, s) * 0.7, color, w * 1.1, true)
			draw_line(c + Vector2(s, -s) * 0.7, c + Vector2(-s, s) * 0.7, color, w * 1.1, true)
		"back":
			draw_polyline(PackedVector2Array([c + Vector2(s * 0.3, -s * 0.8), c + Vector2(-s * 0.5, 0), c + Vector2(s * 0.3, s * 0.8)]), color, w * 1.1, true)
		"home":
			_poly([c + Vector2(0, -s), c + Vector2(s, -s * 0.05), c + Vector2(-s, -s * 0.05)])
			_rrect(Rect2(c + Vector2(-s * 0.7, -s * 0.15), Vector2(s * 1.4, s * 1.05)), s * 0.12)
			_rrect(Rect2(c + Vector2(-s * 0.2, s * 0.3), Vector2(s * 0.4, s * 0.6)), s * 0.08, Color(0, 0, 0, 0.35))
		"retry":
			draw_arc(c, s * 0.75, -PI * 0.35, PI * 1.45, 32, color, w, true)
			var tip := c + Vector2(cos(-PI * 0.35), sin(-PI * 0.35)) * s * 0.75
			_poly([tip + Vector2(-s * 0.45, -s * 0.12), tip + Vector2(s * 0.12, -s * 0.48), tip + Vector2(s * 0.18, s * 0.2)])
		"gear":
			for i in 8:
				var a := TAU * i / 8.0
				var d := Vector2(cos(a), sin(a))
				draw_line(c + d * s * 0.55, c + d * s * 0.95, color, s * 0.32, true)
			draw_circle(c, s * 0.68, color, true, -1.0, true)
			draw_circle(c, s * 0.28, Color(0, 0, 0, 0.45), true, -1.0, true)
		"music":
			draw_line(c + Vector2(-s * 0.25, s * 0.55), c + Vector2(-s * 0.25, -s * 0.8), color, w, true)
			draw_line(c + Vector2(s * 0.65, s * 0.35), c + Vector2(s * 0.65, -s), color, w, true)
			_poly([c + Vector2(-s * 0.25 - w * 0.5, -s * 0.8), c + Vector2(s * 0.65 + w * 0.5, -s), c + Vector2(s * 0.65 + w * 0.5, -s * 0.6), c + Vector2(-s * 0.25 - w * 0.5, -s * 0.4)])
			_ellipse(c + Vector2(-s * 0.5, s * 0.6), Vector2(s * 0.34, s * 0.26))
			_ellipse(c + Vector2(s * 0.4, s * 0.4), Vector2(s * 0.34, s * 0.26))
		"sound":
			_poly([c + Vector2(-s, -s * 0.35), c + Vector2(-s * 0.45, -s * 0.35), c + Vector2(s * 0.1, -s * 0.85),
				c + Vector2(s * 0.1, s * 0.85), c + Vector2(-s * 0.45, s * 0.35), c + Vector2(-s, s * 0.35)])
			draw_arc(c + Vector2(s * 0.15, 0), s * 0.45, -PI * 0.3, PI * 0.3, 12, color, w * 0.8, true)
			draw_arc(c + Vector2(s * 0.15, 0), s * 0.8, -PI * 0.3, PI * 0.3, 16, color, w * 0.8, true)
		"vibrate":
			_rrect(Rect2(c + Vector2(-s * 0.42, -s * 0.85), Vector2(s * 0.84, s * 1.7)), s * 0.16)
			_rrect(Rect2(c + Vector2(-s * 0.28, -s * 0.65), Vector2(s * 0.56, s * 1.2)), s * 0.06, Color(0, 0, 0, 0.4))
			for side in [-1.0, 1.0]:
				draw_line(c + Vector2(side * s * 0.65, -s * 0.4), c + Vector2(side * s * 0.65, s * 0.4), color, w * 0.7, true)
				draw_line(c + Vector2(side * s * 0.88, -s * 0.25), c + Vector2(side * s * 0.88, s * 0.25), color, w * 0.7, true)
		"face":
			draw_arc(c, s * 0.9, 0, TAU, 32, color, w * 0.8, true)
			draw_circle(c + Vector2(-s * 0.32, -s * 0.15), s * 0.13, color, true, -1.0, true)
			draw_circle(c + Vector2(s * 0.32, -s * 0.15), s * 0.13, color, true, -1.0, true)
			draw_arc(c + Vector2(0, s * 0.05), s * 0.42, PI * 0.2, PI * 0.8, 12, color, w * 0.8, true)
		"guide":
			for i in 4:
				var y := -s + i * s * 0.48
				draw_line(c + Vector2(0, y), c + Vector2(0, y + s * 0.26), color, w * 0.8, true)
			draw_arc(c + Vector2(0, s * 0.62), s * 0.38, 0, TAU, 20, color, w * 0.7, true)
		"star":
			_star(c, s, s * 0.45)
		"trophy":
			_poly([c + Vector2(-s * 0.6, -s * 0.85), c + Vector2(s * 0.6, -s * 0.85), c + Vector2(s * 0.45, -s * 0.1),
				c + Vector2(0, s * 0.2), c + Vector2(-s * 0.45, -s * 0.1)])
			draw_arc(c + Vector2(-s * 0.62, -s * 0.5), s * 0.28, PI * 0.5, PI * 1.5, 12, color, w * 0.6, true)
			draw_arc(c + Vector2(s * 0.62, -s * 0.5), s * 0.28, -PI * 0.5, PI * 0.5, 12, color, w * 0.6, true)
			draw_line(c + Vector2(0, s * 0.15), c + Vector2(0, s * 0.55), color, w, true)
			_rrect(Rect2(c + Vector2(-s * 0.45, s * 0.55), Vector2(s * 0.9, s * 0.3)), s * 0.08)
		"calendar":
			_rrect(Rect2(c + Vector2(-s * 0.85, -s * 0.65), Vector2(s * 1.7, s * 1.5)), s * 0.2)
			_rrect(Rect2(c + Vector2(-s * 0.65, -s * 0.2), Vector2(s * 1.3, s * 0.85)), s * 0.08, Color(0, 0, 0, 0.35))
			draw_line(c + Vector2(-s * 0.45, -s * 0.9), c + Vector2(-s * 0.45, -s * 0.5), color, w, true)
			draw_line(c + Vector2(s * 0.45, -s * 0.9), c + Vector2(s * 0.45, -s * 0.5), color, w, true)
		"flame":
			var pts := PackedVector2Array()
			for i in 25:
				var t := i / 24.0
				var a := lerpf(-PI * 0.5, PI * 1.5, t)
				var rr := s * (0.62 + 0.38 * pow(maxf(-sin(a), 0.0), 3.0))
				pts.append(c + Vector2(cos(a) * rr * 0.85, sin(a) * rr + s * 0.25))
			_poly(Array(pts))
		"planet":
			draw_circle(c, s * 0.6, color, true, -1.0, true)
			draw_set_transform(c, -0.35, Vector2(1.0, 0.32))
			draw_arc(Vector2.ZERO, s * 1.0, 0, TAU, 40, color, w * 0.9 / 0.32 * 0.32, true)
			draw_set_transform(Vector2.ZERO)
		"blackhole":
			for arm in 3:
				var pts := PackedVector2Array()
				for i in 16:
					var t := i / 15.0
					var a := arm * TAU / 3.0 + t * 3.6
					pts.append(c + Vector2(cos(a), sin(a)) * s * lerpf(1.0, 0.25, t))
				draw_polyline(pts, color, w * 0.75, true)
			draw_circle(c, s * 0.32, color, true, -1.0, true)
		"shake":
			_rrect(Rect2(c + Vector2(-s * 0.55, -s * 0.55), Vector2(s * 1.1, s * 1.1)), s * 0.25)
			for side in [-1.0, 1.0]:
				draw_arc(c, s * 0.95, PI * (0.5 - 0.5 * side) - 0.55, PI * (0.5 - 0.5 * side) + 0.55, 10, color, w * 0.7, true)
		"share":
			var a := c + Vector2(s * 0.55, -s * 0.6)
			var b := c + Vector2(-s * 0.55, 0)
			var d := c + Vector2(s * 0.55, s * 0.6)
			draw_line(a, b, color, w * 0.8, true)
			draw_line(b, d, color, w * 0.8, true)
			for p in [a, b, d]:
				draw_circle(p, s * 0.28, color, true, -1.0, true)
		"lock":
			draw_arc(c + Vector2(0, -s * 0.2), s * 0.42, PI, TAU, 16, color, w, true)
			draw_line(c + Vector2(-s * 0.42, -s * 0.2), c + Vector2(-s * 0.42, s * 0.05), color, w, true)
			draw_line(c + Vector2(s * 0.42, -s * 0.2), c + Vector2(s * 0.42, s * 0.05), color, w, true)
			_rrect(Rect2(c + Vector2(-s * 0.7, 0), Vector2(s * 1.4, s * 0.95)), s * 0.15)
		"info":
			draw_circle(c + Vector2(0, -s * 0.6), s * 0.17, color, true, -1.0, true)
			_rrect(Rect2(c + Vector2(-s * 0.15, -s * 0.25), Vector2(s * 0.3, s * 1.05)), s * 0.12)
		"stats":
			for i in 3:
				var h := s * (0.7 + 0.45 * i)
				_rrect(Rect2(c + Vector2(-s * 0.85 + i * s * 0.62, s * 0.85 - h), Vector2(s * 0.46, h)), s * 0.1)


func _poly(points: Array, col: Color = color) -> void:
	draw_colored_polygon(PackedVector2Array(points), col)
	var closed := PackedVector2Array(points)
	closed.append(points[0])
	draw_polyline(closed, col, 1.0, true)


func _rrect(r: Rect2, radius: float, col: Color = color) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = col
	sb.set_corner_radius_all(int(radius))
	sb.anti_aliasing = true
	draw_style_box(sb, r)


func _ellipse(center: Vector2, radii: Vector2) -> void:
	var pts := []
	for i in 20:
		var a := TAU * i / 20.0
		pts.append(center + Vector2(cos(a) * radii.x, sin(a) * radii.y))
	_poly(pts)


func _star(center: Vector2, outer: float, inner: float) -> void:
	var pts := []
	for i in 10:
		var a := -PI * 0.5 + PI * i / 5.0
		var r := outer if i % 2 == 0 else inner
		pts.append(center + Vector2(cos(a), sin(a)) * r)
	_poly(pts)
