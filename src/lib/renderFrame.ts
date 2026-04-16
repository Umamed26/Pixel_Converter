// 帧渲染器：绘制像素网格、执行 FX 链并叠加对话框。/ Frame renderer: draws grid, runs FX chain, and overlays dialogs.
import type { DialogState, EffectsState, EffectTuning, MaskState, PixelGrid } from "../types";

type FrameColor = string | null;
type FramePixels = FrameColor[][];

interface DialogThemeConfig {
  isWin95?: boolean;
  isTerminal?: boolean;
  backgroundFlat?: string;
  color?: string;
  nameColor?: string;
  nameBg?: string;
  framePixels?: FramePixels;
  frameSliceRaw?: number;
}

const FRAME_DQ_LIGHT = "#ffffff";
const FRAME_DQ_DARK = "#000000";
const FRAME_FF_LIGHT = "#8888dd";
const FRAME_FF_DARK = "#333366";
const FRAME_FF_MID = "#000066";
const FRAME_RETRO_LIGHT = "#c8a870";
const FRAME_RETRO_MID = "#6a4a2a";
const FRAME_RETRO_DARK = "#2a1a0a";

const DQ_FRAME_PIXELS: FramePixels = [
  [null, null, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, null, null],
  [null, FRAME_DQ_LIGHT, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_LIGHT, null],
  [FRAME_DQ_LIGHT, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_LIGHT],
  [FRAME_DQ_LIGHT, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_LIGHT],
  [FRAME_DQ_LIGHT, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_LIGHT, null, null, FRAME_DQ_LIGHT, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_LIGHT],
  [FRAME_DQ_LIGHT, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_LIGHT, null, null, FRAME_DQ_LIGHT, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_LIGHT],
  [FRAME_DQ_LIGHT, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_LIGHT],
  [FRAME_DQ_LIGHT, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_LIGHT],
  [null, FRAME_DQ_LIGHT, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_DARK, FRAME_DQ_LIGHT, null],
  [null, null, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, FRAME_DQ_LIGHT, null, null],
];

const FF_FRAME_PIXELS: FramePixels = [
  [null, FRAME_FF_LIGHT, FRAME_FF_LIGHT, FRAME_FF_LIGHT, FRAME_FF_LIGHT, FRAME_FF_LIGHT, FRAME_FF_LIGHT, null],
  [FRAME_FF_LIGHT, FRAME_FF_LIGHT, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_DARK, FRAME_FF_DARK],
  [FRAME_FF_LIGHT, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_DARK],
  [FRAME_FF_LIGHT, FRAME_FF_MID, FRAME_FF_MID, null, null, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_DARK],
  [FRAME_FF_LIGHT, FRAME_FF_MID, FRAME_FF_MID, null, null, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_DARK],
  [FRAME_FF_LIGHT, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_DARK],
  [FRAME_FF_LIGHT, FRAME_FF_DARK, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_MID, FRAME_FF_DARK, FRAME_FF_DARK],
  [null, FRAME_FF_DARK, FRAME_FF_DARK, FRAME_FF_DARK, FRAME_FF_DARK, FRAME_FF_DARK, FRAME_FF_DARK, null],
];

const RETRO_FRAME_PIXELS: FramePixels = [
  [null, null, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, null, null],
  [null, FRAME_RETRO_LIGHT, FRAME_RETRO_MID, FRAME_RETRO_MID, FRAME_RETRO_MID, FRAME_RETRO_MID, FRAME_RETRO_MID, FRAME_RETRO_MID, FRAME_RETRO_LIGHT, null],
  [FRAME_RETRO_LIGHT, FRAME_RETRO_MID, FRAME_RETRO_DARK, FRAME_RETRO_DARK, FRAME_RETRO_DARK, FRAME_RETRO_DARK, FRAME_RETRO_DARK, FRAME_RETRO_DARK, FRAME_RETRO_MID, FRAME_RETRO_LIGHT],
  [FRAME_RETRO_LIGHT, FRAME_RETRO_MID, FRAME_RETRO_DARK, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_DARK, FRAME_RETRO_MID, FRAME_RETRO_LIGHT],
  [FRAME_RETRO_LIGHT, FRAME_RETRO_MID, FRAME_RETRO_DARK, FRAME_RETRO_LIGHT, null, null, FRAME_RETRO_LIGHT, FRAME_RETRO_DARK, FRAME_RETRO_MID, FRAME_RETRO_LIGHT],
  [FRAME_RETRO_LIGHT, FRAME_RETRO_MID, FRAME_RETRO_DARK, FRAME_RETRO_LIGHT, null, null, FRAME_RETRO_LIGHT, FRAME_RETRO_DARK, FRAME_RETRO_MID, FRAME_RETRO_LIGHT],
  [FRAME_RETRO_LIGHT, FRAME_RETRO_MID, FRAME_RETRO_DARK, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_DARK, FRAME_RETRO_MID, FRAME_RETRO_LIGHT],
  [FRAME_RETRO_LIGHT, FRAME_RETRO_MID, FRAME_RETRO_DARK, FRAME_RETRO_DARK, FRAME_RETRO_DARK, FRAME_RETRO_DARK, FRAME_RETRO_DARK, FRAME_RETRO_DARK, FRAME_RETRO_MID, FRAME_RETRO_LIGHT],
  [null, FRAME_RETRO_LIGHT, FRAME_RETRO_MID, FRAME_RETRO_MID, FRAME_RETRO_MID, FRAME_RETRO_MID, FRAME_RETRO_MID, FRAME_RETRO_MID, FRAME_RETRO_LIGHT, null],
  [null, null, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, FRAME_RETRO_LIGHT, null, null],
];

function remapFramePixels(pixels: FramePixels, map: Record<string, string>): FramePixels {
  return pixels.map((row) => row.map((cell) => (cell ? (map[cell] ?? cell) : null)));
}

const NEON_FRAME_PIXELS = remapFramePixels(FF_FRAME_PIXELS, {
  [FRAME_FF_LIGHT]: "#7df9ff",
  [FRAME_FF_DARK]: "#4b007c",
  [FRAME_FF_MID]: "#1a1236",
});

const STONE_FRAME_PIXELS = remapFramePixels(DQ_FRAME_PIXELS, {
  [FRAME_DQ_LIGHT]: "#e8e8e8",
  [FRAME_DQ_DARK]: "#4a4a4a",
});

const PAPER_FRAME_PIXELS = remapFramePixels(RETRO_FRAME_PIXELS, {
  [FRAME_RETRO_LIGHT]: "#b39266",
  [FRAME_RETRO_MID]: "#7a5b3a",
  [FRAME_RETRO_DARK]: "#f4ebcf",
});

const VOID_FRAME_PIXELS = remapFramePixels(DQ_FRAME_PIXELS, {
  [FRAME_DQ_LIGHT]: "#9f8cff",
  [FRAME_DQ_DARK]: "#261b4f",
});

const AQUA_FRAME_PIXELS = remapFramePixels(FF_FRAME_PIXELS, {
  [FRAME_FF_LIGHT]: "#8ffff0",
  [FRAME_FF_DARK]: "#0f5b5b",
  [FRAME_FF_MID]: "#0b2f2f",
});

