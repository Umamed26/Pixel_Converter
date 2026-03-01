// 预设存储：负责校验、导入导出与本地持久化。/ Preset store: validation, import/export, and local persistence.
import type {
  DialogState,
  EffectTuning,
  EffectsState,
  MaskConfig,
  PaletteColor,
  PresetBundleV1,
  PresetV1,
  PresetStateV1,
} from "../types";

export const PRESET_STORAGE_KEY = "pixel_converter_presets_v1";
export const PRESET_LIMIT = 20;

const DIALOG_STYLES: DialogState["style"][] = [
  "win95",
  "terminal",
  "dq",
  "ff",
  "retro",
  "neon",
  "stone",
  "paper",
  "void",
  "aqua",
];

const EFFECT_KEYS: Array<keyof EffectsState> = [
  "glitch",
  "crt",
  "paletteCycle",
  "ghost",
  "ditherFade",
  "waveWarp",
];

/**
 * 判断值是否为普通对象。/ Check whether a value is a plain object.
 * @param value 待判断值 / Value to inspect.
 * @returns 是否为对象 / True when value is an object record.
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
 * 判断值是否为布尔值。/ Check whether a value is boolean.
 * @param value 待判断值 / Value to inspect.
 * @returns 是否为布尔值 / True when boolean.
 */
function isBool(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * 判断值是否是合法调色板颜色元组。/ Check whether a value is a valid palette color tuple.
 * @param value 待判断值 / Value to inspect.
 * @returns 是否为颜色三元组 / True when `[r,g,b]`.
 */
function isPaletteColor(value: unknown): value is PaletteColor {
  return Array.isArray(value)
    && value.length === 3
    && isFiniteNumber(value[0])
    && isFiniteNumber(value[1])
    && isFiniteNumber(value[2]);
}

/**
 * 解析并清洗 paletteOverrides。/ Parse and sanitize paletteOverrides.
 * @param value 原始输入 / Raw input.
 * @returns 清洗后的调色板覆盖映射 / Sanitized palette override map.
 */
function parsePaletteOverrides(value: unknown): Partial<Record<string, PaletteColor[]>> {
  if (!isObject(value)) {
    return {};
  }

  const next: Partial<Record<string, PaletteColor[]>> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!Array.isArray(entry)) {
      continue;
    }
    const colors = entry.filter(isPaletteColor).map((row) => [row[0], row[1], row[2]] as PaletteColor);
    if (colors.length > 0) {
      next[key] = colors;
    }
  }
  return next;
}

/**
 * 解析特效开关对象。/ Parse effects toggle object.
 * @param value 原始输入 / Raw input.
 * @returns 合法 EffectsState，失败返回 null / Parsed EffectsState or null.
 */
function parseEffects(value: unknown): EffectsState | null {
  if (!isObject(value)) {
    return null;
  }
  const next = {} as EffectsState;
  for (const key of EFFECT_KEYS) {
    if (!isBool(value[key])) {
      return null;
    }
    next[key] = value[key];
  }
  return next;
}

/**
 * 解析特效调参对象。/ Parse effect tuning values.
 * @param value 原始输入 / Raw input.
 * @returns 合法 EffectTuning，失败返回 null / Parsed EffectTuning or null.
 */
function parseEffectTuning(value: unknown): EffectTuning | null {
  if (!isObject(value)) {
    return null;
  }

  const keys: Array<keyof EffectTuning> = [
    "glitchPower",
    "glitchSpeed",
    "crtPower",
    "paletteCycleSpeed",
    "paletteCycleStep",
    "ghostPower",
    "ghostSpeed",
    "ditherPower",
    "ditherSpeed",
    "wavePower",
    "waveSpeed",
  ];

  const next = {} as EffectTuning;
  for (const key of keys) {
    if (!isFiniteNumber(value[key])) {
      return null;
    }
    next[key] = value[key];
  }
  return next;
}

/**
 * 解析对话框配置。/ Parse dialog configuration.
 * @param value 原始输入 / Raw input.
 * @returns 合法 DialogState，失败返回 null / Parsed DialogState or null.
 */
function parseDialog(value: unknown): DialogState | null {
  if (!isObject(value)) {
    return null;
  }
  if (
    !isBool(value.enabled)
    || typeof value.name !== "string"
    || typeof value.text !== "string"
    || !isFiniteNumber(value.position)
    || !isFiniteNumber(value.page)
    || !isFiniteNumber(value.typingSpeed)
    || !isBool(value.autoPage)
    || !isFiniteNumber(value.autoPageDelay)
    || typeof value.style !== "string"
    || !DIALOG_STYLES.includes(value.style as DialogState["style"])
  ) {
    return null;
  }

  return {
    enabled: value.enabled,
    style: value.style as DialogState["style"],
    name: value.name,
    text: value.text,
    position: value.position,
    page: value.page,
    typingSpeed: value.typingSpeed,
    autoPage: value.autoPage,
    autoPageDelay: value.autoPageDelay,
  };
}

