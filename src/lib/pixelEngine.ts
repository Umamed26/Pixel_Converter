// Pixel conversion engine: image load, grid quantization, palette mapping, and export scaling.
import type { PaletteColor, PixelGrid } from "../types";

const MAX_SOURCE_DIMENSION = 600;
const ALPHA_THRESHOLD = 30;
const DEFAULT_EXPORT_MAX_SIDE = 1200;

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

function quantizeChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value / 32) * 32));
}

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
