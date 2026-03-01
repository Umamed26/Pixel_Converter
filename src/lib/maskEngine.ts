// Mask utilities: create, paint, clamp, and invert mask data in grid space.
export interface MaskPoint {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeDimension(value: number): number {
  return Math.max(0, Math.floor(value));
}

function normalizeBrushSize(value: number): number {
  return Math.max(1, Math.floor(value));
}

function stampCircle(
  target: Uint8Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  color: 0 | 255,
): void {
  const minY = clamp(centerY - radius, 0, height - 1);
  const maxY = clamp(centerY + radius, 0, height - 1);
  const minX = clamp(centerX - radius, 0, width - 1);
  const maxX = clamp(centerX + radius, 0, width - 1);
  const radiusSq = radius * radius;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= radiusSq) {
        target[y * width + x] = color;
      }
    }
  }
}

export function createMaskData(width: number, height: number, fill: 0 | 255 = 0): Uint8Array {
  const safeWidth = normalizeDimension(width);
  const safeHeight = normalizeDimension(height);
  const data = new Uint8Array(safeWidth * safeHeight);
  if (fill !== 0) {
    data.fill(fill);
  }
  return data;
}

export function applyMaskStroke(
  source: Uint8Array,
  width: number,
  height: number,
  from: MaskPoint,
  to: MaskPoint,
  brushSize: number,
  mode: "paint" | "erase",
): Uint8Array {
  const safeWidth = normalizeDimension(width);
  const safeHeight = normalizeDimension(height);
  const expected = safeWidth * safeHeight;
  if (!expected || source.length !== expected) {
    return source;
  }

  const next = new Uint8Array(source);
  const color: 0 | 255 = mode === "paint" ? 255 : 0;
  const radius = Math.max(0, Math.round((normalizeBrushSize(brushSize) - 1) / 2));
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);

  for (let i = 0; i <= steps; i += 1) {
    const ratio = i / steps;
    const x = Math.round(from.x + dx * ratio);
    const y = Math.round(from.y + dy * ratio);
    stampCircle(next, safeWidth, safeHeight, x, y, radius, color);
  }

  return next;
}

export function invertMaskData(source: Uint8Array): Uint8Array {
  const next = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    next[i] = source[i] > 0 ? 0 : 255;
  }
  return next;
}
