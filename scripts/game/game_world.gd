class_name GameWorld
extends Node2D
## The playfield: jar, dropper, planets, merging, scoring and game over.

signal score_changed(score: int, gained: int)
signal next_changed(tier: int)
signal chain(count: int, world_pos: Vector2)
signal discovered(tier: int)
signal seen(tier: int)
signal powerups_changed(black_holes: int, shakes: int)
signal powerup_earned(kind: String, world_pos: Vector2)
signal black_hole_aiming(active: bool)
signal supernova(world_pos: Vector2)
signal first_drop
signal first_merge
signal danger_changed(level: float)
signal game_over(result: Dictionary)

const DROP_COOLDOWN := 0.42
const CHAIN_WINDOW := 1.1
const DANGER_AGE := 1.4
const DANGER_GRACE := 3.0
const START_BLACK_HOLES := 1
const START_SHAKES := 1

var mode := "classic"
var score := 0
var running := false
var is_over := false
var current_tier := 0
var next_tier := 0
var black_holes := 0
var shakes := 0
var aiming_black_hole := false
var autoplay := false

var highest := 0
var merges := 0
var drops := 0
var supernovas := 0
var best_chain := 0
var elapsed := 0.0

var jar: Jar
var dropper: Dropper
var planets_root: Node2D
var fx_root: Node2D

var _rng := RandomNumberGenerator.new()
var _planets: Array[Planet] = []
var _cooldown := 0.0
var _chain_count := 0
var _last_merge_time := -10.0
var _danger_time := 0.0
var _danger_suppress := 0.0
var _pressing := false
var _shake_amount := 0.0
var _shake_offset := Vector2.ZERO
var _base_position := Vector2.ZERO
var _auto_timer := 0.0


func _ready() -> void:
	jar = Jar.new()
	add_child(jar)
	planets_root = Node2D.new()
	add_child(planets_root)
	fx_root = Node2D.new()
	fx_root.z_index = 30
	add_child(fx_root)
	dropper = Dropper.new()
	dropper.z_index = 10
	add_child(dropper)
	Save.settings_changed.connect(_on_settings_changed)
	_on_settings_changed()


## Positions the jar for the given visible area.
func layout(view: Vector2, safe_top: float, safe_bottom: float) -> void:
	var bottom_bar := 196.0 + safe_bottom
	var jar_bottom := view.y - bottom_bar
	var extra := maxf(view.y - 1280.0 - safe_top - safe_bottom, 0.0)
	jar_bottom -= extra * 0.35
	var top_left := Vector2((view.x - Jar.INNER_W) * 0.5, jar_bottom - Jar.INNER_H)
	jar.place(top_left)
	dropper.position.y = top_left.y - 78.0
	dropper.min_x = top_left.x
	dropper.max_x = top_left.x + Jar.INNER_W
	if dropper.target_x == 0.0:
		dropper.target_x = top_left.x + Jar.INNER_W * 0.5
		dropper.position.x = dropper.target_x


# ---------------------------------------------------------------------------
# Run lifecycle
# ---------------------------------------------------------------------------
func start(p_mode: String) -> void:
	_clear()
	mode = p_mode
	if mode == "daily":
		_rng.seed = Save.daily_seed()
	else:
		_rng.randomize()
	score = 0
	black_holes = START_BLACK_HOLES
	shakes = START_SHAKES
	highest = 0
	merges = 0
	drops = 0
	supernovas = 0
	best_chain = 0
	elapsed = 0.0
	current_tier = _roll(true)
	next_tier = _roll(true)
	_begin()


func restore(snap: Dictionary) -> bool:
	if snap.is_empty() or not snap.has("planets"):
		return false
	_clear()
	mode = snap.get("mode", "classic")
	score = int(snap.get("score", 0))
	current_tier = int(snap.get("current", 0))
	next_tier = int(snap.get("next", 0))
	black_holes = int(snap.get("black_holes", 0))
	shakes = int(snap.get("shakes", 0))
	highest = int(snap.get("highest", 0))
	merges = int(snap.get("merges", 0))
	drops = int(snap.get("drops", 0))
	supernovas = int(snap.get("supernovas", 0))
	best_chain = int(snap.get("best_chain", 0))
	elapsed = float(snap.get("elapsed", 0.0))
	_rng.seed = int(snap.get("seed", 0))
	_rng.state = int(snap.get("state", 0))
	for d in snap.planets:
		var p := _spawn(int(d.t), Vector2(d.x, d.y) + jar.rect.position)
		p.rotation = float(d.r)
		p.linear_velocity = Vector2(d.vx, d.vy)
		p.angular_velocity = float(d.w)
		p.age = 5.0
	_begin()
	return true


