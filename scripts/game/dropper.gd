class_name Dropper
extends Node2D
## Holds the next planet above the jar and shows where it will land.

var tier := 0
var ready_to_drop := false
var target_x := 0.0
var min_x := 0.0
var max_x := 0.0
var landing_y := -1.0
var show_guide := true

var _visual: PlanetVisual
var _query := PhysicsShapeQueryParameters2D.new()
var _circle := CircleShape2D.new()
var _time := 0.0


func _ready() -> void:
	_query.shape = _circle
	_query.collide_with_areas = false


func set_tier(t: int, animate: bool = true) -> void:
	tier = t
	if _visual:
		_visual.queue_free()
	_visual = PlanetVisual.new()
	_visual.face_enabled = Save.get_setting("faces")
	_visual.setup(t)
	add_child(_visual)
	ready_to_drop = true
	var r := PlanetData.RADII[t]
	_clamp_target()
	position.x = clampf(position.x, min_x + r, max_x - r)
	if animate:
		_visual.scale = Vector2(0.2, 0.2)
		var tw := create_tween()
		tw.tween_property(_visual, "scale", Vector2.ONE, 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	queue_redraw()


func clear() -> void:
	ready_to_drop = false
	if _visual:
		_visual.queue_free()
		_visual = null
	queue_redraw()


## Keeps the aim inside the jar for the current planet size.
func _clamp_target() -> void:
	var r := PlanetData.RADII[tier] + 1.0
	target_x = clampf(target_x, min_x + r, max_x - r)


func _process(delta: float) -> void:
	_time += delta
	_clamp_target()
	# Snappy but smooth follow.
	position.x = lerpf(position.x, target_x, 1.0 - exp(-delta * 28.0))
	if _visual:
		_visual.position.y = sin(_time * 2.4) * 2.0
		_visual.rotation = sin(_time * 1.3) * 0.06
	queue_redraw()


func _physics_process(_delta: float) -> void:
	if not ready_to_drop or not show_guide:
		landing_y = -1.0
		return
	var r := PlanetData.collision_radius(tier)
	_circle.radius = r
	_query.transform = Transform2D(0.0, global_position)
	_query.motion = Vector2(0, 2000)
	var space := get_world_2d().direct_space_state
	var res := space.cast_motion(_query)
	if res.size() == 2 and res[0] < 1.0:
		landing_y = global_position.y + 2000.0 * res[0]
	else:
		landing_y = -1.0


func _draw() -> void:
	if not ready_to_drop or not show_guide or landing_y < 0.0:
		return
	var r := PlanetData.RADII[tier]
	var top := r + 10.0
	var bottom := landing_y - global_position.y
	if bottom - top < 6.0:
		return
	# Dotted guide line, flowing downwards.
	var c := PlanetData.COLORS[tier].lerp(Color.WHITE, 0.55)
	var y := top + fmod(_time * 60.0, 22.0)
	while y < bottom - r:
		var a := 0.42 * clampf((bottom - r - y) / 80.0, 0.25, 1.0)
		draw_circle(Vector2(0, y), 3.2, Color(c, a), true, -1.0, true)
		y += 22.0
	# Ghost of the landing spot.
	draw_arc(Vector2(0, bottom), r, 0.0, TAU, 48, Color(c, 0.35), 2.5, true)
