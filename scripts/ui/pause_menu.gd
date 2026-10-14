class_name PauseMenu
extends Screen

signal resume_pressed
signal restart_pressed
signal home_pressed

var _confirming := false


func open() -> void:
	_confirming = false
	_build()
	show_screen()


func _build() -> void:
	clear_content()
	var box := centered_panel(560)
	var title := Ui.label("Paused", 64, Color.WHITE, 700)
	box.add_child(title)
	box.add_child(spacer(4))

	var resume := Ui.button("RESUME", "primary", 46, Vector2(0, 116))
	resume.pressed.connect(func(): resume_pressed.emit())
	box.add_child(resume)

	var restart := Ui.button("RESTART", "secondary", 36, Vector2(0, 96))
	restart.pressed.connect(_on_restart)
	box.add_child(restart)

	var home := Ui.button("SAVE & QUIT", "ghost", 32, Vector2(0, 88))
	home.pressed.connect(func(): home_pressed.emit())
	box.add_child(home)

	box.add_child(spacer(6))
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 26)
	for spec in [["music", "music"], ["sfx", "sound"], ["haptics", "vibrate"]]:
		row.add_child(_quick_toggle(spec[0], spec[1]))
	box.add_child(row)


func _on_restart() -> void:
	if not _confirming:
		# Ask once: restarting throws the current run away.
		_confirming = true
		_show_confirm()
		return
	restart_pressed.emit()


func _show_confirm() -> void:
	clear_content()
	var box := centered_panel(560)
	box.add_child(Ui.label("Restart?", 56, Color.WHITE, 700))
	var msg := Ui.label("Your current jar will be lost.", 30, Ui.MUTED, 500)
	msg.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(msg)
	box.add_child(spacer(6))
	var yes := Ui.button("RESTART", "pink", 40, Vector2(0, 104))
	yes.pressed.connect(func(): restart_pressed.emit())
	box.add_child(yes)
	var no := Ui.button("CANCEL", "ghost", 34, Vector2(0, 92))
	no.pressed.connect(_cancel_confirm)
	box.add_child(no)


func _cancel_confirm() -> void:
	_confirming = false
	_build()


func _quick_toggle(key: String, icon: String) -> Button:
	var b := Ui.icon_button(icon, "ghost", 96)
	var ic: UiIcon = b.get_child(0)
	var slash := Slash.new()
	slash.set_anchors_preset(Control.PRESET_FULL_RECT)
	b.add_child(slash)
	var refresh := func():
		var on := Save.get_setting(key)
		ic.modulate.a = 1.0 if on else 0.35
		slash.visible = not on
	refresh.call()
	b.pressed.connect(func():
		Save.set_setting(key, not Save.get_setting(key))
		refresh.call())
	return b


class Slash extends Control:
	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var c := size * 0.5
		var d := Vector2(size.x, -size.y) * 0.24
		draw_line(c - d, c + d, Ui.PINK, 6.0, true)
