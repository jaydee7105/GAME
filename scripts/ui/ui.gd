class_name Ui
## Shared look and feel: fonts, colours, styled widgets and the app theme.

const FONT_PATH := "res://assets/fonts/Fredoka.ttf"

const INK := Color("0d0b22")
const PANEL := Color("1d1850")
const PANEL_EDGE := Color("6a5cff")
const TEXT := Color("f6f3ff")
const MUTED := Color("aaa3d6")
const GOLD := Color("ffd34d")
const ORANGE := Color("ff9f2e")
const VIOLET := Color("7b6cff")
const PINK := Color("ff6fa8")
const TEAL := Color("3fe0c5")
const DANGER := Color("ff4d6d")

const BUTTON_COLORS := {
	"primary": [Color("ffb340"), Color("d9731f"), Color("3a1c00")],
	"secondary": [Color("6d5cff"), Color("4535c2"), Color.WHITE],
	"teal": [Color("2fd3b6"), Color("17917c"), Color("05302a")],
	"ghost": [Color(1, 1, 1, 0.08), Color(1, 1, 1, 0.04), Color.WHITE],
	"pink": [Color("ff6fa8"), Color("c23d74"), Color.WHITE],
}

static var _font_file: FontFile
static var _fonts := {}
static var _theme: Theme


static func font(weight: int = 600) -> Font:
	if not _fonts.has(weight):
		if _font_file == null:
			_font_file = load(FONT_PATH)
		var f := FontVariation.new()
		f.base_font = _font_file
		var ts := TextServerManager.get_primary_interface()
		f.variation_opentype = {ts.name_to_tag("wght"): weight, ts.name_to_tag("wdth"): 100}
		_fonts[weight] = f
	return _fonts[weight]


static func label_settings(size: int, color: Color = TEXT, weight: int = 600,
		outline: int = 0, outline_color: Color = INK, shadow: bool = false) -> LabelSettings:
	var s := LabelSettings.new()
	s.font = font(weight)
	s.font_size = size
	s.font_color = color
	s.outline_size = outline
	s.outline_color = outline_color
	if shadow:
		s.shadow_size = 0
		s.shadow_color = Color(0, 0, 0, 0.35)
		s.shadow_offset = Vector2(0, maxf(2.0, size * 0.06))
	return s


static func label(text: String, size: int = 32, color: Color = TEXT, weight: int = 600,
		align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_CENTER) -> Label:
	var l := Label.new()
	l.text = text
	l.label_settings = label_settings(size, color, weight)
	l.horizontal_alignment = align
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func panel_style(color: Color = PANEL, radius: int = 40, border: Color = PANEL_EDGE) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = color
	s.set_corner_radius_all(radius)
	s.border_color = Color(border, 0.55)
	s.set_border_width_all(3)
	s.shadow_color = Color(0, 0, 0, 0.45)
	s.shadow_size = 24
	s.shadow_offset = Vector2(0, 10)
	s.set_content_margin_all(36)
	s.anti_aliasing = true
	s.corner_detail = 12
	return s


static func panel(radius: int = 40) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", panel_style(PANEL, radius))
	return p


static func _button_box(face: Color, edge: Color, depth: int, radius: int) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = face
	s.border_color = edge
	s.border_width_bottom = depth
	s.set_corner_radius_all(radius)
	s.content_margin_left = 28
	s.content_margin_right = 28
	s.content_margin_top = 14 + (8 - depth)
	s.content_margin_bottom = 14
	s.anti_aliasing = true
	s.corner_detail = 10
	return s


## A chunky, tactile button with a press-down animation and click sound.
static func button(text: String, kind: String = "primary", font_size: int = 40,
		min_size: Vector2 = Vector2(0, 104)) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = min_size
	b.focus_mode = Control.FOCUS_NONE
	style_button(b, kind, font_size)
	return b


static func style_button(b: Button, kind: String = "primary", font_size: int = 40, radius: int = 30) -> void:
	var c: Array = BUTTON_COLORS[kind]
	b.add_theme_stylebox_override("normal", _button_box(c[0], c[1], 8, radius))
	b.add_theme_stylebox_override("hover", _button_box(c[0].lightened(0.06), c[1], 8, radius))
	b.add_theme_stylebox_override("pressed", _button_box(c[0].darkened(0.06), c[1], 2, radius))
	b.add_theme_stylebox_override("disabled", _button_box(Color(c[0], 0.35), Color(c[1], 0.35), 8, radius))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	b.add_theme_font_override("font", font(700))
	b.add_theme_font_size_override("font_size", font_size)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(state, c[2])
	b.add_theme_color_override("font_disabled_color", Color(c[2], 0.5))
	b.add_theme_color_override("icon_normal_color", c[2])
	b.add_theme_color_override("icon_pressed_color", c[2])
	b.add_theme_color_override("icon_hover_color", c[2])
	if not b.button_down.is_connected(_on_down):
		b.button_down.connect(_on_down.bind(b))
		b.button_up.connect(_on_up.bind(b))


static func _on_down(b: Button) -> void:
	Audio.play("click", 1.0, -4.0)
	Audio.buzz(8, 0.25)
	b.pivot_offset = b.size * 0.5
	var t := b.create_tween()
	t.tween_property(b, "scale", Vector2(0.96, 0.96), 0.06)


static func _on_up(b: Button) -> void:
	var t := b.create_tween()
	t.tween_property(b, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## Round button showing a vector icon.
static func icon_button(icon: String, kind: String = "ghost", diameter: float = 92.0) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(diameter, diameter)
	b.focus_mode = Control.FOCUS_NONE
	style_button(b, kind, 30, int(diameter / 2.0))
	for state in ["normal", "hover", "pressed", "disabled"]:
		var box: StyleBoxFlat = b.get_theme_stylebox(state)
		box.set_content_margin_all(0)
	var ic := UiIcon.new()
	ic.kind = icon
	ic.color = BUTTON_COLORS[kind][2]
	ic.set_anchors_preset(Control.PRESET_FULL_RECT)
	ic.offset_bottom = -4
	ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(ic)
	return b


static func theme() -> Theme:
	if _theme == null:
		_theme = Theme.new()
		_theme.default_font = font(600)
		_theme.default_font_size = 32
		_theme.set_color("font_color", "Label", TEXT)
	return _theme


## Pops a control in with a little overshoot.
static func pop_in(c: Control, delay: float = 0.0, from_scale: float = 0.6) -> void:
	c.pivot_offset = c.size * 0.5
	c.scale = Vector2.ONE * from_scale
	c.modulate.a = 0.0
	var t := c.create_tween().set_parallel(true)
	t.tween_property(c, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT).set_delay(delay)
	t.tween_property(c, "modulate:a", 1.0, 0.2).set_delay(delay)


static func format_score(n: int) -> String:
	var s := str(n)
	var out := ""
	var count := 0
	for i in range(s.length() - 1, -1, -1):
		out = s[i] + out
		count += 1
		if count % 3 == 0 and i > 0:
			out = "," + out
	return out
