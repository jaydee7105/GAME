class_name Screen
extends Control
## Base for full-screen overlays: dimmed backdrop and open/close animation.

var safe_top := 0.0
var safe_bottom := 0.0
var dim: ColorRect
var dim_alpha := 0.6
var _tween: Tween


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	dim = ColorRect.new()
	dim.color = Color(0.03, 0.02, 0.1, dim_alpha)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(dim)


func show_screen() -> void:
	if _tween:
		_tween.kill()
	visible = true
	modulate.a = 0.0
	dim.color.a = dim_alpha
	_tween = create_tween()
	_tween.tween_property(self, "modulate:a", 1.0, 0.18)


func close() -> void:
	if not visible:
		return
	if _tween:
		_tween.kill()
	_tween = create_tween()
	_tween.tween_property(self, "modulate:a", 0.0, 0.15)
	_tween.tween_callback(func(): visible = false)


## Clears built content (everything except the backdrop).
func clear_content() -> void:
	for c in get_children():
		if c != dim:
			c.queue_free()


func centered_panel(width: float) -> VBoxContainer:
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	var p := Ui.panel(48)
	p.custom_minimum_size = Vector2(width, 0)
	center.add_child(p)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 22)
	p.add_child(box)
	return box


func spacer(h: float) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, h)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c
