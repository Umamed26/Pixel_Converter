// Preset storage helpers: schema guards, import/export, and localStorage persistence.
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBool(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isPaletteColor(value: unknown): value is PaletteColor {
  return Array.isArray(value)
    && value.length === 3
    && isFiniteNumber(value[0])
    && isFiniteNumber(value[1])
    && isFiniteNumber(value[2]);
}

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

export function savePresetsToStorage(presets: PresetV1[]): void {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    return;
  }

  try {
    const next = presets.slice(0, PRESET_LIMIT);
    window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors and keep runtime usable.
  }
}

export function exportPresetBundleText(presets: PresetV1[]): string {
  const bundle: PresetBundleV1 = {
    kind: "pixel-converter-presets",
    version: 1,
    presets: presets.slice(0, PRESET_LIMIT),
  };
  return JSON.stringify(bundle, null, 2);
}

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
