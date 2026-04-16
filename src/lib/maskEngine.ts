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
 * 规范化羽化半径（网格像素）。/ Normalize feather radius in grid cells.
 * @param value 原始羽化值 / Raw feather value.
 * @returns 规范化羽化值 / Normalized feather value.
 */
function normalizeFeather(value: number): number {
  return Math.max(0, Math.floor(value));
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
 * 在写入蒙版时按模式与权重混合。/ Blend one mask value by mode and weight.
 * @param current 当前值 / Current value.
 * @param mode 模式（涂抹或擦除）/ Mode (paint or erase).
 * @param alpha 目标权重 0..1 / Target alpha in 0..1.
 * @returns 混合后的值 / Blended value.
 */
function blendMaskValue(current: number, mode: "paint" | "erase", alpha: number): number {
  const clampedAlpha = clamp(alpha, 0, 1);
  const target = mode === "paint" ? 255 : 0;
  return Math.round(current + (target - current) * clampedAlpha);
}

/**
 * 计算点到线段的最短距离。/ Compute shortest distance from a point to a segment.
 * @param px 点 X / Point X.
 * @param py 点 Y / Point Y.
 * @param ax 线段起点 X / Segment start X.
 * @param ay 线段起点 Y / Segment start Y.
 * @param bx 线段终点 X / Segment end X.
 * @param by 线段终点 Y / Segment end Y.
 * @returns 最短距离 / Shortest distance.
 */
function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 1e-6) {
    const dx = px - ax;
    const dy = py - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }
  const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 判断点是否在多边形内部。/ Check whether a point is inside polygon.
 * @param x 点 X / Point X.
 * @param y 点 Y / Point Y.
 * @param points 多边形顶点 / Polygon points.
 * @returns 是否在内部 / True when inside polygon.
 */
function isPointInPolygon(x: number, y: number, points: MaskPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-6) + xi);
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
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

/**
 * 应用矩形蒙版工具（支持羽化边缘）。/ Apply rectangular mask tool with optional feather.
 * @param source 源蒙版数据 / Source mask data.
 * @param width 蒙版宽度 / Mask width.
 * @param height 蒙版高度 / Mask height.
 * @param start 起点 / Start point.
 * @param end 终点 / End point.
 * @param mode 模式（涂抹或擦除）/ Mode (paint or erase).
 * @param feather 羽化半径（网格像素）/ Feather radius in grid cells.
 * @returns 新蒙版副本 / New mask buffer.
 */
export function applyMaskRectangle(
  source: Uint8Array,
  width: number,
  height: number,
  start: MaskPoint,
  end: MaskPoint,
  mode: "paint" | "erase",
  feather = 0,
): Uint8Array {
  const safeWidth = normalizeDimension(width);
  const safeHeight = normalizeDimension(height);
  const expected = safeWidth * safeHeight;
  if (!expected || source.length !== expected) {
    return source;
  }
  const next = new Uint8Array(source);
  const minX = clamp(Math.min(start.x, end.x), 0, safeWidth - 1);
  const maxX = clamp(Math.max(start.x, end.x), 0, safeWidth - 1);
  const minY = clamp(Math.min(start.y, end.y), 0, safeHeight - 1);
  const maxY = clamp(Math.max(start.y, end.y), 0, safeHeight - 1);
  const edgeFeather = normalizeFeather(feather);
  const featherSpan = Math.max(1, edgeFeather + 1);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const idx = y * safeWidth + x;
      let alpha = 1;
      if (edgeFeather > 0) {
        const distEdge = Math.min(x - minX, maxX - x, y - minY, maxY - y);
        alpha = clamp((distEdge + 1) / featherSpan, 0, 1);
      }
      next[idx] = blendMaskValue(next[idx], mode, alpha);
    }
  }
  return next;
}

