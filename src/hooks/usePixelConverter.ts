// 核心 Hook：管理状态、渲染循环与导入导出流程。/ Core hook: manages state, render loop, and IO workflows.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  DIALOG_STYLES,
  EFFECTS,
  LANG_OPTIONS,
  PALETTES,
  PIXEL_SIZES,
  STRINGS,
  type PaletteId,
} from "../config/constants";
import { applyMaskStroke, createMaskData, invertMaskData, type MaskPoint } from "../lib/maskEngine";
import { fileToImage, imageToPixelGrid, scaleCanvasForExport } from "../lib/pixelEngine";
import {
  PRESET_LIMIT,
  exportPresetBundleText,
  importPresetBundleText,
  loadPresetsFromStorage,
  savePresetsToStorage,
} from "../lib/presetStore";
import {
  createEmptyBatchProgress,
  createMaskSnapshot,
  createProjectFile,
  decodeMaskSnapshot,
  parseProjectFileText,
} from "../lib/projectStore";
import { renderFrame } from "../lib/renderFrame";
import type {
  BatchProgress,
  DialogState,
  EffectsState,
  EffectTuning,
  Lang,
  MaskConfig,
  MaskMode,
  MaskState,
  PaletteColor,
  ProjectFileV1,
  PixelGrid,
  PixelGridSnapshot,
  PresetV1,
} from "../types";

const TYPEWRITER_CHARS_PER_MS = 1 / 50;

interface GridJsonPayload {
  version: number;
  width: number;
  height: number;
  pixelSize?: number;
  palette?: string;
  colors: Array<[number, number, number]>;
  grid: string;
}

interface PixelWorkerRequest {
  id: number;
  type: "pixelize";
  buffer: ArrayBuffer;
  mimeType: string;
  pixelSize: number;
  palette: PaletteColor[];
}

interface PixelWorkerSuccess {
  id: number;
  ok: true;
  width: number;
  height: number;
  pixelSize: number;
  colors: PaletteColor[];
  indices: ArrayBuffer;
}

interface PixelWorkerFailure {
  id: number;
  ok: false;
  error: string;
}

const PIXEL_WORKER_TIMEOUT_MS = 15_000;
const BATCH_RETRY_LIMIT = 3;

/**
 * 将网格索引序列压缩为 base36 字符串。/ Encode grid indices as compact base36 string.
 * @param indices 网格索引数组 / Grid index array.
 * @returns base36 编码字符串 / Base36 encoded string.
 */
function toBase36Grid(indices: Uint16Array): string {
  return Array.from(indices, (value) => value.toString(36)).join("");
}

/**
 * 将 base36 字符串还原为索引数组。/ Parse base36-encoded grid string into index array.
 * @param serialized base36 网格字符串 / Base36 grid string.
 * @param expectedLength 期望长度 / Expected array length.
 * @returns 索引数组；校验失败返回 null / Parsed indices or null when invalid.
 */
function parseBase36Grid(serialized: string, expectedLength: number): Uint16Array | null {
  if (typeof serialized !== "string" || serialized.length !== expectedLength) {
    return null;
  }
  const parsed = new Uint16Array(expectedLength);
  for (let i = 0; i < expectedLength; i += 1) {
    const value = Number.parseInt(serialized[i], 36);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    parsed[i] = value;
  }
  return parsed;
}

/**
 * 把运行时网格转换为可序列化快照。/ Convert runtime grid into serializable snapshot.
 * @param grid 运行时网格 / Runtime grid.
 * @returns 网格快照对象 / Grid snapshot.
 */
function toGridSnapshot(grid: PixelGrid): PixelGridSnapshot {
  return {
    width: grid.width,
    height: grid.height,
    pixelSize: grid.pixelSize,
    colors: grid.colors,
    grid: toBase36Grid(grid.indices),
  };
}

/**
 * 从快照恢复运行时网格。/ Restore runtime grid from snapshot.
 * @param snapshot 网格快照 / Grid snapshot.
 * @returns 运行时网格；无效时返回 null / Runtime grid or null.
 */
function fromGridSnapshot(snapshot: PixelGridSnapshot): PixelGrid | null {
  const width = Math.max(1, Math.floor(snapshot.width));
  const height = Math.max(1, Math.floor(snapshot.height));
  const pixelSize = Math.max(1, Math.floor(snapshot.pixelSize));
  const parsed = parseBase36Grid(snapshot.grid, width * height);
  if (!parsed || !Array.isArray(snapshot.colors) || snapshot.colors.length === 0) {
    return null;
  }
  return {
    width,
    height,
    pixelSize,
    indices: parsed,
    colors: snapshot.colors,
  };
}

/**
 * 去掉文件名后缀。/ Remove file extension from filename.
 * @param filename 原文件名 / Original filename.
 * @returns 去后缀名称 / Filename without extension.
 */
function stripExt(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "");
}

/**
 * 按模板格式化批量导出文件名。/ Build batch export filename from template.
 * @param template 命名模板 / Naming template.
 * @param filename 原文件名 / Original filename.
 * @param index 序号 / Item index.
 * @returns 安全文件名（不含非法字符）/ Sanitized filename.
 */
