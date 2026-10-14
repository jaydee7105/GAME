class_name PlanetSlot
extends Control
## Shows a planet centred inside a control (menus, previews, collection).

var visual: PlanetVisual
var tier := -1
var max_radius := 40.0
## When true the planet keeps its relative size (bigger tiers look bigger).
var proportional := false
var locked := false:
	set(v):
		locked = v
		if visual:
			visual.locked = v
var face := true


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(_center)


func show_tier(t: int, animate: bool = false) -> void:
	if visual:
		visual.queue_free()
		visual = null
	tier = t
	if t < 0:
		return
	var r := max_radius
	if proportional:
		r = max_radius * PlanetData.RADII[t] / PlanetData.RADII[PlanetData.SUN]
	# Saturn's rings are wider than the planet; keep them inside the slot.
	if PlanetData.KEYS[t] == "saturn":
		r *= 0.62
	visual = PlanetVisual.new()
	visual.face_enabled = face and Save.get_setting("faces")
	visual.setup(t, r)
	visual.locked = locked
	add_child(visual)
	_center()
	if animate:
		visual.scale = Vector2(0.3, 0.3)
		var tw := create_tween()
		tw.tween_property(visual, "scale", Vector2.ONE, 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _center() -> void:
	if visual:
		visual.position = size * 0.5
