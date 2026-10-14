class_name TitleScreen
extends Screen
## Main menu with the animated planet system and logo.

signal play_pressed
signal continue_pressed
signal daily_pressed
signal settings_pressed
signal planetarium_pressed

var _orbit: TitleOrbit
var _logo: Control
var _buttons: VBoxContainer
var _footer: HBoxContainer
var _time := 0.0


func _init() -> void:
	super()
	dim_alpha = 0.0


func open(animate: bool = true) -> void:
	clear_content()
	_build()
	show_screen()
	var delay := 0.25 if animate else 0.1
	_orbit.modulate.a = 0.0
	var t := create_tween()
	t.tween_property(_orbit, "modulate:a", 1.0, 0.6)
	Ui.pop_in(_logo, delay * 0.4, 0.7)
	var i := 0
	for b in _buttons.get_children():
		if b is Control:
			b.modulate.a = 0.0
			var tb := b.create_tween()
			tb.tween_property(b, "modulate:a", 1.0, 0.3).set_delay(delay + i * 0.07)
			i += 1


func _build() -> void:
	var view := get_viewport_rect().size
	var top := safe_top
	var usable := view.y - safe_top - safe_bottom

	_orbit = TitleOrbit.new()
	_orbit.position = Vector2(view.x * 0.5, top + usable * 0.205)
	add_child(_orbit)

	_logo = Control.new()
	_logo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_logo.size = Vector2(view.x, 260)
	_logo.position = Vector2(0, top + usable * 0.33)
	add_child(_logo)
	var l1 := Label.new()
	l1.text = "PLANET"
	l1.label_settings = Ui.label_settings(112, Color("fff3d6"), 700, 22, Color("2a1466"))
	l1.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l1.size = Vector2(view.x, 130)
	l1.position = Vector2(0, 0)
	_logo.add_child(l1)
	var l2 := Label.new()
	l2.text = "DROP"
	l2.label_settings = Ui.label_settings(150, Ui.ORANGE, 700, 24, Color("2a1466"))
	l2.label_settings.shadow_color = Color(0.0, 0.0, 0.0, 0.3)
	l2.label_settings.shadow_offset = Vector2(0, 10)
	l2.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l2.size = Vector2(view.x, 170)
	l2.position = Vector2(0, 96)
	_logo.add_child(l2)
	_logo.pivot_offset = Vector2(view.x * 0.5, 130)

	_buttons = VBoxContainer.new()
	_buttons.add_theme_constant_override("separation", 20)
	_buttons.size = Vector2(540, 0)
	_buttons.position = Vector2((view.x - 540.0) * 0.5, top + usable * 0.555)
	add_child(_buttons)

	if Save.has_snapshot():
		var cont := Ui.button("CONTINUE", "primary", 50, Vector2(0, 124))
		cont.pressed.connect(func(): continue_pressed.emit())
		_buttons.add_child(cont)
		var mode_note: String = "Daily run in progress" if Save.snapshot.get("mode", "") == "daily" else "Score " + Ui.format_score(int(Save.snapshot.get("score", 0)))
		var note := Ui.label(mode_note, 24, Ui.MUTED, 600)
		note.custom_minimum_size = Vector2(0, 14)
		_buttons.add_child(note)
		var fresh := Ui.button("NEW GAME", "secondary", 38, Vector2(0, 96))
		fresh.pressed.connect(func(): play_pressed.emit())
		_buttons.add_child(fresh)
	else:
		var play := Ui.button("PLAY", "primary", 56, Vector2(0, 128))
		play.pressed.connect(func(): play_pressed.emit())
		_buttons.add_child(play)

	var daily := Ui.button("DAILY CHALLENGE", "teal", 36, Vector2(0, 100))
	daily.pressed.connect(func(): daily_pressed.emit())
	_buttons.add_child(daily)
	var daily_info := HBoxContainer.new()
	daily_info.alignment = BoxContainer.ALIGNMENT_CENTER
	daily_info.add_theme_constant_override("separation", 6)
	var streak := Save.live_streak()
	if streak > 0:
		var flame := UiIcon.new()
		flame.kind = "flame"
		flame.color = Ui.ORANGE
		flame.fill = 0.8
		flame.custom_minimum_size = Vector2(30, 30)
		daily_info.add_child(flame)
		daily_info.add_child(Ui.label("%d day streak" % streak, 24, Ui.ORANGE, 700))
		daily_info.add_child(Ui.label("  ·  ", 24, Ui.MUTED))
	var today_best := Save.todays_daily_best()
	daily_info.add_child(Ui.label("Today's best %s" % Ui.format_score(today_best) if today_best > 0 else "New puzzle every day", 24, Ui.MUTED, 600))
	_buttons.add_child(daily_info)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	var planets := Ui.button("Planets", "ghost", 32, Vector2(260, 92))
	planets.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_add_icon(planets, "planet")
	planets.pressed.connect(func(): planetarium_pressed.emit())
	row.add_child(planets)
	var settings := Ui.button("Settings", "ghost", 32, Vector2(260, 92))
	settings.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_add_icon(settings, "gear")
	settings.pressed.connect(func(): settings_pressed.emit())
	row.add_child(settings)
	_buttons.add_child(row)

	_footer = HBoxContainer.new()
	_footer.alignment = BoxContainer.ALIGNMENT_CENTER
	_footer.add_theme_constant_override("separation", 10)
	var trophy := UiIcon.new()
	trophy.kind = "trophy"
	trophy.color = Ui.GOLD
	trophy.fill = 0.85
	trophy.custom_minimum_size = Vector2(34, 34)
	_footer.add_child(trophy)
	_footer.add_child(Ui.label("BEST  " + Ui.format_score(Save.best), 30, Ui.GOLD, 700))
	_footer.size = Vector2(view.x, 50)
	_footer.position = Vector2(0, view.y - safe_bottom - 84.0)
	add_child(_footer)

	# Keep the button stack clear of the footer, sliding the logo and planets
	# up with it on short screens.
	var stack_h := _buttons.get_combined_minimum_size().y
	var max_top := _footer.position.y - 36.0 - stack_h
	if _buttons.position.y > max_top:
		var shift := _buttons.position.y - max_top
		_buttons.position.y -= shift
		_logo.position.y -= shift * 0.8
		_orbit.position.y -= shift * 0.55


