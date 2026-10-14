class_name PlanetariumScreen
extends Screen
## Collection of every planet: discovered ones show their name and a fact.

var _detail: Control


func open() -> void:
	dim_alpha = 0.97
	_build()
	show_screen()


func _build() -> void:
	clear_content()
	_detail = null
	var view := get_viewport_rect().size

	var back := Ui.icon_button("back", "ghost", 88)
	back.position = Vector2(28, safe_top + 28.0)
	back.pressed.connect(close)
	add_child(back)
	var t := Ui.label("Planets", 56, Color.WHITE, 700)
	t.position = Vector2(0, safe_top + 28.0)
	t.size = Vector2(view.x, 88)
	add_child(t)
	var count := Ui.label("%d of %d discovered" % [Save.discovered_count(), PlanetData.COUNT], 28, Ui.GOLD, 600)
	count.position = Vector2(0, safe_top + 112.0)
	count.size = Vector2(view.x, 40)
	add_child(count)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.position = Vector2(0, safe_top + 170.0)
	scroll.size = Vector2(view.x, view.y - safe_top - safe_bottom - 180.0)
	add_child(scroll)
	var margin := MarginContainer.new()
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var side := maxf((view.x - 640.0) * 0.5, 24.0)
	margin.add_theme_constant_override("margin_left", side)
	margin.add_theme_constant_override("margin_right", side)
	margin.add_theme_constant_override("margin_bottom", 40)
	scroll.add_child(margin)
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 16)
	grid.add_theme_constant_override("v_separation", 16)
	margin.add_child(grid)
	for i in PlanetData.COUNT:
		grid.add_child(_card(i))


func _card(tier: int) -> Button:
	var known := Save.is_discovered(tier)
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(200, 236)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Ui.style_button(b, "ghost", 26, 28)
	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_FULL_RECT)
	box.add_theme_constant_override("separation", 2)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(box)
	var slot := PlanetSlot.new()
	slot.custom_minimum_size = Vector2(0, 156)
	slot.max_radius = 58.0
	slot.locked = not known
	box.add_child(slot)
	slot.show_tier(tier)
	box.add_child(Ui.label(PlanetData.NAMES[tier] if known else "???", 30, Color.WHITE if known else Ui.MUTED, 700))
	var made := Save.created[tier]
	var sub := "Made %s×" % Ui.format_score(made) if known and made > 0 else ("Found" if known else "Tier %d" % (tier + 1))
	box.add_child(Ui.label(sub, 20, Ui.MUTED, 600))
	b.pressed.connect(func(): _show_detail(tier))
	return b


func _show_detail(tier: int) -> void:
	var known := Save.is_discovered(tier)
	_detail = Control.new()
	_detail.set_anchors_preset(Control.PRESET_FULL_RECT)
	_detail.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_detail)
	var shade := ColorRect.new()
	shade.color = Color(0.02, 0.01, 0.07, 0.75)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	_detail.add_child(shade)
	shade.gui_input.connect(func(e):
		if e is InputEventMouseButton and e.pressed:
			_close_detail())
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_detail.add_child(center)
	var p := Ui.panel(48)
	p.custom_minimum_size = Vector2(600, 0)
	center.add_child(p)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 16)
	p.add_child(box)
	var slot := PlanetSlot.new()
	slot.custom_minimum_size = Vector2(0, 300)
	slot.max_radius = 130.0
	slot.locked = not known
	box.add_child(slot)
	slot.show_tier(tier, true)
	box.add_child(Ui.label(PlanetData.NAMES[tier] if known else "Undiscovered", 56, Color.WHITE, 700))
	var fact_text := PlanetData.FACTS[tier] if known else _hint(tier)
	var fact := Ui.label(fact_text, 30, Ui.MUTED, 500)
	fact.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	fact.custom_minimum_size = Vector2(520, 0)
	box.add_child(fact)
	if known:
		box.add_child(Ui.label("You've made %s" % Ui.format_score(Save.created[tier]), 26, Ui.GOLD, 600))
	box.add_child(spacer(4))
	var ok := Ui.button("NICE", "primary", 38, Vector2(0, 100))
	ok.pressed.connect(_close_detail)
	box.add_child(ok)
	_detail.modulate.a = 0.0
	var tw := _detail.create_tween()
	tw.tween_property(_detail, "modulate:a", 1.0, 0.15)


func _hint(tier: int) -> String:
	if tier > 0 and Save.is_discovered(tier - 1):
		return "Merge two %s to discover it." % (PlanetData.NAMES[tier - 1] + "s")
	return "Keep merging bigger planets to discover it."


func _close_detail() -> void:
	if _detail:
		var d := _detail
		_detail = null
		var tw := d.create_tween()
		tw.tween_property(d, "modulate:a", 0.0, 0.12)
		tw.tween_callback(d.queue_free)


func close() -> void:
	if _detail:
		_close_detail()
		return
	super()