/**
 * 应用套索多边形蒙版工具（支持羽化边缘）。/ Apply polygon-lasso mask tool with optional feather.
 * @param source 源蒙版数据 / Source mask data.
 * @param width 蒙版宽度 / Mask width.
 * @param height 蒙版高度 / Mask height.
 * @param points 多边形点集 / Polygon points.
 * @param mode 模式（涂抹或擦除）/ Mode (paint or erase).
 * @param feather 羽化半径（网格像素）/ Feather radius in grid cells.
 * @returns 新蒙版副本 / New mask buffer.
 */
export function applyMaskPolygon(
  source: Uint8Array,
  width: number,
  height: number,
  points: MaskPoint[],
  mode: "paint" | "erase",
  feather = 0,
): Uint8Array {
  const safeWidth = normalizeDimension(width);
  const safeHeight = normalizeDimension(height);
  const expected = safeWidth * safeHeight;
  if (!expected || source.length !== expected || points.length < 3) {
    return source;
  }
  const next = new Uint8Array(source);
  const minX = clamp(Math.min(...points.map((p) => p.x)), 0, safeWidth - 1);
  const maxX = clamp(Math.max(...points.map((p) => p.x)), 0, safeWidth - 1);
  const minY = clamp(Math.min(...points.map((p) => p.y)), 0, safeHeight - 1);
  const maxY = clamp(Math.max(...points.map((p) => p.y)), 0, safeHeight - 1);
  const edgeFeather = normalizeFeather(feather);
  const featherSpan = Math.max(1, edgeFeather + 1);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!isPointInPolygon(x + 0.5, y + 0.5, points)) {
        continue;
      }
      const idx = y * safeWidth + x;
      let alpha = 1;
      if (edgeFeather > 0) {
        let minDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < points.length; i += 1) {
          const a = points[i];
          const b = points[(i + 1) % points.length];
          minDist = Math.min(minDist, distancePointToSegment(x + 0.5, y + 0.5, a.x + 0.5, a.y + 0.5, b.x + 0.5, b.y + 0.5));
        }
        alpha = clamp(minDist / featherSpan, 0, 1);
      }
      next[idx] = blendMaskValue(next[idx], mode, alpha);
    }
  }
  return next;
}

/**
 * 应用线性渐变蒙版工具。/ Apply linear-gradient mask tool.
 * @param source 源蒙版数据 / Source mask data.
 * @param width 蒙版宽度 / Mask width.
 * @param height 蒙版高度 / Mask height.
 * @param from 渐变起点 / Gradient start.
 * @param to 渐变终点 / Gradient end.
 * @param mode 模式（涂抹或擦除）/ Mode (paint or erase).
 * @param feather 羽化强度（指数调节）/ Feather strength as exponent tweak.
 * @returns 新蒙版副本 / New mask buffer.
 */
export function applyMaskGradient(
  source: Uint8Array,
  width: number,
  height: number,
  from: MaskPoint,
  to: MaskPoint,
  mode: "paint" | "erase",
  feather = 0,
): Uint8Array {
  const safeWidth = normalizeDimension(width);
  const safeHeight = normalizeDimension(height);
  const expected = safeWidth * safeHeight;
  if (!expected || source.length !== expected) {
    return source;
  }
  const next = new Uint8Array(source);
  const vx = to.x - from.x;
  const vy = to.y - from.y;
  const lenSq = Math.max(1e-6, vx * vx + vy * vy);
  const featherPower = 1 + normalizeFeather(feather) * 0.2;

  for (let y = 0; y < safeHeight; y += 1) {
    for (let x = 0; x < safeWidth; x += 1) {
      const wx = x - from.x;
      const wy = y - from.y;
      const projection = clamp((wx * vx + wy * vy) / lenSq, 0, 1);
      const alphaRaw = mode === "paint" ? projection : 1 - projection;
      const alpha = Math.pow(alphaRaw, featherPower);
      const idx = y * safeWidth + x;
      next[idx] = blendMaskValue(next[idx], mode, alpha);
    }
  }
  return next;
}