func snapshot() -> Dictionary:
	if not running or is_over:
		return {}
	var list := []
	for p in _planets:
		if not p.merging:
			var d := p.to_dict()
			d.x = snappedf(p.position.x - jar.rect.position.x, 0.01)
			d.y = snappedf(p.position.y - jar.rect.position.y, 0.01)
			list.append(d)
	return {
		"mode": mode, "score": score, "current": current_tier, "next": next_tier,
		"black_holes": black_holes, "shakes": shakes, "highest": highest,
		"merges": merges, "drops": drops, "supernovas": supernovas,
		"best_chain": best_chain, "elapsed": elapsed,
		"seed": _rng.seed, "state": _rng.state, "planets": list,
		"date": Save.today(),
	}


func _begin() -> void:
	running = true
	is_over = false
	aiming_black_hole = false
	_cooldown = 0.0
	_danger_time = 0.0
	_danger_suppress = 1.0
	_chain_count = 0
	jar.danger = 0.0
	dropper.target_x = jar.rect.get_center().x
	dropper.set_tier(current_tier)
	score_changed.emit(score, 0)
	next_changed.emit(next_tier)
	powerups_changed.emit(black_holes, shakes)


func stop() -> void:
	running = false
	_clear()


func _clear() -> void:
	for p in _planets:
		if is_instance_valid(p):
			p.queue_free()
	_planets.clear()
	for c in fx_root.get_children():
		c.queue_free()
	dropper.clear()
	is_over = false
	jar.danger = 0.0


func _roll(opening: bool = false) -> int:
	# The first drops are always small so every run starts gently.
	var limit := 3 if opening else PlanetData.DROPPABLE
	var total := 0.0
	for i in limit:
		total += PlanetData.DROP_WEIGHTS[i]
	var x := _rng.randf() * total
	for i in limit:
		x -= PlanetData.DROP_WEIGHTS[i]
		if x <= 0.0:
			return i
	return 0


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------
func _unhandled_input(event: InputEvent) -> void:
	if not running or is_over:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		var pos := _to_world(event)
		if event.pressed:
			if aiming_black_hole:
				_try_black_hole(pos)
				get_viewport().set_input_as_handled()
				return
			_pressing = true
			dropper.target_x = pos.x
		elif _pressing:
			_pressing = false
			dropper.target_x = pos.x
			drop()
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion and _pressing:
		dropper.target_x = _to_world(event).x
		get_viewport().set_input_as_handled()


func _to_world(event: InputEvent) -> Vector2:
	# Local to this node (and so to the jar and planets), ignoring screen shake.
	return (make_input_local(event) as InputEventMouse).position + _shake_offset


func cancel_press() -> void:
	_pressing = false


func drop() -> void:
	if not running or is_over or not dropper.ready_to_drop or _cooldown > 0.0:
		return
	# Drop exactly where the finger is, not where the smoothing has reached.
	dropper.position.x = dropper.target_x
	var p := _spawn(current_tier, dropper.global_position - global_position)
	p.linear_velocity = Vector2(0, 80)
	p.angular_velocity = _rng.randf_range(-0.6, 0.6)
	drops += 1
	Save.add_stat("drops")
	if Save.mark_seen(p.tier):
		seen.emit(p.tier)
	if drops == 1:
		first_drop.emit()
	Audio.play("drop", randf_range(0.95, 1.06) * (1.15 - current_tier * 0.06), -3.0)
	Audio.buzz(10, 0.2)
	dropper.clear()
	# A chain is a cascade of merges set off by one drop.
	_chain_count = 0
	_last_merge_time = -10.0
	current_tier = next_tier
	next_tier = _roll(drops < 3)
	next_changed.emit(next_tier)
	_cooldown = DROP_COOLDOWN


