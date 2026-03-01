import { createCanvas, ImageData } from "@napi-rs/canvas";
import { describe, expect, test } from "vitest";
import { DEFAULT_EFFECT_PLUGINS, renderFrame } from "./renderFrame";
import type { DialogState, EffectsState, EffectTuning, MaskState, PixelGrid } from "../types";

if (!("ImageData" in globalThis)) {
  (globalThis as unknown as { ImageData: typeof ImageData }).ImageData = ImageData;
}

function fnv1a(bytes: Uint8ClampedArray): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function makeGrid(): PixelGrid {
  const palette = [
    [0, 0, 0],
    [255, 80, 80],
    [80, 255, 120],
    [80, 140, 255],
    [245, 245, 245],
    [255, 210, 80],
  ] as Array<[number, number, number]>;
  const width = 12;
  const height = 9;
  const indices = new Uint16Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      indices[idx] = (x * 3 + y * 2 + (x % 2)) % palette.length;
    }
  }
  return {
    width,
    height,
    pixelSize: 4,
    indices,
    colors: palette,
  };
}

function defaultEffects(): EffectsState {
  return {
    glitch: false,
    crt: false,
    paletteCycle: false,
    ghost: false,
    ditherFade: false,
    waveWarp: false,
  };
}

function defaultTuning(): EffectTuning {
  return {
    glitchPower: 100,
    glitchSpeed: 100,
    crtPower: 100,
    paletteCycleSpeed: 100,
    paletteCycleStep: 1,
    ghostPower: 100,
    ghostSpeed: 100,
    ditherPower: 100,
    ditherSpeed: 100,
    wavePower: 100,
    waveSpeed: 100,
  };
}

function defaultDialog(): DialogState {
  return {
    enabled: false,
    style: "win95",
    name: "Tester",
    text: "",
    position: 70,
    page: 0,
    typingSpeed: 100,
    autoPage: false,
    autoPageDelay: 1000,
  };
}

function makeMask(grid: PixelGrid, fill = 0): MaskState {
  const data = new Uint8Array(grid.width * grid.height);
  if (fill !== 0) {
    data.fill(255);
  }
  return {
    enabled: false,
    overlayVisible: false,
    brushSize: 3,
    mode: "paint",
    fxEnabled: {
      glitch: true,
      crt: true,
      paletteCycle: true,
      ghost: true,
      ditherFade: true,
      waveWarp: true,
    },
    data,
    width: grid.width,
    height: grid.height,
  };
}

function renderHash(effects: EffectsState, mask: MaskState, tuning?: Partial<EffectTuning>, timeMs = 3456): string {
  const grid = makeGrid();
  const canvas = createCanvas(grid.width * grid.pixelSize, grid.height * grid.pixelSize);
  renderFrame(
    canvas as unknown as HTMLCanvasElement,
    grid,
    effects,
    { ...defaultTuning(), ...tuning },
    mask,
    defaultDialog(),
    0,
    {} as HTMLImageElement,
    timeMs,
  );
  const ctx = canvas.getContext("2d");
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return fnv1a(data);
}

describe("renderFrame FX plugin registry", () => {
  test("keeps deterministic default plugin order", () => {
    expect(DEFAULT_EFFECT_PLUGINS.map((item) => item.key)).toEqual([
      "crt",
      "paletteCycle",
      "ghost",
      "ditherFade",
      "waveWarp",
      "glitch",
    ]);
  });
});

describe("renderFrame visual regression hash", () => {
  test("matches stable hashes for fixed input", () => {
    const grid = makeGrid();
    const baseMask = makeMask(grid, 0);

    const allFx: EffectsState = {
      glitch: true,
      crt: true,
      paletteCycle: true,
      ghost: true,
      ditherFade: true,
      waveWarp: true,
    };
    const maskedGlitch = makeMask(grid, 0);
    maskedGlitch.enabled = true;
    maskedGlitch.fxEnabled.glitch = true;
    if (!maskedGlitch.data) {
      throw new Error("mask data is required for regression test");
    }
    maskedGlitch.data.fill(0);
    for (let y = 2; y < 7; y += 1) {
      for (let x = 3; x < 9; x += 1) {
        maskedGlitch.data[y * grid.width + x] = 255;
      }
    }

    const hashes = {
      none: renderHash(defaultEffects(), baseMask),
      crt: renderHash({ ...defaultEffects(), crt: true }, baseMask),
      glitch: renderHash({ ...defaultEffects(), glitch: true }, baseMask),
      cycleGhost: renderHash({ ...defaultEffects(), paletteCycle: true, ghost: true }, baseMask),
      all: renderHash(allFx, baseMask),
      allMaskedGlitch: renderHash(allFx, maskedGlitch),
    };

    expect(hashes).toMatchInlineSnapshot(`
      {
        "all": "3e156575",
        "allMaskedGlitch": "b5975e75",
        "crt": "7f0a92cd",
        "cycleGhost": "a1d7c055",
        "glitch": "3a3ca26d",
        "none": "3beab2c5",
      }
    `);
  });
});
