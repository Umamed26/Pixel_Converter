/// <reference lib="webworker" />
// Worker 像素化流水线：将重计算移出主线程。/ Worker pixelization pipeline: moves heavy processing off the main thread.

import type { PaletteColor, PixelizeAlgorithm } from "../types";

interface PixelizeRequest {
  id: number;
  type: "pixelize";
  buffer: ArrayBuffer;
  mimeType: string;
  pixelSize: number;
  palette: PaletteColor[];
  algorithm: PixelizeAlgorithm;
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
 * 将 RGB 编码为 24 位整型键。/ Pack RGB channels into a 24-bit integer key.
 * @param r 红色通道 / Red channel.
 * @param g 绿色通道 / Green channel.
 * @param b 蓝色通道 / Blue channel.
 * @returns 24 位颜色键 / 24-bit color key.
 */
function rgbKey(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

/**
 * 量化单通道到 32 步进。/ Quantize one channel into 32-step buckets.
 * @param value 通道值 / Channel value.
 * @returns 量化结果 / Quantized value.
 */
function quantizeChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value / 32) * 32));
}

/**
 * 将 RGB 量化后编码为整型键。/ Quantize RGB and pack into an integer key.
 * @param r 红色通道 / Red channel.
 * @param g 绿色通道 / Green channel.
 * @param b 蓝色通道 / Blue channel.
 * @returns 量化颜色键 / Quantized color key.
 */
function quantizedRgbKey(r: number, g: number, b: number): number {
  return rgbKey(quantizeChannel(r), quantizeChannel(g), quantizeChannel(b));
}

/**
 * 从整型键还原 RGB 三元组。/ Unpack integer color key into RGB tuple.
 * @param key 颜色键 / Packed key.
 * @returns RGB 三元组 / RGB tuple.
 */
function keyToColor(key: number): PaletteColor {
  return [
    (key >> 16) & 0xff,
    (key >> 8) & 0xff,
    key & 0xff,
  ];
}

/**
 * Worker 标准像素化。/ Worker standard pixelization path.
 * @param bitmap 位图对象 / Source bitmap.
 * @param gridWidth 网格宽度 / Grid width.
 * @param gridHeight 网格高度 / Grid height.
 * @param pixelSize 像素块尺寸 / Pixel size.
 * @param palette 调色板 / Palette colors.
 * @returns 像素化成功负载 / Pixelization success payload.
 */
function pixelizeStandard(
  id: number,
  bitmap: ImageBitmap,
  gridWidth: number,
  gridHeight: number,
  pixelSize: number,
  palette: PaletteColor[],
): PixelizeSuccess {
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

  if (palette.length > 0) {
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
  }

  const colors: PaletteColor[] = [[0, 0, 0]];
  const dynamicMap = new Map<number, number>([[0, 0]]);
  for (let i = 0; i < total; i += 1) {
    const offset = i * 4;
    if (data[offset + 3] < ALPHA_THRESHOLD) {
      indices[i] = 0;
      continue;
    }
    const key = quantizedRgbKey(data[offset], data[offset + 1], data[offset + 2]);
    if (!dynamicMap.has(key)) {
      dynamicMap.set(key, colors.length);
      colors.push(keyToColor(key));
    }
    indices[i] = dynamicMap.get(key) ?? 0;
  }

  return {
    id,
    ok: true,
    width: gridWidth,
    height: gridHeight,
    pixelSize,
    colors,
    indices: indices.buffer,
  };
}

/**
 * Worker 边缘保持像素化：块内众数采样。/ Worker edge-aware pixelization: dominant sampling within each block.
 * @param bitmap 位图对象 / Source bitmap.
 * @param gridWidth 网格宽度 / Grid width.
 * @param gridHeight 网格高度 / Grid height.
 * @param pixelSize 像素块尺寸 / Pixel size.
 * @param palette 调色板 / Palette colors.
 * @returns 像素化成功负载 / Pixelization success payload.
 */