func _spawn(tier: int, local_pos: Vector2, grow_from: float = -1.0) -> Planet:
	var p := Planet.new()
	p.position = local_pos
	planets_root.add_child(p)
	p.setup(tier, grow_from)
	p.impact.connect(_on_impact)
	_planets.append(p)
	return p


func _on_impact(p: Planet, speed: float) -> void:
	if speed < 140.0 or p.merging:
		return
	var vol := clampf(remap(speed, 140.0, 900.0, -20.0, -4.0), -20.0, -4.0)
	Audio.play("thud", clampf(1.25 - p.tier * 0.06, 0.6, 1.3) * randf_range(0.94, 1.06), vol, 0.05)


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------
func _process(delta: float) -> void:
	_update_shake(delta)
	if not running or is_over:
		return
	elapsed += delta
	if _cooldown > 0.0:
		_cooldown -= delta
		if _cooldown <= 0.0 and not dropper.ready_to_drop:
			dropper.set_tier(current_tier)
	if autoplay:
		_auto_timer -= delta
		if _auto_timer <= 0.0 and dropper.ready_to_drop:
			_auto_timer = randf_range(0.5, 1.1)
			dropper.target_x = randf_range(jar.rect.position.x, jar.rect.end.x)
			get_tree().create_timer(0.25).timeout.connect(drop)


func _physics_process(delta: float) -> void:
	if not running or is_over:
		return
	_check_merges()
	_check_danger(delta)


func _check_merges() -> void:
	for p in _planets.duplicate():
		if p.merging or not is_instance_valid(p):
			continue
		for b in p.get_colliding_bodies():
			if b is Planet and b != p and not b.merging and b.tier == p.tier:
				_merge(p, b)
				break


func _merge(a: Planet, b: Planet) -> void:
	var tier := a.tier
	var pos := (a.position + b.position) * 0.5
	var vel := (a.linear_velocity + b.linear_velocity) * 0.5
	for p in [a, b]:
		p.detach()
		_planets.erase(p)
		_absorb(p, pos)

	var now := elapsed
	_chain_count = _chain_count + 1 if now - _last_merge_time < CHAIN_WINDOW else 1
	_last_merge_time = now
	best_chain = maxi(best_chain, _chain_count)
	merges += 1
	Save.add_stat("merges")
	if merges == 1:
		first_merge.emit()

	if tier == PlanetData.SUN:
		_supernova(pos)
		return

	var new_tier := tier + 1
	var np := _spawn(new_tier, pos, PlanetData.RADII[tier])
	np.linear_velocity = vel * 0.4
	np.age = 0.6
	np.visual.cheer(1.4)

	var mult := 1.0 + 0.25 * (_chain_count - 1)
	var gained := int(round(PlanetData.POINTS[new_tier] * mult))
	_add_score(gained)
	if new_tier > highest:
		highest = new_tier

	# Feedback scales with planet size.
	var col := PlanetData.COLORS[new_tier]
	var big := new_tier / 10.0
	Fx.burst(fx_root, pos, col, 14 + new_tier * 3, 220.0 + 260.0 * big, 1.0 + big)
	Fx.shockwave(fx_root, pos, PlanetData.RADII[new_tier] * 1.7, col.lightened(0.4), 5.0 + 6.0 * big)
	Fx.float_text(fx_root, pos + Vector2(0, -PlanetData.RADII[new_tier] * 0.4), "+%d" % gained,
		Color.WHITE.lerp(Ui.GOLD, minf(mult - 1.0, 1.0)), 30 + new_tier * 2)
	Audio.play("merge_%d" % new_tier, 1.0, -1.0, 0.0)
	Audio.buzz(12 + new_tier * 4, 0.25 + big * 0.6)
	if new_tier >= 6:
		add_shake(4.0 + new_tier * 1.6)
	if _chain_count >= 2:
		chain.emit(_chain_count, pos)
		Audio.play("chain", 1.0 + 0.08 * minf(_chain_count - 2, 6), -4.0)

	if Save.discover(new_tier):
		discovered.emit(new_tier)
	if new_tier == 8:
		_award("shake", pos)
	elif new_tier == 9:
		_award("black_hole", pos)


