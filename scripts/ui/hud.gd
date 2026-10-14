class_name Hud
extends Control
## In-game overlay: score, next planet, pause, power-ups and the evolution strip.

signal pause_pressed
signal black_hole_pressed
signal shake_pressed

var world: GameWorld

var _score_label: Label
var _best_label: Label
var _mode_label: Label
var _next_slot: PlanetSlot
var _next_bubble: Panel
var _pause: Button
var _bh_button: Button
var _shake_button: Button
var _bh_badge: Label
var _shake_badge: Label
var _strip: Control
var _strip_slots: Array[PlanetSlot] = []
var _strip_glow: Control
var _hint: Label
var _hint_panel: PanelContainer
var _shown_score := 0.0
var _target_score := 0
var _bh_pulse: Tween
var _layout_rect := Rect2()


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	_score_label = Ui.label("0", 68, Color.WHITE, 700, HORIZONTAL_ALIGNMENT_LEFT)
	_score_label.label_settings = Ui.label_settings(68, Color.WHITE, 700, 10, Color(0.05, 0.03, 0.15, 0.85))
	add_child(_score_label)
	_best_label = Ui.label("BEST 0", 26, Ui.MUTED, 600, HORIZONTAL_ALIGNMENT_LEFT)
	add_child(_best_label)
	_mode_label = Ui.label("", 22, Ui.TEAL, 700, HORIZONTAL_ALIGNMENT_LEFT)
	add_child(_mode_label)

	_next_bubble = Panel.new()
	var sb := Ui.panel_style(Color(0.12, 0.1, 0.3, 0.75), 60)
	sb.shadow_size = 10
	_next_bubble.add_theme_stylebox_override("panel", sb)
	_next_bubble.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_next_bubble)
	var next_lbl := Ui.label("NEXT", 20, Ui.MUTED, 700)
	next_lbl.name = "NextLabel"
	_next_bubble.add_child(next_lbl)
	_next_slot = PlanetSlot.new()
	_next_slot.max_radius = 34.0
	_next_bubble.add_child(_next_slot)

	_pause = Ui.icon_button("pause", "ghost", 88)
	_pause.pressed.connect(func(): pause_pressed.emit())
	add_child(_pause)

	_bh_button = _pill("Black Hole", "blackhole")
	_bh_button.pressed.connect(func(): black_hole_pressed.emit())
	_bh_badge = _badge(_bh_button)
	_shake_button = _pill("Shake", "shake")
	_shake_button.pressed.connect(func(): shake_pressed.emit())
	_shake_badge = _badge(_shake_button)

	_strip = Control.new()
	_strip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_strip)
	_strip_glow = StripGlow.new()
	_strip.add_child(_strip_glow)
	for i in PlanetData.COUNT:
		var s := PlanetSlot.new()
		s.max_radius = 11.0 + i * 1.35
		s.face = false
		_strip.add_child(s)
		_strip_slots.append(s)

	_hint_panel = PanelContainer.new()
	var hs := Ui.panel_style(Color(0.1, 0.08, 0.26, 0.9), 30)
	hs.set_content_margin_all(18)
	hs.content_margin_left = 30
	hs.content_margin_right = 30
	_hint_panel.add_theme_stylebox_override("panel", hs)
	_hint_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hint = Ui.label("", 30, Color.WHITE, 600)
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hint_panel.add_child(_hint)
	_hint_panel.visible = false
	add_child(_hint_panel)


func _pill(text: String, icon: String) -> Button:
	var b := Ui.button(text, "secondary", 30, Vector2(0, 88))
	for state in ["normal", "hover", "pressed", "disabled"]:
		var box: StyleBoxFlat = b.get_theme_stylebox(state)
		box.content_margin_left = 84
		box.content_margin_right = 30
	var ic := UiIcon.new()
	ic.kind = icon
	ic.fill = 0.62
	ic.position = Vector2(18, 10)
	ic.size = Vector2(60, 64)
	b.add_child(ic)
	add_child(b)
	return b


