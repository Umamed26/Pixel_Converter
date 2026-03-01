// 工程文件工具：解析/生成 `.pxc`，并处理蒙版快照与批处理进度。/ Project helpers: parse/create `.pxc`, plus mask snapshot and batch progress.
import type {
  BatchProgress,
  MaskSnapshot,
  PaletteColor,
  ProjectFileV1,
  ProjectStateV1,
} from "../types";

/**
 * 判断值是否为普通对象。/ Check whether a value is a plain object.
 * @param value 待判断值 / Value to inspect.
 * @returns 是否为对象 / True when object record.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 判断值是否为有限数字。/ Check whether a value is a finite number.
 * @param value 待判断值 / Value to inspect.
 * @returns 是否为有限数字 / True when finite number.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 判断是否为合法 RGB 三元组。/ Check whether a value is a valid RGB tuple.
 * @param value 待判断值 / Value to inspect.
 * @returns 是否为颜色三元组 / True when valid color tuple.
 */
function isPaletteColor(value: unknown): value is PaletteColor {
  return Array.isArray(value)
    && value.length === 3
    && isFiniteNumber(value[0])
    && isFiniteNumber(value[1])
    && isFiniteNumber(value[2]);
}

/**
 * 将字节数组编码为 Base64。/ Encode a byte array into Base64.
 * @param bytes 原始字节 / Raw bytes.
 * @returns Base64 字符串 / Base64 string.
 */
function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const view = bytes.subarray(i, Math.min(bytes.length, i + chunk));
    binary += String.fromCharCode(...view);
  }
  return btoa(binary);
}

/**
 * 将 Base64 解码为字节数组。/ Decode Base64 into a byte array.
 * @param text Base64 字符串 / Base64 text.
 * @returns 解码后的字节数组；失败返回 null / Decoded bytes or null on failure.
 */
function decodeBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * 创建可序列化的蒙版快照。/ Create a serializable mask snapshot.
 * @param data 蒙版数据 / Mask bytes.
 * @param width 蒙版宽度 / Mask width.
 * @param height 蒙版高度 / Mask height.
 * @returns 快照对象 / Mask snapshot object.
 */
export function createMaskSnapshot(data: Uint8Array, width: number, height: number): MaskSnapshot {
  return {
    width,
    height,
    dataBase64: encodeBase64(data),
  };
}

/**
 * 解码蒙版快照并做尺寸校验。/ Decode mask snapshot with size validation.
 * @param snapshot 蒙版快照 / Mask snapshot.
 * @returns 蒙版字节数组；无效则 null / Mask bytes or null when invalid.
 */
export function decodeMaskSnapshot(snapshot: MaskSnapshot): Uint8Array | null {
  if (!snapshot || !isFiniteNumber(snapshot.width) || !isFiniteNumber(snapshot.height) || typeof snapshot.dataBase64 !== "string") {
    return null;
  }
  const width = Math.max(0, Math.floor(snapshot.width));
  const height = Math.max(0, Math.floor(snapshot.height));
  const bytes = decodeBase64(snapshot.dataBase64);
  if (!bytes || bytes.length !== width * height) {
    return null;
  }
  return bytes;
}

/**
 * 生成工程文件对象。/ Create a project file object.
 * @param state 工程状态 / Project state payload.
 * @returns 标准化工程文件 / Standard project file object.
 */
export function createProjectFile(state: ProjectStateV1): ProjectFileV1 {
  return {
    kind: "pixel-converter-project",
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  };
}

/**
 * 解析 paletteOverrides 并清洗颜色格式。/ Parse palette overrides and sanitize colors.
 * @param value 原始输入 / Raw input.
 * @returns 清洗后的覆盖映射 / Sanitized override map.
 */
function parsePaletteOverrides(value: unknown): Partial<Record<string, PaletteColor[]>> {
  if (!isObject(value)) {
    return {};
  }
  const next: Partial<Record<string, PaletteColor[]>> = {};
  for (const [key, row] of Object.entries(value)) {
    if (!Array.isArray(row)) {
      continue;
    }
    const colors = row.filter(isPaletteColor).map((color) => [color[0], color[1], color[2]] as PaletteColor);
    if (colors.length > 0) {
      next[key] = colors;
    }
  }
  return next;
}

/**
 * 从文本解析工程文件。/ Parse a project file from text content.
 * @param text 工程文件文本 / Project file text.
 * @returns 合法工程对象；失败返回 null / Parsed project object or null.
 */
export function parseProjectFileText(text: string): ProjectFileV1 | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isObject(parsed) || parsed.kind !== "pixel-converter-project" || parsed.version !== 1 || !isObject(parsed.state)) {
      return null;
    }
    const stateRaw = parsed.state;
    if (!isFiniteNumber(stateRaw.pixelSize) || typeof stateRaw.palette !== "string") {
      return null;
    }
    const state = {
      ...stateRaw,
      pixelSize: stateRaw.pixelSize,
      palette: stateRaw.palette,
      paletteOverrides: parsePaletteOverrides(stateRaw.paletteOverrides),
    } as ProjectStateV1;
    return {
      kind: "pixel-converter-project",
      version: 1,
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
      state,
    };
  } catch {
    return null;
  }
}

/**
 * 创建空的批处理进度对象。/ Create an empty batch progress object.
 * @returns 初始批处理进度 / Initial batch progress.
 */
export function createEmptyBatchProgress(): BatchProgress {
  return {
    total: 0,
    completed: 0,
    failed: 0,
    retries: 0,
    currentFile: "",
    zipProgress: 0,
  };
}
