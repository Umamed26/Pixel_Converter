// 任务栏组件：开始菜单、窗口分组按钮与托盘区。/ Taskbar component: start menu, grouped windows, and tray controls.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "../types";

export interface TaskWindowItem {
  id: string;
  label: string;
  open: boolean;
  onToggle: () => void;
}

export interface StartMenuAction {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}

interface TaskbarProps {
  t: (key: string) => string;
  startPressed: boolean;
  startMenuOpen: boolean;
  onPressStart: () => void;
  onCloseStartMenu: () => void;
  appName: string;
  versionLabel: string;
  mascotName: string;
  windowItems: TaskWindowItem[];
  startPinnedActions: StartMenuAction[];
  startSystemActions: StartMenuAction[];
  isLocalhost: boolean;
  hasGrid: boolean;
  onExportJson: () => void;
  onOpenJsonImport: () => void;
  onExportProject: () => void;
  onOpenProjectImport: () => void;
  lang: Lang;
  setLang: (lang: Lang) => void;
  languages: Array<{ value: Lang; label: string }>;
  onOpenFlipbook: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  clock: string;
}

export function Taskbar({
  t,
  startPressed,
  startMenuOpen,
  onPressStart,
  onCloseStartMenu,
  appName,
  versionLabel,
  mascotName,
  windowItems,
  startPinnedActions,
  startSystemActions,
  isLocalhost,
  hasGrid,
  onExportJson,
  onOpenJsonImport,
  onExportProject,
  onOpenProjectImport,
  lang,
  setLang,
  languages,
  onOpenFlipbook,
  soundOn,
  onToggleSound,
  clock,
}: TaskbarProps) {
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [minimizingIds, setMinimizingIds] = useState<string[]>([]);
  const minimizeTimersRef = useRef<Record<string, number>>({});

  const openWindowItems = useMemo(() => {
    return windowItems.filter((item) => item.open);
  }, [windowItems]);

  const isGrouped = openWindowItems.length > 2;
  const visibleWindowItems = isGrouped ? openWindowItems.slice(0, 2) : openWindowItems;

  useEffect(() => {
    if (!isGrouped) {
      setGroupMenuOpen(false);
    }
  }, [isGrouped]);

  useEffect(() => {
    if (startMenuOpen) {
      setGroupMenuOpen(false);
    }
  }, [startMenuOpen]);

  useEffect(() => {
    return () => {
      const timers = Object.values(minimizeTimersRef.current);
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      minimizeTimersRef.current = {};
    };
  }, []);

  /**
   * 从任务栏切换窗口状态，并在最小化时播放过渡动画。/ Toggle a window from taskbar with minimize transition.
   * @param item 窗口项 / Target window item.
   * @returns 无返回值 / No return value.
   */
  const toggleWindowFromTaskbar = (item: TaskWindowItem) => {
    onCloseStartMenu();
    setGroupMenuOpen(false);
    if (!item.open) {
      item.onToggle();
      return;
    }

    setMinimizingIds((previous) => {
      if (previous.includes(item.id)) {
        return previous;
      }
      const existingTimer = minimizeTimersRef.current[item.id];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      const timeoutId = window.setTimeout(() => {
        item.onToggle();
        setMinimizingIds((current) => current.filter((entry) => entry !== item.id));
        delete minimizeTimersRef.current[item.id];
      }, 190);
      minimizeTimersRef.current[item.id] = timeoutId;
      return [...previous, item.id];
    });
  };

  /**
   * 执行开始菜单动作并关闭菜单。/ Run a start-menu action then close menus.
   * @param action 菜单动作 / Start menu action.
   * @returns 无返回值 / No return value.
   */
  const runStartAction = (action: StartMenuAction) => {
    if (action.disabled) {
      return;
    }
    action.onClick();
    onCloseStartMenu();
    setGroupMenuOpen(false);
  };

  const startBadge = useMemo(() => {
    return appName.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "PW";
  }, [appName]);

  /**
   * 渲染任务栏主体。/ Render taskbar shell.
   * @returns 任务栏 JSX / Taskbar JSX.
   */
  return (
    <footer className="taskbar">
      <button
        type="button"
        className={`task-btn task-start ${startPressed ? "is-active" : ""}`}
        onClick={() => {
          onPressStart();
          setGroupMenuOpen(false);
        }}
      >
        <span className="task-icon task-start-logo" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span>{t("start")}</span>
      </button>

      {startMenuOpen ? (
        <section className="xp-start-menu" role="menu" onClick={(event) => event.stopPropagation()}>
          <header className="xp-start-user">
            <span className="xp-start-avatar">{startBadge}</span>
            <span className="xp-start-user-meta">
              <strong>{appName}</strong>
              <small>{`${versionLabel} · ${mascotName}`}</small>
            </span>
          </header>
          <div className="xp-start-body">
            <section className="xp-start-col">
              <h4>{t("startPinned")}</h4>
              {startPinnedActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="start-action"
                  disabled={action.disabled}
                  onClick={() => runStartAction(action)}
                >
                  <span>{action.label}</span>
                  {action.hint ? <small>{action.hint}</small> : null}
                </button>
              ))}
            </section>
            <section className="xp-start-col xp-start-col-system">
              <h4>{t("startSystem")}</h4>
              {startSystemActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="start-action start-action-system"
                  disabled={action.disabled}
                  onClick={() => runStartAction(action)}
                >
                  <span>{action.label}</span>
                  {action.hint ? <small>{action.hint}</small> : null}
                </button>
              ))}
            </section>
          </div>
        </section>
      ) : null}

      <div className="task-windows">
        {visibleWindowItems.length > 0 ? (
          visibleWindowItems.map((item) => {
            const isMinimizing = minimizingIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={`task-btn task-window ${item.open ? "is-active" : ""} ${isMinimizing ? "is-minimizing" : ""}`}
                disabled={isMinimizing}
                onClick={() => toggleWindowFromTaskbar(item)}
                title={item.label}
              >
                <span>{item.label}</span>
              </button>
            );
          })
        ) : (
          <span className="task-empty">{t("taskNoWindow")}</span>
        )}

        {isGrouped ? (
          <div className="task-group-wrap">
            <button
              type="button"
              className={`task-btn task-window task-group-btn ${groupMenuOpen ? "is-active" : ""}`}
              onClick={() => setGroupMenuOpen((value) => !value)}
              title={t("taskWindows")}
            >
              <span>{`${t("taskWindows")} (${openWindowItems.length})`}</span>
            </button>
            {groupMenuOpen ? (
              <div className="task-group-menu">
                {openWindowItems.map((item) => {
                  const isMinimizing = minimizingIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`task-group-item ${isMinimizing ? "is-minimizing" : ""}`}
                      disabled={isMinimizing}
                      onClick={() => toggleWindowFromTaskbar(item)}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {isLocalhost ? (
        <>
          <button type="button" className="task-btn" onClick={onExportJson} disabled={!hasGrid}>
            <span>↓JSON</span>
          </button>
          <button type="button" className="task-btn" onClick={onOpenJsonImport}>
            <span>↑JSON</span>
          </button>
        </>
      ) : null}

      <button type="button" className="task-btn" onClick={onExportProject}>
        <span>{t("projectExport")}</span>
      </button>
      <button type="button" className="task-btn" onClick={onOpenProjectImport}>
        <span>{t("projectImport")}</span>
      </button>
      <label className="task-lang">
        <span>🌐</span>
        <select value={lang} onChange={(event) => setLang(event.target.value as Lang)}>
          {languages.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="task-btn" onClick={onOpenFlipbook} disabled={!hasGrid}>
        <span>{t("taskFlipbook")}</span>
      </button>
      <div className="task-spacer" />
      <div className="task-tray">
        <button
          type="button"
          className="task-sound"
          onClick={onToggleSound}
          aria-label={soundOn ? "sound on" : "sound off"}
        >
          {soundOn ? "🔊" : "🔇"}
        </button>
        <span className="task-clock">{clock}</span>
      </div>
    </footer>
  );
}
