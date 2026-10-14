class_name Jar
extends Node2D
## The glass jar: physics walls, the back glass and a front layer with
## reflections and the danger line.

const INNER_W := 600.0
const INNER_H := 760.0
const CORNER := 46.0
const GLASS := 10.0
const WALL := 200.0
## Planets resting above this line (relative to the jar top) end the game.
const LINE_OFFSET := 6.0

var rect := Rect2()          # inner rectangle in world space
var danger := 0.0:           # 0..1, drives the warning
	set(v):
		danger = v
		_front.queue_redraw()
var _front: JarFront
var _body: StaticBody2D
var _time := 0.0


func _ready() -> void:
	_front = JarFront.new()
	_front.jar = self
	_front.z_index = 20
	add_child(_front)


func line_y() -> float:
	return rect.position.y + LINE_OFFSET


func place(top_left: Vector2) -> void:
	rect = Rect2(top_left, Vector2(INNER_W, INNER_H))
	_build_walls()
	queue_redraw()
	_front.queue_redraw()


func _process(delta: float) -> void:
	_time += delta
	if danger > 0.0:
		_front.queue_redraw()


func _build_walls() -> void:
	if _body:
		_body.queue_free()
	_body = StaticBody2D.new()
	var mat := PhysicsMaterial.new()
	mat.friction = 0.35
	mat.bounce = 0.05
	_body.physics_material_override = mat
	add_child(_body)
	var r := rect
	var tall := r.size.y + 2400.0
	# Straight walls (thick, reaching far above the jar so nothing escapes).
	_add_box(Rect2(r.position.x - WALL, r.end.y - tall, WALL, tall + WALL))
	_add_box(Rect2(r.end.x, r.end.y - tall, WALL, tall + WALL))
	_add_box(Rect2(r.position.x - WALL, r.end.y, r.size.x + WALL * 2.0, WALL))
	# Rounded bottom corners as segment chains.
	for side in [0, 1]:
		var segs := PackedVector2Array()
		var arc := _corner_arc(side)
		for i in arc.size() - 1:
			segs.append(arc[i])
			segs.append(arc[i + 1])
		var shape := ConcavePolygonShape2D.new()
		shape.segments = segs
		var cs := CollisionShape2D.new()
		cs.shape = shape
		_body.add_child(cs)
		# Fill behind the arc (as convex slivers) so nothing slips through.
		var corner := Vector2(r.end.x if side == 1 else r.position.x, r.end.y)
		for i in arc.size() - 1:
			var poly := ConvexPolygonShape2D.new()
			poly.points = PackedVector2Array([arc[i], arc[i + 1], corner])
			var cs2 := CollisionShape2D.new()
			cs2.shape = poly
			_body.add_child(cs2)


func _add_box(r: Rect2) -> void:
	var shape := RectangleShape2D.new()
	shape.size = r.size
	var cs := CollisionShape2D.new()
	cs.shape = shape
	cs.position = r.get_center()
	_body.add_child(cs)


## Points of a rounded bottom corner (0 = left, 1 = right), wall to floor.
func _corner_arc(side: int) -> PackedVector2Array:
	var pts := PackedVector2Array()
	var r := rect
	var steps := 10
	if side == 0:
		var c := Vector2(r.position.x + CORNER, r.end.y - CORNER)
		for i in steps + 1:
			var a := PI - (PI * 0.5) * i / steps
			pts.append(c + Vector2(cos(a), sin(a)) * CORNER)
	else:
		var c := Vector2(r.end.x - CORNER, r.end.y - CORNER)
		for i in steps + 1:
			var a := (PI * 0.5) * i / steps
			pts.append(c + Vector2(cos(a), sin(a)) * CORNER)
	return pts


