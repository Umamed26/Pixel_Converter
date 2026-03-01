// 应用主壳层：负责组合桌面 UI、连接交互与状态。/ App shell: composes desktop UI and wires stateful interactions.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function App() {
  const {
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
    animation,
    dialog,
    mask,
    presets,
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
    currentPaletteColors,
    updateCurrentPaletteColor,
    addCurrentPaletteColor,
    removeCurrentPaletteColor,
    resetCurrentPalette,
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
  const [ghostMessageIndex, setGhostMessageIndex] = useState(0);
  const [startPressed, setStartPressed] = useState(false);
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const aboutRef = useRef<HTMLDialogElement>(null);
  const docsRef = useRef<HTMLDialogElement>(null);
  const changelogRef = useRef<HTMLDialogElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const presetInputRef = useRef<HTMLInputElement>(null);
  const isMaskDrawingRef = useRef(false);
  const lastMaskPointRef = useRef<{ x: number; y: number } | null>(null);
  const isLocalhost = window.location.hostname === "localhost";

  const ghostMessages = useMemo(() => GHOST_MESSAGES[lang], [lang]);
  const paletteKeys = Object.keys(lists.palettes) as PaletteId[];

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
    paintMaskStroke(point, point);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [grid, locateMaskPoint, mask.enabled, paintMaskStroke]);

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
    paintMaskStroke(from, point);
    lastMaskPointRef.current = point;
  }, [locateMaskPoint, mask.enabled, paintMaskStroke]);

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
    isMaskDrawingRef.current = false;
    lastMaskPointRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  useEffect(() => {
    if (!mask.enabled) {
      isMaskDrawingRef.current = false;
      lastMaskPointRef.current = null;
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

  return (
    <div className="desktop">
      <DesktopIcons
        t={t}
        onOpenAbout={openAboutWindow}
        onOpenDocs={openDocsWindow}
        onOpenChangelog={openChangelogWindow}
      />

      <img className="desktop-ghost" src={mascotPixelbot} alt="" />

      <main className="window main-shell" aria-label={BRAND.appName}>
        <header className="main-title">
          <span className="main-title__text">{`${BRAND.appName} ${BRAND.versionLabel}`}</span>
          <WindowControls />
        </header>

        <div className="main-menu">
          <span>{t("menuFile")}</span>
          <span>{t("menuEdit")}</span>
          <span>{t("menuView")}</span>
          <span>{t("menuHelp")}</span>
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

                <label className="dialog-toggle perf-toggle">
                  <input
                    type="checkbox"
                    checked={performanceMode}
                    onChange={(event) => setPerformanceMode(event.target.checked)}
                  />
                  <span>{t("performanceMode")}</span>
                </label>

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
                </div>
              </div>
            </section>

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
                  <button
                    type="button"
                    className="retro-btn btn-mini"
                    onClick={onPickBatchFiles}
                    disabled={isRecording || isBatchProcessing}
                  >
                    {isBatchProcessing ? t("batchProcessing") : t("batchZip")}
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
                </div>
                <div className="batch-panel">
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
