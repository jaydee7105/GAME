class_name SettingsScreen
extends Screen

const ROWS := [
	["music", "Music", "music"],
	["sfx", "Sound effects", "sound"],
	["haptics", "Vibration", "vibrate"],
	["faces", "Cute faces", "face"],
	["guide", "Aim guide", "guide"],
]

var _confirm_reset := false


func open(_from_pause: bool = false) -> void:
	_confirm_reset = false
	dim_alpha = 0.97
	_build()
	show_screen()


func _build() -> void:
	clear_content()
	var view := get_viewport_rect().size
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.position = Vector2(0, safe_top + 130.0)
	scroll.size = Vector2(view.x, view.y - safe_top - safe_bottom - 150.0)
	add_child(scroll)
	var margin := MarginContainer.new()
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var side := maxf((view.x - 620.0) * 0.5, 30.0)
	margin.add_theme_constant_override("margin_left", side)
	margin.add_theme_constant_override("margin_right", side)
	margin.add_theme_constant_override("margin_bottom", 40)
	scroll.add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 18)
	margin.add_child(col)

	_header(view, "Settings")

	var card := Ui.panel(36)
	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 10)
	card.add_child(rows)
	for r in ROWS:
		rows.add_child(_toggle_row(r[0], r[1], r[2]))
	col.add_child(card)

	col.add_child(_section("Your stats"))
	var stats := Ui.panel(36)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 20)
	grid.add_theme_constant_override("v_separation", 12)
	stats.add_child(grid)
	var minutes := int(Save.stats.seconds / 60.0)
	var items := [
		["Games played", Ui.format_score(int(Save.stats.games))],
		["Best score", Ui.format_score(Save.best)],
		["Planets merged", Ui.format_score(int(Save.stats.merges))],
		["Supernovas", Ui.format_score(int(Save.stats.supernovas))],
		["Planets found", "%d / %d" % [Save.discovered_count(), PlanetData.COUNT]],
		["Time played", "%dh %02dm" % [minutes / 60, minutes % 60]],
	]
	for it in items:
		var k := Ui.label(it[0], 28, Ui.MUTED, 500, HORIZONTAL_ALIGNMENT_LEFT)
		k.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(k)
		grid.add_child(Ui.label(it[1], 28, Color.WHITE, 700, HORIZONTAL_ALIGNMENT_RIGHT))
	col.add_child(stats)

	col.add_child(spacer(6))
	var reset := Ui.button("Reset progress" if not _confirm_reset else "Tap again to erase everything", "pink" if _confirm_reset else "ghost", 30, Vector2(0, 88))
	reset.pressed.connect(_on_reset)
	col.add_child(reset)

	col.add_child(spacer(10))
	var about := Ui.label("Planet Drop v%s\nPlanets modelled in Blender · Made with Godot Engine\nFredoka font by Milena Brandão (SIL Open Font License)\nNo ads. No tracking. Your progress stays on this device." % ProjectSettings.get_setting("application/config/version"), 22, Ui.MUTED, 500)
	about.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(about)


func _header(view: Vector2, text: String) -> void:
	var back := Ui.icon_button("back", "ghost", 88)
	back.position = Vector2(28, safe_top + 28.0)
	back.pressed.connect(close)
	add_child(back)
	var t := Ui.label(text, 56, Color.WHITE, 700)
	t.position = Vector2(0, safe_top + 28.0)
	t.size = Vector2(view.x, 88)
	add_child(t)


func _section(text: String) -> Label:
	var l := Ui.label(text.to_upper(), 24, Ui.MUTED, 700, HORIZONTAL_ALIGNMENT_LEFT)
	l.custom_minimum_size = Vector2(0, 44)
	l.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	return l


func _toggle_row(key: String, text: String, icon: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	row.custom_minimum_size = Vector2(0, 76)
	var ic := UiIcon.new()
	ic.kind = icon
	ic.color = Ui.GOLD
	ic.fill = 0.8
	ic.custom_minimum_size = Vector2(48, 48)
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(ic)
	var l := Ui.label(text, 34, Color.WHITE, 600, HORIZONTAL_ALIGNMENT_LEFT)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(l)
	var tog := UiToggle.new()
	tog.set_on_silent(Save.get_setting(key))
	tog.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	tog.toggled.connect(func(on): Save.set_setting(key, on))
	row.add_child(tog)
	return row


func _on_reset() -> void:
	if not _confirm_reset:
		_confirm_reset = true
		_build()
		return
	Save.reset_progress()
	_confirm_reset = false
	_build()
	Fx.float_text(self, get_viewport_rect().size * 0.5, "Progress reset", Color.WHITE, 40)
