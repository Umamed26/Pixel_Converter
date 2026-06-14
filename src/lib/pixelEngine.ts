// 像素化引擎：负责读图、网格量化、调色板映射与导出缩放。/ Pixel engine: load image, quantize grid, map palette, and scale export.
import type { PaletteColor, PixelGrid, PixelizeAlgorithm } from "../types";

const MAX_SOURCE_DIMENSION = 600;
const ALPHA_THRESHOLD = 30;
const DEFAULT_EXPORT_MAX_SIDE = 1200;

/**
 * 在调色板中查找与目标颜色距离最近的颜色索引。/ Find nearest palette index using RGB squared distance.
 * @param r 红色通道 / Red channel.
 * @param g 绿色通道 / Green channel.
 * @param b 蓝色通道 / Blue channel.
 * @param palette 调色板颜色数组 / Palette colors.
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
 * 把通道值量化到 32 步进。/ Quantize a channel into 32-step buckets.
 * @param value 原始通道值 / Raw channel value.
 * @returns 量化后的通道值 / Quantized channel value.
 */
function quantizeChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value / 32) * 32));
}

/**
 * 将 RGB 先量化再编码为 24 位整型键。/ Quantize RGB channels and pack into a 24-bit integer key.
 * @param r 红色通道 / Red channel.
 * @param g 绿色通道 / Green channel.
 * @param b 蓝色通道 / Blue channel.
 * @returns 量化后的颜色键 / Quantized color key.
 */
function quantizedRgbKey(r: number, g: number, b: number): number {
  const qr = quantizeChannel(r);
  const qg = quantizeChannel(g);
  const qb = quantizeChannel(b);
  return rgbKey(qr, qg, qb);
}

/**
 * 从 24 位整型键反解 RGB。/ Unpack a 24-bit color key into RGB tuple.
 * @param key 颜色键 / Packed color key.
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
 * 按最大边约束等比缩放尺寸。/ Fit width/height into a max dimension while preserving aspect ratio.
 * @param width 原始宽度 / Original width.
 * @param height 原始高度 / Original height.
 * @param maxDimension 最大允许边长 / Maximum side length.
 * @returns 适配后的宽高 / Fitted dimensions.
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
 * 标准像素化：先缩放到网格分辨率再映射调色板。/ Standard pixelization: resize directly to grid resolution and map colors.
 * @param image 源图片元素 / Source image element.
 * @param gridWidth 网格宽度 / Grid width.
 * @param gridHeight 网格高度 / Grid height.
 * @param pixelSize 像素块尺寸 / Pixel block size.
 * @param selectedPalette 目标调色板 / Target palette.
 * @returns 像素网格 / Pixel grid.
 */
