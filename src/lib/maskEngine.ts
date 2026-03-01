// 蒙版引擎：在网格坐标系中创建、涂抹与反选蒙版。/ Mask engine: create, paint, and invert mask data in grid space.
export interface MaskPoint {
  x: number;
  y: number;
}

/**
 * 限制数值到指定区间。/ Clamp a number into a min-max range.
 * @param value 待限制值 / Input value.
 * @param min 最小值 / Lower bound.
 * @param max 最大值 / Upper bound.
 * @returns 区间内结果 / Clamped result.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 规范化维度为非负整数。/ Normalize a dimension to a non-negative integer.
 * @param value 原始维度 / Raw dimension.
 * @returns 规范化后的维度 / Normalized dimension.
 */
function normalizeDimension(value: number): number {
  return Math.max(0, Math.floor(value));
}

/**
 * 规范化画笔尺寸，最小为 1。/ Normalize brush size with minimum value 1.
 * @param value 原始画笔大小 / Raw brush size.
 * @returns 规范化画笔大小 / Normalized brush size.
 */
function normalizeBrushSize(value: number): number {
  return Math.max(1, Math.floor(value));
}

/**
 * 在目标蒙版数据中盖章一个圆形笔刷。/ Stamp a circular brush into target mask data.
 * @param target 目标蒙版数组 / Target mask buffer.
 * @param width 蒙版宽度 / Mask width.
 * @param height 蒙版高度 / Mask height.
 * @param centerX 圆心 X / Circle center X.
 * @param centerY 圆心 Y / Circle center Y.
 * @param radius 半径（网格像素）/ Radius in grid cells.
 * @param color 写入值（0 或 255）/ Fill value (0 or 255).
 * @returns 无返回值 / No return value.
 */
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

/**
 * 创建蒙版位图数据。/ Create a mask bitmap buffer.
 * @param width 蒙版宽度 / Mask width.
 * @param height 蒙版高度 / Mask height.
 * @param fill 初始填充值（0 或 255）/ Initial fill value (0 or 255).
 * @returns 蒙版数据数组 / Mask data buffer.
 */
export function createMaskData(width: number, height: number, fill: 0 | 255 = 0): Uint8Array {
  const safeWidth = normalizeDimension(width);
  const safeHeight = normalizeDimension(height);
  const data = new Uint8Array(safeWidth * safeHeight);
  if (fill !== 0) {
    data.fill(fill);
  }
  return data;
}

/**
 * 沿两点之间绘制一条蒙版笔画。/ Paint a mask stroke between two points.
 * @param source 源蒙版数据 / Source mask data.
 * @param width 蒙版宽度 / Mask width.
 * @param height 蒙版高度 / Mask height.
 * @param from 起点 / Stroke start point.
 * @param to 终点 / Stroke end point.
 * @param brushSize 画笔尺寸（网格像素）/ Brush size in grid cells.
 * @param mode 模式：涂抹或擦除 / Mode: paint or erase.
 * @returns 新的蒙版数据副本 / New mask data copy.
 */
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

/**
 * 反选蒙版：0 与 255 互换。/ Invert mask values by swapping 0 and 255.
 * @param source 源蒙版数据 / Source mask data.
 * @returns 反选后的新蒙版 / Inverted mask buffer.
 */
export function invertMaskData(source: Uint8Array): Uint8Array {
  const next = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    next[i] = source[i] > 0 ? 0 : 255;
  }
  return next;
}
