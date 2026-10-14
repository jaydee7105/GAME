extends Node
## App root: owns the background, the playfield and every screen, and moves
## between them.

const BG_TEXTURE := preload("res://assets/bg/space.jpg")

var world: GameWorld
var hud: Hud
var ui_root: Control
var screens: Control
var overlay: Control

var _bg: TextureRect
var _stars: Starfield
var _flash: ColorRect
var _title: TitleScreen
var _pause: PauseMenu
var _game_over: GameOverScreen
var _settings: SettingsScreen
var _planetarium: PlanetariumScreen
var _tutorial: Tutorial
var _banner: DiscoveryBanner
var _state := "title"
var _view := Vector2(720, 1280)
var _safe_top := 0.0
var _safe_bottom := 0.0
var _autosave := 0.0

# Test hooks (only used when launched with these command-line flags).
var _args := {}


func _ready() -> void:
	get_tree().set_auto_accept_quit(false)
	# A daily run only counts on the day it was started.
	if Save.snapshot.get("mode", "") == "daily" and Save.snapshot.get("date", "") != Save.today():
		Save.clear_snapshot()
	get_tree().set_quit_on_go_back(false)
	_parse_args()

	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	add_child(bg_layer)
	_bg = TextureRect.new()
	_bg.texture = BG_TEXTURE
	_bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bg_layer.add_child(_bg)
	_stars = Starfield.new()
	bg_layer.add_child(_stars)

	world = GameWorld.new()
	world.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(world)

	var ui_layer := CanvasLayer.new()
	ui_layer.layer = 10
	ui_layer.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(ui_layer)
	ui_root = Control.new()
	ui_root.theme = Ui.theme()
	ui_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	ui_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui_layer.add_child(ui_root)

	hud = Hud.new()
	hud.process_mode = Node.PROCESS_MODE_PAUSABLE
	ui_root.add_child(hud)
	hud.bind(world)
	hud.pause_pressed.connect(pause_game)
	hud.black_hole_pressed.connect(world.toggle_black_hole)
	hud.shake_pressed.connect(world.use_shake)

	_tutorial = Tutorial.new()
	ui_root.add_child(_tutorial)
	_tutorial.bind(world, hud)

	_banner = DiscoveryBanner.new()
	ui_root.add_child(_banner)

	_flash = ColorRect.new()
	_flash.color = Color(1, 0.97, 0.88, 0)
	_flash.set_anchors_preset(Control.PRESET_FULL_RECT)
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui_root.add_child(_flash)

	screens = Control.new()
	screens.set_anchors_preset(Control.PRESET_FULL_RECT)
	screens.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui_root.add_child(screens)

	_title = TitleScreen.new()
	screens.add_child(_title)
	_title.play_pressed.connect(func(): start_game("classic"))
	_title.continue_pressed.connect(continue_game)
	_title.daily_pressed.connect(func(): start_game("daily"))
	_title.settings_pressed.connect(func(): open_settings())
	_title.planetarium_pressed.connect(open_planetarium)

	_pause = PauseMenu.new()
	screens.add_child(_pause)
	_pause.resume_pressed.connect(resume_game)
	_pause.restart_pressed.connect(func(): _confirm_restart())
	_pause.home_pressed.connect(func(): go_home(true))

	_game_over = GameOverScreen.new()
	screens.add_child(_game_over)
	_game_over.again_pressed.connect(func(): start_game(world.mode))
	_game_over.home_pressed.connect(func(): go_home(false))

	_settings = SettingsScreen.new()
	screens.add_child(_settings)
	_planetarium = PlanetariumScreen.new()
	screens.add_child(_planetarium)

	world.discovered.connect(_on_discovered)
	world.seen.connect(func(t): hud.flash_strip(t))
	world.supernova.connect(_on_supernova)
	world.game_over.connect(_on_game_over)
	world.powerup_earned.connect(_on_powerup_earned)

	get_viewport().size_changed.connect(_relayout)
	_relayout()
	_show_title(false)
	Audio.play_music()

	if _args.has("scene") or _args.has("autoplay") or _args.has("shots"):
		_run_test_hooks()


func _parse_args() -> void:
	for a in OS.get_cmdline_user_args():
		var parts := a.trim_prefix("--").split("=", true, 1)
		_args[parts[0]] = parts[1] if parts.size() > 1 else "1"


func _relayout() -> void:
	_view = get_viewport().get_visible_rect().size
	var win := Vector2(DisplayServer.window_get_size())
	var safe := DisplayServer.get_display_safe_area()
	_safe_top = 0.0
	_safe_bottom = 0.0
	if OS.has_feature("mobile") and win.y > 0.0:
		var k := _view.y / win.y
		_safe_top = maxf(safe.position.y * k, 0.0)
		_safe_bottom = maxf((win.y - safe.end.y) * k, 0.0)
	if _args.has("notch"):
		_safe_top = 60.0
	world.layout(_view, _safe_top, _safe_bottom)
	hud.layout(_view, _safe_top, _safe_bottom)
	_stars.set_area(_view)
	for s in [_title, _pause, _game_over, _settings, _planetarium]:
		s.safe_top = _safe_top
		s.safe_bottom = _safe_bottom
	_tutorial.relayout()


