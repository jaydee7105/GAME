shader_type canvas_item;
// Lights a pre-rendered planet (albedo + camera-space normal map from Blender).
// The planet sprite can rotate freely: normals are rotated with the node while
// the light stays fixed at the top-left of the screen.

uniform sampler2D normal_tex : filter_linear_mipmap;
uniform sampler2D spec_tex : hint_default_black, filter_linear_mipmap;
uniform vec3 rim_color : source_color = vec3(0.6, 0.75, 1.0);
uniform float rim_strength = 0.4;
uniform float spec_strength = 0.0;
uniform float emissive = 0.0;
uniform float locked = 0.0;
uniform float flash = 0.0;
uniform vec4 tint : source_color = vec4(1.0, 1.0, 1.0, 0.0);

varying vec2 rot_x;
varying vec2 rot_y;

const vec3 SUN_DIR = vec3(-0.5145, -0.5799, 0.5238); // normalize(-0.55, -0.62, 0.56), y down

void vertex() {
	rot_x = normalize(MODEL_MATRIX[0].xy);
	rot_y = normalize(MODEL_MATRIX[1].xy);
}

void fragment() {
	vec4 alb = texture(TEXTURE, UV);
	vec3 nt = texture(normal_tex, UV).rgb * 2.0 - 1.0;
	// Image space has +y up; canvas space has +y down.
	vec2 nl = vec2(nt.x, -nt.y);
	vec3 n = normalize(vec3(rot_x * nl.x + rot_y * nl.y, max(nt.z, 0.0)));

	float ndl = dot(n, SUN_DIR);
	float wrap = clamp((ndl + 0.28) / 1.28, 0.0, 1.0);
	float lit = 0.13 + 1.0 * pow(wrap, 1.25);
	vec3 col = alb.rgb * lit;

	vec3 h = normalize(SUN_DIR + vec3(0.0, 0.0, 1.0));
	col += texture(spec_tex, UV).r * pow(max(dot(n, h), 0.0), 36.0) * spec_strength;

	// Atmosphere: brightest towards the light, fading round the night side.
	vec2 c = UV * 2.0 - 1.0;
	float d = clamp(length(c), 0.0, 1.0);
	vec2 cw = rot_x * c.x + rot_y * c.y;
	float facing = clamp(dot(normalize(cw + 1e-4), SUN_DIR.xy) * 0.6 + 0.55, 0.0, 1.0);
	float rim = pow(d, 3.5) * rim_strength * facing;
	col += rim_color * rim;

	col = mix(col, alb.rgb * 1.08 + vec3(0.04, 0.02, 0.0) * (1.0 - d), emissive);

	vec3 shadow = vec3(0.10, 0.09, 0.20) + vec3(0.25, 0.25, 0.45) * pow(d, 6.0);
	col = mix(col, shadow, locked);
	col = mix(col, tint.rgb, tint.a);
	col = mix(col, vec3(1.0), flash);
	COLOR = vec4(col, alb.a) * COLOR;
}
