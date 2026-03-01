// Frame renderer: draws pixel grid, applies FX chain, and overlays dialog styles.
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampPercent(value: number, min = 0, max = 300): number {
  return clamp(value, min, max);
}

function toStrength(percent: number): number {
  return clampPercent(percent) / 100;
}

function toSpeedScale(percent: number): number {
  return clampPercent(percent, 10, 400) / 100;
}

function scaleTick(baseTick: number, speedPercent: number): number {
  return Math.floor(baseTick * toSpeedScale(speedPercent));
}

function createSeededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function drawGrid(ctx: CanvasRenderingContext2D, grid: PixelGrid): void {
  const { width, height, pixelSize, indices, colors } = grid;
  if (!colors.length) {
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
      if (maskData[rowOffset + cellX] > 0) {
        continue;
      }
      const pixelOffset = (y * canvasWidth + x) * 4;
      afterPixels[pixelOffset] = beforePixels[pixelOffset];
      afterPixels[pixelOffset + 1] = beforePixels[pixelOffset + 1];
      afterPixels[pixelOffset + 2] = beforePixels[pixelOffset + 2];
      afterPixels[pixelOffset + 3] = beforePixels[pixelOffset + 3];
    }
  }
}

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

function encodeRgbKey(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

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
): void {
  canvas.width = grid.width * grid.pixelSize;
  canvas.height = grid.height * grid.pixelSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return;
  }
  ctx.imageSmoothingEnabled = false;

  drawGrid(ctx, grid);
  const effectTick = Math.floor(timeMs / EFFECT_TICK_MS);

  if (effects.crt) {
    applyEffectWithOptionalMask(ctx, canvas, grid, mask, "crt", () => {
      applyCrt(ctx, canvas.width, canvas.height, tuning);
    });
  }
  if (effects.paletteCycle) {
    applyEffectWithOptionalMask(ctx, canvas, grid, mask, "paletteCycle", () => {
      applyPaletteCycle(ctx, canvas.width, canvas.height, grid.colors, effectTick, tuning);
    });
  }
  if (effects.ghost) {
    applyEffectWithOptionalMask(ctx, canvas, grid, mask, "ghost", () => {
      applyGhostTrail(ctx, canvas.width, canvas.height, effectTick, tuning);
    });
  }
  if (effects.ditherFade) {
    applyEffectWithOptionalMask(ctx, canvas, grid, mask, "ditherFade", () => {
      applyDitherFade(ctx, canvas.width, canvas.height, effectTick, tuning);
    });
  }
  if (effects.waveWarp) {
    applyEffectWithOptionalMask(ctx, canvas, grid, mask, "waveWarp", () => {
      applyWaveWarp(ctx, canvas.width, canvas.height, grid.pixelSize, effectTick, tuning);
    });
  }
  if (effects.glitch) {
    applyEffectWithOptionalMask(ctx, canvas, grid, mask, "glitch", () => {
      applyGlitch(ctx, canvas.width, canvas.height, grid.pixelSize, effectTick, tuning);
    });
  }
  drawDialog(ctx, canvas, dialog, revealCount, timeMs);
}