function pixelizeStandard(
  image: HTMLImageElement,
  gridWidth: number,
  gridHeight: number,
  pixelSize: number,
  selectedPalette: PaletteColor[] | null,
): PixelGrid {
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  const sampleW = Math.min(srcW, gridWidth * pixelSize);
  const sampleH = Math.min(srcH, gridHeight * pixelSize);

  const temp = document.createElement("canvas");
  temp.width = sampleW;
  temp.height = sampleH;
  const ctx = temp.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas is unavailable.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, sampleW, sampleH);

  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
  const total = gridWidth * gridHeight;
  const indices = new Uint16Array(total);
  const cellW = sampleW / gridWidth;
  const cellH = sampleH / gridHeight;

  if (selectedPalette && selectedPalette.length > 0) {
    for (let cy = 0; cy < gridHeight; cy += 1) {
      for (let cx = 0; cx < gridWidth; cx += 1) {
        const x0 = Math.floor(cx * cellW);
        const y0 = Math.floor(cy * cellH);
        const x1 = Math.min(sampleW, Math.floor((cx + 1) * cellW));
        const y1 = Math.min(sampleH, Math.floor((cy + 1) * cellH));
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        for (let y = y0; y < y1; y += 1) {
          const row = y * sampleW;
          for (let x = x0; x < x1; x += 1) {
            const off = (row + x) * 4;
            if (data[off + 3] < ALPHA_THRESHOLD) continue;
            sumR += data[off]; sumG += data[off + 1]; sumB += data[off + 2];
            count += 1;
          }
        }
        const idx = cy * gridWidth + cx;
        if (count === 0) { indices[idx] = 0; continue; }
        indices[idx] = nearestColorIndex(sumR / count, sumG / count, sumB / count, selectedPalette);
      }
    }
    return { width: gridWidth, height: gridHeight, pixelSize, indices, colors: selectedPalette };
  }

  const colors: PaletteColor[] = [[0, 0, 0]];
  const dynamicMap = new Map<number, number>([[0, 0]]);
  for (let cy = 0; cy < gridHeight; cy += 1) {
    for (let cx = 0; cx < gridWidth; cx += 1) {
      const x0 = Math.floor(cx * cellW);
      const y0 = Math.floor(cy * cellH);
      const x1 = Math.min(sampleW, Math.floor((cx + 1) * cellW));
      const y1 = Math.min(sampleH, Math.floor((cy + 1) * cellH));
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let y = y0; y < y1; y += 1) {
        const row = y * sampleW;
        for (let x = x0; x < x1; x += 1) {
          const off = (row + x) * 4;
          if (data[off + 3] < ALPHA_THRESHOLD) continue;
          sumR += data[off]; sumG += data[off + 1]; sumB += data[off + 2];
          count += 1;
        }
      }
      const idx = cy * gridWidth + cx;
      if (count === 0) { indices[idx] = 0; continue; }
      const key = quantizedRgbKey(sumR / count, sumG / count, sumB / count);
      if (!dynamicMap.has(key)) {
        dynamicMap.set(key, colors.length);
        colors.push(keyToColor(key));
      }
      indices[idx] = dynamicMap.get(key) ?? 0;
    }
  }
  return { width: gridWidth, height: gridHeight, pixelSize, indices, colors };
}

/**
 * 边缘保持像素化：在块内做“众数采样”，避免跨边缘平均造成糊边。/ Edge-aware pixelization: choose per-block dominant samples to avoid blur across edges.
 * @param image 源图片元素 / Source image element.
 * @param gridWidth 网格宽度 / Grid width.
 * @param gridHeight 网格高度 / Grid height.
 * @param pixelSize 像素块尺寸 / Pixel block size.
 * @param selectedPalette 目标调色板 / Target palette.
 * @returns 像素网格 / Pixel grid.
 */
