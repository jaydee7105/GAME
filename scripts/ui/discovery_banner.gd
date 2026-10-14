class_name DiscoveryBanner
extends Control
## "New planet!" card that drops in from the top when a planet is found.

var _queue: Array[int] = []
var _busy := false


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func show_planet(tier: int) -> void:
	_queue.append(tier)
	if not _busy:
		_next()


func _next() -> void:
	if _queue.is_empty():
		_busy = false
		return
	_busy = true
	var tier: int = _queue.pop_front()
	var view := get_viewport_rect().size
	var card := PanelContainer.new()
	var sb := Ui.panel_style(Color(0.13, 0.1, 0.34, 0.96), 36, Ui.GOLD)
	sb.set_content_margin_all(18)
	sb.content_margin_right = 34
	card.add_theme_stylebox_override("panel", sb)
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(card)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	card.add_child(row)
	var slot := PlanetSlot.new()
	slot.custom_minimum_size = Vector2(96, 96)
	slot.max_radius = 40.0
	row.add_child(slot)
	slot.show_tier(tier)
	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", -4)
	col.add_child(Ui.label("NEW PLANET!", 24, Ui.GOLD, 700, HORIZONTAL_ALIGNMENT_LEFT))
	col.add_child(Ui.label(PlanetData.NAMES[tier], 48, Color.WHITE, 700, HORIZONTAL_ALIGNMENT_LEFT))
	row.add_child(col)
	card.reset_size()
	await get_tree().process_frame
	card.reset_size()
	var w := card.size.x
	var top := 150.0
	card.position = Vector2((view.x - w) * 0.5, -card.size.y - 20.0)
	var t := card.create_tween()
	t.tween_property(card, "position:y", top, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_interval(2.0)
	t.tween_property(card, "position:y", -card.size.y - 20.0, 0.3).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	t.tween_callback(card.queue_free)
	t.tween_callback(_next)