## Old planets fly together into the merge point.
func _absorb(p: Planet, target: Vector2) -> void:
	var t := p.create_tween().set_parallel(true)
	t.tween_property(p, "position", target, 0.09).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	t.tween_property(p.visual, "scale", Vector2(0.75, 0.75), 0.09)
	t.chain().tween_callback(p.queue_free)


func _supernova(pos: Vector2) -> void:
	supernovas += 1
	Save.add_stat("supernovas")
	_add_score(PlanetData.SUPERNOVA_POINTS)
	supernova.emit(pos + global_position)
	Fx.burst(fx_root, pos, Color(1.0, 0.8, 0.3), 90, 900.0, 2.6, 1.2)
	Fx.burst(fx_root, pos, Color(1.0, 0.4, 0.7), 50, 650.0, 2.0, 1.0)
	Fx.shockwave(fx_root, pos, 520.0, Color(1.0, 0.9, 0.6), 22.0, 0.8)
	Fx.shockwave(fx_root, pos, 340.0, Color(1.0, 0.55, 0.3), 14.0, 0.6)
	Fx.float_text(fx_root, pos + Vector2(0, -40), "SUPERNOVA!", Ui.GOLD, 64, 110.0, 1.6)
	Fx.float_text(fx_root, pos + Vector2(0, 30), "+%d" % PlanetData.SUPERNOVA_POINTS, Color.WHITE, 46, 90.0, 1.6)
	Audio.play("supernova", 1.0, 0.0, 0.0)
	Audio.buzz(220, 1.0)
	add_shake(26.0)
	for p in _planets:
		var d := p.position - pos
		var dist := maxf(d.length(), 1.0)
		var push := clampf(1.0 - dist / 600.0, 0.0, 1.0)
		p.apply_central_impulse(d / dist * push * 900.0 * p.mass + Vector2(0, -200.0 * push * p.mass))
	_danger_suppress = 2.5
	_award("black_hole", pos + Vector2(0, -70))
	_award("shake", pos)


func _award(kind: String, pos: Vector2) -> void:
	if kind == "shake":
		shakes += 1
	else:
		black_holes += 1
	powerups_changed.emit(black_holes, shakes)
	powerup_earned.emit(kind, pos + global_position)
	Audio.play("powerup", 1.0, -3.0)


func _add_score(n: int) -> void:
	score += n
	score_changed.emit(score, n)


func _check_danger(delta: float) -> void:
	if _danger_suppress > 0.0:
		_danger_suppress -= delta
	var line := jar.line_y()
	var any := false
	for p in _planets:
		if p.merging:
			continue
		var over := p.age > DANGER_AGE and p.position.y - p.radius < line
		if over:
			any = true
		p.visual.set_mood(PlanetFace.Mood.WORRIED if over or (_danger_time > 0.0 and p.position.y - p.radius < line + 80.0) else PlanetFace.Mood.NORMAL)
	if any and _danger_suppress <= 0.0:
		var before := _danger_time
		_danger_time += delta
		if int(before * 2.0) != int(_danger_time * 2.0):
			Audio.play("warning", 1.0 + _danger_time * 0.1, -6.0)
			Audio.buzz(18, 0.3)
	else:
		_danger_time = maxf(_danger_time - delta * 3.0, 0.0)
	var level := clampf(_danger_time / DANGER_GRACE, 0.0, 1.0)
	if absf(level - jar.danger) > 0.001:
		jar.danger = level
		danger_changed.emit(level)
	if _danger_time >= DANGER_GRACE:
		_end()