func _badge(parent: Control) -> Label:
	var b := Label.new()
	b.label_settings = Ui.label_settings(26, Color.WHITE, 700)
	b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var sb := StyleBoxFlat.new()
	sb.bg_color = Ui.PINK
	sb.set_corner_radius_all(20)
	sb.border_color = Color("1a1240")
	sb.set_border_width_all(3)
	sb.anti_aliasing = true
	b.add_theme_stylebox_override("normal", sb)
	b.size = Vector2(40, 40)
	b.position = Vector2(-10, -12)
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(b)
	return b


func bind(w: GameWorld) -> void:
	world = w
	w.score_changed.connect(_on_score)
	w.next_changed.connect(_on_next)
	w.powerups_changed.connect(_on_powerups)
	w.black_hole_aiming.connect(_on_aiming)
	w.chain.connect(_on_chain)


func layout(view: Vector2, safe_top: float, _safe_bottom: float) -> void:
	var jr := world.jar.rect
	_layout_rect = Rect2(Vector2.ZERO, view)
	var left := jr.position.x - 14.0
	var right := jr.end.x + 14.0
	var top := safe_top + 26.0
	_score_label.position = Vector2(left, top - 8.0)
	_score_label.size = Vector2(360, 80)
	_best_label.position = Vector2(left + 4.0, top + 70.0)
	_best_label.size = Vector2(360, 34)
	_mode_label.position = Vector2(left + 4.0, top + 102.0)
	_mode_label.size = Vector2(360, 30)

	_pause.position = Vector2(right - 88.0, top)
	_pause.size = Vector2(88, 88)
	_next_bubble.size = Vector2(112, 132)
	_next_bubble.position = Vector2(right - 88.0 - 128.0, top - 6.0)
	var nl: Label = _next_bubble.get_node("NextLabel")
	nl.position = Vector2(0, 8)
	nl.size = Vector2(112, 24)
	_next_slot.position = Vector2(0, 30)
	_next_slot.size = Vector2(112, 98)

	var strip_y := jr.end.y + 22.0
	var strip_w := right - left
	_strip.position = Vector2(left, strip_y)
	_strip.size = Vector2(strip_w, 64)
	var step := strip_w / PlanetData.COUNT
	for i in PlanetData.COUNT:
		var s := _strip_slots[i]
		s.position = Vector2(step * i, 0)
		s.size = Vector2(step, 64)

	var bar_y := strip_y + 78.0
	var gap := 20.0
	var pill_w := (strip_w - gap) * 0.5
	_bh_button.position = Vector2(left, bar_y)
	_bh_button.size = Vector2(pill_w, 88)
	_shake_button.position = Vector2(left + pill_w + gap, bar_y)
	_shake_button.size = Vector2(pill_w, 88)
	_strip_glow.size = _strip.size
	(_strip_glow as StripGlow).step = step

	_hint.custom_minimum_size = Vector2(jr.size.x - 140.0, 0)
	_place_hint()
	refresh_strip()


func start_run(mode: String) -> void:
	_mode_label.text = "DAILY CHALLENGE" if mode == "daily" else ""
	_best_label.text = "BEST " + Ui.format_score(Save.todays_daily_best() if mode == "daily" else Save.best)
	_shown_score = world.score
	_target_score = world.score
	_score_label.text = Ui.format_score(world.score)
	refresh_strip()
	hide_hint()


func refresh_strip() -> void:
	for i in PlanetData.COUNT:
		var s := _strip_slots[i]
		var want_locked := not Save.is_discovered(i)
		if s.tier != i:
			s.locked = want_locked
			s.show_tier(i)
		elif s.locked != want_locked:
			s.locked = want_locked
	if world:
		(_strip_glow as StripGlow).highest = world.highest
		_strip_glow.queue_redraw()


func flash_strip(tier: int) -> void:
	refresh_strip()
	var s := _strip_slots[tier]
	if s.visual:
		s.visual.scale = Vector2(2.2, 2.2)
		var t := s.create_tween()
		t.tween_property(s.visual, "scale", Vector2.ONE, 0.6).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)