# ---------------------------------------------------------------------------
# Flow
# ---------------------------------------------------------------------------
func _show_title(animate: bool = true) -> void:
	_state = "title"
	world.visible = false
	hud.visible = false
	_title.open(animate)


func start_game(mode: String) -> void:
	Save.clear_snapshot()
	_close_overlays()
	get_tree().paused = false
	_state = "game"
	world.visible = true
	hud.visible = true
	world.start(mode)
	hud.start_run(mode)
	_title.close()
	_tutorial.begin_if_needed()
	Audio.play("start", 1.0, -3.0)


func continue_game() -> void:
	_close_overlays()
	get_tree().paused = false
	if not world.restore(Save.snapshot):
		start_game("classic")
		return
	_state = "game"
	world.visible = true
	hud.visible = true
	hud.start_run(world.mode)
	_title.close()
	Audio.play("start", 1.0, -3.0)


func pause_game() -> void:
	if _state != "game" or world.is_over:
		return
	world.cancel_press()
	_state = "paused"
	get_tree().paused = true
	_save_snapshot()
	_pause.open()


func resume_game() -> void:
	_pause.close()
	_state = "game"
	get_tree().paused = false


func _confirm_restart() -> void:
	_pause.close()
	start_game(world.mode)


func go_home(save_run: bool) -> void:
	if save_run:
		_save_snapshot()
	else:
		Save.clear_snapshot()
	get_tree().paused = false
	_close_overlays()
	world.stop()
	_show_title()


func open_settings(from_pause: bool = false) -> void:
	_settings.open(from_pause)


func open_planetarium() -> void:
	_planetarium.open()


func _close_overlays() -> void:
	_pause.close()
	_game_over.close()
	_settings.close()
	_planetarium.close()


func _save_snapshot() -> void:
	var snap := world.snapshot()
	if snap.is_empty():
		Save.clear_snapshot()
	else:
		Save.set_snapshot(snap)


func _on_game_over(result: Dictionary) -> void:
	_state = "over"
	Save.clear_snapshot()
	var new_best := Save.record_game(result.mode, result.score, result.seconds)
	_game_over.open(result, new_best)


func _on_discovered(tier: int) -> void:
	hud.flash_strip(tier)
	if tier >= 2:
		_banner.show_planet(tier)
		Audio.play("discover", 1.0, -2.0)


func _on_powerup_earned(kind: String, pos: Vector2) -> void:
	var text := "+1 Shake" if kind == "shake" else "+1 Black Hole"
	Fx.float_text(hud, pos + Vector2(0, -150), text, Color("c9a6ff"), 34, 60.0, 1.4)


func _on_supernova(_pos: Vector2) -> void:
	_flash.color.a = 0.7
	var t := _flash.create_tween()
	t.tween_property(_flash, "color:a", 0.0, 0.9).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)


# ---------------------------------------------------------------------------
# Platform events
# ---------------------------------------------------------------------------
func _notification(what: int) -> void:
	match what:
		NOTIFICATION_WM_GO_BACK_REQUEST:
			_on_back()
		NOTIFICATION_WM_CLOSE_REQUEST:
			_save_snapshot()
			Save.flush()
			get_tree().quit()
		NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_APPLICATION_FOCUS_OUT:
			if _state == "game":
				pause_game()
			else:
				_save_snapshot()
			Save.flush()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		_on_back()
		get_viewport().set_input_as_handled()


func _on_back() -> void:
	if _settings.visible:
		_settings.close()
	elif _planetarium.visible:
		_planetarium.close()
	elif _state == "game":
		if world.aiming_black_hole:
			world.toggle_black_hole()
		else:
			pause_game()
	elif _state == "paused":
		resume_game()
	elif _state == "over":
		go_home(false)
	else:
		_save_snapshot()
		Save.flush()
		get_tree().quit()


func _process(delta: float) -> void:
	if _state == "game":
		_autosave += delta
		if _autosave > 6.0:
			_autosave = 0.0
			_save_snapshot()