## Inner outline: top-left, down, round the bottom, up to top-right.
func outline(inset: float = 0.0, steps: int = 14) -> PackedVector2Array:
	var r := rect.grow(-inset)
	var k := CORNER - inset
	var pts := PackedVector2Array()
	pts.append(r.position)
	var cl := Vector2(r.position.x + k, r.end.y - k)
	for i in steps + 1:
		var a := PI - (PI * 0.5) * i / steps
		pts.append(cl + Vector2(cos(a), sin(a)) * k)
	var cr := Vector2(r.end.x - k, r.end.y - k)
	for i in steps + 1:
		var a := PI * 0.5 - (PI * 0.5) * i / steps
		pts.append(cr + Vector2(cos(a), sin(a)) * k)
	pts.append(Vector2(r.end.x, r.position.y))
	return pts


func _draw() -> void:
	# Back glass: a faint tinted fill with a soft floor glow.
	var inner := outline(0.0)
	var cols := PackedColorArray()
	for p in inner:
		var t := clampf((p.y - rect.position.y) / rect.size.y, 0.0, 1.0)
		cols.append(Color(0.42, 0.5, 1.0, lerpf(0.05, 0.13, t)))
	draw_polygon(inner, cols)
	var floor_y := rect.end.y
	for i in 5:
		var h := 18.0 + i * 16.0
		draw_rect(Rect2(rect.position.x + CORNER * 0.6, floor_y - h, rect.size.x - CORNER * 1.2, h),
			Color(0.55, 0.65, 1.0, 0.018))
	# Rear rim.
	draw_line(Vector2(rect.position.x, rect.position.y), Vector2(rect.end.x, rect.position.y),
		Color(0.75, 0.82, 1.0, 0.10), 3.0, true)


class JarFront extends Node2D:
	var jar: Jar

	func _draw() -> void:
		var r := jar.rect
		if r.size.x <= 0.0:
			return
		var glass_out := jar.outline(-Jar.GLASS * 0.5)
		# Thick glass edge with a bright inner lip.
		draw_polyline(glass_out, Color(0.62, 0.70, 1.0, 0.28), Jar.GLASS + 4.0, true)
		draw_polyline(jar.outline(-Jar.GLASS * 0.5), Color(0.80, 0.86, 1.0, 0.55), Jar.GLASS * 0.45, true)
		draw_polyline(jar.outline(1.5), Color(1, 1, 1, 0.22), 2.0, true)
		# Rim caps.
		for x in [r.position.x - Jar.GLASS * 0.5, r.end.x + Jar.GLASS * 0.5]:
			draw_circle(Vector2(x, r.position.y), Jar.GLASS * 0.75, Color(0.85, 0.9, 1.0, 0.85), true, -1.0, true)
		# Reflections.
		var hl := PackedVector2Array()
		for i in 12:
			var t := i / 11.0
			hl.append(Vector2(r.position.x + 22.0 + sin(t * PI) * 3.0, lerpf(r.position.y + 50.0, r.end.y - 120.0, t)))
		draw_polyline(hl, Color(1, 1, 1, 0.10), 12.0, true)
		draw_line(Vector2(r.position.x + 44.0, r.position.y + 70.0), Vector2(r.position.x + 44.0, r.position.y + 190.0),
			Color(1, 1, 1, 0.07), 6.0, true)
		draw_line(Vector2(r.end.x - 26.0, r.position.y + 90.0), Vector2(r.end.x - 26.0, r.position.y + 300.0),
			Color(1, 1, 1, 0.05), 6.0, true)
		# Danger line: dashed, glowing red as the jar overflows.
		var y := jar.line_y()
		var d := jar.danger
		var pulse := 0.5 + 0.5 * sin(jar._time * (8.0 + d * 10.0))
		var col := Color(1, 1, 1, 0.16).lerp(Color(1.0, 0.25, 0.35, 0.55 + 0.45 * pulse), minf(d * 3.0, 1.0))
		var width := 3.0 + d * 3.0
		var x := r.position.x + 14.0
		while x < r.end.x - 14.0:
			var x2 := minf(x + 18.0, r.end.x - 14.0)
			draw_line(Vector2(x, y), Vector2(x2, y), col, width, true)
			x += 30.0
		if d > 0.0:
			var glow := Color(1.0, 0.2, 0.3, 0.12 * pulse * minf(d * 3.0, 1.0))
			draw_rect(Rect2(r.position.x, y - 14.0, r.size.x, 28.0), glow)
