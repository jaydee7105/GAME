class_name PlanetVisual
extends Node2D
## Everything you see of a planet: lit sphere, atmosphere halo, Saturn's
## rings, the Sun's glow and the cartoon face. Used in the jar and in menus.

const SHADER := preload("res://shaders/planet.gdshader")
const TEX_SIZE := 512.0

static var _halo_tex: Texture2D
static var _glow_tex: Texture2D
static var _materials := {}

var tier := 0
var radius := 20.0
var face: PlanetFace
var face_enabled := true:
	set(v):
		face_enabled = v
		if face:
			face.visible = v and not locked
var locked := false:
	set(v):
		locked = v
		if _mat:
			_mat.set_shader_parameter("locked", 1.0 if v else 0.0)
		if face:
			face.visible = face_enabled and not v
		if _halo:
			_halo.visible = not v
		if _glow:
			_glow.visible = not v
		if _ring:
			_ring.modulate = Color(0.12, 0.11, 0.22) if v else Color.WHITE
## Animated white flash (0..1).
var flash := 0.0:
	set(v):
		flash = v
		if _mat:
			_mat.set_shader_parameter("flash", v)

var _sprite: Sprite2D
var _mat: ShaderMaterial
var _ring: Sprite2D
var _halo: Sprite2D
var _glow: Sprite2D
var _time := 0.0


func setup(p_tier: int, p_radius: float = -1.0) -> PlanetVisual:
	tier = p_tier
	radius = p_radius if p_radius > 0.0 else PlanetData.RADII[tier]
	var s := (radius * 2.0) / TEX_SIZE
	var rim_strength := PlanetData.RIM_STRENGTH[tier]

	if tier == PlanetData.SUN:
		_glow = Sprite2D.new()
		_glow.texture = _get_glow_tex()
		_glow.material = _additive()
		_glow.modulate = Color(1.0, 0.72, 0.25, 0.85)
		var gs := radius * 3.3 / 256.0
		_glow.scale = Vector2(gs, gs)
		add_child(_glow)
	elif rim_strength > 0.2:
		_halo = Sprite2D.new()
		_halo.texture = _get_halo_tex()
		var c: Color = PlanetData.RIM_COLORS[tier]
		c.a = clampf(rim_strength * 0.75, 0.0, 0.7)
		_halo.modulate = c
		var hs := radius * 2.36 / 256.0
		_halo.scale = Vector2(hs, hs)
		add_child(_halo)

	_sprite = Sprite2D.new()
	_sprite.texture = PlanetData.albedo(tier)
	_sprite.scale = Vector2(s, s)
	_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_mat = ShaderMaterial.new()
	_mat.shader = SHADER
	_mat.set_shader_parameter("normal_tex", PlanetData.normal_map(tier))
	var spec := PlanetData.spec_map(tier)
	if spec:
		_mat.set_shader_parameter("spec_tex", spec)
		_mat.set_shader_parameter("spec_strength", 0.75)
	_mat.set_shader_parameter("rim_color", PlanetData.RIM_COLORS[tier])
	_mat.set_shader_parameter("rim_strength", rim_strength)
	_mat.set_shader_parameter("emissive", 1.0 if tier == PlanetData.SUN else 0.0)
	_sprite.material = _mat
	add_child(_sprite)

	face = PlanetFace.new()
	face.radius = radius * (0.85 if tier == 0 else 1.0)
	face.visible = face_enabled and not locked
	add_child(face)

	if PlanetData.KEYS[tier] == "saturn":
		_ring = Sprite2D.new()
		_ring.texture = load("res://assets/planets/saturn_ring.png")
		_ring.scale = Vector2(s, s)
		_ring.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
		add_child(_ring)
	return self


func set_mood(mood: PlanetFace.Mood) -> void:
	if face:
		face.mood = mood


func cheer(seconds: float = 1.2) -> void:
	if face:
		face.cheer(seconds)


func surprise(seconds: float = 1.2) -> void:
	if face:
		face.surprise(seconds)


func set_tint(color: Color) -> void:
	if _mat:
		_mat.set_shader_parameter("tint", color)


func _process(delta: float) -> void:
	_time += delta
	if _ring:
		# Rings keep their tilt while the planet rolls underneath.
		_ring.global_rotation = 0.0
	if _halo:
		_halo.global_rotation = 0.0
	if _glow:
		var pulse := 1.0 + sin(_time * 2.2) * 0.04 + sin(_time * 5.3) * 0.015
		var gs := radius * 3.3 / 256.0 * pulse
		_glow.scale = Vector2(gs, gs)
		_glow.rotation = _time * 0.1


static func _additive() -> CanvasItemMaterial:
	if not _materials.has("add"):
		var m := CanvasItemMaterial.new()
		m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		_materials["add"] = m
	return _materials["add"]


static func _radial(stops: Array) -> GradientTexture2D:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array(stops.map(func(s): return s[0]))
	g.colors = PackedColorArray(stops.map(func(s): return s[1]))
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	t.width = 256
	t.height = 256
	return t


## Thin atmosphere ring hugging the planet edge (planet edge at 1/1.18).
static func _get_halo_tex() -> Texture2D:
	if _halo_tex == null:
		_halo_tex = _radial([
			[0.0, Color(1, 1, 1, 0)],
			[0.80, Color(1, 1, 1, 0)],
			[0.85, Color(1, 1, 1, 0.9)],
			[0.91, Color(1, 1, 1, 0.28)],
			[1.0, Color(1, 1, 1, 0)],
		])
	return _halo_tex


static func _get_glow_tex() -> Texture2D:
	if _glow_tex == null:
		_glow_tex = _radial([
			# The Sun's edge sits at 1 / 1.65 of the glow radius.
			[0.0, Color(1, 1, 1, 1)],
			[0.58, Color(1, 1, 1, 0.9)],
			[0.64, Color(1, 1, 1, 0.42)],
			[0.78, Color(1, 1, 1, 0.13)],
			[1.0, Color(1, 1, 1, 0)],
		])
	return _glow_tex
