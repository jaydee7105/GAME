class_name Planet
extends RigidBody2D
## A physical planet in the jar.

signal impact(planet: Planet, speed: float)

static var _physics_material: PhysicsMaterial

var tier := 0
var radius := 20.0
## Seconds since the planet entered the jar (merges start a little older).
var age := 0.0
## Set once the planet is being merged or swallowed; it must be ignored.
var merging := false
var visual: PlanetVisual

var _shape: CircleShape2D


func setup(p_tier: int, grow_from: float = -1.0) -> Planet:
	tier = p_tier
	radius = PlanetData.RADII[tier]
	mass = PlanetData.mass(tier)
	gravity_scale = 1.0
	linear_damp = 0.08
	angular_damp = 0.8
	can_sleep = true
	contact_monitor = true
	max_contacts_reported = 8
	continuous_cd = RigidBody2D.CCD_MODE_CAST_SHAPE
	if _physics_material == null:
		_physics_material = PhysicsMaterial.new()
		_physics_material.friction = 0.45
		_physics_material.bounce = 0.12
	physics_material_override = _physics_material

	_shape = CircleShape2D.new()
	_shape.radius = PlanetData.collision_radius(tier)
	var cs := CollisionShape2D.new()
	cs.shape = _shape
	add_child(cs)

	visual = PlanetVisual.new()
	visual.face_enabled = Save.get_setting("faces")
	visual.setup(tier)
	add_child(visual)

	body_entered.connect(_on_body_entered)

	if grow_from > 0.0:
		_grow(grow_from)
	return self


func _grow(from_radius: float) -> void:
	var target := PlanetData.collision_radius(tier)
	var start := from_radius / radius
	_shape.radius = target * start
	visual.scale = Vector2.ONE * start
	visual.flash = 0.85
	var t := create_tween().set_parallel(true)
	t.tween_property(_shape, "radius", target, 0.14).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	t.tween_property(visual, "scale", Vector2.ONE, 0.5).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	t.tween_property(visual, "flash", 0.0, 0.35)


func _physics_process(delta: float) -> void:
	age += delta


func _on_body_entered(body: Node) -> void:
	var speed := linear_velocity.length()
	if body is RigidBody2D:
		speed = (linear_velocity - (body as RigidBody2D).linear_velocity).length()
	impact.emit(self, speed)


## Removes the planet from the simulation without freeing it yet.
func detach() -> void:
	merging = true
	set_deferred("freeze", true)
	collision_layer = 0
	collision_mask = 0
	set_deferred("contact_monitor", false)


func to_dict() -> Dictionary:
	return {
		"t": tier,
		"x": snappedf(position.x, 0.01),
		"y": snappedf(position.y, 0.01),
		"r": snappedf(rotation, 0.001),
		"vx": snappedf(linear_velocity.x, 0.01),
		"vy": snappedf(linear_velocity.y, 0.01),
		"w": snappedf(angular_velocity, 0.001),
	}
