// Shared domain and serialization types used across hooks, libs, and components.
export type Lang = "zh-CN" | "en";

export type PaletteColor = [number, number, number];

export interface PixelGrid {
  width: number;
  height: number;
  pixelSize: number;
  indices: Uint16Array;
  colors: PaletteColor[];
}

export interface EffectsState {
  glitch: boolean;
  crt: boolean;
  paletteCycle: boolean;
  ghost: boolean;
  ditherFade: boolean;
  waveWarp: boolean;
}

export interface EffectTuning {
  glitchPower: number;
  glitchSpeed: number;
  crtPower: number;
  paletteCycleSpeed: number;
  paletteCycleStep: number;
  ghostPower: number;
  ghostSpeed: number;
  ditherPower: number;
  ditherSpeed: number;
  wavePower: number;
  waveSpeed: number;
}

export interface DialogState {
  enabled: boolean;
  style: "win95" | "terminal" | "dq" | "ff" | "retro" | "neon" | "stone" | "paper" | "void" | "aqua";
  name: string;
  text: string;
  position: number;
  page: number;
  typingSpeed: number;
  autoPage: boolean;
  autoPageDelay: number;
}

export type MaskMode = "paint" | "erase";

export interface MaskConfig {
  enabled: boolean;
  overlayVisible: boolean;
  brushSize: number;
  mode: MaskMode;
  fxEnabled: Record<keyof EffectsState, boolean>;
}

export interface MaskState extends MaskConfig {
  data: Uint8Array | null;
  width: number;
  height: number;
}

export interface PresetStateV1 {
  pixelSize: number;
  palette: string;
  paletteOverrides: Partial<Record<string, PaletteColor[]>>;
  effects: EffectsState;
  effectTuning: EffectTuning;
  dialog: DialogState;
  maskConfig: MaskConfig;
}

export interface PresetV1 {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  state: PresetStateV1;
}

export interface PresetBundleV1 {
  kind: "pixel-converter-presets";
  version: 1;
  presets: PresetV1[];
}

export interface PixelGridSnapshot {
  width: number;
  height: number;
  pixelSize: number;
  colors: PaletteColor[];
  grid: string;
}

export interface MaskSnapshot {
  width: number;
  height: number;
  dataBase64: string;
}

export interface ProjectStateV1 {
  pixelSize: number;
  palette: string;
  paletteOverrides: Partial<Record<string, PaletteColor[]>>;
  effects: EffectsState;
  effectTuning: EffectTuning;
  dialog: DialogState;
  maskConfig: MaskConfig;
  maskSnapshot: MaskSnapshot | null;
  presets: PresetV1[];
  selectedPresetId: string | null;
  batchNamingTemplate: string;
  performanceMode: boolean;
  gridSnapshot: PixelGridSnapshot | null;
}

export interface ProjectFileV1 {
  kind: "pixel-converter-project";
  version: 1;
  exportedAt: string;
  state: ProjectStateV1;
}

export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  retries: number;
  currentFile: string;
  zipProgress: number;
}
