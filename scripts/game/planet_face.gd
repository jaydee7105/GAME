class_name PlanetFace
extends Node2D
## A small, expressive cartoon face drawn on top of a planet.

enum Mood { NORMAL, HAPPY, WORRIED, SLEEPY, AMAZED }

const INK := Color(0.12, 0.08, 0.16)
const BLUSH := Color(1.0, 0.42, 0.55, 0.38)
const TONGUE := Color(1.0, 0.45, 0.5)

var radius := 20.0:
	set(v):
		radius = v
		queue_redraw()
var mood := Mood.NORMAL:
	set(v):
		if mood != v:
			mood = v
			queue_redraw()

var _blink_in := 0.0
var _blink_left := 0.0
var _happy_left := 0.0
var _amazed_left := 0.0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	_blink_in = _rng.randf_range(1.0, 5.0)


## Shows a happy face for a moment (after merging, for example).
func cheer(seconds: float = 1.2) -> void:
	_happy_left = seconds
	queue_redraw()


## Shows a surprised face for a moment (shaken, swallowed...).
func surprise(seconds: float = 1.2) -> void:
	_amazed_left = seconds
	queue_redraw()


func _process(delta: float) -> void:
	var was_closed := _blink_left > 0.0
	var was_happy := _happy_left > 0.0
	var was_amazed := _amazed_left > 0.0
	_happy_left = maxf(_happy_left - delta, 0.0)
	_amazed_left = maxf(_amazed_left - delta, 0.0)
	if _blink_left > 0.0:
		_blink_left -= delta
	else:
		_blink_in -= delta
		if _blink_in <= 0.0:
			_blink_left = 0.12
			_blink_in = _rng.randf_range(2.0, 6.0)
	if was_closed != (_blink_left > 0.0) or was_happy != (_happy_left > 0.0) or was_amazed != (_amazed_left > 0.0):
		queue_redraw()


func _draw() -> void:
	var r := radius
	var current := mood
	if _amazed_left > 0.0:
		current = Mood.AMAZED
	elif _happy_left > 0.0:
		current = Mood.HAPPY
	var ex := r * 0.33
	var ey := -r * 0.04
	var eh := r * 0.17
	var ew := r * 0.13
	var line := maxf(r * 0.065, 1.4)

	# Cheeks.
	for side in [-1.0, 1.0]:
		_ellipse(Vector2(side * r * 0.52, r * 0.17), Vector2(r * 0.12, r * 0.075), BLUSH)

	# Eyes.
	for side in [-1.0, 1.0]:
		var c := Vector2(side * ex, ey)
		if current == Mood.HAPPY:
			draw_arc(c + Vector2(0, eh * 0.35), ew * 1.15, PI * 1.12, PI * 1.88, 12, INK, line, true)
		elif current == Mood.SLEEPY or (_blink_left > 0.0 and current != Mood.AMAZED):
			draw_arc(c + Vector2(0, -eh * 0.2), ew * 1.05, PI * 0.15, PI * 0.85, 12, INK, line, true)
		else:
			var size := Vector2(ew, eh)
			if current == Mood.AMAZED:
				size *= 1.18
			_ellipse(c, size, INK)
			_ellipse(c + Vector2(-ew * 0.3, -eh * 0.38), Vector2(ew, ew) * 0.42, Color.WHITE)
			_ellipse(c + Vector2(ew * 0.35, eh * 0.35), Vector2(ew, ew) * 0.18, Color(1, 1, 1, 0.8))
			if current == Mood.WORRIED:
				# Worried brows.
				var b0 := c + Vector2(-side * ew * 1.3, -eh * 1.55)
				var b1 := c + Vector2(side * ew * 0.9, -eh * 1.9)
				draw_line(b0, b1, INK, line * 0.85, true)

	# Mouth.
	var m := Vector2(0, r * 0.2)
	match current:
		Mood.HAPPY:
			var pts := PackedVector2Array()
			var w := r * 0.17
			for i in 13:
				var a := PI * i / 12.0
				pts.append(m + Vector2(cos(a) * w, sin(a) * w * 0.95 - w * 0.12))
			draw_colored_polygon(pts, INK)
			_ellipse(m + Vector2(0, w * 0.5), Vector2(w * 0.55, w * 0.28), TONGUE)
		Mood.WORRIED:
			var pts := PackedVector2Array()
			var w := r * 0.15
			for i in 9:
				var t := i / 8.0
				pts.append(m + Vector2(lerpf(-w, w, t), sin(t * TAU) * w * 0.18 + w * 0.15))
			draw_polyline(pts, INK, line * 0.9, true)
		Mood.AMAZED:
			_ellipse(m + Vector2(0, r * 0.03), Vector2(r * 0.07, r * 0.09), INK)
		Mood.SLEEPY:
			draw_line(m + Vector2(-r * 0.07, r * 0.03), m + Vector2(r * 0.07, r * 0.03), INK, line * 0.9, true)
		_:
			draw_arc(m + Vector2(0, -r * 0.06), r * 0.12, PI * 0.18, PI * 0.82, 12, INK, line, true)


func _ellipse(center: Vector2, size: Vector2, color: Color) -> void:
	var pts := PackedVector2Array()
	var n := 20
	for i in n:
		var a := TAU * i / n
		pts.append(center + Vector2(cos(a) * size.x, sin(a) * size.y))
	draw_colored_polygon(pts, color)
	# Soft edge.
	pts.append(pts[0])
	draw_polyline(pts, color, 1.0, true)
