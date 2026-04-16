// 调色板智能工具：提取主色、合并相近色、按锁定位应用候选色。/ Palette smart tools: extract dominant colors, merge similar colors, and apply with locks.
import type { PaletteColor } from "../types";

/**
 * 限制数值到区间。/ Clamp number into range.
 * @param value 输入值 / Input value.
 * @param min 最小值 / Lower bound.
 * @param max 最大值 / Upper bound.
 * @returns 限制后的值 / Clamped value.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 计算两种颜色的欧氏距离。/ Compute Euclidean distance between two colors.
 * @param a 颜色 A / Color A.
 * @param b 颜色 B / Color B.
 * @returns 距离值 / Distance.
 */
function colorDistance(a: PaletteColor, b: PaletteColor): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * 规范化 RGB 颜色为 0..255 整数。/ Normalize RGB color into 0..255 integers.
 * @param color 输入颜色 / Input color.
 * @returns 规范化颜色 / Normalized color.
 */
function normalizeColor(color: PaletteColor): PaletteColor {
  return [
    clamp(Math.round(color[0]), 0, 255),
    clamp(Math.round(color[1]), 0, 255),
    clamp(Math.round(color[2]), 0, 255),
  ];
}

/**
 * 把 ImageData 提取为主色集合（基于量化频次）。/ Extract dominant colors from ImageData by quantized frequency.
 * @param imageData 图像数据 / ImageData.
 * @param colorCount 目标颜色数量 / Target color count.
 * @returns 主色列表 / Dominant colors.
 */
export function extractDominantColors(imageData: ImageData, colorCount: number): PaletteColor[] {
  const targetCount = clamp(Math.floor(colorCount), 1, 64);
  const bucket = new Map<string, { sum: [number, number, number]; count: number }>();
  const { data } = imageData;
  const step = Math.max(1, Math.floor(Math.sqrt((imageData.width * imageData.height) / 16000)));

  for (let y = 0; y < imageData.height; y += step) {
    for (let x = 0; x < imageData.width; x += step) {
      const idx = (y * imageData.width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha < 12) {
        continue;
      }
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const key = `${Math.floor(r / 16)}-${Math.floor(g / 16)}-${Math.floor(b / 16)}`;
      const hit = bucket.get(key);
      if (hit) {
        hit.sum[0] += r;
        hit.sum[1] += g;
        hit.sum[2] += b;
        hit.count += 1;
      } else {
        bucket.set(key, {
          sum: [r, g, b],
          count: 1,
        });
      }
    }
  }

  const ranked = Array.from(bucket.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, targetCount * 3);
  const picked: PaletteColor[] = [];
  for (const item of ranked) {
    const color: PaletteColor = normalizeColor([
      item.sum[0] / item.count,
      item.sum[1] / item.count,
      item.sum[2] / item.count,
    ]);
    if (picked.every((entry) => colorDistance(entry, color) >= 18)) {
      picked.push(color);
    }
    if (picked.length >= targetCount) {
      break;
    }
  }
  if (picked.length === 0) {
    return [[0, 0, 0]];
  }
  return picked;
}

/**
 * 将相近颜色合并为代表色。/ Merge nearby colors into representative entries.
 * @param colors 输入颜色列表 / Input colors.
 * @param threshold 合并阈值（欧氏距离）/ Merge threshold (Euclidean distance).
 * @returns 合并后的颜色列表 / Merged colors.
 */
export function mergeSimilarColors(colors: PaletteColor[], threshold: number): PaletteColor[] {
  if (colors.length <= 1) {
    return colors.map((color) => normalizeColor(color));
  }
  const distThreshold = clamp(threshold, 2, 160);
  const clusters: Array<{ sum: [number, number, number]; count: number; center: PaletteColor }> = [];

  for (const rawColor of colors) {
    const color = normalizeColor(rawColor);
    let assigned = false;
    for (const cluster of clusters) {
      if (colorDistance(cluster.center, color) <= distThreshold) {
        cluster.sum[0] += color[0];
        cluster.sum[1] += color[1];
        cluster.sum[2] += color[2];
        cluster.count += 1;
        cluster.center = normalizeColor([
          cluster.sum[0] / cluster.count,
          cluster.sum[1] / cluster.count,
          cluster.sum[2] / cluster.count,
        ]);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      clusters.push({
        sum: [color[0], color[1], color[2]],
        count: 1,
        center: color,
      });
    }
  }

  return clusters.map((cluster) => cluster.center);
}

/**
 * 将候选颜色按锁定位写入现有调色板。/ Apply candidate colors to current palette while respecting lock flags.
 * @param current 当前调色板 / Current palette.
 * @param suggested 候选颜色 / Suggested colors.
 * @param locks 锁定数组 / Lock flags.
 * @returns 新调色板 / Next palette.
 */
export function applyPaletteWithLocks(
  current: PaletteColor[],
  suggested: PaletteColor[],
  locks: boolean[],
): PaletteColor[] {
  const next = current.map((color) => normalizeColor(color));
  let cursor = 0;
  for (let i = 0; i < next.length; i += 1) {
    if (locks[i]) {
      continue;
    }
    if (cursor >= suggested.length) {
      break;
    }
    next[i] = normalizeColor(suggested[cursor]);
    cursor += 1;
  }
  if (next.length === 0) {
    return suggested.length > 0 ? [normalizeColor(suggested[0])] : [[0, 0, 0]];
  }
  return next;
}

