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
  const temp = document.createElement("canvas");
  temp.width = gridWidth;
  temp.height = gridHeight;
  const ctx = temp.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("2D canvas is unavailable.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.drawImage(image, 0, 0, gridWidth, gridHeight);

  const { data } = ctx.getImageData(0, 0, gridWidth, gridHeight);
  const total = gridWidth * gridHeight;
  const indices = new Uint16Array(total);

  if (selectedPalette && selectedPalette.length > 0) {
    for (let i = 0; i < total; i += 1) {
      const offset = i * 4;
      const alpha = data[offset + 3];
      if (alpha < ALPHA_THRESHOLD) {
        indices[i] = 0;
        continue;
      }
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      indices[i] = nearestColorIndex(r, g, b, selectedPalette);
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

  for (let i = 0; i < total; i += 1) {
    const offset = i * 4;
    const alpha = data[offset + 3];
    if (alpha < ALPHA_THRESHOLD) {
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
    width: gridWidth,
    height: gridHeight,
    pixelSize,
    indices,
    colors,
  };
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