function pixelizeEdgeAware(
  image: HTMLImageElement,
  gridWidth: number,
  gridHeight: number,
  pixelSize: number,
  selectedPalette: PaletteColor[] | null,
): PixelGrid {
  const sampleWidth = Math.max(1, gridWidth * pixelSize);
  const sampleHeight = Math.max(1, gridHeight * pixelSize);
  const temp = document.createElement("canvas");
  temp.width = sampleWidth;
  temp.height = sampleHeight;
  const ctx = temp.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("2D canvas is unavailable.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight);

  const { data } = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
  const total = gridWidth * gridHeight;
  const indices = new Uint16Array(total);
  const blockSampleCount = pixelSize * pixelSize;

  if (selectedPalette && selectedPalette.length > 0) {
    const indexCounts = new Uint16Array(selectedPalette.length);
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
              nearest = nearestColorIndex(data[offset], data[offset + 1], data[offset + 2], selectedPalette);
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
      width: gridWidth,
      height: gridHeight,
      pixelSize,
      indices,
      colors: selectedPalette,
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
    width: gridWidth,
    height: gridHeight,
    pixelSize,
    indices,
    colors,
  };
}

function pixelizeFloydSteinberg(
  image: HTMLImageElement,
  gridWidth: number,
  gridHeight: number,
  pixelSize: number,
  selectedPalette: PaletteColor[] | null,
): PixelGrid {
  const temp = document.createElement("canvas");
  temp.width = gridWidth;
  temp.height = gridHeight;
  const ctx = temp.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas is unavailable.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, gridWidth, gridHeight);

  const imgData = ctx.getImageData(0, 0, gridWidth, gridHeight);
  const data = imgData.data;
  const total = gridWidth * gridHeight;
  const indices = new Uint16Array(total);

  const errR = new Float32Array(total);
  const errG = new Float32Array(total);
  const errB = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    errR[i] = data[i * 4];
    errG[i] = data[i * 4 + 1];
    errB[i] = data[i * 4 + 2];
  }

  const palette = selectedPalette && selectedPalette.length > 0 ? selectedPalette : null;
  const colors: PaletteColor[] = palette ? palette : [[0, 0, 0]];
  const dynamicMap = palette ? null : new Map<number, number>([[0, 0]]);

  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const i = y * gridWidth + x;
      if (data[i * 4 + 3] < ALPHA_THRESHOLD) { indices[i] = 0; continue; }
      const oldR = Math.max(0, Math.min(255, errR[i]));
      const oldG = Math.max(0, Math.min(255, errG[i]));
      const oldB = Math.max(0, Math.min(255, errB[i]));

      let newR: number, newG: number, newB: number;
      if (palette) {
        const idx = nearestColorIndex(oldR, oldG, oldB, palette);
        indices[i] = idx;
        [newR, newG, newB] = palette[idx];
      } else {
        const key = quantizedRgbKey(oldR, oldG, oldB);
        if (!dynamicMap!.has(key)) {
          dynamicMap!.set(key, colors.length);
          colors.push(keyToColor(key));
        }
        indices[i] = dynamicMap!.get(key) ?? 0;
        [newR, newG, newB] = colors[indices[i]];
      }

      const eR = oldR - newR;
      const eG = oldG - newG;
      const eB = oldB - newB;

      if (x + 1 < gridWidth) {
        const j = i + 1;
        errR[j] += eR * 7 / 16; errG[j] += eG * 7 / 16; errB[j] += eB * 7 / 16;
      }
      if (y + 1 < gridHeight) {
        if (x > 0) {
          const j = i + gridWidth - 1;
          errR[j] += eR * 3 / 16; errG[j] += eG * 3 / 16; errB[j] += eB * 3 / 16;
        }
        const j2 = i + gridWidth;
        errR[j2] += eR * 5 / 16; errG[j2] += eG * 5 / 16; errB[j2] += eB * 5 / 16;
        if (x + 1 < gridWidth) {
          const j3 = i + gridWidth + 1;
          errR[j3] += eR * 1 / 16; errG[j3] += eG * 1 / 16; errB[j3] += eB * 1 / 16;
        }
      }
    }
  }
  return { width: gridWidth, height: gridHeight, pixelSize, indices, colors };
}

const BAYER4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

function pixelizeOrderedDither(
  image: HTMLImageElement,
  gridWidth: number,
  gridHeight: number,
  pixelSize: number,
  selectedPalette: PaletteColor[] | null,
): PixelGrid {
  const temp = document.createElement("canvas");
  temp.width = gridWidth;
  temp.height = gridHeight;
  const ctx = temp.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas is unavailable.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, gridWidth, gridHeight);

  const imgData = ctx.getImageData(0, 0, gridWidth, gridHeight);
  const data = imgData.data;
  const total = gridWidth * gridHeight;
  const indices = new Uint16Array(total);
  const spread = 48;

  if (selectedPalette && selectedPalette.length > 0) {
    for (let y = 0; y < gridHeight; y += 1) {
      for (let x = 0; x < gridWidth; x += 1) {
        const i = y * gridWidth + x;
        const offset = i * 4;
        if (data[offset + 3] < ALPHA_THRESHOLD) { indices[i] = 0; continue; }
        const threshold = (BAYER4X4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * spread;
        const r = Math.max(0, Math.min(255, data[offset] + threshold));
        const g = Math.max(0, Math.min(255, data[offset + 1] + threshold));
        const b = Math.max(0, Math.min(255, data[offset + 2] + threshold));
        indices[i] = nearestColorIndex(r, g, b, selectedPalette);
      }
    }
    return { width: gridWidth, height: gridHeight, pixelSize, indices, colors: selectedPalette };
  }

  const colors: PaletteColor[] = [[0, 0, 0]];
  const dynamicMap = new Map<number, number>([[0, 0]]);
  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const i = y * gridWidth + x;
      const offset = i * 4;
      if (data[offset + 3] < ALPHA_THRESHOLD) { indices[i] = 0; continue; }
      const threshold = (BAYER4X4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * spread;
      const r = Math.max(0, Math.min(255, data[offset] + threshold));
      const g = Math.max(0, Math.min(255, data[offset + 1] + threshold));
      const b = Math.max(0, Math.min(255, data[offset + 2] + threshold));
      const key = quantizedRgbKey(r, g, b);
      if (!dynamicMap.has(key)) {
        dynamicMap.set(key, colors.length);
        colors.push(keyToColor(key));
      }
      indices[i] = dynamicMap.get(key) ?? 0;
    }
  }
  return { width: gridWidth, height: gridHeight, pixelSize, indices, colors };
}

