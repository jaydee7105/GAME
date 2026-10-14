class_name Starfield
extends Node2D
## Twinkling stars and the occasional shooting star over the nebula.

const COUNT := 70

var area := Vector2(720, 1280)
var _stars := []
var _time := 0.0
var _meteor_in := 4.0
var _meteor := {}
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	_generate()


func set_area(a: Vector2) -> void:
	area = a
	_generate()


func _generate() -> void:
	_stars.clear()
	for i in COUNT:
		_stars.append({
			"p": Vector2(_rng.randf() * area.x, _rng.randf() * area.y),
			"r": _rng.randf_range(0.8, 2.3),
			"s": _rng.randf_range(0.6, 2.2),
			"o": _rng.randf() * TAU,
			"c": [Color(1, 1, 1), Color(0.8, 0.88, 1.0), Color(1.0, 0.92, 0.8)][_rng.randi() % 3],
		})


func _process(delta: float) -> void:
	_time += delta
	_meteor_in -= delta
	if _meteor_in <= 0.0 and _meteor.is_empty():
		_meteor = {
			"p": Vector2(_rng.randf_range(area.x * 0.2, area.x * 1.1), _rng.randf_range(-20, area.y * 0.35)),
			"v": Vector2(-1, 0.45).normalized() * _rng.randf_range(700, 1000),
			"t": 0.0,
		}
		_meteor_in = _rng.randf_range(6.0, 14.0)
	if not _meteor.is_empty():
		_meteor.t += delta
		_meteor.p += _meteor.v * delta
		if _meteor.t > 1.2:
			_meteor = {}
	queue_redraw()


func _draw() -> void:
	for s in _stars:
		var tw: float = 0.55 + 0.45 * sin(_time * s.s + s.o)
		var c: Color = s.c
		c.a = 0.35 + 0.65 * tw
		var r: float = s.r * (0.8 + 0.3 * tw)
		draw_circle(s.p, r * 2.4, Color(c, c.a * 0.12), true, -1.0, true)
		draw_circle(s.p, r, c, true, -1.0, true)
		if s.r > 2.0:
			var len := r * 4.0 * tw
			draw_line(s.p - Vector2(len, 0), s.p + Vector2(len, 0), Color(c, c.a * 0.5), 1.0, true)
			draw_line(s.p - Vector2(0, len), s.p + Vector2(0, len), Color(c, c.a * 0.5), 1.0, true)
	if not _meteor.is_empty():
		var a := sin(clampf(_meteor.t / 1.2, 0.0, 1.0) * PI)
		var head: Vector2 = _meteor.p
		var tail: Vector2 = head - (_meteor.v as Vector2).normalized() * 160.0
		var pts := PackedVector2Array([tail, head])
		var cols := PackedColorArray([Color(1, 1, 1, 0), Color(1, 1, 1, 0.85 * a)])
		draw_polyline_colors(pts, cols, 2.5, true)
		draw_circle(head, 2.5, Color(1, 1, 1, a), true, -1.0, true)