# ---------------------------------------------------------------------------
# Automated test hooks: --scene=<name> --shots=<dir> [--autoplay --every=s --count=n]
# ---------------------------------------------------------------------------
func _run_test_hooks() -> void:
	await get_tree().create_timer(0.3).timeout
	var scene: String = _args.get("scene", "game")
	var dir: String = _args.get("shots", "user://shots")
	DirAccess.make_dir_recursive_absolute(dir)
	match scene:
		"title":
			await _wait(1.5)
			await _shot(dir, "title")
		"planetarium":
			open_planetarium()
			await _wait(1.0)
			await _shot(dir, "planetarium")
		"settings":
			open_settings()
			await _wait(1.0)
			await _shot(dir, "settings")
		"supernova":
			start_game("classic")
			await _wait(0.6)
			var c := world.jar.rect.get_center()
			world._spawn(PlanetData.SUN, Vector2(c.x - 40, c.y + 200)).age = 5.0
			world._spawn(PlanetData.SUN, Vector2(c.x + 40, c.y - 120)).age = 5.0
			for i in 6:
				world._spawn(i % 5, Vector2(c.x - 250 + i * 100, c.y - 330)).age = 5.0
			for i in 8:
				await _wait(0.15)
				await _shot(dir, "supernova_%d" % i)
		"powerups":
			start_game("classic")
			world.autoplay = true
			await _wait(10.0)
			world.autoplay = false
			await _wait(1.5)
			await _shot(dir, "before")
			world.use_shake()
			await _wait(0.25)
			await _shot(dir, "shake")
			await _wait(2.0)
			world.toggle_black_hole()
			await _wait(0.3)
			await _shot(dir, "aiming")
			world._swallow(world._planets[0])
			await _wait(0.35)
			await _shot(dir, "swallow")
		"pause":
			start_game("classic")
			world.autoplay = true
			await _wait(4.0)
			pause_game()
			await _wait(0.6)
			await _shot(dir, "pause")
		"resume":
			start_game(_args.get("mode", "classic"))
			world.autoplay = true
			await _wait(8.0)
			world.autoplay = false
			await _wait(2.0)
			await _shot(dir, "before")
			var before := world.planet_count()
			go_home(true)
			await _wait(1.0)
			await _shot(dir, "title_continue")
			continue_game()
			await _wait(0.5)
			await _shot(dir, "after")
			print("[test] resume planets before=%d after=%d score=%d" % [before, world.planet_count(), world.score])
		"icon":
			await PromoArt.render(self, PromoArt.icon(), Vector2i(1024, 1024), dir + "/icon_full.png")
			await PromoArt.render(self, PromoArt.icon(false, true, 0.155), Vector2i(1024, 1024), dir + "/icon_fg.png", true)
			await PromoArt.render(self, PromoArt.icon(true, false), Vector2i(1024, 1024), dir + "/icon_bg.png")
		"feature":
			await PromoArt.render(self, PromoArt.feature(), Vector2i(2048, 1000), dir + "/feature.png")
		"showcase":
			# A good-looking mid-game jar for store screenshots.
			for i in PlanetData.COUNT:
				Save.discovered[i] = i <= 9
			Save.tutorial_done = true
			start_game("classic")
			world._danger_suppress = 9999.0
			var r := world.jar.rect
			var layout := [
				[9, 0.27, 0.80], [8, 0.73, 0.83], [7, 0.70, 0.55], [5, 0.24, 0.48],
				[6, 0.46, 0.60], [4, 0.85, 0.34], [3, 0.10, 0.30], [2, 0.42, 0.33],
				[1, 0.6, 0.30], [0, 0.3, 0.2], [3, 0.53, 0.15], [1, 0.9, 0.1],
			]
			for spec in layout:
				var p := world._spawn(spec[0], r.position + Vector2(r.size.x * spec[1], r.size.y * spec[2]))
				p.age = 0.0
				await _wait(0.12)
			world.highest = 9
			world.score = 4280
			hud.start_run("classic")
			await _wait(3.5)
			world.dropper.target_x = r.position.x + r.size.x * 0.62
			await _wait(1.0)
			await _shot(dir, "showcase")
			# Then a merge with a chain for an action shot.
			var c := r.get_center()
			world._spawn(6, Vector2(c.x - 40, r.position.y + 40)).age = 0.0
			await _wait(0.75)
			await _shot(dir, "showcase_merge")
		"gameover":
			Save.tutorial_done = true
			start_game("classic")
			var r := world.jar.rect
			for i in 26:
				world._spawn([2, 3, 4, 5, 6][i % 5], r.position + Vector2(60.0 + (i * 137) % 480, r.size.y - 60.0 - i * 40.0)).age = 2.0
			world.highest = 8
			world.score = Save.best + 1361
			world.merges = 117
			world.best_chain = 4
			world.score_changed.emit(world.score, 0)
			await _wait(4.0)
			world._end()
			await _wait(3.6)
			await _shot(dir, "gameover")
		"collection":
			for i in PlanetData.COUNT:
				Save.discovered[i] = true
				Save.created[i] = maxi(Save.created[i], 3 + (PlanetData.COUNT - i) * 7)
			open_planetarium()
			await _wait(0.8)
			await _shot(dir, "collection")
		"tutorial":
			Save.tutorial_done = false
			start_game("classic")
			await _wait(1.2)
			await _shot(dir, "tutorial")
		_:
			start_game(_args.get("mode", "classic"))
			world.autoplay = _args.has("autoplay")
			var every := float(_args.get("every", "3"))
			for i in int(_args.get("count", "1")):
				await _wait(every)
				await _shot(dir, "shot_%02d" % i)
	get_tree().quit()


func _wait(seconds: float) -> void:
	await get_tree().create_timer(seconds, true, false, true).timeout


func _shot(dir: String, name: String) -> void:
	await RenderingServer.frame_post_draw
	print("[test] fps=%d" % Engine.get_frames_per_second())
	var img := get_viewport().get_texture().get_image()
	img.save_png("%s/%s.png" % [dir, name])
	print("[test] %s score=%d planets=%d" % [name, world.score, world.planet_count()])
