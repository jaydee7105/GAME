class_name UiToggle
extends Control
## A rounded on/off switch.

signal toggled(on: bool)

var on := true:
	set(v):
		on = v
		_animate()
var _knob := 1.0


func _init() -> void:
	custom_minimum_size = Vector2(104, 58)
	mouse_filter = Control.MOUSE_FILTER_STOP


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		on = not on
		Audio.play("click", 1.1 if on else 0.9, -4.0)
		Audio.buzz(10, 0.3)
		toggled.emit(on)
		accept_event()


func set_on_silent(v: bool) -> void:
	on = v
	_knob = 1.0 if v else 0.0
	queue_redraw()


func _animate() -> void:
	var t := create_tween()
	t.tween_method(_set_knob, _knob, 1.0 if on else 0.0, 0.18) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _set_knob(k: float) -> void:
	_knob = k
	queue_redraw()


func _draw() -> void:
	var r := size.y * 0.5
	var track := Color(1, 1, 1, 0.14).lerp(Ui.TEAL, clampf(_knob, 0.0, 1.0))
	var sb := StyleBoxFlat.new()
	sb.bg_color = track
	sb.set_corner_radius_all(int(r))
	sb.anti_aliasing = true
	draw_style_box(sb, Rect2(Vector2.ZERO, size))
	var x := lerpf(r, size.x - r, _knob)
	draw_circle(Vector2(x, r + 2.0), r - 6.0, Color(0, 0, 0, 0.25), true, -1.0, true)
	draw_circle(Vector2(x, r), r - 6.0, Color.WHITE, true, -1.0, true)