/**
 * 解析蒙版配置。/ Parse mask configuration.
 * @param value 原始输入 / Raw input.
 * @returns 合法 MaskConfig，失败返回 null / Parsed MaskConfig or null.
 */
function parseMaskConfig(value: unknown): MaskConfig | null {
  if (!isObject(value)) {
    return null;
  }
  if (
    !isBool(value.enabled)
    || !isBool(value.overlayVisible)
    || !isFiniteNumber(value.brushSize)
    || (value.mode !== "paint" && value.mode !== "erase")
    || !isObject(value.fxEnabled)
  ) {
    return null;
  }

  const fxEnabled = {} as Record<keyof EffectsState, boolean>;
  for (const key of EFFECT_KEYS) {
    const entry = value.fxEnabled[key];
    if (!isBool(entry)) {
      return null;
    }
    fxEnabled[key] = entry;
  }

  return {
    enabled: value.enabled,
    overlayVisible: value.overlayVisible,
    brushSize: value.brushSize,
    mode: value.mode,
    fxEnabled,
  };
}

/**
 * 解析预设 state 主体。/ Parse preset state payload.
 * @param value 原始输入 / Raw input.
 * @returns 合法 PresetStateV1，失败返回 null / Parsed PresetStateV1 or null.
 */
function parsePresetState(value: unknown): PresetStateV1 | null {
  if (!isObject(value) || !isFiniteNumber(value.pixelSize) || typeof value.palette !== "string") {
    return null;
  }

  const effects = parseEffects(value.effects);
  const effectTuning = parseEffectTuning(value.effectTuning);
  const dialog = parseDialog(value.dialog);
  const maskConfig = parseMaskConfig(value.maskConfig);
  if (!effects || !effectTuning || !dialog || !maskConfig) {
    return null;
  }

  return {
    pixelSize: value.pixelSize,
    palette: value.palette,
    paletteOverrides: parsePaletteOverrides(value.paletteOverrides),
    effects,
    effectTuning,
    dialog,
    maskConfig,
  };
}

/**
 * 清洗单条预设记录。/ Sanitize one preset record.
 * @param value 原始输入 / Raw input.
 * @returns 合法预设或 null / Sanitized preset or null.
 */
function sanitizePreset(value: unknown): PresetV1 | null {
  if (
    !isObject(value)
    || value.version !== 1
    || typeof value.id !== "string"
    || typeof value.name !== "string"
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  const state = parsePresetState(value.state);
  if (!state) {
    return null;
  }

  return {
    version: 1,
    id: value.id,
    name: value.name,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    state,
  };
}

/**
 * 清洗预设列表并应用条数上限。/ Sanitize preset list and apply max limit.
 * @param values 原始数组 / Raw array.
 * @returns 合法预设列表 / Sanitized preset list.
 */
function sanitizePresetList(values: unknown[]): PresetV1[] {
  const next: PresetV1[] = [];
  for (const entry of values) {
    const preset = sanitizePreset(entry);
    if (!preset) {
      continue;
    }
    next.push(preset);
    if (next.length >= PRESET_LIMIT) {
      break;
    }
  }
  return next;
}

/**
 * 从 localStorage 读取预设。/ Load presets from localStorage.
 * @returns 预设列表，失败时返回空数组 / Preset list, or empty array on failure.
 */
export function loadPresetsFromStorage(): PresetV1[] {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return sanitizePresetList(parsed);
  } catch {
    return [];
  }
}

/**
 * 将预设保存到 localStorage。/ Persist presets to localStorage.
 * @param presets 预设列表 / Preset list.
 * @returns 无返回值 / No return value.
 */
export function savePresetsToStorage(presets: PresetV1[]): void {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    return;
  }

  try {
    const next = presets.slice(0, PRESET_LIMIT);
    window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 忽略存储异常，保持运行可用。/ Ignore storage errors to keep runtime usable.
  }
}

/**
 * 导出预设包为 JSON 文本。/ Export preset bundle as JSON text.
 * @param presets 预设列表 / Preset list.
 * @returns 可下载的 JSON 字符串 / JSON text ready for download.
 */
export function exportPresetBundleText(presets: PresetV1[]): string {
  const bundle: PresetBundleV1 = {
    kind: "pixel-converter-presets",
    version: 1,
    presets: presets.slice(0, PRESET_LIMIT),
  };
  return JSON.stringify(bundle, null, 2);
}

/**
 * 从 JSON 文本导入预设包。/ Import preset bundle from JSON text.
 * @param text JSON 文本 / JSON text.
 * @returns 预设列表；格式不合法时返回 null / Preset list or null when invalid.
 */
export function importPresetBundleText(text: string): PresetV1[] | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isObject(parsed) || parsed.kind !== "pixel-converter-presets" || parsed.version !== 1 || !Array.isArray(parsed.presets)) {
      return null;
    }
    return sanitizePresetList(parsed.presets);
  } catch {
    return null;
  }
}
