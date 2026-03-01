/// <reference lib="webworker" />
// Worker 像素化流水线：将重计算移出主线程。/ Worker pixelization pipeline: moves heavy processing off the main thread.

import type { PaletteColor } from "../types";

interface PixelizeRequest {
  id: number;
  type: "pixelize";
  buffer: ArrayBuffer;
  mimeType: string;
  pixelSize: number;
  palette: PaletteColor[];
}

interface PixelizeSuccess {
  id: number;
  ok: true;
  width: number;
  height: number;
  pixelSize: number;
  colors: PaletteColor[];
  indices: ArrayBuffer;
}

interface PixelizeFailure {
  id: number;
  ok: false;
  error: string;
}

const MAX_SOURCE_DIMENSION = 600;
const ALPHA_THRESHOLD = 30;

/**
 * 按最大边限制等比缩放尺寸。/ Fit dimensions into a max side while preserving ratio.
 * @param width 原始宽度 / Original width.
 * @param height 原始高度 / Original height.
 * @param maxDimension 最大边长 / Maximum side length.
 * @returns 适配后的尺寸 / Fitted dimensions.
 */
function fitToMaxDimension(width: number, height: number, maxDimension: number) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  const scale = Math.min(maxDimension / width, maxDimension / height);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

/**
 * 在调色板中寻找最近颜色索引。/ Find nearest palette index by RGB squared distance.
 * @param r 红色通道 / Red channel.
 * @param g 绿色通道 / Green channel.
 * @param b 蓝色通道 / Blue channel.
 * @param palette 调色板 / Palette colors.
 * @returns 最近颜色索引 / Nearest palette index.
 */
function nearestColorIndex(r: number, g: number, b: number, palette: PaletteColor[]): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i += 1) {
    const [pr, pg, pb] = palette[i];
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Worker 中执行像素化转换。/ Execute pixelization in worker context.
 * @param id 请求 ID / Request id.
 * @param buffer 文件二进制数据 / File binary data.
 * @param mimeType 文件 MIME 类型 / File MIME type.
 * @param pixelSize 像素块尺寸 / Pixel block size.
 * @param palette 目标调色板 / Target palette.
 * @returns 像素化结果 / Pixelization result payload.
 */
async function pixelize(
  id: number,
  buffer: ArrayBuffer,
  mimeType: string,
  pixelSize: number,
  palette: PaletteColor[],
): Promise<PixelizeSuccess> {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("OffscreenCanvas unavailable");
  }

  const blob = new Blob([buffer], { type: mimeType || "image/png" });
  const bitmap = await createImageBitmap(blob);

  try {
    const fitted = fitToMaxDimension(bitmap.width, bitmap.height, MAX_SOURCE_DIMENSION);
    const gridWidth = Math.max(1, Math.floor(fitted.width / pixelSize));
    const gridHeight = Math.max(1, Math.floor(fitted.height / pixelSize));

    const canvas = new OffscreenCanvas(gridWidth, gridHeight);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("2D context unavailable");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(bitmap, 0, 0, gridWidth, gridHeight);

    const { data } = ctx.getImageData(0, 0, gridWidth, gridHeight);
    const total = gridWidth * gridHeight;
    const indices = new Uint16Array(total);

    for (let i = 0; i < total; i += 1) {
      const offset = i * 4;
      if (data[offset + 3] < ALPHA_THRESHOLD) {
        indices[i] = 0;
        continue;
      }
      indices[i] = nearestColorIndex(data[offset], data[offset + 1], data[offset + 2], palette);
    }

    return {
      id,
      ok: true,
      width: gridWidth,
      height: gridHeight,
      pixelSize,
      colors: palette,
      indices: indices.buffer,
    };
  } finally {
    bitmap.close();
  }
}

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<PixelizeRequest>) => {
  const payload = event.data;
  if (!payload || payload.type !== "pixelize") {
    return;
  }
  void pixelize(payload.id, payload.buffer, payload.mimeType, payload.pixelSize, payload.palette)
    .then((result) => {
      ctx.postMessage(result, [result.indices]);
    })
    .catch((error: unknown) => {
      const failure: PixelizeFailure = {
        id: payload.id,
        ok: false,
        error: error instanceof Error ? error.message : "worker_error",
      };
      ctx.postMessage(failure);
    });
};