const DIALOG_THEME_CONFIG: Record<DialogState["style"], DialogThemeConfig> = {
  win95: { isWin95: true },
  terminal: { isTerminal: true },
  dq: {
    backgroundFlat: "#000000",
    color: "#ffffff",
    nameColor: "#ffffff",
    nameBg: "#000000",
    framePixels: DQ_FRAME_PIXELS,
    frameSliceRaw: 4,
  },
  ff: {
    backgroundFlat: "#000066",
    color: "#ffffff",
    nameColor: "#ffffff",
    nameBg: "#000066",
    framePixels: FF_FRAME_PIXELS,
    frameSliceRaw: 3,
  },
  retro: {
    backgroundFlat: "#2a1a0a",
    color: "#f0e0c0",
    nameColor: "#ffe0a0",
    nameBg: "#2a1a0a",
    framePixels: RETRO_FRAME_PIXELS,
    frameSliceRaw: 4,
  },
  neon: {
    backgroundFlat: "#120018",
    color: "#7dfff2",
    nameColor: "#ff8cf0",
    nameBg: "#2a0038",
    framePixels: NEON_FRAME_PIXELS,
    frameSliceRaw: 3,
  },
  stone: {
    backgroundFlat: "#2d2d2d",
    color: "#f0f0f0",
    nameColor: "#ffffff",
    nameBg: "#3a3a3a",
    framePixels: STONE_FRAME_PIXELS,
    frameSliceRaw: 4,
  },
  paper: {
    backgroundFlat: "#f4ebcf",
    color: "#4a3721",
    nameColor: "#2d1d10",
    nameBg: "#ead8b5",
    framePixels: PAPER_FRAME_PIXELS,
    frameSliceRaw: 4,
  },
  void: {
    backgroundFlat: "#080818",
    color: "#d0c2ff",
    nameColor: "#ffffff",
    nameBg: "#141432",
    framePixels: VOID_FRAME_PIXELS,
    frameSliceRaw: 4,
  },
  aqua: {
    backgroundFlat: "#052a2a",
    color: "#b8fff1",
    nameColor: "#e5fffb",
    nameBg: "#0a3c3c",
    framePixels: AQUA_FRAME_PIXELS,
    frameSliceRaw: 3,
  },
};