func _add_icon(b: Button, kind: String) -> void:
	for state in ["normal", "hover", "pressed", "disabled"]:
		var box: StyleBoxFlat = b.get_theme_stylebox(state)
		box.content_margin_left = 70
	var ic := UiIcon.new()
	ic.kind = kind
	ic.fill = 0.6
	ic.position = Vector2(26, 14)
	ic.size = Vector2(52, 60)
	b.add_child(ic)


func _process(delta: float) -> void:
	if not visible or _logo == null:
		return
	_time += delta
	_logo.rotation = sin(_time * 1.1) * 0.025
	var s := 1.0 + sin(_time * 1.7) * 0.012
	_logo.scale = Vector2(s, s)


## A little solar system that orbits behind the title.
class TitleOrbit extends Node2D:
	var _time := 0.0
	var _center: PlanetVisual
	var _orbiters: Array = []

	func _ready() -> void:
		_center = PlanetVisual.new()
		_center.face_enabled = Save.get_setting("faces")
		_center.setup(8, 100.0)
		add_child(_center)
		var specs := [[5, 34.0, 0.0, 0.55], [1, 18.0, 2.2, 0.55], [3, 26.0, 4.0, 0.55], [6, 30.0, 1.1, 0.38], [0, 14.0, 3.1, 0.38]]
		for sp in specs:
			var v := PlanetVisual.new()
			v.face_enabled = Save.get_setting("faces")
			v.setup(sp[0], sp[1])
			add_child(v)
			_orbiters.append({"v": v, "phase": sp[2], "speed": sp[3], "dist": 1.0 if sp[3] > 0.5 else 1.3})

	func _process(delta: float) -> void:
		_time += delta
		_center.position = Vector2(0, sin(_time * 1.3) * 8.0)
		_center.rotation = sin(_time * 0.6) * 0.08
		for o in _orbiters:
			var a: float = o.phase + _time * o.speed
			var rx: float = 250.0 * o.dist
			var ry: float = 64.0 * o.dist
			var p := Vector2(cos(a) * rx, sin(a) * ry).rotated(-0.24)
			var v: PlanetVisual = o.v
			v.position = p + _center.position * 0.4
			var depth := sin(a)
			# Draw order instead of z_index, so overlays always stay on top.
			var want := get_child_count() - 1 if depth > 0.0 else 0
			if v.get_index() != want:
				move_child(v, want)
			var k := 0.82 + 0.18 * depth
			v.scale = Vector2(k, k)
			v.modulate = Color(1, 1, 1).darkened(0.25 * (1.0 - depth) * 0.5)
			v.rotation += delta * 0.5
