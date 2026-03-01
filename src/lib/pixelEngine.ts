// 像素化引擎：负责读图、网格量化、调色板映射与导出缩放。/ Pixel engine: load image, quantize grid, map palette, and scale export.
import type { PaletteColor, PixelGrid } from "../types";

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
 * 把通道值量化到 32 步进。/ Quantize a channel into 32-step buckets.
 * @param value 原始通道值 / Raw channel value.
 * @returns 量化后的通道值 / Quantized channel value.
 */
function quantizeChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value / 32) * 32));
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
): PixelGrid {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const fitted = fitToMaxDimension(sourceWidth, sourceHeight, MAX_SOURCE_DIMENSION);

  const gridWidth = Math.max(1, Math.floor(fitted.width / pixelSize));
  const gridHeight = Math.max(1, Math.floor(fitted.height / pixelSize));

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
  const dynamicMap = new Map<string, number>([["0,0,0", 0]]);

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

    const qr = quantizeChannel(r);
    const qg = quantizeChannel(g);
    const qb = quantizeChannel(b);
    const key = `${qr},${qg},${qb}`;
    if (!dynamicMap.has(key)) {
      dynamicMap.set(key, colors.length);
      colors.push([qr, qg, qb]);
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