function pixelizeEdgeAware(
  id: number,
  bitmap: ImageBitmap,
  gridWidth: number,
  gridHeight: number,
  pixelSize: number,
  palette: PaletteColor[],
): PixelizeSuccess {
  const sampleWidth = Math.max(1, gridWidth * pixelSize);
  const sampleHeight = Math.max(1, gridHeight * pixelSize);
  const canvas = new OffscreenCanvas(sampleWidth, sampleHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("2D context unavailable");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);

  const { data } = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
  const total = gridWidth * gridHeight;
  const indices = new Uint16Array(total);
  const blockSampleCount = pixelSize * pixelSize;

  if (palette.length > 0) {
    const indexCounts = new Uint16Array(palette.length);
    const colorCache = new Map<number, number>();
    for (let cellY = 0; cellY < gridHeight; cellY += 1) {
      for (let cellX = 0; cellX < gridWidth; cellX += 1) {
        indexCounts.fill(0);
        let opaqueSamples = 0;
        for (let sampleY = 0; sampleY < pixelSize; sampleY += 1) {
          const y = cellY * pixelSize + sampleY;
          const rowOffset = y * sampleWidth;
          for (let sampleX = 0; sampleX < pixelSize; sampleX += 1) {
            const x = cellX * pixelSize + sampleX;
            const offset = (rowOffset + x) * 4;
            if (data[offset + 3] < ALPHA_THRESHOLD) {
              continue;
            }
            opaqueSamples += 1;
            const key = rgbKey(data[offset], data[offset + 1], data[offset + 2]);
            let nearest = colorCache.get(key);
            if (nearest === undefined) {
              nearest = nearestColorIndex(data[offset], data[offset + 1], data[offset + 2], palette);
              colorCache.set(key, nearest);
            }
            indexCounts[nearest] += 1;
          }
        }
        const cellIndex = cellY * gridWidth + cellX;
        if (opaqueSamples === 0) {
          indices[cellIndex] = 0;
          continue;
        }
        let bestIndex = 0;
        let bestCount = -1;
        for (let i = 0; i < indexCounts.length; i += 1) {
          if (indexCounts[i] > bestCount) {
            bestCount = indexCounts[i];
            bestIndex = i;
          }
        }
        indices[cellIndex] = bestIndex;
      }
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
  }

  const colors: PaletteColor[] = [[0, 0, 0]];
  const dynamicMap = new Map<number, number>([[0, 0]]);
  const blockKeys = new Int32Array(blockSampleCount);
  const blockCounts = new Uint16Array(blockSampleCount);
  for (let cellY = 0; cellY < gridHeight; cellY += 1) {
    for (let cellX = 0; cellX < gridWidth; cellX += 1) {
      let uniqueCount = 0;
      let opaqueSamples = 0;
      for (let sampleY = 0; sampleY < pixelSize; sampleY += 1) {
        const y = cellY * pixelSize + sampleY;
        const rowOffset = y * sampleWidth;
        for (let sampleX = 0; sampleX < pixelSize; sampleX += 1) {
          const x = cellX * pixelSize + sampleX;
          const offset = (rowOffset + x) * 4;
          if (data[offset + 3] < ALPHA_THRESHOLD) {
            continue;
          }
          opaqueSamples += 1;
          const key = quantizedRgbKey(data[offset], data[offset + 1], data[offset + 2]);
          let found = -1;
          for (let i = 0; i < uniqueCount; i += 1) {
            if (blockKeys[i] === key) {
              found = i;
              break;
            }
          }
          if (found >= 0) {
            blockCounts[found] += 1;
          } else {
            blockKeys[uniqueCount] = key;
            blockCounts[uniqueCount] = 1;
            uniqueCount += 1;
          }
        }
      }
      const cellIndex = cellY * gridWidth + cellX;
      if (opaqueSamples === 0 || uniqueCount === 0) {
        indices[cellIndex] = 0;
        continue;
      }
      let bestKey = blockKeys[0];
      let bestCount = blockCounts[0];
      for (let i = 1; i < uniqueCount; i += 1) {
        if (blockCounts[i] > bestCount) {
          bestCount = blockCounts[i];
          bestKey = blockKeys[i];
        }
      }
      if (!dynamicMap.has(bestKey)) {
        dynamicMap.set(bestKey, colors.length);
        colors.push(keyToColor(bestKey));
      }
      indices[cellIndex] = dynamicMap.get(bestKey) ?? 0;
    }
  }
  return {
    id,
    ok: true,
    width: gridWidth,
    height: gridHeight,
    pixelSize,
    colors,
    indices: indices.buffer,
  };
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
  algorithm: PixelizeAlgorithm,
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

    if (algorithm === "edgeAware") {
      return pixelizeEdgeAware(id, bitmap, gridWidth, gridHeight, pixelSize, palette);
    }
    return pixelizeStandard(id, bitmap, gridWidth, gridHeight, pixelSize, palette);
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
  void pixelize(payload.id, payload.buffer, payload.mimeType, payload.pixelSize, payload.palette, payload.algorithm)
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