function formatBatchName(template: string, filename: string, index: number): string {
  const base = stripExt(filename) || "image";
  const raw = template
    .replace(/\{name\}/g, base)
    .replace(/\{index\}/g, String(index).padStart(3, "0"))
    .trim();
  return (raw || `${base}_${String(index).padStart(3, "0")}`).replace(/[\\/:*?"<>|]/g, "_");
}

/**
 * 规范化百分比进度值到 0..100。/ Clamp progress to 0..100 integer.
 * @param value 原始进度值 / Raw progress value.
 * @returns 规范化进度 / Clamped progress.
 */
function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * 判断值是否为合法颜色三元组。/ Check whether value is a valid RGB tuple.
 * @param value 待判断值 / Value to inspect.
 * @returns 是否合法 / True when valid color row.
 */
function isValidColorRow(value: unknown): value is [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    return false;
  }
  return value.every((channel) => typeof channel === "number" && Number.isFinite(channel));
}

/**
 * 限制数值区间。/ Clamp number into range.
 * @param value 输入值 / Input value.
 * @param min 最小值 / Lower bound.
 * @param max 最大值 / Upper bound.
 * @returns 区间内结果 / Clamped result.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 将颜色通道规范到 0..255 整数。/ Normalize RGB channels into 0..255 integers.
 * @param value 原始颜色 / Raw color tuple.
 * @returns 规范化颜色 / Normalized color tuple.
 */
function normalizeColor(value: PaletteColor): PaletteColor {
  return [
    clamp(Math.round(value[0]), 0, 255),
    clamp(Math.round(value[1]), 0, 255),
    clamp(Math.round(value[2]), 0, 255),
  ];
}

/**
 * 清洗并去重调色板。/ Sanitize and deduplicate palette colors.
 * @param colors 原始调色板 / Raw palette colors.
 * @returns 清洗后的调色板 / Sanitized palette colors.
 */
function normalizePalette(colors: PaletteColor[]): PaletteColor[] {
  const dedup = new Map<string, PaletteColor>();
  for (const color of colors) {
    const next = normalizeColor(color);
    dedup.set(`${next[0]},${next[1]},${next[2]}`, next);
  }
  const result = Array.from(dedup.values());
  return result.length > 0 ? result : [[0, 0, 0]];
}

/**
 * 按 `---` 分隔符解析对话页。/ Split dialog text into pages using `---` separators.
 * @param text 原始文本 / Raw dialog text.
 * @returns 分页文本数组 / Dialog pages.
 */
function parseDialogPages(text: string): string[] {
  const pages = text
    .split(/\n-{3,}\n/g)
    .map((page) => page.trimEnd());
  return pages.length > 0 ? pages : [""];
}

/**
 * 根据 URL 参数检测语言。/ Detect language from URL query.
 * @returns 当前语言代码 / Active language code.
 */
function detectLanguage(): Lang {
  const query = new URLSearchParams(window.location.search);
  const lang = query.get("lang") as Lang | null;
  if (lang && STRINGS[lang]) {
    return lang;
  }
  return "zh-CN";
}

/**
 * 创建默认特效开关状态。/ Create default effect toggles.
 * @returns 默认 EffectsState / Default EffectsState.
 */
function defaultEffects(): EffectsState {
  return {
    glitch: false,
    crt: false,
    paletteCycle: false,
    ghost: false,
    ditherFade: false,
    waveWarp: false,
  };
}

/**
 * 创建默认对话框状态。/ Create default dialog state.
 * @returns 默认 DialogState / Default DialogState.
 */
function defaultDialog(): DialogState {
  return {
    enabled: false,
    style: "win95",
    name: "Nova",
    text: "像素工作流已启动。",
    position: 70,
    page: 0,
    typingSpeed: 100,
    autoPage: false,
    autoPageDelay: 1500,
  };
}

/**
 * 创建默认 FX 调参。/ Create default effect tuning values.
 * @returns 默认 EffectTuning / Default EffectTuning.
 */
function defaultEffectTuning(): EffectTuning {
  return {
    glitchPower: 100,
    glitchSpeed: 100,
    crtPower: 100,
    paletteCycleSpeed: 100,
    paletteCycleStep: 1,
    ghostPower: 100,
    ghostSpeed: 100,
    ditherPower: 100,
    ditherSpeed: 100,
    wavePower: 100,
    waveSpeed: 100,
  };
}

/**
 * 生成“每个特效都启用蒙版”的默认映射。/ Build default per-effect mask toggles (all enabled).
 * @returns FX 蒙版开关映射 / Per-effect mask toggle map.
 */
function defaultMaskFxEnabled(): Record<keyof EffectsState, boolean> {
  const entries = EFFECTS.map((effect) => [effect, true]);
  return Object.fromEntries(entries) as Record<keyof EffectsState, boolean>;
}

/**
 * 创建默认蒙版状态。/ Create default mask state.
 * @returns 默认 MaskState / Default MaskState.
 */
function defaultMask(): MaskState {
  return {
    enabled: false,
    overlayVisible: true,
    brushSize: 3,
    mode: "paint",
    fxEnabled: defaultMaskFxEnabled(),
    data: null,
    width: 0,
    height: 0,
  };
}

/**
 * 返回默认批处理命名模板。/ Return default batch naming template.
 * @returns 命名模板字符串 / Naming template string.
 */
function defaultBatchNamingTemplate(): string {
  return "{name}_pixel_{index}";
}

/**
 * 复制蒙版配置（不含位图数据）。/ Copy mask config without bitmap data.
 * @param mask 蒙版配置 / Mask config.
 * @returns 配置副本 / Cloned config.
 */
function copyMaskConfig(mask: MaskConfig): MaskConfig {
  return {
    enabled: mask.enabled,
    overlayVisible: mask.overlayVisible,
    brushSize: mask.brushSize,
    mode: mask.mode,
    fxEnabled: { ...mask.fxEnabled },
  };
}

/**
 * 将运行时蒙版状态转换为预设配置。/ Convert runtime mask state to preset config.
 * @param mask 运行时蒙版状态 / Runtime mask state.
 * @returns 可序列化蒙版配置 / Serializable mask config.
 */
function toPresetMaskConfig(mask: MaskState): MaskConfig {
  return copyMaskConfig(mask);
}

/**
 * 由配置与尺寸创建完整蒙版状态。/ Build full mask state from config and dimensions.
 * @param config 蒙版配置 / Mask config.
 * @param width 目标宽度 / Target width.
 * @param height 目标高度 / Target height.
 * @returns 完整蒙版状态 / Full mask state.
 */
function createMaskStateFromConfig(config: MaskConfig, width: number, height: number): MaskState {
  const safeWidth = Math.max(0, Math.floor(width));
  const safeHeight = Math.max(0, Math.floor(height));
  return {
    ...copyMaskConfig(config),
    data: safeWidth > 0 && safeHeight > 0 ? createMaskData(safeWidth, safeHeight) : null,
    width: safeWidth,
    height: safeHeight,
  };
}

/**
 * 获取当前 ISO 时间字符串。/ Get current ISO timestamp string.
 * @returns ISO 时间 / ISO timestamp.
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 生成轻量随机 ID。/ Generate a lightweight random id.
 * @returns 随机 ID / Random id.
 */
function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 规范化调色板 ID。/ Normalize palette id from external input.
 * @param raw 原始值 / Raw value.
 * @returns 合法 PaletteId；非法返回 null / Valid PaletteId or null.
 */
function normalizePaletteId(raw: unknown): PaletteId | null {
  if (typeof raw !== "string") {
    return null;
  }
  const mapped = raw === "sora" ? "studio" : raw;
  return mapped in PALETTES ? (mapped as PaletteId) : null;
}

/**
 * 像素工作流核心 Hook。/ Core hook for the pixel workflow.
 * @param ghostSrc 像素机器人图片地址 / Pixel mascot image source.
 * @returns UI 层所需的状态与动作集合 / State and actions consumed by UI components.
 */
export function usePixelConverter(ghostSrc: string) {
  const [lang, setLang] = useState<Lang>(detectLanguage);
  const [statusKey, setStatusKey] = useState("statusReady");
  const [pixelSize, setPixelSize] = useState<number>(4);
  const [palette, setPalette] = useState<PaletteId>("studio");
  const [paletteOverrides, setPaletteOverrides] = useState<Partial<Record<PaletteId, PaletteColor[]>>>({});
  const [effects, setEffects] = useState<EffectsState>(defaultEffects);
  const [effectTuning, setEffectTuning] = useState<EffectTuning>(defaultEffectTuning);
  const [dialog, setDialog] = useState<DialogState>(defaultDialog);
  const [mask, setMask] = useState<MaskState>(defaultMask);
  const [grid, setGrid] = useState<PixelGrid | null>(null);
  const [presets, setPresets] = useState<PresetV1[]>(loadPresetsFromStorage);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [clock, setClock] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>(createEmptyBatchProgress);
  const [batchNamingTemplate, setBatchNamingTemplate] = useState(defaultBatchNamingTemplate);
  const [performanceMode, setPerformanceMode] = useState(false);

  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const revealCountRef = useRef(0);
  const pageRevealFinishedAtRef = useRef<number | null>(null);
  const dirtyRef = useRef(true);
  const lastFrameRef = useRef(0);
  const lastEffectTickRef = useRef(-1);
  const processBatchFilesRef = useRef<(files: File[]) => void>(() => {});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const ghostRef = useRef<HTMLImageElement>(new Image());
  const workerSeqRef = useRef(0);
  const lastRenderCommitRef = useRef(0);

  const paletteColorsById = useMemo(() => {
    const ids = Object.keys(PALETTES) as PaletteId[];
    const entries = ids.map((id) => [id, paletteOverrides[id] ?? PALETTES[id].colors]);
    return Object.fromEntries(entries) as Record<PaletteId, PaletteColor[]>;
  }, [paletteOverrides]);

  const selectedPaletteColors = paletteColorsById[palette];
  const dialogPages = useMemo(() => parseDialogPages(dialog.text), [dialog.text]);
  const currentDialogPage = clamp(dialog.page, 0, Math.max(0, dialogPages.length - 1));
  const currentDialogText = dialogPages[currentDialogPage] ?? "";

  const strings = STRINGS[lang];
  const t = useCallback(
    (key: string) => {
      return strings[key] ?? STRINGS.en[key] ?? key;
    },
    [strings],
  );

  const resetMaskDataForGrid = useCallback((targetGrid: PixelGrid | null) => {
    setMask((previous) => {
      if (!targetGrid) {
        return {
          ...previous,
          data: null,
          width: 0,
          height: 0,
        };
      }
      return {
        ...previous,
        width: targetGrid.width,
        height: targetGrid.height,
        data: createMaskData(targetGrid.width, targetGrid.height),
      };
    });
    dirtyRef.current = true;
  }, []);

  const pixelizeFileWithWorker = useCallback(async (file: File, targetPixelSize: number, paletteColors: PaletteColor[]) => {
    if (typeof Worker === "undefined") {
      throw new Error("worker_unavailable");
    }
    const worker = new Worker(new URL("../workers/pixelWorker.ts", import.meta.url), { type: "module" });
    const id = workerSeqRef.current + 1;
    workerSeqRef.current = id;
    const buffer = await file.arrayBuffer();

    return await new Promise<PixelGrid>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        worker.terminate();
        reject(new Error("worker_timeout"));
      }, PIXEL_WORKER_TIMEOUT_MS);

      worker.onmessage = (event: MessageEvent<PixelWorkerSuccess | PixelWorkerFailure>) => {
        const payload = event.data;
        if (!payload || payload.id !== id) {
          return;
        }
        window.clearTimeout(timeoutId);
        worker.terminate();
        if (!payload.ok) {
          reject(new Error(payload.error));
          return;
        }
        resolve({
          width: payload.width,
          height: payload.height,
          pixelSize: payload.pixelSize,
          colors: payload.colors,
          indices: new Uint16Array(payload.indices),
        });
      };

      worker.onerror = () => {
        window.clearTimeout(timeoutId);
        worker.terminate();
        reject(new Error("worker_error"));
      };

      const request: PixelWorkerRequest = {
        id,
        type: "pixelize",
        buffer,
        mimeType: file.type || "image/png",
        pixelSize: targetPixelSize,
        palette: paletteColors,
      };
      worker.postMessage(request, [buffer]);
    });
  }, []);

  useEffect(() => {
    ghostRef.current.src = ghostSrc;
  }, [ghostSrc]);

  useEffect(() => {
    document.documentElement.lang = lang;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", lang);
    window.history.replaceState({}, "", url.toString());
  }, [lang]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      setClock(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    }, 1000 * 30);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const maxPage = Math.max(0, dialogPages.length - 1);
    if (dialog.page > maxPage) {
      setDialog((previous) => ({ ...previous, page: maxPage }));
    }
  }, [dialog.page, dialogPages.length]);

  useEffect(() => {
    savePresetsToStorage(presets);
  }, [presets]);

  useEffect(() => {
    if (!selectedPresetId) {
      return;
    }
    if (!presets.some((preset) => preset.id === selectedPresetId)) {
      setSelectedPresetId(null);
    }
  }, [presets, selectedPresetId]);

  const rebuildGrid = useCallback(() => {
    if (!sourceImageRef.current) {
      return;
    }
    const nextGrid = imageToPixelGrid(sourceImageRef.current, pixelSize, selectedPaletteColors);
    setGrid(nextGrid);
    resetMaskDataForGrid(nextGrid);
    setStatusKey("statusDone");
    revealCountRef.current = 0;
    pageRevealFinishedAtRef.current = null;
    dirtyRef.current = true;
  }, [pixelSize, resetMaskDataForGrid, selectedPaletteColors]);

  useEffect(() => {
    rebuildGrid();
  }, [rebuildGrid]);

  const loadFile = useCallback(async (file: File) => {
    try {
      setStatusKey("statusProcessing");
      const image = await fileToImage(file);
      sourceImageRef.current = image;
      setStatusKey("statusDone");
      let nextGrid: PixelGrid;
      if (performanceMode) {
        try {
          nextGrid = await pixelizeFileWithWorker(file, pixelSize, selectedPaletteColors);
        } catch {
          nextGrid = imageToPixelGrid(image, pixelSize, selectedPaletteColors);
        }
      } else {
        nextGrid = imageToPixelGrid(image, pixelSize, selectedPaletteColors);
      }
      setGrid(nextGrid);
      resetMaskDataForGrid(nextGrid);
      revealCountRef.current = 0;
      pageRevealFinishedAtRef.current = null;
      dirtyRef.current = true;
    } catch {
      setStatusKey("statusReady");
    }
  }, [performanceMode, pixelSize, pixelizeFileWithWorker, resetMaskDataForGrid, selectedPaletteColors]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            void loadFile(file);
            event.preventDefault();
          }
          break;
        }
      }
    };

    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("paste", onPaste);
    };
  }, [loadFile]);

  const onInputFile = useCallback(
    (fileList: FileList | null) => {
      const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
      if (files.length === 0) {
        return;
      }
      if (files.length === 1) {
        void loadFile(files[0]);
        return;
      }
      processBatchFilesRef.current(files);
    },
    [loadFile],
  );

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const files = Array.from(event.dataTransfer.files ?? []).filter((file) => file.type.startsWith("image/"));
      if (files.length === 0) {
        return;
      }
      if (files.length === 1) {
        void loadFile(files[0]);
      } else {
        processBatchFilesRef.current(files);
      }
    },
    [loadFile],
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const toggleEffect = useCallback((effectKey: keyof EffectsState) => {
    setEffects((previous) => {
      const next = { ...previous, [effectKey]: !previous[effectKey] };
      dirtyRef.current = true;
      return next;
    });
  }, []);

  const patchDialog = useCallback((partial: Partial<DialogState>) => {
    setDialog((previous) => {
      const next = { ...previous, ...partial };
      dirtyRef.current = true;
      if (partial.text !== undefined) {
        next.page = 0;
      }
      if (
        partial.text !== undefined ||
        partial.enabled !== undefined ||
        partial.page !== undefined ||
        partial.typingSpeed !== undefined
      ) {
        revealCountRef.current = 0;
        pageRevealFinishedAtRef.current = null;
      }
      return next;
    });
  }, []);

  const patchEffectTuning = useCallback((partial: Partial<EffectTuning>) => {
    setEffectTuning((previous) => {
      const next = { ...previous, ...partial };
      dirtyRef.current = true;
      return next;
    });
  }, []);

  const setMaskEnabled = useCallback((enabled: boolean) => {
    setMask((previous) => ({ ...previous, enabled }));
    dirtyRef.current = true;
  }, []);

  const setMaskMode = useCallback((mode: MaskMode) => {
    setMask((previous) => ({ ...previous, mode }));
    dirtyRef.current = true;
  }, []);

  const setBrushSize = useCallback((brushSize: number) => {
    const nextBrush = clamp(Math.floor(brushSize), 1, 16);
    setMask((previous) => ({ ...previous, brushSize: nextBrush }));
    dirtyRef.current = true;
  }, []);

  const toggleMaskOverlay = useCallback(() => {
    setMask((previous) => ({ ...previous, overlayVisible: !previous.overlayVisible }));
    dirtyRef.current = true;
  }, []);

  const toggleMaskFx = useCallback((effectKey: keyof EffectsState) => {
    setMask((previous) => ({
      ...previous,
      fxEnabled: {
        ...previous.fxEnabled,
        [effectKey]: !previous.fxEnabled[effectKey],
      },
    }));
    dirtyRef.current = true;
  }, []);

  const paintMaskStroke = useCallback((from: MaskPoint, to: MaskPoint) => {
    setMask((previous) => {
      if (!previous.data || previous.width <= 0 || previous.height <= 0) {
        return previous;
      }
      const data = applyMaskStroke(
        previous.data,
        previous.width,
        previous.height,
        from,
        to,
        previous.brushSize,
        previous.mode,
      );
      return { ...previous, data };
    });
    dirtyRef.current = true;
  }, []);

  const clearMask = useCallback(() => {
    setMask((previous) => {
      if (!previous.width || !previous.height) {
        return previous;
      }
      return {
        ...previous,
        data: createMaskData(previous.width, previous.height),
      };
    });
    dirtyRef.current = true;
  }, []);

  const invertMask = useCallback(() => {
    setMask((previous) => {
      if (!previous.data) {
        return previous;
      }
      return {
        ...previous,
        data: invertMaskData(previous.data),
      };
    });
    dirtyRef.current = true;
  }, []);

  const setCurrentPaletteColors = useCallback((colors: PaletteColor[]) => {
    setPaletteOverrides((previous) => ({
      ...previous,
      [palette]: normalizePalette(colors),
    }));
    dirtyRef.current = true;
  }, [palette]);

  const updateCurrentPaletteColor = useCallback((index: number, color: PaletteColor) => {
    const next = [...selectedPaletteColors];
    if (index < 0 || index >= next.length) {
      return;
    }
    next[index] = normalizeColor(color);
    setCurrentPaletteColors(next);
  }, [selectedPaletteColors, setCurrentPaletteColors]);

  const addCurrentPaletteColor = useCallback(() => {
    const next = [...selectedPaletteColors, [255, 255, 255] as PaletteColor];
    setCurrentPaletteColors(next);
  }, [selectedPaletteColors, setCurrentPaletteColors]);

  const removeCurrentPaletteColor = useCallback((index: number) => {
    if (selectedPaletteColors.length <= 1) {
      return;
    }
    const next = selectedPaletteColors.filter((_, idx) => idx !== index);
    setCurrentPaletteColors(next);
  }, [selectedPaletteColors, setCurrentPaletteColors]);

  const resetCurrentPalette = useCallback(() => {
    setPaletteOverrides((previous) => {
      const next = { ...previous };
      delete next[palette];
      return next;
    });
    dirtyRef.current = true;
  }, [palette]);

  const onImportPalette = useCallback(async (file: File) => {
    const text = await file.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }

    const raw = Array.isArray(payload)
      ? payload
      : (payload as { colors?: unknown })?.colors;
    if (!Array.isArray(raw)) {
      return;
    }
    const colors = raw.filter(isValidColorRow) as PaletteColor[];
    if (colors.length === 0) {
      return;
    }
    setCurrentPaletteColors(colors);
  }, [setCurrentPaletteColors]);

  const onExportPalette = useCallback(() => {
    const payload = {
      name: palette,
      colors: selectedPaletteColors,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${palette}-palette.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [palette, selectedPaletteColors]);

  const savePreset = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setStatusKey("statusPresetError");
      return false;
    }
    if (presets.length >= PRESET_LIMIT) {
      setStatusKey("statusPresetError");
      return false;
    }

    const timestamp = nowIso();
    const preset: PresetV1 = {
      version: 1,
      id: randomId(),
      name: trimmed,
      createdAt: timestamp,
      updatedAt: timestamp,
      state: {
        pixelSize,
        palette,
        paletteOverrides: JSON.parse(JSON.stringify(paletteOverrides)) as Partial<Record<string, PaletteColor[]>>,
        effects: { ...effects },
        effectTuning: { ...effectTuning },
        dialog: { ...dialog },
        maskConfig: toPresetMaskConfig(mask),
      },
    };

    setPresets((previous) => [preset, ...previous].slice(0, PRESET_LIMIT));
    setSelectedPresetId(preset.id);
    setStatusKey("statusPresetSaved");
    return true;
  }, [dialog, effectTuning, effects, mask, palette, paletteOverrides, pixelSize, presets.length]);

  const applyPreset = useCallback((presetId: string) => {
    const preset = presets.find((entry) => entry.id === presetId);
    if (!preset) {
      setStatusKey("statusPresetError");
      return false;
    }

    const state = preset.state;
    const nextPixelSize = Math.max(1, Math.floor(state.pixelSize));
    const nextPaletteOverrides: Partial<Record<PaletteId, PaletteColor[]>> = {};
    for (const [key, colors] of Object.entries(state.paletteOverrides ?? {})) {
      if (key in PALETTES) {
        nextPaletteOverrides[key as PaletteId] = normalizePalette(colors as PaletteColor[]);
      }
    }

    setPixelSize(nextPixelSize);
    const resolvedPalette = normalizePaletteId(state.palette);
    if (resolvedPalette) {
      setPalette(resolvedPalette);
    }
    setPaletteOverrides(nextPaletteOverrides);
    setEffects({ ...state.effects });
    setEffectTuning({ ...state.effectTuning });
    setDialog({ ...state.dialog });

    const width = grid?.width ?? 0;
    const height = grid?.height ?? 0;
    setMask(createMaskStateFromConfig(state.maskConfig, width, height));

    revealCountRef.current = 0;
    pageRevealFinishedAtRef.current = null;
    dirtyRef.current = true;
    setSelectedPresetId(presetId);
    setStatusKey("statusPresetApplied");
    return true;
  }, [grid?.height, grid?.width, presets]);

  const renamePreset = useCallback((presetId: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed) {
      setStatusKey("statusPresetError");
      return false;
    }
    let renamed = false;
    setPresets((previous) => previous.map((preset) => {
      if (preset.id !== presetId) {
        return preset;
      }
      renamed = true;
      return {
        ...preset,
        name: trimmed,
        updatedAt: nowIso(),
      };
    }));
    setStatusKey(renamed ? "statusPresetSaved" : "statusPresetError");
    return renamed;
  }, []);

  const deletePreset = useCallback((presetId: string) => {
    let removed = false;
    setPresets((previous) => previous.filter((preset) => {
      const keep = preset.id !== presetId;
      if (!keep) {
        removed = true;
      }
      return keep;
    }));
    if (selectedPresetId === presetId) {
      setSelectedPresetId(null);
    }
    setStatusKey(removed ? "statusPresetApplied" : "statusPresetError");
    return removed;
  }, [selectedPresetId]);

  const exportPresets = useCallback(() => {
    const bundleText = exportPresetBundleText(presets);
    const blob = new Blob([bundleText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pixel-converter-presets.json";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [presets]);

  const importPresets = useCallback(async (file: File) => {
    const text = await file.text();
    const imported = importPresetBundleText(text);
    if (!imported || imported.length === 0) {
      setStatusKey("statusPresetError");
      return false;
    }

    setPresets((previous) => {
      const seen = new Set<string>();
      const merged: PresetV1[] = [];
      for (const preset of [...imported, ...previous]) {
        if (seen.has(preset.id)) {
          continue;
        }
        seen.add(preset.id);
        merged.push(preset);
        if (merged.length >= PRESET_LIMIT) {
          break;
        }
      }
      return merged;
    });
    setSelectedPresetId(imported[0]?.id ?? null);
    setStatusKey("statusPresetImported");
    dirtyRef.current = true;
    return true;
  }, []);

  const renderDialogForFrame: DialogState = useMemo(() => ({
    ...dialog,
    page: currentDialogPage,
    text: currentDialogText,
  }), [currentDialogPage, currentDialogText, dialog]);

  const renderGridToExportCanvas = useCallback((inputGrid: PixelGrid, timeMs: number) => {
    const tempCanvas = document.createElement("canvas");
    renderFrame(
      tempCanvas,
      inputGrid,
      effects,
      effectTuning,
      mask,
      renderDialogForFrame,
      Math.floor(revealCountRef.current),
      ghostRef.current,
      timeMs,
    );
    return scaleCanvasForExport(tempCanvas, 1200);
  }, [effects, effectTuning, mask, renderDialogForFrame]);

  const processBatchFiles = useCallback(async (files: File[]) => {
    if (files.length === 0 || isBatchProcessing) {
      return;
    }

    setIsBatchProcessing(true);
    setBatchProgress({
      total: files.length,
      completed: 0,
      failed: 0,
      retries: 0,
      currentFile: "",
      zipProgress: 0,
    });
    setStatusKey("statusProcessing");
    try {
      const zip = new JSZip();
      let completed = 0;
      let failed = 0;
      let retries = 0;

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        let success = false;
        setBatchProgress((previous) => ({
          ...previous,
          currentFile: file.name,
        }));

        for (let attempt = 0; attempt < BATCH_RETRY_LIMIT && !success; attempt += 1) {
          try {
            let batchGrid: PixelGrid;
            if (performanceMode) {
              batchGrid = await pixelizeFileWithWorker(file, pixelSize, selectedPaletteColors);
            } else {
              const image = await fileToImage(file);
              batchGrid = imageToPixelGrid(image, pixelSize, selectedPaletteColors);
            }

            const rendered = renderGridToExportCanvas(batchGrid, performance.now() + i * 120);
            const blob = await new Promise<Blob | null>((resolve) => rendered.toBlob(resolve, "image/png"));
            if (!blob) {
              throw new Error("png_blob_error");
            }
            const filename = `${formatBatchName(batchNamingTemplate, file.name, i + 1)}.png`;
            zip.file(filename, blob);
            completed += 1;
            success = true;
          } catch {
            if (attempt < BATCH_RETRY_LIMIT - 1) {
              retries += 1;
            }
          }
        }

        if (!success) {
          failed += 1;
        }
        setBatchProgress((previous) => ({
          ...previous,
          completed,
          failed,
          retries,
          currentFile: file.name,
        }));
      }

      if (completed > 0) {
        const zipBlob = await zip.generateAsync(
          { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
          (metadata) => {
            setBatchProgress((previous) => ({
              ...previous,
              zipProgress: clampProgress(metadata.percent),
            }));
          },
        );
        const url = URL.createObjectURL(zipBlob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `pixel-batch-${Date.now()}.zip`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }
      setStatusKey(completed > 0 ? "statusDone" : "statusPresetError");
    } catch {
      setStatusKey("statusReady");
    } finally {
      setIsBatchProcessing(false);
      setBatchProgress((previous) => ({
        ...previous,
        currentFile: "",
      }));
      dirtyRef.current = true;
    }
  }, [batchNamingTemplate, isBatchProcessing, performanceMode, pixelSize, pixelizeFileWithWorker, renderGridToExportCanvas, selectedPaletteColors]);

  processBatchFilesRef.current = (files: File[]) => {
    void processBatchFiles(files);
  };

  const onPickBatchFiles = useCallback(() => {
    batchInputRef.current?.click();
  }, []);

  const onInputBatchFiles = useCallback((fileList: FileList | null) => {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    void processBatchFiles(files);
  }, [processBatchFiles]);

  const goDialogPage = useCallback((index: number) => {
    const max = Math.max(0, dialogPages.length - 1);
    const nextPage = clamp(index, 0, max);
    patchDialog({ page: nextPage });
    revealCountRef.current = 0;
    pageRevealFinishedAtRef.current = null;
    dirtyRef.current = true;
  }, [dialogPages.length, patchDialog]);

  const nextDialogPage = useCallback(() => {
    goDialogPage(currentDialogPage + 1);
  }, [currentDialogPage, goDialogPage]);

  const prevDialogPage = useCallback(() => {
    goDialogPage(currentDialogPage - 1);
  }, [currentDialogPage, goDialogPage]);

  const onDownloadPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid) {
      return;
    }
    const exportCanvas = scaleCanvasForExport(canvas, 1200);
    exportCanvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "pixel-art.png";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [grid]);

  const updateGridIndices = useCallback((nextIndices: Uint16Array) => {
    setGrid((previous) => {
      if (!previous || nextIndices.length !== previous.indices.length) {
        return previous;
      }
      return {
        ...previous,
        indices: new Uint16Array(nextIndices),
      };
    });
    dirtyRef.current = true;
    setStatusKey("statusDone");
  }, []);

  const onExportProject = useCallback(() => {
    const maskSnapshot = mask.data && mask.width > 0 && mask.height > 0
      ? createMaskSnapshot(mask.data, mask.width, mask.height)
      : null;
    const project = createProjectFile({
      pixelSize,
      palette,
      paletteOverrides: JSON.parse(JSON.stringify(paletteOverrides)) as Partial<Record<string, PaletteColor[]>>,
      effects: { ...effects },
      effectTuning: { ...effectTuning },
      dialog: { ...dialog },
      maskConfig: toPresetMaskConfig(mask),
      maskSnapshot,
      presets: presets.slice(0, PRESET_LIMIT),
      selectedPresetId,
      batchNamingTemplate,
      performanceMode,
      gridSnapshot: grid ? toGridSnapshot(grid) : null,
    });

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pixel-project-${Date.now()}.pxc`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setStatusKey("statusProjectSaved");
  }, [batchNamingTemplate, dialog, effectTuning, effects, grid, mask, palette, paletteOverrides, performanceMode, pixelSize, presets, selectedPresetId]);

  const onImportProject = useCallback(async (file: File) => {
    const text = await file.text();
    const project: ProjectFileV1 | null = parseProjectFileText(text);
    if (!project?.state) {
      setStatusKey("statusProjectError");
      return false;
    }

    const state = project.state;
    if (!state.effects || !state.effectTuning || !state.dialog || !state.maskConfig) {
      setStatusKey("statusProjectError");
      return false;
    }

    const nextPixelSize = Math.max(1, Math.floor(state.pixelSize));
    const nextPaletteOverrides: Partial<Record<PaletteId, PaletteColor[]>> = {};
    for (const [key, colors] of Object.entries(state.paletteOverrides ?? {})) {
      if (key in PALETTES) {
        nextPaletteOverrides[key as PaletteId] = normalizePalette(colors as PaletteColor[]);
      }
    }

    setPixelSize(nextPixelSize);
    const resolvedPalette = normalizePaletteId(state.palette);
    if (resolvedPalette) {
      setPalette(resolvedPalette);
    }
    setPaletteOverrides(nextPaletteOverrides);
    setEffects({ ...state.effects });
    setEffectTuning({ ...state.effectTuning });
    setDialog({ ...state.dialog });
    setBatchNamingTemplate(typeof state.batchNamingTemplate === "string" ? state.batchNamingTemplate : defaultBatchNamingTemplate());
    setPerformanceMode(Boolean(state.performanceMode));
    setPresets(Array.isArray(state.presets) ? state.presets.slice(0, PRESET_LIMIT) : []);
    setSelectedPresetId(typeof state.selectedPresetId === "string" ? state.selectedPresetId : null);

    const importedGrid = state.gridSnapshot ? fromGridSnapshot(state.gridSnapshot) : null;
    setGrid(importedGrid);

    const nextMask = createMaskStateFromConfig(
      state.maskConfig,
      importedGrid?.width ?? 0,
      importedGrid?.height ?? 0,
    );
    if (state.maskSnapshot && nextMask.data) {
      const restoredMask = decodeMaskSnapshot(state.maskSnapshot);
      if (restoredMask && restoredMask.length === nextMask.data.length) {
        nextMask.data = restoredMask;
      }
    }
    setMask(nextMask);

    revealCountRef.current = 0;
    pageRevealFinishedAtRef.current = null;
    dirtyRef.current = true;
    setStatusKey("statusProjectLoaded");
    return true;
  }, []);

  const onExportJson = useCallback(() => {
    if (!grid) {
      return;
    }
    const payload: GridJsonPayload = {
      version: 1,
      width: grid.width,
      height: grid.height,
      pixelSize: grid.pixelSize,
      palette,
      colors: grid.colors,
      grid: toBase36Grid(grid.indices),
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pixel-art.json";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [grid, palette]);

  const onImportJson = useCallback(async (file: File) => {
    const content = await file.text();
    let payload: GridJsonPayload;
    try {
      payload = JSON.parse(content) as GridJsonPayload;
    } catch {
      return;
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.width !== "number" ||
      typeof payload.height !== "number" ||
      !Array.isArray(payload.colors)
    ) {
      return;
    }

    const width = Math.max(1, Math.floor(payload.width));
    const height = Math.max(1, Math.floor(payload.height));
    const total = width * height;
    const parsed = parseBase36Grid(payload.grid, total);
    if (!parsed) {
      return;
    }

    const colors = payload.colors.filter(isValidColorRow) as Array<[number, number, number]>;
    if (!colors.length) {
      return;
    }

    const nextPixelSize = payload.pixelSize && Number.isFinite(payload.pixelSize)
      ? Math.max(1, Math.floor(payload.pixelSize))
      : pixelSize;

    const nextGrid: PixelGrid = {
      width,
      height,
      pixelSize: nextPixelSize,
      indices: parsed,
      colors,
    };

    setGrid(nextGrid);
    resetMaskDataForGrid(nextGrid);
    setPixelSize(nextPixelSize);
    const resolvedPalette = normalizePaletteId(payload.palette);
    if (resolvedPalette) {
      setPalette(resolvedPalette);
    }
    revealCountRef.current = 0;
    dirtyRef.current = true;
    setStatusKey("statusDone");
  }, [pixelSize, resetMaskDataForGrid]);

  const onOpenFlipbook = useCallback(() => {
    if (!grid) {
      return;
    }

    const configuredUrl = String(import.meta.env.VITE_FLIPBOOK_URL ?? "").trim();
    if (!configuredUrl) {
      setStatusKey("statusFlipbookDisabled");
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(configuredUrl);
    } catch {
      setStatusKey("statusFlipbookDisabled");
      return;
    }
    targetUrl.searchParams.set("import", "1");

    const targetOrigin = targetUrl.origin;
    const targetWindow = window.open(targetUrl.toString(), "_blank");
    if (!targetWindow) {
      return;
    }

    const payload = {
      version: 1,
      width: grid.width,
      height: grid.height,
      colors: grid.colors,
      grid: toBase36Grid(grid.indices),
    };

    const intervalId = window.setInterval(() => {
      targetWindow.postMessage({ type: "pixel-converter-import", data: payload }, targetOrigin);
    }, 300);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === "pixel-converter-received") {
        window.clearInterval(intervalId);
        window.removeEventListener("message", onMessage);
      }
    };

    window.addEventListener("message", onMessage);
    window.setTimeout(() => {
      window.clearInterval(intervalId);
      window.removeEventListener("message", onMessage);
    }, 10_000);
  }, [grid]);

  const canRecordVideo = typeof MediaRecorder !== "undefined";

  const onDownloadVideo = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !grid || !canRecordVideo || isRecording) {
      return;
    }
    setIsRecording(true);
    dirtyRef.current = true;
    try {
      const stream = canvas.captureStream(10);
      const mimeType = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      await new Promise<void>((resolve, reject) => {
        recorder.onerror = () => reject(new Error("recording failed"));
        recorder.onstop = () => resolve();
        recorder.start();
        window.setTimeout(() => {
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        }, 2600);
      });

      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `pixel-art.${ext}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } finally {
      setIsRecording(false);
      dirtyRef.current = true;
    }
  }, [canRecordVideo, grid, isRecording]);

  useEffect(() => {
    dirtyRef.current = true;
  }, [grid, effects, effectTuning, dialog, lang, palette, pixelSize, mask, performanceMode]);

  useEffect(() => {
    let rafId = 0;

    const loop = (nowMs: number) => {
      const canvas = canvasRef.current;
      if (canvas && grid) {
        const delta = lastFrameRef.current === 0 ? 16 : nowMs - lastFrameRef.current;
        lastFrameRef.current = nowMs;

        if (dialog.enabled) {
          const max = renderDialogForFrame.text.length;
          if (dialog.style === "win95") {
            if (revealCountRef.current !== max) {
              revealCountRef.current = max;
              dirtyRef.current = true;
            }
            if (max > 0 && pageRevealFinishedAtRef.current === null) {
              pageRevealFinishedAtRef.current = nowMs;
            }
          } else {
            const speed = Math.max(0.1, dialog.typingSpeed / 100);
            const next = Math.min(max, revealCountRef.current + delta * TYPEWRITER_CHARS_PER_MS * speed);
            if (next !== revealCountRef.current) {
              revealCountRef.current = next;
              dirtyRef.current = true;
            }
            if (next >= max && max > 0) {
              if (pageRevealFinishedAtRef.current === null) {
                pageRevealFinishedAtRef.current = nowMs;
              }
            } else {
              pageRevealFinishedAtRef.current = null;
            }
          }

          if (
            dialog.autoPage &&
            dialogPages.length > 1 &&
            pageRevealFinishedAtRef.current !== null &&
            nowMs - pageRevealFinishedAtRef.current >= dialog.autoPageDelay
          ) {
            const nextPage = (currentDialogPage + 1) % dialogPages.length;
            setDialog((previous) => ({ ...previous, page: nextPage }));
            revealCountRef.current = 0;
            pageRevealFinishedAtRef.current = null;
            dirtyRef.current = true;
          }
        } else {
          pageRevealFinishedAtRef.current = null;
        }

        const effectTick = Math.floor(nowMs / 120);
        const hasTimedEffects = effects.glitch || effects.paletteCycle || effects.ghost || effects.ditherFade || effects.waveWarp;
        if (hasTimedEffects && effectTick !== lastEffectTickRef.current) {
          lastEffectTickRef.current = effectTick;
          dirtyRef.current = true;
        } else if (!hasTimedEffects) {
          lastEffectTickRef.current = effectTick;
        }

        const hasDialogAnimation =
          dialog.enabled &&
          dialog.style !== "win95" &&
          renderDialogForFrame.text.length > 0 &&
          (revealCountRef.current < renderDialogForFrame.text.length || (dialog.autoPage && dialogPages.length > 1));
        const shouldRender = dirtyRef.current || hasDialogAnimation || isRecording;
        if (shouldRender) {
          if (performanceMode && !isRecording) {
            const minIntervalMs = 33;
            if (!dirtyRef.current && nowMs - lastRenderCommitRef.current < minIntervalMs) {
              rafId = window.requestAnimationFrame(loop);
              return;
            }
          }
          renderFrame(
            canvas,
            grid,
            effects,
            effectTuning,
            mask,
            renderDialogForFrame,
            Math.floor(revealCountRef.current),
            ghostRef.current,
            nowMs,
          );
          lastRenderCommitRef.current = nowMs;
          dirtyRef.current = false;
        }
      }
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [currentDialogPage, dialog, dialogPages.length, effectTuning, effects, grid, isRecording, mask, performanceMode, renderDialogForFrame]);

  useEffect(() => {
    const overlay = maskCanvasRef.current;
    if (!overlay) {
      return;
    }

    if (!grid) {
      overlay.width = 0;
      overlay.height = 0;
      return;
    }

    const width = grid.width * grid.pixelSize;
    const height = grid.height * grid.pixelSize;
    if (overlay.width !== width) {
      overlay.width = width;
    }
    if (overlay.height !== height) {
      overlay.height = height;
    }

    const ctx = overlay.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, width, height);

    if (
      !mask.overlayVisible
      || !mask.data
      || mask.width !== grid.width
      || mask.height !== grid.height
      || mask.data.length !== grid.width * grid.height
    ) {
      return;
    }

    ctx.fillStyle = "rgba(0, 255, 255, 0.22)";
    ctx.strokeStyle = "rgba(16, 132, 208, 0.45)";
    ctx.lineWidth = 1;
    const cellSize = grid.pixelSize;
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        if (mask.data[y * grid.width + x] === 0) {
          continue;
        }
        const drawX = x * cellSize;
        const drawY = y * cellSize;
        ctx.fillRect(drawX, drawY, cellSize, cellSize);
        if (cellSize >= 3) {
          ctx.strokeRect(drawX + 0.5, drawY + 0.5, cellSize - 1, cellSize - 1);
        }
      }
    }
  }, [grid, mask]);

  return {
    t,
    lang,
    setLang,
    clock,
    statusKey,
    pixelSize,
    setPixelSize,
    palette,
    setPalette,
    effects,
    effectTuning,
    dialog,
    mask,
    presets,
    selectedPresetId,
    setSelectedPresetId,
    patchDialog,
    patchEffectTuning,
    setMaskEnabled,
    setMaskMode,
    setBrushSize,
    toggleMaskOverlay,
    toggleMaskFx,
    paintMaskStroke,
    clearMask,
    invertMask,
    savePreset,
    applyPreset,
    renamePreset,
    deletePreset,
    exportPresets,
    importPresets,
    onExportProject,
    onImportProject,
    isDragging,
    grid,
    canvasRef,
    maskCanvasRef,
    fileInputRef,
    batchInputRef,
    onPickFile,
    onPickBatchFiles,
    onInputFile,
    onInputBatchFiles,
    onDrop,
    onDragOver,
    onDragLeave,
    onDownloadPng,
    onDownloadVideo,
    onExportJson,
    onImportJson,
    onOpenFlipbook,
    updateGridIndices,
    canRecordVideo,
    isRecording,
    isBatchProcessing,
    batchProgress,
    batchNamingTemplate,
    setBatchNamingTemplate,
    performanceMode,
    setPerformanceMode,
    toggleEffect,
    paletteColorsById,
    currentPaletteColors: selectedPaletteColors,
    setCurrentPaletteColors,
    updateCurrentPaletteColor,
    addCurrentPaletteColor,
    removeCurrentPaletteColor,
    resetCurrentPalette,
    onImportPalette,
    onExportPalette,
    dialogPages,
    currentDialogPage,
    goDialogPage,
    nextDialogPage,
    prevDialogPage,
    lists: {
      pixelSizes: PIXEL_SIZES,
      effects: EFFECTS,
      dialogStyles: DIALOG_STYLES,
      palettes: PALETTES,
      languages: LANG_OPTIONS,
    },
  };
}