const EFFECT_TICK_MS = 120;
const GRID_TILE_SIZE = 64;
const TILE_RENDER_THRESHOLD = 24_000;
const WEBGL_VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = (a_pos + 1.0) * 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;
const WEBGL_FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
void main() {
  gl_FragColor = texture2D(u_tex, vec2(v_uv.x, 1.0 - v_uv.y));
}
`;

interface WebGLGridResources {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  texture: WebGLTexture;
  positionLocation: number;
  textureLocation: WebGLUniformLocation;
  pixelData: Uint8Array;
  pixelDataWidth: number;
  pixelDataHeight: number;
}

const WEBGL_GRID_CACHE = new WeakMap<HTMLCanvasElement, WebGLGridResources>();

/**
 * 限制数值到区间。/ Clamp number into range.
 * @param value 输入值 / Input value.
 * @param min 最小值 / Lower bound.
 * @param max 最大值 / Upper bound.
 * @returns 限制后的值 / Clamped value.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 将百分比参数限制到安全范围。/ Clamp percentage parameter into safe range.
 * @param value 百分比值 / Percentage value.
 * @param min 最小百分比 / Minimum percentage.
 * @param max 最大百分比 / Maximum percentage.
 * @returns 规范化百分比 / Normalized percentage.
 */
function clampPercent(value: number, min = 0, max = 300): number {
  return clamp(value, min, max);
}

/**
 * 百分比转强度系数。/ Convert percentage into strength factor.
 * @param percent 百分比 / Percentage.
 * @returns 强度系数 / Strength scale.
 */
function toStrength(percent: number): number {
  return clampPercent(percent) / 100;
}

/**
 * 百分比转速度倍率。/ Convert percentage into speed scale.
 * @param percent 百分比 / Percentage.
 * @returns 速度倍率 / Speed scale.
 */
function toSpeedScale(percent: number): number {
  return clampPercent(percent, 10, 400) / 100;
}

/**
 * 按速度缩放离散 tick。/ Scale discrete tick by speed setting.
 * @param baseTick 基础 tick / Base tick.
 * @param speedPercent 速度百分比 / Speed percentage.
 * @returns 缩放后 tick / Scaled tick.
 */
function scaleTick(baseTick: number, speedPercent: number): number {
  return Math.floor(baseTick * toSpeedScale(speedPercent));
}

/**
 * 构造可复现伪随机生成器。/ Create deterministic pseudo-random generator.
 * @param seed 随机种子 / Seed value.
 * @returns 生成 [0,1) 浮点数的函数 / Generator returning [0,1) values.
 */
function createSeededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * 编译 WebGL 着色器。/ Compile a WebGL shader.
 * @param gl WebGL 上下文 / WebGL context.
 * @param type 着色器类型 / Shader type.
 * @param source GLSL 源码 / GLSL source.
 * @returns 着色器对象；失败返回 null / Shader object or null.
 */
function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * 创建 WebGL Program。/ Create a WebGL program.
 * @param gl WebGL 上下文 / WebGL context.
 * @returns Program 对象；失败返回 null / Program object or null.
 */
function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, WEBGL_VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, WEBGL_FRAGMENT_SHADER);
  if (!vertex || !fragment) {
    if (vertex) {
      gl.deleteShader(vertex);
    }
    if (fragment) {
      gl.deleteShader(fragment);
    }
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * 构建并缓存 WebGL 网格渲染资源。/ Build and cache WebGL grid rendering resources.
 * @param targetCanvas 主渲染画布 / Main render canvas.
 * @returns WebGL 资源；不可用时返回 null / WebGL resources or null.
 */
function getWebGLGridResources(targetCanvas: HTMLCanvasElement): WebGLGridResources | null {
  const cached = WEBGL_GRID_CACHE.get(targetCanvas);
  if (cached) {
    return cached;
  }
  const offscreen = document.createElement("canvas");
  const gl = offscreen.getContext("webgl", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    return null;
  }
  const program = createProgram(gl);
  if (!program) {
    return null;
  }

  const positionLocation = gl.getAttribLocation(program, "a_pos");
  const textureLocation = gl.getUniformLocation(program, "u_tex");
  if (positionLocation < 0 || !textureLocation) {
    gl.deleteProgram(program);
    return null;
  }

  const positionBuffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!positionBuffer || !texture) {
    if (positionBuffer) {
      gl.deleteBuffer(positionBuffer);
    }
    if (texture) {
      gl.deleteTexture(texture);
    }
    gl.deleteProgram(program);
    return null;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]),
    gl.STATIC_DRAW,
  );

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const resources: WebGLGridResources = {
    canvas: offscreen,
    gl,
    program,
    positionBuffer,
    texture,
    positionLocation,
    textureLocation,
    pixelData: new Uint8Array(0),
    pixelDataWidth: 0,
    pixelDataHeight: 0,
  };
  WEBGL_GRID_CACHE.set(targetCanvas, resources);
  return resources;
}

/**
 * 将索引网格转换为 RGBA 像素缓冲。/ Convert index grid into RGBA pixel buffer.
 * @param resources WebGL 资源缓存 / WebGL resource cache.
 * @param grid 像素网格 / Pixel grid.
 * @returns RGBA 像素缓冲 / RGBA pixel buffer.
 */
function gridToRgbaPixels(resources: WebGLGridResources, grid: PixelGrid): Uint8Array {
  const total = grid.width * grid.height;
  if (
    resources.pixelData.length !== total * 4
    || resources.pixelDataWidth !== grid.width
    || resources.pixelDataHeight !== grid.height
  ) {
    resources.pixelData = new Uint8Array(total * 4);
    resources.pixelDataWidth = grid.width;
    resources.pixelDataHeight = grid.height;
  }
  const { pixelData } = resources;
  for (let i = 0; i < total; i += 1) {
    const colorIndex = grid.indices[i];
    const color = grid.colors[colorIndex] ?? [0, 0, 0];
    const offset = i * 4;
    pixelData[offset] = color[0];
    pixelData[offset + 1] = color[1];
    pixelData[offset + 2] = color[2];
    pixelData[offset + 3] = 255;
  }
  return pixelData;
}

/**
 * 使用 WebGL 渲染基础像素网格。/ Render base pixel grid with WebGL.
 * @param targetCanvas 主渲染画布 / Main render canvas.
 * @param ctx 主画布 2D 上下文 / Main canvas 2D context.
 * @param grid 像素网格 / Pixel grid.
 * @returns 是否渲染成功 / Whether rendering succeeded.
 */
function drawGridWithWebGL(
  targetCanvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  grid: PixelGrid,
): boolean {
  const resources = getWebGLGridResources(targetCanvas);
  if (!resources) {
    return false;
  }
  const { canvas, gl, program, texture, positionBuffer, positionLocation, textureLocation } = resources;
  canvas.width = targetCanvas.width;
  canvas.height = targetCanvas.height;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const pixels = gridToRgbaPixels(resources, grid);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    grid.width,
    grid.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixels,
  );
  gl.uniform1i(textureLocation, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  ctx.drawImage(canvas, 0, 0, targetCanvas.width, targetCanvas.height);
  return true;
}

/**
 * 将网格索引绘制到画布。/ Draw indexed pixel grid to canvas.
 * @param canvas 目标画布 / Target canvas.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param grid 像素网格 / Pixel grid.
 * @param useWebGL 是否启用 WebGL 加速底图渲染 / Whether to use WebGL accelerated base-grid rendering.
 * @returns 无返回值 / No return value.
 */
function drawGrid(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  grid: PixelGrid,
  useWebGL: boolean,
): void {
  const { width, height, pixelSize, indices, colors } = grid;
  if (!colors.length) {
    return;
  }
  if (useWebGL && drawGridWithWebGL(canvas, ctx, grid)) {
    return;
  }
  const cellCount = width * height;
  if (cellCount > TILE_RENDER_THRESHOLD) {
    for (let tileY = 0; tileY < height; tileY += GRID_TILE_SIZE) {
      const endY = Math.min(height, tileY + GRID_TILE_SIZE);
      for (let tileX = 0; tileX < width; tileX += GRID_TILE_SIZE) {
        const endX = Math.min(width, tileX + GRID_TILE_SIZE);
        for (let y = tileY; y < endY; y += 1) {
          for (let x = tileX; x < endX; x += 1) {
            const i = y * width + x;
            const colorIndex = indices[i];
            const [r, g, b] = colors[colorIndex] ?? [0, 0, 0];
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
          }
        }
      }
    }
    return;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const colorIndex = indices[i];
      const [r, g, b] = colors[colorIndex] ?? [0, 0, 0];
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
    }
  }
}

/**
 * 判断某个效果是否应受蒙版约束。/ Decide whether an effect should be masked.
 * @param mask 当前蒙版状态 / Current mask state.
 * @param effectKey 效果键 / Effect key.
 * @param grid 当前网格 / Current grid.
 * @returns 是否启用局部蒙版 / True when masked effect should be applied.
 */
function shouldUseEffectMask(mask: MaskState, effectKey: keyof EffectsState, grid: PixelGrid): boolean {
  return Boolean(
    mask.enabled
    && mask.data
    && mask.data.length === grid.width * grid.height
    && mask.width === grid.width
    && mask.height === grid.height
    && mask.fxEnabled[effectKey],
  );
}

/**
 * 将效果前后图像按蒙版合并。/ Merge before/after images with mask gating.
 * @param before 应用前图像 / Image before effect.
 * @param after 应用后图像 / Image after effect.
 * @param maskData 蒙版位图 / Mask bitmap data.
 * @param grid 当前网格信息 / Current grid metadata.
 * @returns 无返回值 / No return value.
 */
function mergeMaskedEffectResult(
  before: ImageData,
  after: ImageData,
  maskData: Uint8Array,
  grid: PixelGrid,
): void {
  const { width: canvasWidth, height: canvasHeight } = before;
  const { width: gridWidth, height: gridHeight, pixelSize } = grid;
  const beforePixels = before.data;
  const afterPixels = after.data;

  for (let y = 0; y < canvasHeight; y += 1) {
    const cellY = Math.min(gridHeight - 1, Math.floor(y / pixelSize));
    const rowOffset = cellY * gridWidth;
    for (let x = 0; x < canvasWidth; x += 1) {
      const cellX = Math.min(gridWidth - 1, Math.floor(x / pixelSize));
      const maskAlpha = maskData[rowOffset + cellX];
      if (maskAlpha >= 255) {
        continue;
      }
      const pixelOffset = (y * canvasWidth + x) * 4;
      if (maskAlpha <= 0) {
        afterPixels[pixelOffset] = beforePixels[pixelOffset];
        afterPixels[pixelOffset + 1] = beforePixels[pixelOffset + 1];
        afterPixels[pixelOffset + 2] = beforePixels[pixelOffset + 2];
        afterPixels[pixelOffset + 3] = beforePixels[pixelOffset + 3];
        continue;
      }
      const blend = maskAlpha / 255;
      afterPixels[pixelOffset] = Math.round(beforePixels[pixelOffset] + (afterPixels[pixelOffset] - beforePixels[pixelOffset]) * blend);
      afterPixels[pixelOffset + 1] = Math.round(beforePixels[pixelOffset + 1] + (afterPixels[pixelOffset + 1] - beforePixels[pixelOffset + 1]) * blend);
      afterPixels[pixelOffset + 2] = Math.round(beforePixels[pixelOffset + 2] + (afterPixels[pixelOffset + 2] - beforePixels[pixelOffset + 2]) * blend);
      afterPixels[pixelOffset + 3] = Math.round(beforePixels[pixelOffset + 3] + (afterPixels[pixelOffset + 3] - beforePixels[pixelOffset + 3]) * blend);
    }
  }
}

/**
 * 在“全局生效”和“蒙版局部生效”之间自动切换效果执行。/ Run effect globally or masked by current mask settings.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param canvas 目标画布 / Target canvas.
 * @param grid 当前网格 / Current grid.
 * @param mask 当前蒙版 / Current mask.
 * @param effectKey 效果键 / Effect key.
 * @param applyEffect 实际效果执行函数 / Effect callback.
 * @returns 无返回值 / No return value.
 */
function applyEffectWithOptionalMask(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  grid: PixelGrid,
  mask: MaskState,
  effectKey: keyof EffectsState,
  applyEffect: () => void,
): void {
  if (!shouldUseEffectMask(mask, effectKey, grid) || !mask.data) {
    applyEffect();
    return;
  }

  const before = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyEffect();
  const after = ctx.getImageData(0, 0, canvas.width, canvas.height);
  mergeMaskedEffectResult(before, after, mask.data, grid);
  ctx.putImageData(after, 0, 0);
}

/**
 * 故障条纹效果（通道错位 + 行偏移）。/ Apply glitch effect (channel shift + scanline offsets).
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param width 画布宽度 / Canvas width.
 * @param height 画布高度 / Canvas height.
 * @param pixelSize 像素块尺寸 / Pixel size.
 * @param baseTick 基础 tick / Base tick.
 * @param tuning 效果调参 / Effect tuning values.
 * @returns 无返回值 / No return value.
 */
function applyGlitch(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelSize: number,
  baseTick: number,
  tuning: EffectTuning,
): void {
  const strength = toStrength(tuning.glitchPower);
  if (strength <= 0) {
    return;
  }

  const tick = scaleTick(baseTick, tuning.glitchSpeed);
  const imageData = ctx.getImageData(0, 0, width, height);
  const shifted = new Uint8ClampedArray(imageData.data);
  const channelShift = Math.max(pixelSize, Math.round(pixelSize * 1.5 * strength));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const right = Math.min(width - 1, x + channelShift);
      const left = Math.max(0, x - channelShift);
      shifted[idx] = imageData.data[(y * width + right) * 4];
      shifted[idx + 1] = imageData.data[idx + 1];
      shifted[idx + 2] = imageData.data[(y * width + left) * 4 + 2];
      shifted[idx + 3] = imageData.data[idx + 3];
    }
  }

  const base = new Uint8ClampedArray(shifted);
  const random = createSeededRandom(
    ((tick + 1) * 2654435761) ^ (width << 11) ^ height ^ pixelSize,
  );
  const stripeCount = Math.max(1, Math.round((8 + Math.floor(random() * 8)) * Math.max(0.35, strength)));
  for (let i = 0; i < stripeCount; i += 1) {
    const smallStripe = random() < 0.5;
    const startY = Math.floor((random() * height) / pixelSize) * pixelSize;
    const stripeHeight = smallStripe
      ? (1 + Math.floor(random() * 2)) * pixelSize
      : (3 + Math.floor(random() * 4)) * pixelSize;
    const maxShift = (smallStripe ? pixelSize * 6 : pixelSize * 2) * strength;
    const shift = Math.round((random() - 0.5) * 2 * maxShift);

    for (let y = startY; y < Math.min(height, startY + stripeHeight); y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceX = x - shift;
        const targetIdx = (y * width + x) * 4;
        if (sourceX >= 0 && sourceX < width) {
          const sourceIdx = (y * width + sourceX) * 4;
          shifted[targetIdx] = base[sourceIdx];
          shifted[targetIdx + 1] = base[sourceIdx + 1];
          shifted[targetIdx + 2] = base[sourceIdx + 2];
          shifted[targetIdx + 3] = base[sourceIdx + 3];
        } else {
          shifted[targetIdx] = 0;
          shifted[targetIdx + 1] = 0;
          shifted[targetIdx + 2] = 0;
          shifted[targetIdx + 3] = imageData.data[targetIdx + 3];
        }
      }
    }
  }

  ctx.putImageData(new ImageData(shifted, width, height), 0, 0);
}

/**
 * CRT 效果（扫描线 + 轻微色偏）。/ Apply CRT effect (scanlines and slight chromatic offset).
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param width 画布宽度 / Canvas width.
 * @param height 画布高度 / Canvas height.
 * @param tuning 效果调参 / Effect tuning values.
 * @returns 无返回值 / No return value.
 */
function applyCrt(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tuning: EffectTuning,
): void {
  const strength = toStrength(tuning.crtPower);
  if (strength <= 0) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const source = new Uint8ClampedArray(data);
  const oddRowBrightness = 1 - 0.35 * strength;
  const chromaOffset = Math.max(1, Math.round(strength));

  for (let y = 0; y < height; y += 1) {
    const brightness = y % 2 === 1 ? oddRowBrightness : 1;
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const left = Math.max(0, x - chromaOffset);
      const right = Math.min(width - 1, x + chromaOffset);
      data[idx] = source[(y * width + left) * 4] * brightness;
      data[idx + 1] = source[idx + 1] * brightness;
      data[idx + 2] = source[(y * width + right) * 4 + 2] * brightness;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * 将 RGB 三通道编码为整型键。/ Encode RGB into an integer map key.
 * @param r 红色通道 / Red channel.
 * @param g 绿色通道 / Green channel.
 * @param b 蓝色通道 / Blue channel.
 * @returns 编码键 / Encoded key.
 */
function encodeRgbKey(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

/**
 * 调色板循环效果。/ Apply palette-cycling effect.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param width 画布宽度 / Canvas width.
 * @param height 画布高度 / Canvas height.
 * @param palette 当前调色板 / Active palette.
 * @param baseTick 基础 tick / Base tick.
 * @param tuning 效果调参 / Effect tuning values.
 * @returns 无返回值 / No return value.
 */
function applyPaletteCycle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: PixelGrid["colors"],
  baseTick: number,
  tuning: EffectTuning,
): void {
  const paletteLength = palette.length;
  if (paletteLength === 0) {
    return;
  }
  const tick = scaleTick(baseTick, tuning.paletteCycleSpeed);
  const step = Math.max(1, Math.round(tuning.paletteCycleStep));
  const cycle = (tick * step) % paletteLength;
  if (cycle === 0) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const paletteMap = new Map<number, number>();
  palette.forEach((color, index) => {
    paletteMap.set(encodeRgbKey(color[0], color[1], color[2]), index);
  });

  for (let i = 0; i < data.length; i += 4) {
    const key = encodeRgbKey(data[i], data[i + 1], data[i + 2]);
    const colorIndex = paletteMap.get(key);
    if (colorIndex !== undefined) {
      const nextColor = palette[(colorIndex + cycle) % paletteLength];
      data[i] = nextColor[0];
      data[i + 1] = nextColor[1];
      data[i + 2] = nextColor[2];
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * 残影拖尾效果。/ Apply ghost trail effect.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param width 画布宽度 / Canvas width.
 * @param height 画布高度 / Canvas height.
 * @param baseTick 基础 tick / Base tick.
 * @param tuning 效果调参 / Effect tuning values.
 * @returns 无返回值 / No return value.
 */
function applyGhostTrail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseTick: number,
  tuning: EffectTuning,
): void {
  const strength = toStrength(tuning.ghostPower);
  if (strength <= 0) {
    return;
  }

  const tick = scaleTick(baseTick, tuning.ghostSpeed);
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const source = new Uint8ClampedArray(data);
  const angle = (tick * 0.12) % (Math.PI * 2);
  const shiftX = Math.round(Math.cos(angle) * 3 * strength);
  const shiftY = Math.round(Math.sin(angle) * 2 * strength);
  const ghostMix = Math.min(0.95, 0.3 * strength);
  const baseMix = 1 - ghostMix;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = x - shiftX;
      const sourceY = y - shiftY;
      if (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height) {
        continue;
      }
      const targetIdx = (y * width + x) * 4;
      const sourceIdx = (sourceY * width + sourceX) * 4;
      data[targetIdx] = Math.round(data[targetIdx] * baseMix + source[sourceIdx] * ghostMix);
      data[targetIdx + 1] = Math.round(data[targetIdx + 1] * baseMix + source[sourceIdx + 1] * ghostMix);
      data[targetIdx + 2] = Math.round(data[targetIdx + 2] * baseMix + source[sourceIdx + 2] * ghostMix);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

const DITHER_MATRIX = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

/**
 * 抖动淡出效果。/ Apply dither fade effect.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param width 画布宽度 / Canvas width.
 * @param height 画布高度 / Canvas height.
 * @param baseTick 基础 tick / Base tick.
 * @param tuning 效果调参 / Effect tuning values.
 * @returns 无返回值 / No return value.
 */
function applyDitherFade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseTick: number,
  tuning: EffectTuning,
): void {
  const strength = toStrength(tuning.ditherPower);
  if (strength <= 0) {
    return;
  }

  const tick = scaleTick(baseTick, tuning.ditherSpeed);
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const threshold = 8 + Math.sin(tick * 0.15) * (6 * strength);
  const darkenFactor = 1 - 0.7 * strength;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (DITHER_MATRIX[y % 4][x % 4] > threshold) {
        const idx = (y * width + x) * 4;
        data[idx] *= darkenFactor;
        data[idx + 1] *= darkenFactor;
        data[idx + 2] *= darkenFactor;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * 波浪扭曲效果。/ Apply horizontal wave warp effect.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param width 画布宽度 / Canvas width.
 * @param height 画布高度 / Canvas height.
 * @param pixelSize 像素块尺寸 / Pixel size.
 * @param baseTick 基础 tick / Base tick.
 * @param tuning 效果调参 / Effect tuning values.
 * @returns 无返回值 / No return value.
 */
function applyWaveWarp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelSize: number,
  baseTick: number,
  tuning: EffectTuning,
): void {
  const strength = toStrength(tuning.wavePower);
  if (strength <= 0) {
    return;
  }

  const tick = scaleTick(baseTick, tuning.waveSpeed);
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const source = new Uint8ClampedArray(data);
  const amplitude = Math.max(1, Math.round(pixelSize * 1.8 * strength));
  const wavelength = Math.max(pixelSize * 6, Math.round(height / (2.5 + strength)));
  const phase = tick * 0.35;

  for (let y = 0; y < height; y += 1) {
    const shift = Math.round(Math.sin((y / wavelength) * Math.PI * 2 + phase) * amplitude);
    for (let x = 0; x < width; x += 1) {
      const wrappedX = (x - shift + width) % width;
      const targetIdx = (y * width + x) * 4;
      const sourceIdx = (y * width + wrappedX) * 4;
      data[targetIdx] = source[sourceIdx];
      data[targetIdx + 1] = source[sourceIdx + 1];
      data[targetIdx + 2] = source[sourceIdx + 2];
      data[targetIdx + 3] = source[sourceIdx + 3];
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * 扫描线效果（独立于 CRT）。/ Apply standalone scanline shading.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param width 画布宽度 / Canvas width.
 * @param height 画布高度 / Canvas height.
 * @param baseTick 基础 tick / Base tick.
 * @param tuning 效果调参 / Effect tuning values.
 * @returns 无返回值 / No return value.
 */
function applyScanlines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseTick: number,
  tuning: EffectTuning,
): void {
  const strength = toStrength(tuning.scanlinePower);
  if (strength <= 0) {
    return;
  }

  const tick = baseTick;
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  for (let y = 0; y < height; y += 1) {
    const wave = Math.sin((y + tick * 0.35) * 0.14) * 0.08 * strength;
    const rowDim = (y % 2 === 0 ? 0.12 : 0.33) * strength;
    const brightness = clamp(1 - rowDim + wave, 0.2, 1);
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      data[idx] = Math.round(data[idx] * brightness);
      data[idx + 1] = Math.round(data[idx + 1] * brightness);
      data[idx + 2] = Math.round(data[idx + 2] * brightness);
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * 暗角效果。/ Apply vignette darkening.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param width 画布宽度 / Canvas width.
 * @param height 画布高度 / Canvas height.
 * @param tuning 效果调参 / Effect tuning values.
 * @returns 无返回值 / No return value.
 */
function applyVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tuning: EffectTuning,
): void {
  const strength = toStrength(tuning.vignettePower);
  if (strength <= 0) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxDist = Math.hypot(cx, cy) || 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const distRatio = Math.hypot(dx, dy) / maxDist;
      const edgeDark = Math.pow(distRatio, 1.8) * 0.72 * strength;
      const brightness = clamp(1 - edgeDark, 0.12, 1);
      data[idx] = Math.round(data[idx] * brightness);
      data[idx + 1] = Math.round(data[idx + 1] * brightness);
      data[idx + 2] = Math.round(data[idx + 2] * brightness);
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * 色差（RGB 通道偏移）效果。/ Apply chromatic aberration channel offset.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param width 画布宽度 / Canvas width.
 * @param height 画布高度 / Canvas height.
 * @param baseTick 基础 tick / Base tick.
 * @param tuning 效果调参 / Effect tuning values.
 * @returns 无返回值 / No return value.
 */
function applyChromaShift(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseTick: number,
  tuning: EffectTuning,
): void {
  const strength = toStrength(tuning.chromaPower);
  if (strength <= 0) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const source = new Uint8ClampedArray(data);
  const shift = Math.max(1, Math.round(2.5 * strength));
  const yShift = Math.round(Math.sin(baseTick * 0.2) * shift);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const rx = clamp(x - shift, 0, width - 1);
      const gx = clamp(x, 0, width - 1);
      const bx = clamp(x + shift, 0, width - 1);
      const ry = clamp(y - yShift, 0, height - 1);
      const by = clamp(y + yShift, 0, height - 1);
      data[idx] = source[(ry * width + rx) * 4];
      data[idx + 1] = source[(y * width + gx) * 4 + 1];
      data[idx + 2] = source[(by * width + bx) * 4 + 2];
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 像素排序效果（按亮度对局部段排序）。/ Apply local pixel-sorting by luminance.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param width 画布宽度 / Canvas width.
 * @param height 画布高度 / Canvas height.
 * @param baseTick 基础 tick / Base tick.
 * @param tuning 效果调参 / Effect tuning values.
 * @returns 无返回值 / No return value.
 */
function applyPixelSort(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseTick: number,
  tuning: EffectTuning,
): void {
  const strength = toStrength(tuning.pixelSortPower);
  if (strength <= 0) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const source = new Uint8ClampedArray(data);
  const blockSize = clamp(Math.round(6 + (1 - strength) * 18), 4, 28);
  const threshold = 95 + strength * 90;
  const reverse = baseTick % 2 === 1;

  for (let y = 0; y < height; y += 1) {
    for (let startX = 0; startX < width; startX += blockSize) {
      const endX = Math.min(width, startX + blockSize);
      let hasHighlight = false;
      for (let x = startX; x < endX; x += 1) {
        const idx = (y * width + x) * 4;
        if (luma(source[idx], source[idx + 1], source[idx + 2]) >= threshold) {
          hasHighlight = true;
          break;
        }
      }
      if (!hasHighlight) {
        continue;
      }

      const segment: Array<{ r: number; g: number; b: number; a: number; y: number }> = [];
      for (let x = startX; x < endX; x += 1) {
        const idx = (y * width + x) * 4;
        segment.push({
          r: source[idx],
          g: source[idx + 1],
          b: source[idx + 2],
          a: source[idx + 3],
          y: luma(source[idx], source[idx + 1], source[idx + 2]),
        });
      }

      segment.sort((a, b) => (reverse ? b.y - a.y : a.y - b.y));
      for (let x = startX; x < endX; x += 1) {
        const pixel = segment[x - startX];
        const idx = (y * width + x) * 4;
        data[idx] = pixel.r;
        data[idx + 1] = pixel.g;
        data[idx + 2] = pixel.b;
        data[idx + 3] = pixel.a;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * 噪点颗粒效果。/ Apply film-like noise grain.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param width 画布宽度 / Canvas width.
 * @param height 画布高度 / Canvas height.
 * @param baseTick 基础 tick / Base tick.
 * @param tuning 效果调参 / Effect tuning values.
 * @returns 无返回值 / No return value.
 */
function applyNoise(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseTick: number,
  tuning: EffectTuning,
): void {
  const strength = toStrength(tuning.noisePower);
  if (strength <= 0) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const random = createSeededRandom((baseTick + 1) * 2654435761 + width * 17 + height * 31);
  const amount = Math.max(1, Math.round(18 * strength));
  for (let i = 0; i < data.length; i += 4) {
    const grain = Math.round((random() - 0.5) * 2 * amount);
    data[i] = clamp(data[i] + grain, 0, 255);
    data[i + 1] = clamp(data[i + 1] + grain, 0, 255);
    data[i + 2] = clamp(data[i + 2] + grain, 0, 255);
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * 轮廓描边效果（按亮度梯度）。/ Apply edge outline by luminance gradient.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param width 画布宽度 / Canvas width.
 * @param height 画布高度 / Canvas height.
 * @param tuning 效果调参 / Effect tuning values.
 * @returns 无返回值 / No return value.
 */
function applyOutline(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tuning: EffectTuning,
): void {
  const strength = toStrength(tuning.outlinePower);
  if (strength <= 0) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const source = new Uint8ClampedArray(data);
  const threshold = 12 + (1 - strength) * 42;
  const blend = clamp(0.25 + strength * 0.55, 0.1, 0.9);

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const idx = (y * width + x) * 4;
      const rightIdx = (y * width + x + 1) * 4;
      const downIdx = ((y + 1) * width + x) * 4;
      const current = luma(source[idx], source[idx + 1], source[idx + 2]);
      const right = luma(source[rightIdx], source[rightIdx + 1], source[rightIdx + 2]);
      const down = luma(source[downIdx], source[downIdx + 1], source[downIdx + 2]);
      const edge = Math.abs(current - right) + Math.abs(current - down);
      if (edge < threshold) {
        continue;
      }
      data[idx] = Math.round(data[idx] * (1 - blend));
      data[idx + 1] = Math.round(data[idx + 1] * (1 - blend));
      data[idx + 2] = Math.round(data[idx + 2] * (1 - blend));
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * 按宽度限制自动换行。/ Wrap plain text lines by maximum width.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param text 原始文本 / Raw text.
 * @param maxWidth 最大行宽 / Maximum line width.
 * @returns 换行后的行数组 / Wrapped lines.
 */
function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";

  for (const char of text) {
    if (char === "\n") {
      lines.push(line);
      line = "";
      continue;
    }

    const nextLine = line + char;
    if (line && ctx.measureText(nextLine).width > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line = nextLine;
    }
  }

  if (line || lines.length === 0) {
    lines.push(line);
  }
  return lines;
}

/**
 * 终端风格换行（首行保留前缀宽度）。/ Wrap terminal lines with first-line prompt offset.
 * @param ctx 2D 绘图上下文 / 2D rendering context.
 * @param text 原始文本 / Raw text.
 * @param maxWidth 最大行宽 / Maximum line width.
 * @param promptPrefix 提示符前缀 / Prompt prefix.
 * @returns 换行后的行数组 / Wrapped lines.
 */
function wrapTerminalLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  promptPrefix: string,
): string[] {
  const prefixWidth = ctx.measureText(promptPrefix).width;
  const lines: string[] = [];
  let line = "";

  for (const char of text) {
    if (char === "\n") {
      lines.push(line);
      line = "";
      continue;
    }

    const nextLine = line + char;
    const available = lines.length === 0 ? Math.max(1, maxWidth - prefixWidth) : maxWidth;
    if (line && ctx.measureText(nextLine).width > available) {
      lines.push(line);
      line = char;
    } else {
      line = nextLine;
    }
  }

  if (line || lines.length === 0) {
    lines.push(line);
  }
  return lines;
}

/**
 * 计算对话框顶部 Y 坐标。/ Compute dialog top Y coordinate.
 * @param canvasHeight 画布高度 / Canvas height.
 * @param position 位置百分比 / Position percentage.
 * @param dialogHeight 对话框高度 / Dialog height.
 * @returns 顶部 Y 坐标 / Top Y coordinate.
 */
function getDialogTop(canvasHeight: number, position: number, dialogHeight: number): number {
  const rawTop = Math.round((canvasHeight * position) / 100) - dialogHeight;
  return clamp(rawTop, 0, Math.max(0, canvasHeight - dialogHeight));
}

function drawWin95Frame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  raised: boolean,
): void {
  const topLight = raised ? "#ffffff" : "#808080";
  const bottomDark = raised ? "#808080" : "#ffffff";
  const innerTop = raised ? "#dfdfdf" : "#000000";
  const innerBottom = raised ? "#000000" : "#dfdfdf";

  ctx.fillStyle = topLight;
  ctx.fillRect(x, y, width, 1);
  ctx.fillRect(x, y, 1, height);
  ctx.fillStyle = bottomDark;
  ctx.fillRect(x, y + height - 1, width, 1);
  ctx.fillRect(x + width - 1, y, 1, height);

  if (width > 2 && height > 2) {
    ctx.fillStyle = innerTop;
    ctx.fillRect(x + 1, y + 1, width - 2, 1);
    ctx.fillRect(x + 1, y + 1, 1, height - 2);
    ctx.fillStyle = innerBottom;
    ctx.fillRect(x + 1, y + height - 2, width - 2, 1);
    ctx.fillRect(x + width - 2, y + 1, 1, height - 2);
  }
}

function drawDialogWin95(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  dialog: DialogState,
): void {
  const width = clamp(Math.round(canvas.width * 0.5), 160, canvas.width - 8);
  const border = 2;
  const titleHeight = 18;
  const contentPadX = 12;
  const contentPadY = 12;
  const iconSize = 32;
  const textGap = 12;
  const textFontSize = 12;
  const lineHeight = Math.round(textFontSize * 1.6);
  const buttonWidth = 75;
  const buttonHeight = 20;
  const buttonGap = 12;
  const bottomPad = 10;

  ctx.save();
  ctx.font = `${textFontSize}px DotGothic16, 'Courier New', monospace`;
  const textMaxWidth = Math.max(24, width - border * 2 - contentPadX * 2 - iconSize - textGap);
  const lines = wrapTextLines(ctx, dialog.text, textMaxWidth);
  ctx.restore();

  const contentHeight = Math.max(iconSize, lines.length * lineHeight);
  const height = border * 2 + titleHeight + contentPadY + contentHeight + buttonGap + buttonHeight + bottomPad;
  const x = Math.round((canvas.width - width) / 2);
  const y = getDialogTop(canvas.height, dialog.position, height);

  ctx.fillStyle = "#c0c0c0";
  ctx.fillRect(x, y, width, height);
  drawWin95Frame(ctx, x, y, width, height, true);

  const titleX = x + border;
  const titleY = y + border;
  const titleWidth = width - border * 2;
  const titleGradient = ctx.createLinearGradient(titleX, titleY, titleX + titleWidth, titleY);
  titleGradient.addColorStop(0, "#000080");
  titleGradient.addColorStop(1, "#1084d0");
  ctx.fillStyle = titleGradient;
  ctx.fillRect(titleX, titleY, titleWidth, titleHeight);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px DotGothic16, 'Courier New', monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(dialog.name || "System Failure", titleX + 4, titleY + titleHeight / 2);

  const closeSize = 14;
  const closeX = titleX + titleWidth - closeSize - 2;
  const closeY = titleY + Math.round((titleHeight - closeSize) / 2);
  ctx.fillStyle = "#c0c0c0";
  ctx.fillRect(closeX, closeY, closeSize, closeSize);
  drawWin95Frame(ctx, closeX, closeY, closeSize, closeSize, true);
  ctx.fillStyle = "#000000";
  ctx.font = "10px DotGothic16, 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("×", closeX + closeSize / 2, closeY + closeSize / 2);
  ctx.textAlign = "start";

  const iconX = x + border + contentPadX;
  const contentTop = y + border + titleHeight + contentPadY;
  const iconY = contentTop + Math.round((contentHeight - iconSize) / 2);
  const iconCenterX = iconX + iconSize / 2;
  const iconCenterY = iconY + iconSize / 2;

  ctx.beginPath();
  ctx.arc(iconCenterX, iconCenterY, iconSize / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = "#ff0000";
  ctx.fill();
  ctx.strokeStyle = "#800000";
  ctx.lineWidth = 2;
  ctx.stroke();

  const crossInset = Math.round(iconSize * 0.28);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(iconX + crossInset, iconY + crossInset);
  ctx.lineTo(iconX + iconSize - crossInset, iconY + iconSize - crossInset);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(iconX + iconSize - crossInset, iconY + crossInset);
  ctx.lineTo(iconX + crossInset, iconY + iconSize - crossInset);
  ctx.stroke();

  ctx.fillStyle = "#000000";
  ctx.font = `${textFontSize}px DotGothic16, 'Courier New', monospace`;
  ctx.textBaseline = "middle";
  const textX = iconX + iconSize + textGap;
  const textY = contentTop + Math.round((contentHeight - lines.length * lineHeight) / 2);
  lines.forEach((line, lineIndex) => {
    ctx.fillText(line, textX, textY + lineIndex * lineHeight + lineHeight / 2);
  });

  const buttonX = x + Math.round((width - buttonWidth) / 2);
  const buttonY = y + height - bottomPad - buttonHeight;
  ctx.fillStyle = "#c0c0c0";
  ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
  drawWin95Frame(ctx, buttonX, buttonY, buttonWidth, buttonHeight, true);
  ctx.fillStyle = "#000000";
  ctx.font = "11px DotGothic16, 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("OK", buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);
  ctx.textAlign = "start";
}

function drawDialogTerminal(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  dialog: DialogState,
  visibleText: string,
  timeMs: number,
): void {
  const margin = 8;
  const x = margin;
  const width = Math.max(120, canvas.width - margin * 2);
  const paddingX = 14;
  const paddingY = 10;
  const bodyFontSize = 13;
  const lineHeight = Math.round(bodyFontSize * 1.8);
  const promptPrefix = "> ";
  const promptLabel = dialog.name ? `${dialog.name}@pixel:~$` : "";
  const promptHeight = promptLabel ? lineHeight : 0;

  ctx.save();
  ctx.font = `${bodyFontSize}px 'Courier New', DotGothic16, monospace`;
  const lines = wrapTerminalLines(ctx, visibleText, Math.max(20, width - paddingX * 2), promptPrefix);
  ctx.restore();

  const textHeight = Math.max(1, lines.length) * lineHeight;
  const height = paddingY * 2 + promptHeight + textHeight;
  const y = getDialogTop(canvas.height, dialog.position, height);

  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#33ff33";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);

  let cursorTop = y + paddingY;
  if (promptLabel) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#33ff33";
    ctx.font = `11px 'Courier New', DotGothic16, monospace`;
    ctx.textBaseline = "middle";
    ctx.fillText(promptLabel, x + paddingX, cursorTop + lineHeight / 2);
    ctx.restore();
    cursorTop += lineHeight;
  }

  ctx.fillStyle = "#33ff33";
  ctx.font = `${bodyFontSize}px 'Courier New', DotGothic16, monospace`;
  ctx.textBaseline = "middle";

  const promptWidth = ctx.measureText(promptPrefix).width;
  lines.forEach((line, index) => {
    const drawText = index === 0 ? `${promptPrefix}${line}` : line;
    ctx.fillText(drawText, x + paddingX, cursorTop + index * lineHeight + lineHeight / 2);
  });

  if (Math.floor(timeMs / 500) % 2 === 0) {
    const lastLine = lines[lines.length - 1] ?? "";
    const cursorX = x + paddingX + (lines.length === 1 ? promptWidth : 0) + ctx.measureText(lastLine).width + 2;
    const cursorY = cursorTop + (lines.length - 1) * lineHeight + Math.round((lineHeight - bodyFontSize) / 2);
    ctx.fillRect(cursorX, cursorY, 7, bodyFontSize);
  }
}

function drawPixelFrame(
  ctx: CanvasRenderingContext2D,
  pixels: FramePixels,
  slice: number,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
): number {
  const rows = pixels.length;
  const cols = pixels[0]?.length ?? 0;
  if (!rows || !cols || slice <= 0) {
    return 0;
  }

  const unit = scale;
  const border = slice * unit;

  for (let row = 0; row < slice; row += 1) {
    for (let col = 0; col < slice; col += 1) {
      const topLeft = pixels[row][col];
      const topRight = pixels[row][cols - 1 - col];
      const bottomLeft = pixels[rows - 1 - row][col];
      const bottomRight = pixels[rows - 1 - row][cols - 1 - col];

      if (topLeft) {
        ctx.fillStyle = topLeft;
        ctx.fillRect(x + col * unit, y + row * unit, unit, unit);
      }
      if (topRight) {
        ctx.fillStyle = topRight;
        ctx.fillRect(x + width - (col + 1) * unit, y + row * unit, unit, unit);
      }
      if (bottomLeft) {
        ctx.fillStyle = bottomLeft;
        ctx.fillRect(x + col * unit, y + height - (row + 1) * unit, unit, unit);
      }
      if (bottomRight) {
        ctx.fillStyle = bottomRight;
        ctx.fillRect(x + width - (col + 1) * unit, y + height - (row + 1) * unit, unit, unit);
      }
    }
  }

  const horizontalWidth = Math.max(0, width - border * 2);
  const verticalHeight = Math.max(0, height - border * 2);
  const middleCol = Math.floor(cols / 2);
  for (let row = 0; row < slice; row += 1) {
    const topColor = pixels[row][middleCol];
    const bottomColor = pixels[rows - 1 - row][middleCol];
    if (topColor && horizontalWidth > 0) {
      ctx.fillStyle = topColor;
      ctx.fillRect(x + border, y + row * unit, horizontalWidth, unit);
    }
    if (bottomColor && horizontalWidth > 0) {
      ctx.fillStyle = bottomColor;
      ctx.fillRect(x + border, y + height - (row + 1) * unit, horizontalWidth, unit);
    }
  }

  const middleRow = Math.floor(rows / 2);
  for (let col = 0; col < slice; col += 1) {
    const leftColor = pixels[middleRow][col];
    const rightColor = pixels[middleRow][cols - 1 - col];
    if (leftColor && verticalHeight > 0) {
      ctx.fillStyle = leftColor;
      ctx.fillRect(x + col * unit, y + border, unit, verticalHeight);
    }
    if (rightColor && verticalHeight > 0) {
      ctx.fillStyle = rightColor;
      ctx.fillRect(x + width - (col + 1) * unit, y + border, unit, verticalHeight);
    }
  }

  return border;
}

function drawDialogFramed(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  dialog: DialogState,
  visibleText: string,
  revealCount: number,
  timeMs: number,
  config: DialogThemeConfig,
): void {
  const framePixels = config.framePixels;
  const frameSliceRaw = config.frameSliceRaw;
  if (!framePixels || !frameSliceRaw) {
    return;
  }

  const margin = 8;
  const x = margin;
  const width = Math.max(120, canvas.width - margin * 2);
  const frameScale = 1;
  const frameBorder = frameSliceRaw * frameScale;
  const textPaddingX = 14;
  const textPaddingY = 10;
  const fontSize = 14;
  const lineHeight = Math.round(fontSize * 1.8);

  ctx.save();
  ctx.font = `bold ${fontSize}px DotGothic16, 'Courier New', monospace`;
  const maxTextWidth = Math.max(20, width - frameBorder * 2 - textPaddingX * 2);
  const lines = wrapTextLines(ctx, visibleText, maxTextWidth);
  ctx.restore();

  const textHeight = Math.max(1, lines.length) * lineHeight;
  const height = textHeight + frameBorder * 2 + textPaddingY * 2;
  const y = getDialogTop(canvas.height, dialog.position, height);

  drawPixelFrame(ctx, framePixels, frameSliceRaw, x, y, width, height, frameScale);
  ctx.fillStyle = config.backgroundFlat ?? "#000000";
  ctx.fillRect(x + frameBorder, y + frameBorder, width - frameBorder * 2, height - frameBorder * 2);

  if (dialog.name) {
    const nameFontSize = 12;
    const namePaddingX = 10;
    const namePaddingY = 2;
    const nameGap = 4;

    ctx.font = `bold ${nameFontSize}px DotGothic16, 'Courier New', monospace`;
    const nameTextWidth = ctx.measureText(dialog.name).width;
    const nameWidth = Math.ceil(nameTextWidth) + namePaddingX * 2 + frameBorder * 2;
    const nameHeight = Math.round(nameFontSize * 1.8) + namePaddingY * 2 + frameBorder * 2;
    const nameX = x + frameBorder + 12;
    const nameY = y + frameBorder - nameGap - nameHeight;

    drawPixelFrame(ctx, framePixels, frameSliceRaw, nameX, nameY, nameWidth, nameHeight, frameScale);
    ctx.fillStyle = config.nameBg ?? config.backgroundFlat ?? "#000000";
    ctx.fillRect(nameX + frameBorder, nameY + frameBorder, nameWidth - frameBorder * 2, nameHeight - frameBorder * 2);

    ctx.fillStyle = config.nameColor ?? config.color ?? "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(
      dialog.name,
      nameX + frameBorder + namePaddingX,
      nameY + frameBorder + (nameHeight - frameBorder * 2) / 2,
    );
  }

  ctx.fillStyle = config.color ?? "#ffffff";
  ctx.font = `bold ${fontSize}px DotGothic16, 'Courier New', monospace`;
  ctx.textBaseline = "middle";
  const textX = x + frameBorder + textPaddingX;
  const textY = y + frameBorder + textPaddingY;
  lines.forEach((line, index) => {
    ctx.fillText(line, textX, textY + index * lineHeight + lineHeight / 2);
  });

  if (revealCount > 0 && Math.floor(timeMs / 500) % 2 === 0) {
    const lastLine = lines[lines.length - 1] ?? "";
    const cursorX = textX + ctx.measureText(lastLine).width + 6;
    const cursorTop = textY + (lines.length - 1) * lineHeight + Math.round((lineHeight - fontSize) / 2);

    if (revealCount >= dialog.text.length) {
      ctx.fillText("▼", cursorX, textY + (lines.length - 1) * lineHeight + lineHeight / 2);
    } else {
      ctx.fillRect(cursorX, cursorTop + Math.round(fontSize * 0.1), 8, Math.round(fontSize));
    }
  }
}

function drawDialog(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  dialog: DialogState,
  revealCount: number,
  timeMs: number,
): void {
  if (!dialog.enabled || !dialog.text) {
    return;
  }

  const config = DIALOG_THEME_CONFIG[dialog.style];
  if (config.isWin95) {
    drawDialogWin95(ctx, canvas, dialog);
    return;
  }

  const visibleCount = clamp(revealCount, 0, dialog.text.length);
  const visibleText = dialog.text.slice(0, visibleCount);
  if (config.isTerminal) {
    drawDialogTerminal(ctx, canvas, dialog, visibleText, timeMs);
    return;
  }

  drawDialogFramed(ctx, canvas, dialog, visibleText, visibleCount, timeMs, config);
}

/**
 * FX 插件定义：描述单个效果的执行函数。/ FX plugin contract for one effect stage.
 */
export interface EffectPlugin {
  key: keyof EffectsState;
  apply: (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    grid: PixelGrid,
    tuning: EffectTuning,
    effectTick: number,
  ) => void;
}

/**
 * 默认 FX 插件注册表（执行顺序即数组顺序）。/ Default FX plugin registry (array order is execution order).
 */
export const DEFAULT_EFFECT_PLUGINS: EffectPlugin[] = [
  {
    key: "crt",
    apply: (ctx, canvas, _grid, tuning) => {
      applyCrt(ctx, canvas.width, canvas.height, tuning);
    },
  },
  {
    key: "scanlines",
    apply: (ctx, canvas, _grid, tuning, effectTick) => {
      applyScanlines(ctx, canvas.width, canvas.height, effectTick, tuning);
    },
  },
  {
    key: "paletteCycle",
    apply: (ctx, canvas, grid, tuning, effectTick) => {
      applyPaletteCycle(ctx, canvas.width, canvas.height, grid.colors, effectTick, tuning);
    },
  },
  {
    key: "ghost",
    apply: (ctx, canvas, _grid, tuning, effectTick) => {
      applyGhostTrail(ctx, canvas.width, canvas.height, effectTick, tuning);
    },
  },
  {
    key: "ditherFade",
    apply: (ctx, canvas, _grid, tuning, effectTick) => {
      applyDitherFade(ctx, canvas.width, canvas.height, effectTick, tuning);
    },
  },
  {
    key: "waveWarp",
    apply: (ctx, canvas, grid, tuning, effectTick) => {
      applyWaveWarp(ctx, canvas.width, canvas.height, grid.pixelSize, effectTick, tuning);
    },
  },
  {
    key: "chromaShift",
    apply: (ctx, canvas, _grid, tuning, effectTick) => {
      applyChromaShift(ctx, canvas.width, canvas.height, effectTick, tuning);
    },
  },
  {
    key: "pixelSort",
    apply: (ctx, canvas, _grid, tuning, effectTick) => {
      applyPixelSort(ctx, canvas.width, canvas.height, effectTick, tuning);
    },
  },
  {
    key: "noise",
    apply: (ctx, canvas, _grid, tuning, effectTick) => {
      applyNoise(ctx, canvas.width, canvas.height, effectTick, tuning);
    },
  },
  {
    key: "vignette",
    apply: (ctx, canvas, _grid, tuning) => {
      applyVignette(ctx, canvas.width, canvas.height, tuning);
    },
  },
  {
    key: "outline",
    apply: (ctx, canvas, _grid, tuning) => {
      applyOutline(ctx, canvas.width, canvas.height, tuning);
    },
  },
  {
    key: "glitch",
    apply: (ctx, canvas, grid, tuning, effectTick) => {
      applyGlitch(ctx, canvas.width, canvas.height, grid.pixelSize, effectTick, tuning);
    },
  },
];

/**
 * 主渲染入口：按固定顺序绘制网格、FX 与对话框。/ Main frame renderer: draws grid, applies FX in order, then dialog.
 * @param canvas 输出画布 / Output canvas.
 * @param grid 像素网格 / Pixel grid.
 * @param effects 效果开关 / Effect toggles.
 * @param tuning 效果调参 / Effect tuning values.
 * @param mask 蒙版状态 / Mask state.
 * @param dialog 对话框状态 / Dialog state.
 * @param revealCount 当前可见字符数 / Visible character count.
 * @param _ghostImage 保留参数（兼容接口）/ Reserved parameter for interface compatibility.
 * @param timeMs 当前时间戳（毫秒）/ Current time in milliseconds.
 * @param useWebGL 是否启用 WebGL 底图加速 / Whether to enable WebGL for base grid acceleration.
 * @returns 无返回值 / No return value.
 */
export function renderFrame(
  canvas: HTMLCanvasElement,
  grid: PixelGrid,
  effects: EffectsState,
  tuning: EffectTuning,
  mask: MaskState,
  dialog: DialogState,
  revealCount: number,
  _ghostImage: HTMLImageElement,
  timeMs: number,
  plugins: EffectPlugin[] = DEFAULT_EFFECT_PLUGINS,
  useWebGL = false,
): void {
  canvas.width = grid.width * grid.pixelSize;
  canvas.height = grid.height * grid.pixelSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return;
  }
  ctx.imageSmoothingEnabled = false;

  drawGrid(canvas, ctx, grid, useWebGL);
  const effectTick = Math.floor(timeMs / EFFECT_TICK_MS);
  for (const plugin of plugins) {
    if (!effects[plugin.key]) {
      continue;
    }
    applyEffectWithOptionalMask(ctx, canvas, grid, mask, plugin.key, () => {
      plugin.apply(ctx, canvas, grid, tuning, effectTick);
    });
  }
  drawDialog(ctx, canvas, dialog, revealCount, timeMs);
}
