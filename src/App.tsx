// 应用主壳层：负责组合桌面 UI、连接交互与状态。/ App shell: composes desktop UI and wires stateful interactions.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import mascotPixelbot from "./assets/mascot_pixelbot.png";
import { BRAND } from "./config/brand";
import { GHOST_MESSAGES, type PaletteId } from "./config/constants";
import { DesktopIcons } from "./components/DesktopIcons";
import { PixelEditorModal } from "./components/PixelEditorModal";
import { Taskbar } from "./components/Taskbar";
import { WindowControls } from "./components/WindowControls";
import { usePixelConverter } from "./hooks/usePixelConverter";
import type { DialogState } from "./types";
import "./styles/studio.css";

type UiMode = "basic" | "advanced";
type ThemeMode = "light" | "dark";
type ShortcutScope = "global" | "advanced";

interface ShortcutBinding {
  id: string;
  combo: string;
  labelKey: string;
  scope: ShortcutScope;
  run: () => void;
}

const UI_MODE_STORAGE_KEY = "pixel_workshop_ui_mode_v1";
const THEME_MODE_STORAGE_KEY = "pixel_workshop_theme_mode_v1";
const LEFT_PANEL_WIDTH_STORAGE_KEY = "pixel_workshop_left_panel_width_v1";

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  const tagName = element.tagName;
  return element.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function normalizeShortcutKey(key: string): string {
  if (key === " ") {
    return "Space";
  }
  if (key === "Esc") {
    return "Escape";
  }
  if (key === "ArrowLeft") {
    return "Left";
  }
  if (key === "ArrowRight") {
    return "Right";
  }
  if (key === "ArrowUp") {
    return "Up";
  }
  if (key === "ArrowDown") {
    return "Down";
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return key;
}

function eventToShortcutCombo(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) {
    parts.push("Ctrl");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  parts.push(normalizeShortcutKey(event.key));
  return parts.join("+");
}

function App() {
  const {
    t,
    lang,
    setLang,
    clock,
    statusKey,
    pixelSize,
    setPixelSize,
    pixelizeAlgorithm,
    setPixelizeAlgorithm,
    palette,
    setPalette,
    effects,
    effectTuning,
    animation,
    dialog,
    mask,
    maskToolMode,
    maskFeather,
    presets,
    paramHistory,
    activeParamHistoryId,
    canUndoParamHistory,
    canRedoParamHistory,
    galleryItems,
    sourcePreviewUrl,
    paletteLocks,
    effectPipelineOrder,
    fxPipelinePresets,
    selectedFxPipelinePresetId,
    setSelectedFxPipelinePresetId,
    selectedPresetId,
    setSelectedPresetId,
    patchDialog,
    patchEffectTuning,
    setAnimationEnabled,
    setAnimationLoop,
    setAnimationDuration,
    setAnimationProgress,
    captureAnimationStart,
    captureAnimationEnd,
    toggleAnimationPlaying,
    stopAnimationPlayback,
    setMaskEnabled,
    setMaskMode,
    setMaskTool,
    setMaskFeatherStrength,
    setBrushSize,
    toggleMaskOverlay,
    toggleMaskFx,
    paintMaskStroke,
    applyMaskRectangleTool,
    applyMaskLassoTool,
    applyMaskGradientTool,
    clearMask,
    invertMask,
    restoreParamHistory,
    undoParamHistory,
    redoParamHistory,
    clearParamHistory,
    savePreset,
    applyPreset,
    renamePreset,
    deletePreset,
    exportPresets,
    importPresets,
    saveCurrentToGallery,
    downloadGalleryItem,
    downloadGalleryItemsBulk,
    removeGalleryItem,
    removeGalleryItemsBulk,
    clearGallery,
    toggleGalleryFavorite,
    updateGalleryTags,
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
    onDownloadGif,
    onDownloadApng,
    onDownloadSpriteSheet,
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
    webglSupported,
    webglAcceleration,
    setWebglAcceleration,
    gifFps,
    setGifFps,
    apngFps,
    setApngFps,
    exportLoopCount,
    setExportLoopCount,
    spriteColumns,
    setSpriteColumns,
    toggleEffect,
    moveEffectInPipeline,
    saveFxPipelinePreset,
    applyFxPipelinePreset,
    deleteFxPipelinePreset,
    externalPlugins,
    unregisterExternalPlugin,
    importExternalPlugin,
    setExternalPluginEnabled,
    setExternalPluginStrength,
    paletteColorsById,
    currentPaletteColors,
    updateCurrentPaletteColor,
    addCurrentPaletteColor,
    removeCurrentPaletteColor,
    resetCurrentPalette,
    togglePaletteLock,
    clearPaletteLocks,
    extractPaletteFromSource,
    mergeCurrentPaletteSimilar,
    onImportPalette,
    onExportPalette,
    dialogPages,
    currentDialogPage,
    nextDialogPage,
    prevDialogPage,
    lists,
  } = usePixelConverter(mascotPixelbot);

  const [aboutOpen, setAboutOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [ghostOpen, setGhostOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [paletteEditorOpen, setPaletteEditorOpen] = useState(false);
  const [presetName, setPresetName] = useState("My Preset");
  const [fxPresetName, setFxPresetName] = useState("Default FX");
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryBulkIds, setGalleryBulkIds] = useState<string[]>([]);
  const [galleryTagDraft, setGalleryTagDraft] = useState("");
  const [paletteExtractCount, setPaletteExtractCount] = useState(8);
  const [paletteMergeThreshold, setPaletteMergeThreshold] = useState(24);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareZoom, setCompareZoom] = useState(1);
  const [comparePanX, setComparePanX] = useState(0);
  const [comparePanY, setComparePanY] = useState(0);
  const [ghostMessageIndex, setGhostMessageIndex] = useState(0);
  const [startPressed, setStartPressed] = useState(false);
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(null);
  const [uiMode, setUiMode] = useState<UiMode>(() => {
    const saved = window.localStorage.getItem(UI_MODE_STORAGE_KEY);
    return saved === "advanced" ? "advanced" : "basic";
  });
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return saved === "dark" ? "dark" : "light";
  });
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(() => {
    const saved = Number(window.localStorage.getItem(LEFT_PANEL_WIDTH_STORAGE_KEY) ?? "");
    if (!Number.isFinite(saved)) {
      return 238;
    }
    return Math.max(200, Math.min(360, Math.round(saved)));
  });
  const aboutRef = useRef<HTMLDialogElement>(null);
  const docsRef = useRef<HTMLDialogElement>(null);
  const changelogRef = useRef<HTMLDialogElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const presetInputRef = useRef<HTMLInputElement>(null);
  const pluginInputRef = useRef<HTMLInputElement>(null);
  const isMaskDrawingRef = useRef(false);
  const lastMaskPointRef = useRef<{ x: number; y: number } | null>(null);
  const maskShapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const maskLassoPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const compareDragRef = useRef<{ x: number; y: number } | null>(null);
  const isLocalhost = window.location.hostname === "localhost";
  const isAdvancedMode = uiMode === "advanced";

  const ghostMessages = useMemo(() => GHOST_MESSAGES[lang], [lang]);
  const mainShellStyle = useMemo(
    () => ({ "--left-panel-width": `${leftPanelWidth}px` }) as CSSProperties,
    [leftPanelWidth],
  );
  const paletteKeys = Object.keys(lists.palettes) as PaletteId[];
  const filteredGalleryItems = useMemo(() => {
    if (!isAdvancedMode) {
      return galleryItems;
    }
    const keyword = gallerySearch.trim().toLowerCase();
    if (!keyword) {
      return galleryItems;
    }
    return galleryItems.filter((item) => {
      const haystack = `${item.name} ${item.tags.join(" ")}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [galleryItems, gallerySearch, isAdvancedMode]);
  const selectedGalleryItem = useMemo(
    () => filteredGalleryItems.find((item) => item.id === selectedGalleryId) ?? filteredGalleryItems[0] ?? null,
    [filteredGalleryItems, selectedGalleryId],
  );
  const selectedGalleryIndex = useMemo(() => {
    if (!selectedGalleryItem) {
      return -1;
    }
    return filteredGalleryItems.findIndex((item) => item.id === selectedGalleryItem.id);
  }, [filteredGalleryItems, selectedGalleryItem]);
  const allFilteredSelected = useMemo(() => (
    filteredGalleryItems.length > 0
    && filteredGalleryItems.every((item) => galleryBulkIds.includes(item.id))
  ), [filteredGalleryItems, galleryBulkIds]);

  const goGalleryStep = useCallback((step: number) => {
    if (filteredGalleryItems.length === 0) {
      return;
    }
    const anchorId = selectedGalleryId ?? filteredGalleryItems[0].id;
    const currentIndex = filteredGalleryItems.findIndex((item) => item.id === anchorId);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + step + filteredGalleryItems.length) % filteredGalleryItems.length;
    setSelectedGalleryId(filteredGalleryItems[nextIndex].id);
  }, [filteredGalleryItems, selectedGalleryId]);

  const shortcutBindings = useMemo<ShortcutBinding[]>(() => {
    const bindings: ShortcutBinding[] = [
      {
        id: "open_file",
        combo: "Ctrl+O",
        labelKey: "shortcutOpenFile",
        scope: "global",
        run: () => onPickFile(),
      },
      {
        id: "export_png",
        combo: "Ctrl+S",
        labelKey: "shortcutExportPng",
        scope: "global",
        run: () => {
          void onDownloadPng();
        },
      },
      {
        id: "undo_params",
        combo: "Ctrl+Z",
        labelKey: "shortcutUndo",
        scope: "global",
        run: () => {
          undoParamHistory();
        },
      },
      {
        id: "redo_params",
        combo: "Ctrl+Y",
        labelKey: "shortcutRedo",
        scope: "global",
        run: () => {
          redoParamHistory();
        },
      },
      {
        id: "redo_params_alt",
        combo: "Ctrl+Shift+Z",
        labelKey: "shortcutRedoAlt",
        scope: "global",
        run: () => {
          redoParamHistory();
        },
      },
      {
        id: "toggle_theme",
        combo: "Ctrl+L",
        labelKey: "shortcutToggleTheme",
        scope: "global",
        run: () => setThemeMode((previous) => (previous === "light" ? "dark" : "light")),
      },
      {
        id: "toggle_editor",
        combo: "Ctrl+E",
        labelKey: "shortcutToggleEditor",
        scope: "global",
        run: () => setEditorOpen((previous) => !previous),
      },
      {
        id: "open_batch",
        combo: "Ctrl+Shift+O",
        labelKey: "shortcutBatch",
        scope: "advanced",
        run: () => onPickBatchFiles(),
      },
      {
        id: "save_gallery",
        combo: "Ctrl+Shift+S",
        labelKey: "shortcutSaveGallery",
        scope: "advanced",
        run: () => {
          void saveCurrentToGallery();
        },
      },
      {
        id: "toggle_palette_editor",
        combo: "Ctrl+P",
        labelKey: "shortcutPaletteEditor",
        scope: "advanced",
        run: () => setPaletteEditorOpen((previous) => !previous),
      },
      {
        id: "mode_basic",
        combo: "Ctrl+1",
        labelKey: "shortcutModeBasic",
        scope: "global",
        run: () => setUiMode("basic"),
      },
      {
        id: "mode_advanced",
        combo: "Ctrl+2",
        labelKey: "shortcutModeAdvanced",
        scope: "global",
        run: () => setUiMode("advanced"),
      },
    ];
    return bindings.filter((binding) => binding.scope === "global" || isAdvancedMode);
  }, [isAdvancedMode, onDownloadPng, onPickBatchFiles, onPickFile, redoParamHistory, saveCurrentToGallery, undoParamHistory]);

  useEffect(() => {
    if (filteredGalleryItems.length === 0) {
      if (selectedGalleryId !== null) {
        setSelectedGalleryId(null);
      }
      return;
    }
    if (!selectedGalleryId || !filteredGalleryItems.some((item) => item.id === selectedGalleryId)) {
      setSelectedGalleryId(filteredGalleryItems[0].id);
    }
  }, [filteredGalleryItems, selectedGalleryId]);

  useEffect(() => {
    setGalleryBulkIds((previous) => previous.filter((id) => galleryItems.some((item) => item.id === id)));
  }, [galleryItems]);

  useEffect(() => {
    if (filteredGalleryItems.length <= 1) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (
          target.isContentEditable
          || tagName === "INPUT"
          || tagName === "TEXTAREA"
          || tagName === "SELECT"
        ) {
          return;
        }
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goGalleryStep(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goGalleryStep(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [filteredGalleryItems.length, goGalleryStep]);

  useEffect(() => {
    const map = new Map(shortcutBindings.map((item) => [item.combo, item]));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest(".editor-window")) {
        return;
      }
      const combo = eventToShortcutCombo(event);
      const binding = map.get(combo);
      if (!binding) {
        return;
      }
      event.preventDefault();
      binding.run();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shortcutBindings]);

  useEffect(() => {
    const syncDialog = (node: HTMLDialogElement | null, open: boolean) => {
      if (!node) {
        return;
      }
      if (open && !node.open) {
        node.showModal();
      }
      if (!open && node.open) {
        node.close();
      }
    };
    syncDialog(aboutRef.current, aboutOpen);
    syncDialog(docsRef.current, docsOpen);
    syncDialog(changelogRef.current, changelogOpen);
  }, [aboutOpen, changelogOpen, docsOpen]);

  useEffect(() => {
    if (!ghostOpen) {
      return;
    }
    const timer = window.setInterval(() => {
      setGhostMessageIndex((prev) => (prev + 1) % ghostMessages.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [ghostOpen, ghostMessages.length]);

  useEffect(() => {
    if (!startMenuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".xp-start-menu, .task-start")) {
        return;
      }
      setStartMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStartMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [startMenuOpen]);

  useEffect(() => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, uiMode);
  }, [uiMode]);

  useEffect(() => {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
    document.documentElement.setAttribute("data-theme", themeMode);
    document.body.classList.toggle("theme-dark", themeMode === "dark");
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem(LEFT_PANEL_WIDTH_STORAGE_KEY, String(leftPanelWidth));
  }, [leftPanelWidth]);

  useEffect(() => {
    if (isAdvancedMode) {
      return;
    }
    setAnimationEnabled(false);
    setMaskEnabled(false);
    setPaletteEditorOpen(false);
    setCompareEnabled(false);
  }, [isAdvancedMode, setAnimationEnabled, setMaskEnabled]);

  const pressStart = useCallback(() => {
    setStartPressed(true);
    setStartMenuOpen((value) => !value);
    window.setTimeout(() => setStartPressed(false), 180);
  }, []);

  /**
   * 将指针坐标映射到蒙版网格坐标。/ Map pointer coordinates to mask grid coordinates.
   * @param event 画布指针事件 / Canvas pointer event.
   * @returns 网格坐标或 null / Grid point or null.
   */
  const locateMaskPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!grid) {
      return null;
    }
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const localX = (event.clientX - rect.left) * scaleX;
    const localY = (event.clientY - rect.top) * scaleY;
    const x = Math.floor(localX / grid.pixelSize);
    const y = Math.floor(localY / grid.pixelSize);
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) {
      return null;
    }
    return { x, y };
  }, [grid]);

  /**
   * 开始蒙版绘制。/ Start mask drawing stroke.
   * @param event 指针事件 / Pointer event.
   * @returns 无返回值 / No return value.
   */
  const onMaskPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!grid || !mask.enabled) {
      return;
    }
    const point = locateMaskPoint(event);
    if (!point) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    isMaskDrawingRef.current = true;
    lastMaskPointRef.current = point;
    maskShapeStartRef.current = point;
    if (maskToolMode === "brush") {
      paintMaskStroke(point, point);
    } else if (maskToolMode === "lasso") {
      maskLassoPointsRef.current = [point];
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [grid, locateMaskPoint, mask.enabled, maskToolMode, paintMaskStroke]);

  /**
   * 持续蒙版绘制。/ Continue mask drawing while dragging.
   * @param event 指针事件 / Pointer event.
   * @returns 无返回值 / No return value.
   */
  const onMaskPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMaskDrawingRef.current || !mask.enabled) {
      return;
    }
    event.stopPropagation();
    const point = locateMaskPoint(event);
    if (!point) {
      return;
    }
    const from = lastMaskPointRef.current ?? point;
    if (maskToolMode === "brush") {
      paintMaskStroke(from, point);
    } else if (maskToolMode === "lasso") {
      const last = maskLassoPointsRef.current[maskLassoPointsRef.current.length - 1];
      if (!last || Math.abs(last.x - point.x) + Math.abs(last.y - point.y) >= 1) {
        maskLassoPointsRef.current = [...maskLassoPointsRef.current, point];
      }
    }
    lastMaskPointRef.current = point;
  }, [locateMaskPoint, mask.enabled, maskToolMode, paintMaskStroke]);

  /**
   * 结束蒙版绘制。/ Finish current mask drawing stroke.
   * @param event 指针事件 / Pointer event.
   * @returns 无返回值 / No return value.
   */
  const onMaskPointerEnd = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMaskDrawingRef.current) {
      return;
    }
    event.stopPropagation();
    const endPoint = locateMaskPoint(event) ?? lastMaskPointRef.current;
    const startPoint = maskShapeStartRef.current;
    if (startPoint && endPoint) {
      if (maskToolMode === "rect") {
        applyMaskRectangleTool(startPoint, endPoint);
      } else if (maskToolMode === "gradient") {
        applyMaskGradientTool(startPoint, endPoint);
      } else if (maskToolMode === "lasso") {
        const points = maskLassoPointsRef.current.length > 0
          ? [...maskLassoPointsRef.current, endPoint]
          : [startPoint, endPoint];
        applyMaskLassoTool(points);
      }
    }
    isMaskDrawingRef.current = false;
    lastMaskPointRef.current = null;
    maskShapeStartRef.current = null;
    maskLassoPointsRef.current = [];
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [applyMaskGradientTool, applyMaskLassoTool, applyMaskRectangleTool, locateMaskPoint, maskToolMode]);

  useEffect(() => {
    if (!mask.enabled) {
      isMaskDrawingRef.current = false;
      lastMaskPointRef.current = null;
      maskShapeStartRef.current = null;
      maskLassoPointsRef.current = [];
    }
  }, [mask.enabled]);

  useEffect(() => {
    if (!selectedPresetId) {
      return;
    }
    const target = presets.find((preset) => preset.id === selectedPresetId);
    if (target) {
      setPresetName(target.name);
    }
  }, [presets, selectedPresetId]);

  useEffect(() => {
    if (!selectedFxPipelinePresetId) {
      return;
    }
    const target = fxPipelinePresets.find((preset) => preset.id === selectedFxPipelinePresetId);
    if (target) {
      setFxPresetName(target.name);
    }
  }, [fxPipelinePresets, selectedFxPipelinePresetId]);

  useEffect(() => {
    if (!selectedGalleryItem) {
      setGalleryTagDraft("");
      return;
    }
    setGalleryTagDraft(selectedGalleryItem.tags.join(", "));
  }, [selectedGalleryItem]);

  /**
   * 处理预览区拖拽：优先识别 `.pxc`，否则按图片流程处理。/ Handle preview drop: prioritize `.pxc`, otherwise image flow.
   * @param event 拖拽事件 / Drag event.
   * @returns 无返回值 / No return value.
   */
  const onPreviewDrop = useCallback((event: React.DragEvent<HTMLElement>) => {
    const files = Array.from(event.dataTransfer.files ?? []);
    const projectFile = files.find((file) => /\.pxc$/i.test(file.name));
    if (projectFile) {
      event.preventDefault();
      onDragLeave(event);
      void onImportProject(projectFile);
      return;
    }
    onDrop(event);
  }, [onDragLeave, onDrop, onImportProject]);

  const closeStartMenu = useCallback(() => {
    setStartMenuOpen(false);
  }, []);

  const onOpenPluginImport = useCallback(() => {
    pluginInputRef.current?.click();
  }, []);

  const onInputPluginFile = useCallback((fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }
    void importExternalPlugin(file);
  }, [importExternalPlugin]);

  const toggleAboutWindow = useCallback(() => {
    setAboutOpen((value) => !value);
  }, []);

  const toggleDocsWindow = useCallback(() => {
    setDocsOpen((value) => !value);
  }, []);

  const toggleChangelogWindow = useCallback(() => {
    setChangelogOpen((value) => !value);
  }, []);

  const toggleGhostWindow = useCallback(() => {
    setGhostOpen((value) => !value);
  }, []);

  const openAboutWindow = useCallback(() => {
    setAboutOpen(true);
    setStartMenuOpen(false);
  }, []);

  const openDocsWindow = useCallback(() => {
    setDocsOpen(true);
    setStartMenuOpen(false);
  }, []);

  const openChangelogWindow = useCallback(() => {
    setChangelogOpen(true);
    setStartMenuOpen(false);
  }, []);

  const taskWindowItems = useMemo(() => {
    return [
      { id: "about", label: t("taskReadme"), open: aboutOpen, onToggle: toggleAboutWindow },
      { id: "docs", label: t("docs"), open: docsOpen, onToggle: toggleDocsWindow },
      { id: "changelog", label: t("changelog"), open: changelogOpen, onToggle: toggleChangelogWindow },
      { id: "ghost", label: t("ghostTitle"), open: ghostOpen, onToggle: toggleGhostWindow },
    ];
  }, [aboutOpen, changelogOpen, docsOpen, ghostOpen, t, toggleAboutWindow, toggleChangelogWindow, toggleDocsWindow, toggleGhostWindow]);

  const startPinnedActions = useMemo(() => {
    return [
      { id: "about", label: t("taskReadme"), onClick: openAboutWindow },
      { id: "docs", label: t("docs"), onClick: openDocsWindow },
      { id: "changelog", label: t("changelog"), onClick: openChangelogWindow },
      { id: "ghost", label: t("ghostTitle"), onClick: toggleGhostWindow },
    ];
  }, [openAboutWindow, openChangelogWindow, openDocsWindow, t, toggleGhostWindow]);

  const startSystemActions = useMemo(() => {
    return [
      { id: "import-image", label: t("startImportImage"), onClick: onPickFile },
      { id: "project-import", label: t("projectImport"), onClick: () => projectInputRef.current?.click() },
      { id: "project-export", label: t("projectExport"), onClick: onExportProject },
      { id: "flipbook", label: t("taskFlipbook"), onClick: onOpenFlipbook, disabled: !grid },
      { id: "sound-toggle", label: soundOn ? t("startSoundOff") : t("startSoundOn"), onClick: () => setSoundOn((value) => !value) },
      { id: "close-menu", label: t("startCloseMenu"), onClick: closeStartMenu },
    ];
  }, [closeStartMenu, grid, onExportProject, onOpenFlipbook, onPickFile, soundOn, t]);

  const toggleGalleryBulkId = useCallback((imageId: string) => {
    setGalleryBulkIds((previous) => (
      previous.includes(imageId)
        ? previous.filter((id) => id !== imageId)
        : [...previous, imageId]
    ));
  }, []);

  const toggleSelectAllFiltered = useCallback(() => {
    if (allFilteredSelected) {
      setGalleryBulkIds((previous) => previous.filter((id) => !filteredGalleryItems.some((item) => item.id === id)));
      return;
    }
    const filteredIds = filteredGalleryItems.map((item) => item.id);
    setGalleryBulkIds((previous) => Array.from(new Set([...previous, ...filteredIds])));
  }, [allFilteredSelected, filteredGalleryItems]);

  const applyGalleryTagDraft = useCallback(() => {
    if (!selectedGalleryItem) {
      return;
    }
    updateGalleryTags(selectedGalleryItem.id, galleryTagDraft);
  }, [galleryTagDraft, selectedGalleryItem, updateGalleryTags]);

  const resetCompareTransform = useCallback(() => {
    setCompareZoom(1);
    setComparePanX(0);
    setComparePanY(0);
  }, []);

  const onCompareWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    setCompareZoom((previous) => Math.min(4, Math.max(0.5, Number((previous + delta).toFixed(2)))));
  }, []);

  const onComparePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    compareDragRef.current = { x: event.clientX - comparePanX, y: event.clientY - comparePanY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [comparePanX, comparePanY]);

  const onComparePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!compareDragRef.current) {
      return;
    }
    setComparePanX(event.clientX - compareDragRef.current.x);
    setComparePanY(event.clientY - compareDragRef.current.y);
  }, []);

  const onComparePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    compareDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div className="desktop">
      <DesktopIcons
        t={t}
        onOpenAbout={openAboutWindow}
        onOpenDocs={openDocsWindow}
        onOpenChangelog={openChangelogWindow}
      />

      <img className="desktop-ghost" src={mascotPixelbot} alt="" />

      <main className="window main-shell" aria-label={BRAND.appName} style={mainShellStyle}>
        <header className="main-title">
          <span className="main-title__text">{`${BRAND.appName} ${BRAND.versionLabel}`}</span>
          <WindowControls />
        </header>

        <div className="main-menu">
          <span>{t("menuFile")}</span>
          <span>{t("menuEdit")}</span>
          <span>{t("menuView")}</span>
          <span>{t("menuHelp")}</span>
          <div className="mode-switch" role="group" aria-label={t("modeTitle")}>
            <span className="mode-switch__label">{t("modeTitle")}</span>
            <button
              type="button"
              className={`retro-btn btn-mini ${uiMode === "basic" ? "is-active" : ""}`}
              onClick={() => setUiMode("basic")}
            >
              {t("modeBasic")}
            </button>
            <button
              type="button"
              className={`retro-btn btn-mini ${uiMode === "advanced" ? "is-active" : ""}`}
              onClick={() => setUiMode("advanced")}
            >
              {t("modeAdvanced")}
            </button>
          </div>
          <div className="theme-switch" role="group" aria-label={t("themeTitle")}>
            <span className="mode-switch__label">{t("themeTitle")}</span>
            <button
              type="button"
              className={`retro-btn btn-mini ${themeMode === "light" ? "is-active" : ""}`}
              onClick={() => setThemeMode("light")}
            >
              {t("themeLight")}
            </button>
            <button
              type="button"
              className={`retro-btn btn-mini ${themeMode === "dark" ? "is-active" : ""}`}
              onClick={() => setThemeMode("dark")}
            >
              {t("themeDark")}
            </button>
          </div>
          {isAdvancedMode ? (
            <label className="layout-switch" aria-label={t("layoutTitle")}>
              <span className="mode-switch__label">{`${t("layoutPanelWidth")} ${leftPanelWidth}px`}</span>
              <input
                type="range"
                min={200}
                max={360}
                step={2}
                value={leftPanelWidth}
                onChange={(event) => setLeftPanelWidth(Number(event.target.value))}
              />
            </label>
          ) : null}
        </div>

        <section className="main-body">
          <aside className="left-column">
            <section className="tool-window">
              <header>
                <span>{t("toolTitle")}</span>
                <WindowControls />
              </header>
              <div className="tool-content">
                <div className="group-label">{t("pixelSize")}</div>
                <div className="tiny-grid">
                  {lists.pixelSizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`retro-btn btn-mini ${pixelSize === size ? "is-active" : ""}`}
                      onClick={() => setPixelSize(size)}
                    >
                      {size}px
                    </button>
                  ))}
                </div>

                <div className="group-label">{t("effects")}</div>
                <div className="tiny-grid fx-grid">
                  {lists.effects.map((effectKey) => (
                    <button
                      key={effectKey}
                      type="button"
                      className={`retro-btn btn-mini ${effects[effectKey] ? "is-active" : ""}`}
                      onClick={() => toggleEffect(effectKey)}
                    >
                      {t(`effect_${effectKey}`)}
                    </button>
                  ))}
                </div>

                {isAdvancedMode ? (
                  <label className="dialog-toggle perf-toggle">
                    <input
                      type="checkbox"
                      checked={performanceMode}
                      onChange={(event) => setPerformanceMode(event.target.checked)}
                    />
                    <span>{t("performanceMode")}</span>
                  </label>
                ) : null}

                {isAdvancedMode ? (
                  <>
                    <div className="group-label">{t("pixelizeAlgorithm")}</div>
                    <div className="tiny-grid">
                      {lists.pixelizeAlgorithms.map((algorithm) => (
                        <button
                          key={algorithm}
                          type="button"
                          className={`retro-btn btn-mini ${pixelizeAlgorithm === algorithm ? "is-active" : ""}`}
                          onClick={() => setPixelizeAlgorithm(algorithm)}
                        >
                          {t(`pixelizeAlgorithm_${algorithm}`)}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                {isAdvancedMode ? (
                  <div className="fx-tuning">
                  {effects.glitch ? (
                    <div className="fx-tuning-row">
                      <span className="fx-tuning-title">{t("effect_glitch")}</span>
                      <label>
                        <span>{t("fxPower")} {effectTuning.glitchPower}%</span>
                        <input
                          type="range"
                          min={0}
                          max={220}
                          value={effectTuning.glitchPower}
                          onChange={(event) => patchEffectTuning({ glitchPower: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        <span>{t("fxSpeed")} {effectTuning.glitchSpeed}%</span>
                        <input
                          type="range"
                          min={25}
                          max={300}
                          value={effectTuning.glitchSpeed}
                          onChange={(event) => patchEffectTuning({ glitchSpeed: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {effects.crt ? (
                    <div className="fx-tuning-row">
                      <span className="fx-tuning-title">{t("effect_crt")}</span>
                      <label>
                        <span>{t("fxPower")} {effectTuning.crtPower}%</span>
                        <input
                          type="range"
                          min={0}
                          max={220}
                          value={effectTuning.crtPower}
                          onChange={(event) => patchEffectTuning({ crtPower: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {effects.paletteCycle ? (
                    <div className="fx-tuning-row">
                      <span className="fx-tuning-title">{t("effect_paletteCycle")}</span>
                      <label>
                        <span>{t("fxSpeed")} {effectTuning.paletteCycleSpeed}%</span>
                        <input
                          type="range"
                          min={25}
                          max={300}
                          value={effectTuning.paletteCycleSpeed}
                          onChange={(event) => patchEffectTuning({ paletteCycleSpeed: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        <span>{t("fxStep")} {effectTuning.paletteCycleStep}</span>
                        <input
                          type="range"
                          min={1}
                          max={4}
                          value={effectTuning.paletteCycleStep}
                          onChange={(event) => patchEffectTuning({ paletteCycleStep: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {effects.ghost ? (
                    <div className="fx-tuning-row">
                      <span className="fx-tuning-title">{t("effect_ghost")}</span>
                      <label>
                        <span>{t("fxPower")} {effectTuning.ghostPower}%</span>
                        <input
                          type="range"
                          min={0}
                          max={220}
                          value={effectTuning.ghostPower}
                          onChange={(event) => patchEffectTuning({ ghostPower: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        <span>{t("fxSpeed")} {effectTuning.ghostSpeed}%</span>
                        <input
                          type="range"
                          min={25}
                          max={300}
                          value={effectTuning.ghostSpeed}
                          onChange={(event) => patchEffectTuning({ ghostSpeed: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {effects.ditherFade ? (
                    <div className="fx-tuning-row">
                      <span className="fx-tuning-title">{t("effect_ditherFade")}</span>
                      <label>
                        <span>{t("fxPower")} {effectTuning.ditherPower}%</span>
                        <input
                          type="range"
                          min={0}
                          max={220}
                          value={effectTuning.ditherPower}
                          onChange={(event) => patchEffectTuning({ ditherPower: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        <span>{t("fxSpeed")} {effectTuning.ditherSpeed}%</span>
                        <input
                          type="range"
                          min={25}
                          max={300}
                          value={effectTuning.ditherSpeed}
                          onChange={(event) => patchEffectTuning({ ditherSpeed: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {effects.waveWarp ? (
                    <div className="fx-tuning-row">
                      <span className="fx-tuning-title">{t("effect_waveWarp")}</span>
                      <label>
                        <span>{t("fxPower")} {effectTuning.wavePower}%</span>
                        <input
                          type="range"
                          min={0}
                          max={220}
                          value={effectTuning.wavePower}
                          onChange={(event) => patchEffectTuning({ wavePower: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        <span>{t("fxSpeed")} {effectTuning.waveSpeed}%</span>
                        <input
                          type="range"
                          min={25}
                          max={300}
                          value={effectTuning.waveSpeed}
                          onChange={(event) => patchEffectTuning({ waveSpeed: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {effects.scanlines ? (
                    <div className="fx-tuning-row">
                      <span className="fx-tuning-title">{t("effect_scanlines")}</span>
                      <label>
                        <span>{t("fxPower")} {effectTuning.scanlinePower}%</span>
                        <input
                          type="range"
                          min={0}
                          max={220}
                          value={effectTuning.scanlinePower}
                          onChange={(event) => patchEffectTuning({ scanlinePower: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {effects.chromaShift ? (
                    <div className="fx-tuning-row">
                      <span className="fx-tuning-title">{t("effect_chromaShift")}</span>
                      <label>
                        <span>{t("fxPower")} {effectTuning.chromaPower}%</span>
                        <input
                          type="range"
                          min={0}
                          max={220}
                          value={effectTuning.chromaPower}
                          onChange={(event) => patchEffectTuning({ chromaPower: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {effects.pixelSort ? (
                    <div className="fx-tuning-row">
                      <span className="fx-tuning-title">{t("effect_pixelSort")}</span>
                      <label>
                        <span>{t("fxPower")} {effectTuning.pixelSortPower}%</span>
                        <input
                          type="range"
                          min={0}
                          max={220}
                          value={effectTuning.pixelSortPower}
                          onChange={(event) => patchEffectTuning({ pixelSortPower: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {effects.noise ? (
                    <div className="fx-tuning-row">
                      <span className="fx-tuning-title">{t("effect_noise")}</span>
                      <label>
                        <span>{t("fxPower")} {effectTuning.noisePower}%</span>
                        <input
                          type="range"
                          min={0}
                          max={220}
                          value={effectTuning.noisePower}
                          onChange={(event) => patchEffectTuning({ noisePower: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {effects.vignette ? (
                    <div className="fx-tuning-row">
                      <span className="fx-tuning-title">{t("effect_vignette")}</span>
                      <label>
                        <span>{t("fxPower")} {effectTuning.vignettePower}%</span>
                        <input
                          type="range"
                          min={0}
                          max={220}
                          value={effectTuning.vignettePower}
                          onChange={(event) => patchEffectTuning({ vignettePower: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {effects.outline ? (
                    <div className="fx-tuning-row">
                      <span className="fx-tuning-title">{t("effect_outline")}</span>
                      <label>
                        <span>{t("fxPower")} {effectTuning.outlinePower}%</span>
                        <input
                          type="range"
                          min={0}
                          max={220}
                          value={effectTuning.outlinePower}
                          onChange={(event) => patchEffectTuning({ outlinePower: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  ) : null}
                  </div>
                ) : null}
              </div>
            </section>

            {isAdvancedMode ? (
              <section className="tool-window">
              <header>
                <span>{t("animationTitle")}</span>
                <WindowControls />
              </header>
              <div className="tool-content">
                <label className="dialog-toggle">
                  <input
                    type="checkbox"
                    checked={animation.enabled}
                    onChange={(event) => setAnimationEnabled(event.target.checked)}
                  />
                  <span>{t("animationEnable")}</span>
                </label>
                <label className="dialog-advanced__label">
                  <span>{t("animationDuration")} {animation.durationMs}ms</span>
                  <input
                    type="range"
                    min={300}
                    max={12000}
                    step={100}
                    value={animation.durationMs}
                    onChange={(event) => setAnimationDuration(Number(event.target.value))}
                  />
                </label>
                <label className="dialog-toggle">
                  <input
                    type="checkbox"
                    checked={animation.loop}
                    onChange={(event) => setAnimationLoop(event.target.checked)}
                  />
                  <span>{t("animationLoop")}</span>
                </label>
                <label className="dialog-advanced__label">
                  <span>{t("animationProgress")} {Math.round(animation.progress * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(animation.progress * 100)}
                    onChange={(event) => setAnimationProgress(Number(event.target.value) / 100)}
                  />
                </label>
                <div className="tiny-grid">
                  <button type="button" className="retro-btn btn-mini" onClick={captureAnimationStart}>
                    {t("animationSetStart")}
                  </button>
                  <button type="button" className="retro-btn btn-mini" onClick={captureAnimationEnd}>
                    {t("animationSetEnd")}
                  </button>
                  <button type="button" className="retro-btn btn-mini" onClick={toggleAnimationPlaying}>
                    {animation.playing ? t("animationPause") : t("animationPlay")}
                  </button>
                  <button type="button" className="retro-btn btn-mini" onClick={stopAnimationPlayback}>
                    {t("animationStop")}
                  </button>
                </div>
              </div>
              </section>
            ) : null}

            <section className="tool-window">
              <header>
                <span>{t("paletteTitle")}</span>
                <WindowControls />
              </header>
              <div className="tool-content">
                <div className="palette-grid-fixed">
                  {paletteKeys.map((id) => {
                    const item = lists.palettes[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`palette-btn ${palette === id ? "is-active" : ""}`}
                        onClick={() => setPalette(id)}
                      >
                        <span className="palette-swatches">
                          {(paletteColorsById[id] ?? []).slice(0, 8).map((color, idx) => (
                            <i
                              key={`${id}-${idx}`}
                              style={{ background: `rgb(${color[0]},${color[1]},${color[2]})` }}
                            />
                          ))}
                        </span>
                        <span className="palette-name">{item.name[lang] ?? item.name.en}</span>
                      </button>
                    );
                  })}
                </div>
                {isAdvancedMode ? (
                  <>
                    <div className="palette-tools">
                      <button
                        type="button"
                        className={`retro-btn btn-mini ${paletteEditorOpen ? "is-active" : ""}`}
                        onClick={() => setPaletteEditorOpen((value) => !value)}
                      >
                        {t("paletteEditor")}
                      </button>
                      <button type="button" className="retro-btn btn-mini" onClick={onExportPalette}>
                        {t("paletteExport")}
                      </button>
                      <button
                        type="button"
                        className="retro-btn btn-mini"
                        onClick={() => paletteInputRef.current?.click()}
                      >
                        {t("paletteImport")}
                      </button>
                      <button type="button" className="retro-btn btn-mini" onClick={resetCurrentPalette}>
                        {t("paletteReset")}
                      </button>
                      <input
                        ref={paletteInputRef}
                        type="file"
                        accept=".json,application/json"
                        hidden
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void onImportPalette(file);
                          }
                          event.currentTarget.value = "";
                        }}
                      />
                    </div>
                    <div className="palette-smart-controls">
                      <label className="dialog-advanced__label">
                        <span>{t("paletteExtractCount")} {paletteExtractCount}</span>
                        <input
                          type="range"
                          min={1}
                          max={Math.max(1, currentPaletteColors.length)}
                          value={Math.min(paletteExtractCount, Math.max(1, currentPaletteColors.length))}
                          onChange={(event) => setPaletteExtractCount(Number(event.target.value))}
                        />
                      </label>
                      <label className="dialog-advanced__label">
                        <span>{t("paletteMergeThreshold")} {paletteMergeThreshold}</span>
                        <input
                          type="range"
                          min={2}
                          max={96}
                          value={paletteMergeThreshold}
                          onChange={(event) => setPaletteMergeThreshold(Number(event.target.value))}
                        />
                      </label>
                      <div className="tiny-grid">
                        <button
                          type="button"
                          className="retro-btn btn-mini"
                          onClick={() => extractPaletteFromSource(paletteExtractCount)}
                          disabled={!sourcePreviewUrl}
                        >
                          {t("paletteExtract")}
                        </button>
                        <button
                          type="button"
                          className="retro-btn btn-mini"
                          onClick={() => mergeCurrentPaletteSimilar(paletteMergeThreshold)}
                        >
                          {t("paletteMerge")}
                        </button>
                        <button type="button" className="retro-btn btn-mini" onClick={clearPaletteLocks}>
                          {t("paletteUnlockAll")}
                        </button>
                      </div>
                    </div>
                    {paletteEditorOpen ? (
                      <div className="palette-editor">
                        <div className="palette-editor__title">
                          {t("paletteEditor")} ({currentPaletteColors.length})
                        </div>
                        <div className="palette-editor__list">
                          {currentPaletteColors.map((color, index) => (
                            <div key={`${palette}-${index}`} className="palette-editor__item">
                              <span className="palette-editor__index">#{index}</span>
                              <input
                                type="color"
                                value={`#${color[0].toString(16).padStart(2, "0")}${color[1].toString(16).padStart(2, "0")}${color[2].toString(16).padStart(2, "0")}`}
                                onChange={(event) => {
                                  const hex = event.target.value;
                                  updateCurrentPaletteColor(index, [
                                    Number.parseInt(hex.slice(1, 3), 16),
                                    Number.parseInt(hex.slice(3, 5), 16),
                                    Number.parseInt(hex.slice(5, 7), 16),
                                  ]);
                                }}
                              />
                              {[0, 1, 2].map((channel) => (
                                <input
                                  key={`${index}-${channel}`}
                                  type="number"
                                  min={0}
                                  max={255}
                                  value={color[channel]}
                                  onChange={(event) => {
                                    const next = [...color] as [number, number, number];
                                    next[channel] = Number(event.target.value);
                                    updateCurrentPaletteColor(index, next);
                                  }}
                                />
                              ))}
                              <button
                                type="button"
                                className="retro-btn btn-mini"
                                onClick={() => togglePaletteLock(index)}
                              >
                                {paletteLocks[index] ? t("paletteUnlock") : t("paletteLock")}
                              </button>
                              <button
                                type="button"
                                className="retro-btn btn-mini"
                                onClick={() => removeCurrentPaletteColor(index)}
                                disabled={currentPaletteColors.length <= 1}
                              >
                                -
                              </button>
                            </div>
                          ))}
                        </div>
                        <button type="button" className="retro-btn btn-mini" onClick={addCurrentPaletteColor}>
                          {t("paletteAddColor")}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </section>

            <section className="tool-window">
              <header>
                <span>{t("dialogTitle")}</span>
                <WindowControls />
              </header>
              <div className="tool-content">
                <label className="dialog-toggle">
                  <input
                    type="checkbox"
                    checked={dialog.enabled}
                    onChange={(event) => patchDialog({ enabled: event.target.checked })}
                  />
                  <span>{t("onOff")}</span>
                </label>

                {dialog.enabled ? (
                  <div className="dialog-settings">
                    <div className="style-grid">
                      {lists.dialogStyles.map((styleId) => (
                        <button
                          key={styleId}
                          type="button"
                          className={`retro-btn btn-mini ${dialog.style === styleId ? "is-active" : ""}`}
                          onClick={() => patchDialog({ style: styleId as DialogState["style"] })}
                        >
                          {t(`style_${styleId}`)}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={dialog.name}
                      onChange={(event) => patchDialog({ name: event.target.value })}
                      placeholder={t("dialogName")}
                    />
                    <textarea
                      value={dialog.text}
                      rows={4}
                      onChange={(event) => patchDialog({ text: event.target.value })}
                      placeholder={t("dialogText")}
                    />
                    {isAdvancedMode ? (
                      <div className="dialog-advanced">
                        <div className="dialog-advanced__title">{t("dialogAdvanced")}</div>
                        <div className="dialog-page-row">
                          <button type="button" className="retro-btn btn-mini" onClick={prevDialogPage}>
                            {t("dialogPrev")}
                          </button>
                          <span>
                            {t("dialogPage")} {currentDialogPage + 1} / {dialogPages.length}
                          </span>
                          <button type="button" className="retro-btn btn-mini" onClick={nextDialogPage}>
                            {t("dialogNext")}
                          </button>
                        </div>
                        <label className="dialog-advanced__label">
                          <span>{t("dialogTypingSpeed")} {dialog.typingSpeed}%</span>
                          <input
                            type="range"
                            min={25}
                            max={300}
                            value={dialog.typingSpeed}
                            onChange={(event) => patchDialog({ typingSpeed: Number(event.target.value) })}
                          />
                        </label>
                        <label className="dialog-toggle">
                          <input
                            type="checkbox"
                            checked={dialog.autoPage}
                            onChange={(event) => patchDialog({ autoPage: event.target.checked })}
                          />
                          <span>{t("dialogAutoPage")}</span>
                        </label>
                        {dialog.autoPage ? (
                          <label className="dialog-advanced__label">
                            <span>{t("dialogAutoDelay")} {dialog.autoPageDelay}ms</span>
                            <input
                              type="range"
                              min={300}
                              max={4000}
                              step={100}
                              value={dialog.autoPageDelay}
                              onChange={(event) => patchDialog({ autoPageDelay: Number(event.target.value) })}
                            />
                          </label>
                        ) : null}
                        <small>{t("dialogPageHint")}</small>
                      </div>
                    ) : null}
                    <div className="dialog-position-presets">
                      {[25, 50, 70, 90].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`retro-btn btn-mini ${dialog.position === value ? "is-active" : ""}`}
                          onClick={() => patchDialog({ position: value })}
                        >
                          {value}%
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={dialog.position}
                      onChange={(event) => patchDialog({ position: Number(event.target.value) })}
                    />
                    <div className="dialog-position-meta">
                      <span>{t("top")}</span>
                      <span>{dialog.position}%</span>
                      <span>{t("bottom")}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {isAdvancedMode ? (
              <section className="tool-window">
              <header>
                <span>{t("maskTitle")}</span>
                <WindowControls />
              </header>
              <div className="tool-content">
                <label className="dialog-toggle">
                  <input
                    type="checkbox"
                    checked={mask.enabled}
                    onChange={(event) => setMaskEnabled(event.target.checked)}
                  />
                  <span>{t("maskEnable")}</span>
                </label>
                <div className="mask-controls">
                  <div className="group-label">{t("maskToolMode")}</div>
                  <div className="tiny-grid mask-tool-grid">
                    <button
                      type="button"
                      className={`retro-btn btn-mini ${maskToolMode === "brush" ? "is-active" : ""}`}
                      onClick={() => setMaskTool("brush")}
                    >
                      {t("maskToolBrush")}
                    </button>
                    <button
                      type="button"
                      className={`retro-btn btn-mini ${maskToolMode === "rect" ? "is-active" : ""}`}
                      onClick={() => setMaskTool("rect")}
                    >
                      {t("maskToolRect")}
                    </button>
                    <button
                      type="button"
                      className={`retro-btn btn-mini ${maskToolMode === "lasso" ? "is-active" : ""}`}
                      onClick={() => setMaskTool("lasso")}
                    >
                      {t("maskToolLasso")}
                    </button>
                    <button
                      type="button"
                      className={`retro-btn btn-mini ${maskToolMode === "gradient" ? "is-active" : ""}`}
                      onClick={() => setMaskTool("gradient")}
                    >
                      {t("maskToolGradient")}
                    </button>
                  </div>
                  <div className="tiny-grid">
                    <button
                      type="button"
                      className={`retro-btn btn-mini ${mask.mode === "paint" ? "is-active" : ""}`}
                      onClick={() => setMaskMode("paint")}
                    >
                      {t("maskPaint")}
                    </button>
                    <button
                      type="button"
                      className={`retro-btn btn-mini ${mask.mode === "erase" ? "is-active" : ""}`}
                      onClick={() => setMaskMode("erase")}
                    >
                      {t("maskErase")}
                    </button>
                  </div>
                  <label className="dialog-advanced__label">
                    <span>{t("maskFeather")} {maskFeather}</span>
                    <input
                      type="range"
                      min={0}
                      max={16}
                      value={maskFeather}
                      onChange={(event) => setMaskFeatherStrength(Number(event.target.value))}
                    />
                  </label>
                  <label className="dialog-advanced__label">
                    <span>{t("maskBrush")} {mask.brushSize}</span>
                    <input
                      type="range"
                      min={1}
                      max={16}
                      value={mask.brushSize}
                      onChange={(event) => setBrushSize(Number(event.target.value))}
                    />
                  </label>
                  <div className="mask-actions">
                    <button type="button" className="retro-btn btn-mini" onClick={clearMask}>
                      {t("maskClear")}
                    </button>
                    <button type="button" className="retro-btn btn-mini" onClick={invertMask}>
                      {t("maskInvert")}
                    </button>
                    <button
                      type="button"
                      className={`retro-btn btn-mini ${mask.overlayVisible ? "is-active" : ""}`}
                      onClick={toggleMaskOverlay}
                    >
                      {t("maskOverlay")}
                    </button>
                  </div>
                  <div className="mask-fx-grid">
                    {lists.effects.map((effectKey) => (
                      <label key={`mask-${effectKey}`} className="mask-fx-item">
                        <input
                          type="checkbox"
                          checked={mask.fxEnabled[effectKey]}
                          onChange={() => toggleMaskFx(effectKey)}
                        />
                        <span>{t(`effect_${effectKey}`)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              </section>
            ) : null}

            {isAdvancedMode ? (
              <section className="tool-window">
              <header>
                <span>{t("shortcutTitle")}</span>
                <WindowControls />
              </header>
              <div className="tool-content">
                <div className="shortcut-list">
                  {shortcutBindings.map((binding) => (
                    <div key={binding.id} className="shortcut-item">
                      <kbd>{binding.combo}</kbd>
                      <span>{t(binding.labelKey)}</span>
                    </div>
                  ))}
                </div>
              </div>
              </section>
            ) : null}

            {isAdvancedMode ? (
              <section className="tool-window">
              <header>
                <span>{t("pluginTitle")}</span>
                <WindowControls />
              </header>
              <div className="tool-content">
                <label className="dialog-toggle perf-toggle">
                  <input
                    type="checkbox"
                    checked={webglAcceleration && webglSupported}
                    disabled={!webglSupported}
                    onChange={(event) => setWebglAcceleration(event.target.checked)}
                  />
                  <span>
                    {t("webglAcceleration")}
                    {!webglSupported ? ` (${t("webglUnsupported")})` : ""}
                  </span>
                </label>
                <div className="preset-actions">
                  <button type="button" className="retro-btn btn-mini" onClick={onOpenPluginImport}>
                    {t("pluginImport")}
                  </button>
                </div>
                <div className="preset-list">
                  {externalPlugins.length > 0 ? (
                    externalPlugins.map((plugin) => (
                      <div key={plugin.id} className="preset-item plugin-item">
                        <label className="dialog-toggle plugin-item__toggle">
                          <input
                            type="checkbox"
                            checked={plugin.enabled}
                            onChange={(event) => setExternalPluginEnabled(plugin.id, event.target.checked)}
                          />
                          <span>{plugin.name}</span>
                        </label>
                        <small>{plugin.id}</small>
                        <label className="plugin-item__strength">
                          <span>{t("pluginStrength")} {plugin.strength}%</span>
                          <input
                            type="range"
                            min={0}
                            max={200}
                            value={plugin.strength}
                            onChange={(event) => setExternalPluginStrength(plugin.id, Number(event.target.value))}
                          />
                        </label>
                        <button
                          type="button"
                          className="retro-btn btn-mini"
                          onClick={() => unregisterExternalPlugin(plugin.id)}
                        >
                          {t("pluginRemove")}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="preset-empty">{t("pluginEmpty")}</div>
                  )}
                </div>
              </div>
              </section>
            ) : null}

            {isAdvancedMode ? (
              <section className="tool-window">
              <header>
                <span>{t("fxPipelineTitle")}</span>
                <WindowControls />
              </header>
              <div className="tool-content">
                <div className="fx-pipeline-list">
                  {effectPipelineOrder.map((effectKey, index) => (
                    <div key={`pipeline-${effectKey}`} className="fx-pipeline-item">
                      <span>{index + 1}. {t(`effect_${effectKey}`)}</span>
                      <div className="fx-pipeline-item__actions">
                        <button
                          type="button"
                          className="retro-btn btn-mini"
                          onClick={() => moveEffectInPipeline(effectKey, -1)}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="retro-btn btn-mini"
                          onClick={() => moveEffectInPipeline(effectKey, 1)}
                          disabled={index === effectPipelineOrder.length - 1}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="preset-controls">
                  <input
                    type="text"
                    value={fxPresetName}
                    onChange={(event) => setFxPresetName(event.target.value)}
                    placeholder={t("fxPipelinePresetName")}
                  />
                  <div className="preset-actions">
                    <button type="button" className="retro-btn btn-mini" onClick={() => saveFxPipelinePreset(fxPresetName)}>
                      {t("fxPipelinePresetSave")}
                    </button>
                    <button
                      type="button"
                      className="retro-btn btn-mini"
                      disabled={!selectedFxPipelinePresetId}
                      onClick={() => {
                        if (selectedFxPipelinePresetId) {
                          applyFxPipelinePreset(selectedFxPipelinePresetId);
                        }
                      }}
                    >
                      {t("fxPipelinePresetApply")}
                    </button>
                    <button
                      type="button"
                      className="retro-btn btn-mini"
                      disabled={!selectedFxPipelinePresetId}
                      onClick={() => {
                        if (selectedFxPipelinePresetId) {
                          deleteFxPipelinePreset(selectedFxPipelinePresetId);
                        }
                      }}
                    >
                      {t("fxPipelinePresetDelete")}
                    </button>
                  </div>
                </div>
                <div className="preset-list">
                  {fxPipelinePresets.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`preset-item ${selectedFxPipelinePresetId === item.id ? "is-active" : ""}`}
                      onClick={() => setSelectedFxPipelinePresetId(item.id)}
                    >
                      <span>{item.name}</span>
                      <small>{item.order.map((effectKey) => t(`effect_${effectKey}`)).join(" > ")}</small>
                    </button>
                  ))}
                </div>
              </div>
              </section>
            ) : null}

            {isAdvancedMode ? (
              <section className="tool-window">
              <header>
                <span>{t("historyTitle")}</span>
                <WindowControls />
              </header>
              <div className="tool-content">
                <div className="history-actions">
                  <button type="button" className="retro-btn btn-mini" onClick={undoParamHistory} disabled={!canUndoParamHistory}>
                    {t("historyUndo")}
                  </button>
                  <button type="button" className="retro-btn btn-mini" onClick={redoParamHistory} disabled={!canRedoParamHistory}>
                    {t("historyRedo")}
                  </button>
                  <button type="button" className="retro-btn btn-mini" onClick={clearParamHistory} disabled={paramHistory.length === 0}>
                    {t("historyClear")}
                  </button>
                </div>
                <div className="history-list">
                  {paramHistory.length > 0 ? (
                    paramHistory.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className={`history-item ${activeParamHistoryId === entry.id ? "is-active" : ""}`}
                        onClick={() => restoreParamHistory(entry.id)}
                      >
                        <span>{entry.label}</span>
                        <small>{new Date(entry.createdAt).toLocaleString()}</small>
                      </button>
                    ))
                  ) : (
                    <div className="preset-empty">{t("historyEmpty")}</div>
                  )}
                </div>
              </div>
              </section>
            ) : null}

            {isAdvancedMode ? (
              <section className="tool-window">
              <header>
                <span>{t("presetTitle")}</span>
                <WindowControls />
              </header>
              <div className="tool-content">
                <div className="preset-controls">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder={t("presetName")}
                  />
                  <div className="preset-actions">
                    <button type="button" className="retro-btn btn-mini" onClick={() => savePreset(presetName)}>
                      {t("presetSave")}
                    </button>
                    <button
                      type="button"
                      className="retro-btn btn-mini"
                      disabled={!selectedPresetId}
                      onClick={() => {
                        if (selectedPresetId) {
                          applyPreset(selectedPresetId);
                        }
                      }}
                    >
                      {t("presetApply")}
                    </button>
                    <button
                      type="button"
                      className="retro-btn btn-mini"
                      disabled={!selectedPresetId}
                      onClick={() => {
                        if (selectedPresetId) {
                          renamePreset(selectedPresetId, presetName);
                        }
                      }}
                    >
                      {t("presetRename")}
                    </button>
                    <button
                      type="button"
                      className="retro-btn btn-mini"
                      disabled={!selectedPresetId}
                      onClick={() => {
                        if (selectedPresetId) {
                          deletePreset(selectedPresetId);
                        }
                      }}
                    >
                      {t("presetDelete")}
                    </button>
                  </div>
                  <div className="preset-actions">
                    <button type="button" className="retro-btn btn-mini" onClick={exportPresets}>
                      {t("presetExport")}
                    </button>
                    <button
                      type="button"
                      className="retro-btn btn-mini"
                      onClick={() => presetInputRef.current?.click()}
                    >
                      {t("presetImport")}
                    </button>
                    <input
                      ref={presetInputRef}
                      type="file"
                      accept=".json,application/json"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void importPresets(file);
                        }
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>
                </div>
                <div className="preset-list">
                  {presets.length > 0 ? (
                    presets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`preset-item ${selectedPresetId === preset.id ? "is-active" : ""}`}
                        onClick={() => setSelectedPresetId(preset.id)}
                      >
                        <span>{preset.name}</span>
                        <small>{new Date(preset.updatedAt).toLocaleString()}</small>
                      </button>
                    ))
                  ) : (
                    <div className="preset-empty">{t("statusReady")}</div>
                  )}
                </div>
              </div>
              </section>
            ) : null}
          </aside>

          <section className="preview-column">
            <section className="tool-window preview-window">
              <header>
                <span>{t("previewTitle")}</span>
                <WindowControls />
              </header>
              <div className="tool-content preview-content">
                <div
                  className={`preview-area ${isDragging ? "is-dragging" : ""}`}
                  tabIndex={0}
                  role="button"
                  onClick={onPickFile}
                  onDrop={onPreviewDrop}
                  onDragEnter={onDragOver}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onPickFile();
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      onInputFile(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={batchInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(event) => {
                      onInputBatchFiles(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={jsonInputRef}
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void onImportJson(file);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={projectInputRef}
                    type="file"
                    accept=".pxc,.json,application/octet-stream"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void onImportProject(file);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={pluginInputRef}
                    type="file"
                    accept=".js,.mjs,text/javascript,application/javascript"
                    hidden
                    onChange={(event) => {
                      onInputPluginFile(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <canvas ref={canvasRef} className={`preview-canvas ${grid ? "is-visible" : ""}`} />
                  <canvas
                    ref={maskCanvasRef}
                    className={`mask-overlay-canvas ${grid ? "is-visible" : ""} ${mask.enabled ? "is-enabled" : ""} ${mask.overlayVisible ? "" : "is-hidden"}`}
                    onPointerDown={onMaskPointerDown}
                    onPointerMove={onMaskPointerMove}
                    onPointerUp={onMaskPointerEnd}
                    onPointerCancel={onMaskPointerEnd}
                    onClick={(event) => event.stopPropagation()}
                  />
                  {grid ? (
                    <button
                      type="button"
                      className="retro-btn btn-mini preview-edit-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditorOpen(true);
                      }}
                    >
                      {t("edit")}
                    </button>
                  ) : null}
                  {!grid ? (
                    <div className="preview-placeholder">
                      <span className="ph-icon">🖼</span>
                      <span>{t("dropHint")}</span>
                      <span>{t("orClick")}</span>
                    </div>
                  ) : null}
                </div>

                <div className="export-row">
                  <button
                    type="button"
                    className="retro-btn btn-mini"
                    onClick={onDownloadPng}
                    disabled={!grid || isRecording || isBatchProcessing}
                  >
                    {t("download")}
                  </button>
                  {isAdvancedMode ? (
                    <>
                      <button
                        type="button"
                        className="retro-btn btn-mini"
                        onClick={onPickBatchFiles}
                        disabled={isRecording || isBatchProcessing}
                      >
                        {isBatchProcessing ? t("batchProcessing") : t("batchZip")}
                      </button>
                      <button
                        type="button"
                        className="retro-btn btn-mini"
                        onClick={() => {
                          void onDownloadGif();
                        }}
                        disabled={!grid || isRecording || isBatchProcessing}
                      >
                        {t("downloadGif")}
                      </button>
                      <button
                        type="button"
                        className="retro-btn btn-mini"
                        onClick={() => {
                          void onDownloadApng();
                        }}
                        disabled={!grid || isRecording || isBatchProcessing}
                      >
                        {t("downloadApng")}
                      </button>
                      <button
                        type="button"
                        className="retro-btn btn-mini"
                        onClick={() => {
                          void onDownloadSpriteSheet();
                        }}
                        disabled={!grid || isRecording || isBatchProcessing}
                      >
                        {t("downloadSprite")}
                      </button>
                      {canRecordVideo ? (
                        <button
                          type="button"
                          className="retro-btn btn-mini"
                          onClick={() => {
                            void onDownloadVideo();
                          }}
                          disabled={!grid || isRecording || isBatchProcessing}
                        >
                          {isRecording ? t("recording") : t("downloadVideo")}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
                {isAdvancedMode ? (
                  <div className="batch-panel">
                    <div className="export-settings-grid">
                      <label>
                        <span>{t("exportGifFps")} {gifFps}</span>
                        <input
                          type="range"
                          min={1}
                          max={24}
                          value={gifFps}
                          onChange={(event) => setGifFps(Number(event.target.value))}
                        />
                      </label>
                      <label>
                        <span>{t("exportApngFps")} {apngFps}</span>
                        <input
                          type="range"
                          min={1}
                          max={24}
                          value={apngFps}
                          onChange={(event) => setApngFps(Number(event.target.value))}
                        />
                      </label>
                      <label>
                        <span>{t("exportLoopCount")} {exportLoopCount}</span>
                        <input
                          type="number"
                          min={0}
                          max={99}
                          value={exportLoopCount}
                          onChange={(event) => setExportLoopCount(Number(event.target.value) || 0)}
                        />
                      </label>
                      <label>
                        <span>{t("spriteColumns")} {spriteColumns}</span>
                        <input
                          type="range"
                          min={1}
                          max={12}
                          value={spriteColumns}
                          onChange={(event) => setSpriteColumns(Number(event.target.value))}
                        />
                      </label>
                    </div>
                    <label className="batch-template">
                      <span>{t("batchTemplate")}</span>
                      <input
                        type="text"
                        value={batchNamingTemplate}
                        onChange={(event) => setBatchNamingTemplate(event.target.value)}
                        placeholder="{name}_pixel_{index}"
                      />
                    </label>
                    <div className="batch-progress">
                      <span>{t("batchProgress")}</span>
                      <span>{batchProgress.completed} / {batchProgress.total}</span>
                      <span>F:{batchProgress.failed}</span>
                      <span>R:{batchProgress.retries}</span>
                      <span>{batchProgress.zipProgress}%</span>
                    </div>
                    {batchProgress.currentFile ? (
                      <small className="batch-current">{batchProgress.currentFile}</small>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="tool-window gallery-window">
              <header>
                <span>{t("galleryTitle")}</span>
                <WindowControls />
              </header>
              <div className="tool-content gallery-content">
                <div className="gallery-actions">
                  <button
                    type="button"
                    className="retro-btn btn-mini"
                    onClick={() => {
                      void saveCurrentToGallery();
                    }}
                    disabled={!grid || isRecording || isBatchProcessing}
                  >
                    {t("gallerySaveCurrent")}
                  </button>
                  <button
                    type="button"
                    className="retro-btn btn-mini"
                    onClick={() => {
                      void clearGallery();
                    }}
                    disabled={galleryItems.length === 0}
                  >
                    {t("galleryClear")}
                  </button>
                </div>
                {isAdvancedMode ? (
                  <div className="gallery-toolbar">
                    <input
                      type="text"
                      value={gallerySearch}
                      onChange={(event) => setGallerySearch(event.target.value)}
                      placeholder={t("gallerySearchPlaceholder")}
                    />
                    <button type="button" className="retro-btn btn-mini" onClick={toggleSelectAllFiltered}>
                      {allFilteredSelected ? t("galleryUnselectAll") : t("gallerySelectAll")}
                    </button>
                    <button
                      type="button"
                      className="retro-btn btn-mini"
                      disabled={galleryBulkIds.length === 0}
                      onClick={() => downloadGalleryItemsBulk(galleryBulkIds)}
                    >
                      {t("galleryBulkDownload")}
                    </button>
                    <button
                      type="button"
                      className="retro-btn btn-mini"
                      disabled={galleryBulkIds.length === 0}
                      onClick={() => {
                        void removeGalleryItemsBulk(galleryBulkIds);
                        setGalleryBulkIds([]);
                      }}
                    >
                      {t("galleryBulkDelete")}
                    </button>
                  </div>
                ) : null}

                <div className="gallery-region">
                  {filteredGalleryItems.length > 0 ? (
                    <div className="gallery-layout">
                      <div className="gallery-list" role="listbox" aria-label={t("galleryTitle")}>
                        {filteredGalleryItems.map((item) => (
                          <div
                            key={item.id}
                            className={`gallery-list-item ${selectedGalleryItem?.id === item.id ? "is-active" : ""}`}
                          >
                            <label className="gallery-bulk-check">
                              <input
                                type="checkbox"
                                checked={galleryBulkIds.includes(item.id)}
                                onChange={() => toggleGalleryBulkId(item.id)}
                              />
                            </label>
                            <button
                              type="button"
                              className="gallery-list-main"
                              onClick={() => setSelectedGalleryId(item.id)}
                              title={item.name}
                            >
                              <img className="gallery-list-thumb" src={item.url} alt={item.name} loading="lazy" />
                              <span className="gallery-list-name">{item.name}</span>
                              <small className="gallery-list-time">{new Date(item.createdAt).toLocaleString()}</small>
                              {item.tags.length > 0 ? (
                                <small className="gallery-list-tags">{item.tags.join(", ")}</small>
                              ) : null}
                            </button>
                            <button
                              type="button"
                              className={`gallery-fav-btn ${item.favorite ? "is-active" : ""}`}
                              onClick={() => toggleGalleryFavorite(item.id)}
                              title={t("galleryFavorite")}
                            >
                              ★
                            </button>
                          </div>
                        ))}
                      </div>

                      {selectedGalleryItem ? (
                        <article className="gallery-preview">
                          <div className="gallery-preview-image-wrap">
                            <img
                              className="gallery-preview-image"
                              src={selectedGalleryItem.url}
                              alt={selectedGalleryItem.name}
                              loading="lazy"
                            />
                          </div>
                          <div className="gallery-nav-actions">
                            <button
                              type="button"
                              className="retro-btn btn-mini"
                              onClick={() => goGalleryStep(-1)}
                              disabled={filteredGalleryItems.length <= 1}
                            >
                              {t("galleryPrev")}
                            </button>
                            <span className="gallery-nav-status">{`${selectedGalleryIndex + 1} / ${filteredGalleryItems.length}`}</span>
                            <button
                              type="button"
                              className="retro-btn btn-mini"
                              onClick={() => goGalleryStep(1)}
                              disabled={filteredGalleryItems.length <= 1}
                            >
                              {t("galleryNext")}
                            </button>
                          </div>
                          {isAdvancedMode ? (
                            <div className="gallery-tag-editor">
                              <input
                                type="text"
                                value={galleryTagDraft}
                                onChange={(event) => setGalleryTagDraft(event.target.value)}
                                placeholder={t("galleryTagsPlaceholder")}
                              />
                              <button type="button" className="retro-btn btn-mini" onClick={applyGalleryTagDraft}>
                                {t("galleryTagsApply")}
                              </button>
                              <button
                                type="button"
                                className={`retro-btn btn-mini ${compareEnabled ? "is-active" : ""}`}
                                onClick={() => setCompareEnabled((value) => !value)}
                                disabled={!sourcePreviewUrl}
                              >
                                {t("compareToggle")}
                              </button>
                            </div>
                          ) : null}
                          {isAdvancedMode && compareEnabled && sourcePreviewUrl ? (
                            <div className="compare-box">
                              <div className="compare-toolbar">
                                <button type="button" className="retro-btn btn-mini" onClick={() => setCompareZoom((v) => Math.max(0.5, Number((v - 0.1).toFixed(2))))}>-</button>
                                <span>{Math.round(compareZoom * 100)}%</span>
                                <button type="button" className="retro-btn btn-mini" onClick={() => setCompareZoom((v) => Math.min(4, Number((v + 0.1).toFixed(2))))}>+</button>
                                <button type="button" className="retro-btn btn-mini" onClick={resetCompareTransform}>
                                  {t("compareReset")}
                                </button>
                                <button type="button" className="retro-btn btn-mini" onClick={() => setComparePanX((v) => v - 20)}>←</button>
                                <button type="button" className="retro-btn btn-mini" onClick={() => setComparePanY((v) => v - 20)}>↑</button>
                                <button type="button" className="retro-btn btn-mini" onClick={() => setComparePanY((v) => v + 20)}>↓</button>
                                <button type="button" className="retro-btn btn-mini" onClick={() => setComparePanX((v) => v + 20)}>→</button>
                              </div>
                              <div
                                className="compare-viewport"
                                onWheel={onCompareWheel}
                                onPointerDown={onComparePointerDown}
                                onPointerMove={onComparePointerMove}
                                onPointerUp={onComparePointerEnd}
                                onPointerCancel={onComparePointerEnd}
                              >
                                <div className="compare-pane">
                                  <span>{t("compareSource")}</span>
                                  <img
                                    src={sourcePreviewUrl}
                                    alt={t("compareSource")}
                                    style={{ transform: `translate(${comparePanX}px, ${comparePanY}px) scale(${compareZoom})` }}
                                  />
                                </div>
                                <div className="compare-pane">
                                  <span>{t("compareProcessed")}</span>
                                  <img
                                    src={selectedGalleryItem.url}
                                    alt={t("compareProcessed")}
                                    style={{ transform: `translate(${comparePanX}px, ${comparePanY}px) scale(${compareZoom})` }}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null}
                          <small className="gallery-nav-hint">{t("galleryShortcutHint")}</small>
                          <div className="gallery-meta">
                            <span>{selectedGalleryItem.name}</span>
                            <small>{`${selectedGalleryItem.width} x ${selectedGalleryItem.height}`}</small>
                            <small>{new Date(selectedGalleryItem.createdAt).toLocaleString()}</small>
                          </div>
                          <div className="gallery-item-actions">
                            <button
                              type="button"
                              className="retro-btn btn-mini"
                              onClick={() => downloadGalleryItem(selectedGalleryItem.id)}
                            >
                              {t("download")}
                            </button>
                            <button
                              type="button"
                              className="retro-btn btn-mini"
                              onClick={() => {
                                void removeGalleryItem(selectedGalleryItem.id);
                              }}
                            >
                              {t("galleryDelete")}
                            </button>
                          </div>
                        </article>
                      ) : (
                        <div className="gallery-preview gallery-preview-empty">{t("galleryEmpty")}</div>
                      )}
                    </div>
                  ) : (
                    <div className="preset-empty">{t("galleryEmpty")}</div>
                  )}
                </div>
              </div>
            </section>
          </section>
        </section>

        <footer className="inner-status">
          <span className="inner-status__main">{grid ? t(statusKey) : t("statusDrop")}</span>
          <span>{pixelSize}px</span>
          <span>{lists.palettes[palette].name[lang] ?? lists.palettes[palette].name.en}</span>
        </footer>
      </main>

      {ghostOpen ? (
        <aside className="ghost-window">
          <header>
            <span>{t("ghostTitle")}</span>
            <button type="button" onClick={() => setGhostOpen(false)}>
              ×
            </button>
          </header>
          <button
            type="button"
            className="ghost-window__body"
            onClick={() => setGhostMessageIndex((prev) => (prev + 1) % ghostMessages.length)}
          >
            <img src={mascotPixelbot} alt={t("ghostTitle")} />
            <p>{ghostMessages[ghostMessageIndex]}</p>
          </button>
        </aside>
      ) : null}

      <Taskbar
        t={t}
        startPressed={startPressed}
        startMenuOpen={startMenuOpen}
        onPressStart={pressStart}
        onCloseStartMenu={closeStartMenu}
        appName={BRAND.appName}
        versionLabel={BRAND.versionLabel}
        mascotName={t("ghostTitle")}
        windowItems={taskWindowItems}
        startPinnedActions={startPinnedActions}
        startSystemActions={startSystemActions}
        isLocalhost={isLocalhost}
        hasGrid={Boolean(grid)}
        onExportJson={onExportJson}
        onOpenJsonImport={() => jsonInputRef.current?.click()}
        onExportProject={onExportProject}
        onOpenProjectImport={() => projectInputRef.current?.click()}
        lang={lang}
        setLang={setLang}
        languages={lists.languages}
        onOpenFlipbook={onOpenFlipbook}
        soundOn={soundOn}
        onToggleSound={() => setSoundOn((value) => !value)}
        clock={clock}
      />

      <dialog
        ref={aboutRef}
        className="about-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setAboutOpen(false);
          }
        }}
      >
        <header>{t("taskReadme")}</header>
        <article>{t("aboutText")}</article>
        <footer>
          <button type="button" className="retro-btn btn-mini" onClick={() => setAboutOpen(false)}>
            OK
          </button>
        </footer>
      </dialog>

      <dialog
        ref={docsRef}
        className="about-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setDocsOpen(false);
          }
        }}
      >
        <header>{t("docsTitle")}</header>
        <article>{t("docsText")}</article>
        <footer>
          <button type="button" className="retro-btn btn-mini" onClick={() => setDocsOpen(false)}>
            OK
          </button>
        </footer>
      </dialog>

      <dialog
        ref={changelogRef}
        className="about-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setChangelogOpen(false);
          }
        }}
      >
        <header>{t("changelogTitle")}</header>
        <article>{t("changelogText")}</article>
        <footer>
          <button type="button" className="retro-btn btn-mini" onClick={() => setChangelogOpen(false)}>
            OK
          </button>
        </footer>
      </dialog>

      {editorOpen && grid ? (
        <PixelEditorModal
          grid={grid}
          t={t}
          onSave={(nextIndices) => {
            updateGridIndices(nextIndices);
            setEditorOpen(false);
          }}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default App;
