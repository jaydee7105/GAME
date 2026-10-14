class_name GameOverScreen
extends Screen
## Results card shown when the jar overflows.

signal again_pressed
signal home_pressed

const TITLES := ["Jar's full!", "Out of space!", "Cosmic crunch!", "Planet pile-up!"]

var _score_label: Label
var _shown := 0.0
var _target := 0
var _ticking := false
var _panel: Control
var _ribbon: Control


func open(result: Dictionary, new_best: bool) -> void:
	clear_content()
	dim_alpha = 0.7
	var daily: bool = result.mode == "daily"
	var box := centered_panel(600)
	_panel = box.get_parent()

	box.add_child(Ui.label(TITLES[randi() % TITLES.size()], 58, Color.WHITE, 700))
	if daily:
		var d := Time.get_date_dict_from_system()
		var months := ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
		box.add_child(Ui.label("Daily Challenge · %s %d" % [months[d.month - 1], d.day], 26, Ui.TEAL, 700))

	var score_box := VBoxContainer.new()
	score_box.add_theme_constant_override("separation", 0)
	score_box.add_child(Ui.label("SCORE", 26, Ui.MUTED, 700))
	_score_label = Ui.label("0", 104, Ui.GOLD, 700)
	_score_label.label_settings = Ui.label_settings(104, Ui.GOLD, 700, 14, Color("2a1466"))
	score_box.add_child(_score_label)
	box.add_child(score_box)

	var best := Save.todays_daily_best() if daily else Save.best
	if new_best:
		var ribbon := PanelContainer.new()
		var sb := StyleBoxFlat.new()
		sb.bg_color = Ui.PINK
		sb.set_corner_radius_all(26)
		sb.content_margin_left = 26
		sb.content_margin_right = 26
		sb.content_margin_top = 6
		sb.content_margin_bottom = 8
		sb.anti_aliasing = true
		ribbon.add_theme_stylebox_override("panel", sb)
		ribbon.add_child(Ui.label("NEW BEST!", 34, Color.WHITE, 700))
		ribbon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		box.add_child(ribbon)
		_ribbon = ribbon
	else:
		box.add_child(Ui.label("Best  " + Ui.format_score(best), 30, Ui.MUTED, 600))

	# Stats row.
	var stats := HBoxContainer.new()
	stats.alignment = BoxContainer.ALIGNMENT_CENTER
	stats.add_theme_constant_override("separation", 14)
	var biggest := VBoxContainer.new()
	biggest.add_theme_constant_override("separation", 2)
	var slot := PlanetSlot.new()
	slot.custom_minimum_size = Vector2(150, 108)
	slot.max_radius = 46.0
	biggest.add_child(slot)
	biggest.add_child(Ui.label(PlanetData.NAMES[result.highest], 28, Color.WHITE, 700))
	biggest.add_child(Ui.label("Biggest planet", 20, Ui.MUTED, 600))
	stats.add_child(biggest)
	stats.add_child(_stat(str(result.merges), "Merges"))
	stats.add_child(_stat("x%d" % maxi(result.best_chain, 1), "Best chain"))
	box.add_child(stats)
	slot.show_tier(result.highest, true)

	if daily:
		var streak := Save.live_streak()
		var msg := "%d day streak! New challenge tomorrow." % streak if streak > 1 else "Come back tomorrow for a new challenge."
		var l := Ui.label(msg, 24, Ui.ORANGE if streak > 1 else Ui.MUTED, 600)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(l)

	box.add_child(spacer(4))
	var again := Ui.button("PLAY AGAIN", "primary", 46, Vector2(0, 116))
	again.pressed.connect(func(): again_pressed.emit())
	box.add_child(again)
	var home := Ui.button("HOME", "ghost", 32, Vector2(0, 88))
	home.pressed.connect(func(): home_pressed.emit())
	box.add_child(home)

	show_screen()
	_intro()
	_shown = 0.0
	_target = result.score
	_ticking = true
	if new_best:
		get_tree().create_timer(1.0).timeout.connect(_celebrate)


func _intro() -> void:
	var ribbon := _ribbon
	_ribbon = null
	_panel.modulate.a = 0.0
	await get_tree().process_frame
	await get_tree().process_frame
	if not is_instance_valid(_panel):
		return
	var y := _panel.position.y
	_panel.position.y = y + 90.0
	var t := _panel.create_tween().set_parallel(true)
	t.tween_property(_panel, "position:y", y, 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(_panel, "modulate:a", 1.0, 0.2)
	if ribbon:
		Ui.pop_in(ribbon, 1.0, 0.2)


func _stat(value: String, caption: String) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	v.custom_minimum_size = Vector2(150, 0)
	v.alignment = BoxContainer.ALIGNMENT_END
	v.add_child(Ui.label(value, 54, Color.WHITE, 700))
	v.add_child(Ui.label(caption, 20, Ui.MUTED, 600))
	return v


func _celebrate() -> void:
	if not visible:
		return
	Audio.play("highscore", 1.0, -1.0)
	Audio.buzz(80, 0.6)
	var view := get_viewport_rect().size
	for i in 6:
		var pos := Vector2(randf_range(80, view.x - 80), randf_range(view.y * 0.2, view.y * 0.5))
		var col: Color = [Ui.GOLD, Ui.PINK, Ui.TEAL, Ui.ORANGE, Ui.VIOLET][i % 5]
		get_tree().create_timer(i * 0.12).timeout.connect(func(): Fx.burst(self, pos, col, 30, 420.0, 1.6, 1.0))


func _process(delta: float) -> void:
	if not _ticking or _score_label == null:
		return
	var before := int(_shown)
	_shown = minf(_shown + maxf(_target * delta * 1.1, 60.0 * delta), _target)
	if int(_shown) != before:
		_score_label.text = Ui.format_score(int(_shown))
		if int(_shown / 50.0) != int(before / 50.0):
			Audio.play("tick", 1.0 + _shown / maxf(_target, 1.0) * 0.5, -10.0, 0.04)
	if _shown >= _target:
		_ticking = false
		_score_label.text = Ui.format_score(_target)
		_score_label.pivot_offset = _score_label.size * 0.5
		var t := _score_label.create_tween()
		t.tween_property(_score_label, "scale", Vector2(1.15, 1.15), 0.08)
		t.tween_property(_score_label, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
