// Draws lit planets with WebGL. Each planet is a pre-rendered Blender sphere:
// an albedo map and a camera-space normal map. The light stays fixed at the
// top-left of the screen while the planet sprite rotates, so planets can roll
// freely and still look three-dimensional.

import { RIM_COLORS, RIM_STRENGTH, SUN } from "../game/planets";

export interface PlanetTextures {
  albedo: HTMLImageElement;
  normal: HTMLImageElement;
  spec?: HTMLImageElement;
}

export interface DrawOpts {
  flash?: number;
  alpha?: number;
  locked?: number;
}

const VERT = `
attribute vec2 a_corner;
uniform vec4 u_xf;      // centre x, centre y, radius, angle (world units)
uniform vec2 u_view;    // world -> clip scale
uniform vec2 u_off;     // camera offset (screen shake)
varying vec2 v_uv;
varying vec2 v_c;
void main() {
  float cs = cos(u_xf.w), sn = sin(u_xf.w);
  vec2 c = a_corner;
  vec2 p = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * u_xf.z + u_xf.xy + u_off;
  gl_Position = vec4(p.x * u_view.x - 1.0, 1.0 - p.y * u_view.y, 0.0, 1.0);
  v_uv = c * 0.5 + 0.5;
  v_c = c;
}`;

const FRAG = `
precision mediump float;
uniform sampler2D u_alb;
uniform sampler2D u_nrm;
uniform sampler2D u_spec;
uniform float u_angle;
uniform vec3 u_rim;
uniform float u_rimStrength;
uniform float u_specStrength;
uniform float u_emissive;
uniform float u_locked;
uniform float u_flash;
uniform float u_alpha;
varying vec2 v_uv;
varying vec2 v_c;
const vec3 SUN_DIR = vec3(-0.5145, -0.5799, 0.5238); // screen space, y down

void main() {
  vec4 alb = texture2D(u_alb, v_uv);
  if (alb.a < 0.004) discard;
  vec3 base = alb.rgb / alb.a;               // textures are premultiplied on upload
  vec3 nt = texture2D(u_nrm, v_uv).rgb * 2.0 - 1.0;
  vec2 nl = vec2(nt.x, -nt.y);               // image +y is up, screen +y is down
  float cs = cos(u_angle), sn = sin(u_angle);
  vec3 n = normalize(vec3(nl.x * cs - nl.y * sn, nl.x * sn + nl.y * cs, max(nt.z, 0.0)));

  float wrap = clamp((dot(n, SUN_DIR) + 0.28) / 1.28, 0.0, 1.0);
  vec3 col = base * (0.13 + pow(wrap, 1.25));

  vec3 h = normalize(SUN_DIR + vec3(0.0, 0.0, 1.0));
  col += texture2D(u_spec, v_uv).r * pow(max(dot(n, h), 0.0), 36.0) * u_specStrength;

  // Atmosphere: brightest towards the light, fading round the night side.
  float d = clamp(length(v_c), 0.0, 1.0);
  vec2 cw = vec2(v_c.x * cs - v_c.y * sn, v_c.x * sn + v_c.y * cs);
  float facing = clamp(dot(normalize(cw + 1e-4), SUN_DIR.xy) * 0.6 + 0.55, 0.0, 1.0);
  col += u_rim * pow(d, 3.5) * u_rimStrength * facing;

  col = mix(col, base * 1.08 + vec3(0.04, 0.02, 0.0) * (1.0 - d), u_emissive);
  vec3 shadow = vec3(0.10, 0.09, 0.20) + vec3(0.25, 0.25, 0.45) * pow(d, 6.0);
  col = mix(col, shadow, u_locked);
  col = mix(col, vec3(1.0), u_flash);
  float a = alb.a * u_alpha;
  gl_FragColor = vec4(col * a, a);
}`;

interface TierGL {
  albedo: WebGLTexture;
  normal: WebGLTexture;
  spec: WebGLTexture;
  specStrength: number;
}

export class PlanetGL {
  readonly gl: WebGLRenderingContext | null;
  private prog!: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private tiers: TierGL[] = [];
  private black!: WebGLTexture;
  private boundTier = -1;

  constructor(readonly canvas: HTMLCanvasElement) {
    const opts: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: false };
    this.gl = (canvas.getContext("webgl", opts) ?? canvas.getContext("experimental-webgl", opts)) as WebGLRenderingContext | null;
    if (this.gl) this.init();
  }

  get ok(): boolean {
    return this.gl !== null;
  }

  private init(): void {
    const gl = this.gl!;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    this.prog = prog;
    gl.useProgram(prog);
    for (const name of ["u_xf", "u_view", "u_off", "u_alb", "u_nrm", "u_spec", "u_angle", "u_rim", "u_rimStrength",
      "u_specStrength", "u_emissive", "u_locked", "u_flash", "u_alpha"]) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_corner");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(this.u.u_alb, 0);
    gl.uniform1i(this.u.u_nrm, 1);
    gl.uniform1i(this.u.u_spec, 2);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const black = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, black);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.black = black;
  }

  private texture(img: HTMLImageElement, premultiply: boolean): WebGLTexture {
    const gl = this.gl!;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  load(textures: PlanetTextures[]): void {
    if (!this.gl) return;
    this.tiers = textures.map((t) => ({
      albedo: this.texture(t.albedo, true),
      normal: this.texture(t.normal, false),
      spec: t.spec ? this.texture(t.spec, false) : this.black,
      specStrength: t.spec ? 0.75 : 0,
    }));
  }

  /** Starts a frame covering a world area of viewW x viewH. */
  begin(viewW: number, viewH: number, offX = 0, offY = 0): void {
    const gl = this.gl;
    if (!gl) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.u_view, 2 / viewW, 2 / viewH);
    gl.uniform2f(this.u.u_off, offX, offY);
    this.boundTier = -1;
  }

  draw(tier: number, x: number, y: number, radius: number, angle: number, o: DrawOpts = {}): void {
    const gl = this.gl;
    if (!gl || !this.tiers[tier]) return;
    if (this.boundTier !== tier) {
      const t = this.tiers[tier];
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, t.albedo);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, t.normal);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, t.spec);
      const rim = RIM_COLORS[tier];
      gl.uniform3f(this.u.u_rim, rim[0], rim[1], rim[2]);
      gl.uniform1f(this.u.u_rimStrength, RIM_STRENGTH[tier]);
      gl.uniform1f(this.u.u_specStrength, t.specStrength);
      gl.uniform1f(this.u.u_emissive, tier === SUN ? 1 : 0);
      this.boundTier = tier;
    }
    gl.uniform4f(this.u.u_xf, x, y, radius, angle);
    gl.uniform1f(this.u.u_angle, angle);
    gl.uniform1f(this.u.u_locked, o.locked ?? 0);
    gl.uniform1f(this.u.u_flash, o.flash ?? 0);
    gl.uniform1f(this.u.u_alpha, o.alpha ?? 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose(): void {
    this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