/**
 * 将本地文件读取为可渲染的 HTMLImageElement。/ Convert a local file into an HTMLImageElement.
 * @param file 图片文件 / Image file.
 * @returns 异步返回加载完成的图片元素 / Promise that resolves to a loaded image element.
 */
export function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = (event) => {
      URL.revokeObjectURL(url);
      reject(event);
    };
    image.src = url;
  });
}

/**
 * 将图片转换为像素网格。/ Convert an image into a pixel grid.
 * @param image 源图片元素 / Source image element.
 * @param pixelSize 网格像素尺寸 / Pixel block size.
 * @param selectedPalette 目标调色板；为空时走动态量化 / Target palette; dynamic quantization when null.
 * @returns 像素网格（颜色表 + 索引）/ Pixel grid with palette and indices.
 */
export function imageToPixelGrid(
  image: HTMLImageElement,
  pixelSize: number,
  selectedPalette: PaletteColor[] | null,
  algorithm: PixelizeAlgorithm = "standard",
): PixelGrid {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const fitted = fitToMaxDimension(sourceWidth, sourceHeight, MAX_SOURCE_DIMENSION);

  const gridWidth = Math.max(1, Math.floor(fitted.width / pixelSize));
  const gridHeight = Math.max(1, Math.floor(fitted.height / pixelSize));
  if (algorithm === "edgeAware") {
    return pixelizeEdgeAware(image, gridWidth, gridHeight, pixelSize, selectedPalette);
  }
  if (algorithm === "orderedDither") {
    return pixelizeOrderedDither(image, gridWidth, gridHeight, pixelSize, selectedPalette);
  }
  if (algorithm === "floydSteinberg") {
    return pixelizeFloydSteinberg(image, gridWidth, gridHeight, pixelSize, selectedPalette);
  }
  return pixelizeStandard(image, gridWidth, gridHeight, pixelSize, selectedPalette);
}

/**
 * 为导出把画布按整数倍放大，保持像素边缘锐利。/ Scale canvas for export using integer factor with nearest-neighbor style.
 * @param source 源画布 / Source canvas.
 * @param targetMaxSide 导出目标最大边长 / Target maximum side length.
 * @returns 放大后的画布；若无需放大则返回原画布 / Scaled canvas or original canvas when no scaling needed.
 */
export function scaleCanvasForExport(
  source: HTMLCanvasElement,
  targetMaxSide = DEFAULT_EXPORT_MAX_SIDE,
): HTMLCanvasElement {
  const maxSide = Math.max(source.width, source.height);
  const scale = Math.max(1, Math.ceil(targetMaxSide / Math.max(1, maxSide)));
  if (scale === 1) {
    return source;
  }

  const output = document.createElement("canvas");
  output.width = source.width * scale;
  output.height = source.height * scale;
  const ctx = output.getContext("2d");
  if (!ctx) {
    return source;
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, output.width, output.height);
  return output;
}
