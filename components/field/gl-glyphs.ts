/*
 * Draws the background's characters on the GPU (WebGL 2): every character is a small square
 * copied from the sheet of sprites, each with its own opacity, all in one draw call. Drawing
 * them one by one on a 2D canvas costs several milliseconds a frame at retina resolution;
 * this costs a fraction of one. Positions are device px, so the result is pixel for pixel
 * what the 2D canvas would draw.
 */

const VERTEX = `#version 300 es
in vec2 a_corner;
in vec2 a_pos;
in float a_kind;
in float a_alpha;
uniform vec2 u_res;
uniform float u_cell;
uniform float u_kinds;
out vec2 v_uv;
out float v_alpha;
void main() {
  vec2 p = a_pos + a_corner * u_cell;
  gl_Position = vec4(p.x / u_res.x * 2.0 - 1.0, 1.0 - p.y / u_res.y * 2.0, 0.0, 1.0);
  v_uv = vec2((a_kind + a_corner.x) / u_kinds, a_corner.y);
  v_alpha = a_alpha;
}`;

const FRAGMENT = `#version 300 es
precision mediump float;
uniform sampler2D u_atlas;
uniform vec3 u_ink;
in vec2 v_uv;
in float v_alpha;
out vec4 color;
void main() {
  float a = texture(u_atlas, v_uv).a * v_alpha;
  color = vec4(u_ink * a, a);
}`;

export interface GlyphLayer {
  /** The sheet of sprites: `kinds` squares `cell` device px wide in a row, and the ink color. */
  setAtlas(atlas: HTMLCanvasElement, cell: number, kinds: number, ink: string): void;
  /** Each character's top-left corner (device px) and sprite. */
  setGlyphs(x: Int32Array, y: Int32Array, kind: Uint8Array): void;
  /** Draws every character at its opacity. */
  draw(alpha: Float32Array): void;
  /** Frees what it holds on the GPU (the canvas keeps its context, for whoever draws next). */
  dispose(): void;
}

/** A GPU glyph layer on the canvas, or null where WebGL 2 isn't available. */
export function glyphLayer(canvas: HTMLCanvasElement): GlyphLayer | null {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return null;

  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn(gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const uRes = uniform("u_res");
  const uCell = uniform("u_cell");
  const uKinds = uniform("u_kinds");
  const uInk = uniform("u_ink");
  gl.uniform1i(uniform("u_atlas"), 0);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  // One buffer per attribute: the square's corners (shared), then per character.
  const attribute = (name: string, size: number, data: BufferSource | null, perGlyph: boolean) => {
    const loc = gl.getAttribLocation(program, name);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    if (data) gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    if (perGlyph) gl.vertexAttribDivisor(loc, 1);
    return buf;
  };
  const cornerBuf = attribute("a_corner", 2, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), false);
  const posBuf = attribute("a_pos", 2, null, true);
  const kindBuf = attribute("a_kind", 1, null, true);
  const alphaBuf = attribute("a_alpha", 1, null, true);

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  let count = 0;
  let alphaSize = 0;
  // The canvas's context may be shared with an earlier layer (React mounts twice in
  // development), so each call makes this layer's program and buffers current first.
  const use = () => {
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  };

  return {
    setAtlas(atlas, cell, kinds, ink) {
      use();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
      gl.uniform1f(uCell, cell);
      gl.uniform1f(uKinds, kinds);
      // The ink as 0–1 RGB, by way of the 2D canvas's own color parsing.
      const probe = document.createElement("canvas").getContext("2d")!;
      probe.fillStyle = ink;
      const hex = /^#[0-9a-f]{6}$/i.test(probe.fillStyle) ? probe.fillStyle : "#1d1d1b";
      gl.uniform3f(uInk, parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
    },

    setGlyphs(x, y, kind) {
      use();
      count = x.length;
      const pos = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        pos[i * 2] = x[i];
        pos[i * 2 + 1] = y[i];
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, kindBuf);
      gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(kind), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuf);
      gl.bufferData(gl.ARRAY_BUFFER, count * 4, gl.DYNAMIC_DRAW);
      alphaSize = count;
    },

    draw(alpha) {
      use();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!count || alpha.length < count || alphaSize !== count) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, alpha, 0, count);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    },

    dispose() {
      for (const b of [cornerBuf, posBuf, kindBuf, alphaBuf]) gl.deleteBuffer(b);
      gl.deleteTexture(texture);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