func _end() -> void:
	is_over = true
	running = false
	dropper.clear()
	_pressing = false
	aiming_black_hole = false
	black_hole_aiming.emit(false)
	jar.danger = 1.0
	for p in _planets:
		p.set_deferred("freeze", true)
		p.visual.set_mood(PlanetFace.Mood.SLEEPY)
	Audio.play("game_over", 1.0, -2.0, 0.0)
	Audio.buzz(160, 0.7)
	add_shake(10.0)
	var result := {
		"mode": mode, "score": score, "highest": highest, "merges": merges,
		"drops": drops, "supernovas": supernovas, "best_chain": best_chain,
		"seconds": elapsed,
	}
	# Let the moment land before the results appear.
	get_tree().create_timer(1.1).timeout.connect(func(): game_over.emit(result))


# ---------------------------------------------------------------------------
# Power-ups
# ---------------------------------------------------------------------------
func toggle_black_hole() -> void:
	if not running or is_over:
		return
	if aiming_black_hole:
		aiming_black_hole = false
	elif black_holes > 0 and not _planets.is_empty():
		aiming_black_hole = true
	black_hole_aiming.emit(aiming_black_hole)


func _try_black_hole(pos: Vector2) -> void:
	var best: Planet = null
	var best_d := INF
	for p in _planets:
		if p.merging:
			continue
		var d := p.position.distance_to(pos) - p.radius
		if d < best_d:
			best_d = d
			best = p
	if best == null or best_d > 40.0:
		Audio.play("click", 0.7, -8.0)
		return
	aiming_black_hole = false
	black_hole_aiming.emit(false)
	black_holes -= 1
	powerups_changed.emit(black_holes, shakes)
	_swallow(best)


func _swallow(p: Planet) -> void:
	p.detach()
	_planets.erase(p)
	p.visual.surprise(2.0)
	var hole := Fx.BlackHole.new()
	hole.radius = p.radius * 1.15
	hole.position = p.position
	hole.z_index = -1
	fx_root.add_child(hole)
	Audio.play("black_hole", 1.0, -2.0, 0.0)
	Audio.buzz(120, 0.6)
	var t := create_tween()
	t.tween_property(hole, "strength", 1.0, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.parallel().tween_property(p.visual, "rotation", p.visual.rotation + TAU * 2.0, 0.85).set_delay(0.15)
	t.parallel().tween_property(p.visual, "scale", Vector2(0.02, 0.02), 0.75).set_delay(0.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	t.tween_callback(p.queue_free)
	t.tween_property(hole, "strength", 0.0, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	t.tween_callback(hole.queue_free)
	Fx.float_text(fx_root, p.position + Vector2(0, -p.radius - 20.0), "Gulp!", Color("c9a6ff"), 36)


func use_shake() -> void:
	if not running or is_over or shakes <= 0:
		return
	shakes -= 1
	powerups_changed.emit(black_holes, shakes)
	_danger_suppress = 2.5
	_danger_time = 0.0
	for p in _planets:
		if p.merging:
			continue
		p.sleeping = false
		var side := _rng.randf_range(-1.0, 1.0)
		p.apply_central_impulse(Vector2(side * 380.0, -_rng.randf_range(760.0, 1040.0)) * p.mass)
		p.apply_torque_impulse(side * 6000.0 * p.mass)
		p.visual.surprise(1.4)
	add_shake(22.0)
	Audio.play("shake", 1.0, -1.0, 0.0)
	Audio.buzz(260, 0.8)


# ---------------------------------------------------------------------------
# Screen shake
# ---------------------------------------------------------------------------
func add_shake(amount: float) -> void:
	_shake_amount = minf(_shake_amount + amount, 40.0)


func _update_shake(delta: float) -> void:
	if _shake_amount <= 0.05:
		if _shake_offset != Vector2.ZERO:
			_shake_offset = Vector2.ZERO
			position = _base_position
		return
	_shake_amount = lerpf(_shake_amount, 0.0, 1.0 - exp(-delta * 7.0))
	_shake_offset = Vector2(randf_range(-1, 1), randf_range(-1, 1)) * _shake_amount
	position = _base_position + _shake_offset


func _on_settings_changed() -> void:
	dropper.show_guide = Save.get_setting("guide")
	var faces := Save.get_setting("faces")
	for p in _planets:
		p.visual.face_enabled = faces
	if dropper._visual:
		dropper._visual.face_enabled = faces


func planet_count() -> int:
	return _planets.size()
