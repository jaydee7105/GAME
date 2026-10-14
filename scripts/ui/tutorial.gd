class_name Tutorial
extends Control
## First-run coaching: how to aim, what merging does and what the line means.

var world: GameWorld
var hud: Hud
var _step := -1
var _time := 0.0
var _warned := false


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	process_mode = Node.PROCESS_MODE_PAUSABLE


func bind(w: GameWorld, h: Hud) -> void:
	world = w
	hud = h
	w.first_drop.connect(_on_first_drop)
	w.first_merge.connect(_on_first_merge)
	w.danger_changed.connect(_on_danger)
	w.game_over.connect(func(_r): _finish())


func relayout() -> void:
	queue_redraw()


func begin_if_needed() -> void:
	_warned = false
	if Save.tutorial_done:
		_step = -1
		visible = false
		return
	_step = 0
	visible = true
	hud.show_hint("Drag to aim, then let go to drop")


func _on_first_drop() -> void:
	if _step != 0:
		return
	_step = 1
	hud.show_hint("Two matching planets merge into a bigger one!")


func _on_first_merge() -> void:
	if _step != 1:
		return
	_step = 2
	hud.show_hint("Keep merging to grow all the way to the Sun")
	get_tree().create_timer(3.5).timeout.connect(_finish)


func _on_danger(level: float) -> void:
	if _warned or level <= 0.0 or Save.stats.games > 2:
		return
	_warned = true
	hud.show_hint("Careful! Planets can't stay above the line")
	get_tree().create_timer(2.6).timeout.connect(hud.hide_hint)


func _finish() -> void:
	if _step < 0:
		return
	_step = -1
	visible = false
	hud.hide_hint()
	Save.tutorial_done = true
	Save.save_data()


func _process(delta: float) -> void:
	if _step != 0 or not world.visible:
		return
	_time += delta
	queue_redraw()


func _draw() -> void:
	if _step != 0 or world == null:
		return
	var jr := world.jar.rect
	var y := world.dropper.position.y + 96.0
	var x := jr.get_center().x + sin(_time * 2.0) * jr.size.x * 0.3
	var p := Vector2(x, y) + world.position
	var pulse := 0.5 + 0.5 * sin(_time * 6.0)
	draw_circle(p, 34.0 + pulse * 6.0, Color(1, 1, 1, 0.12), true, -1.0, true)
	draw_circle(p, 24.0, Color(1, 1, 1, 0.85), true, -1.0, true)
	draw_arc(p, 30.0, 0.0, TAU, 40, Color(1, 1, 1, 0.6), 3.0, true)
	for side in [-1.0, 1.0]:
		var a := p + Vector2(side * 62.0, 0)
		draw_colored_polygon(PackedVector2Array([a + Vector2(side * 16.0, 0), a + Vector2(-side * 4.0, -13.0), a + Vector2(-side * 4.0, 13.0)]), Color(1, 1, 1, 0.75))