func _process(delta: float) -> void:
	if int(_shown_score) != _target_score:
		_shown_score = lerpf(_shown_score, _target_score, 1.0 - exp(-delta * 12.0))
		if absf(_shown_score - _target_score) < 1.0:
			_shown_score = _target_score
		_score_label.text = Ui.format_score(int(round(_shown_score)))
	if world and world.highest != (_strip_glow as StripGlow).highest:
		(_strip_glow as StripGlow).highest = world.highest
		_strip_glow.queue_redraw()


func _on_score(score: int, gained: int) -> void:
	_target_score = score
	if gained > 0:
		_score_label.pivot_offset = Vector2(0, 40)
		var t := _score_label.create_tween()
		t.tween_property(_score_label, "scale", Vector2(1.12, 1.12), 0.06)
		t.tween_property(_score_label, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	else:
		_shown_score = score
		_score_label.text = Ui.format_score(score)


func _on_next(tier: int) -> void:
	_next_slot.show_tier(tier, true)


func _on_powerups(bh: int, sh: int) -> void:
	_bh_badge.text = str(bh)
	_shake_badge.text = str(sh)
	_bh_button.disabled = bh <= 0 and not world.aiming_black_hole
	_shake_button.disabled = sh <= 0
	_bh_badge.visible = true
	_shake_badge.visible = true
	_bh_badge.modulate.a = 1.0 if bh > 0 else 0.45
	_shake_badge.modulate.a = 1.0 if sh > 0 else 0.45


func _on_aiming(active: bool) -> void:
	if _bh_pulse:
		_bh_pulse.kill()
	_bh_button.scale = Vector2.ONE
	if active:
		show_hint("Tap a planet to feed it to the black hole")
		_bh_button.pivot_offset = _bh_button.size * 0.5
		_bh_pulse = _bh_button.create_tween().set_loops()
		_bh_pulse.tween_property(_bh_button, "scale", Vector2(1.1, 1.1), 0.35).set_trans(Tween.TRANS_SINE)
		_bh_pulse.tween_property(_bh_button, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_SINE)
	else:
		hide_hint()
	_on_powerups(world.black_holes, world.shakes)


func _on_chain(count: int, pos: Vector2) -> void:
	var at := pos + world.position + Vector2(0, -90)
	at.x = clampf(at.x, 190.0, size.x - 190.0)
	var l := Fx.float_text(self, at, "CHAIN x%d" % count,
		[Ui.TEAL, Ui.GOLD, Ui.ORANGE, Ui.PINK][mini(count - 2, 3)], 40 + mini(count, 6) * 4, 80.0, 1.1)
	l.rotation = randf_range(-0.08, 0.08)


func show_hint(text: String) -> void:
	_hint.text = text
	_hint_panel.visible = true
	_place_hint()
	_hint_panel.modulate.a = 0.0
	var t := _hint_panel.create_tween()
	t.tween_property(_hint_panel, "modulate:a", 1.0, 0.25)


func hide_hint() -> void:
	if not _hint_panel.visible:
		return
	var t := _hint_panel.create_tween()
	t.tween_property(_hint_panel, "modulate:a", 0.0, 0.2)
	t.tween_callback(func(): _hint_panel.visible = false)


func _place_hint() -> void:
	_hint_panel.reset_size()
	var jr := world.jar.rect
	_hint_panel.position = Vector2(jr.get_center().x - _hint_panel.size.x * 0.5, jr.position.y + 150.0)


## Highlights the biggest planet reached this run in the evolution strip.
class StripGlow extends Control:
	var highest := 0
	var step := 40.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(1, 1, 1, 0.05)
		sb.set_corner_radius_all(40)
		sb.anti_aliasing = true
		draw_style_box(sb, Rect2(Vector2(0, 4), Vector2(size.x, size.y - 8)))
		var c := Vector2(step * (highest + 0.5), size.y * 0.5)
		var rr := minf(step * 0.5, size.y * 0.46)
		draw_circle(c, rr, Color(1.0, 0.85, 0.4, 0.18), true, -1.0, true)
		draw_arc(c, rr, 0, TAU, 32, Color(1.0, 0.85, 0.4, 0.65), 2.0, true)
