// 桌面图标组件：提供快捷入口。/ Desktop icon component: provides shortcut launchers.
interface DesktopIconsProps {
  t: (key: string) => string;
  onOpenAbout: () => void;
  onOpenDocs: () => void;
  onOpenChangelog: () => void;
}

/**
 * 文档图标。/ Icon for the About/Readme shortcut.
 * @returns SVG 图标节点 / SVG icon node.
 */
function ReadmeIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="7" y="4" width="22" height="28" fill="#fff" />
      <rect x="7" y="4" width="22" height="1" fill="#000" />
      <rect x="7" y="4" width="1" height="28" fill="#000" />
      <rect x="28" y="4" width="1" height="28" fill="#000" />
      <rect x="7" y="31" width="22" height="1" fill="#000" />
      <rect x="22" y="4" width="7" height="6" fill="#c0c0c0" />
      <rect x="10" y="9" width="10" height="1" fill="#808080" />
      <rect x="10" y="12" width="15" height="1" fill="#a0a0a0" />
      <rect x="10" y="15" width="12" height="1" fill="#808080" />
      <rect x="10" y="18" width="14" height="1" fill="#a0a0a0" />
      <rect x="10" y="21" width="10" height="1" fill="#808080" />
    </svg>
  );
}

/**
 * 文档页图标。/ Icon for the docs shortcut.
 * @returns SVG 图标节点 / SVG icon node.
 */
function HomepageIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="4" y="26" width="28" height="4" fill="#808080" />
      <rect x="15" y="7" width="5" height="5" fill="#ffd900" />
      <rect x="7" y="13" width="18" height="13" fill="#008080" />
      <rect x="7" y="13" width="18" height="1" fill="#000" />
      <rect x="7" y="13" width="1" height="13" fill="#000" />
      <rect x="24" y="13" width="1" height="13" fill="#000" />
      <rect x="7" y="25" width="18" height="1" fill="#000" />
      <rect x="11" y="17" width="10" height="6" fill="#1084d0" />
      <line x1="8" y1="24" x2="26" y2="8" stroke="#ffd900" strokeWidth="2" />
    </svg>
  );
}

/**
 * 回收站风格图标。/ Recycle-bin style icon for changelog shortcut.
 * @returns SVG 图标节点 / SVG icon node.
 */
function TrashIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="8" y="9" width="16" height="20" fill="#9f9f9f" />
      <rect x="8" y="9" width="16" height="1" fill="#fff" />
      <rect x="8" y="9" width="1" height="20" fill="#fff" />
      <rect x="23" y="9" width="1" height="20" fill="#666" />
      <rect x="8" y="28" width="16" height="1" fill="#666" />
      <rect x="6" y="6" width="20" height="2" fill="#cfcfcf" />
      <rect x="13" y="4" width="6" height="2" fill="#cfcfcf" />
      <rect x="12" y="12" width="1" height="14" fill="#666" />
      <rect x="16" y="12" width="1" height="14" fill="#666" />
      <rect x="20" y="12" width="1" height="14" fill="#666" />
    </svg>
  );
}

/**
 * 渲染桌面快捷图标区域。/ Render desktop shortcut icon areas.
 * @param props 图标文案与事件回调 / Icon labels and callback handlers.
 * @returns 桌面图标节点 / Desktop icon JSX.
 */
export function DesktopIcons({ t, onOpenAbout, onOpenDocs, onOpenChangelog }: DesktopIconsProps) {
  return (
    <>
      <div className="desktop-icons-top">
        <button className="desktop-icon" type="button" onDoubleClick={onOpenAbout}>
          <ReadmeIcon />
          <span>{t("about")}</span>
        </button>
        <button className="desktop-icon" type="button" onDoubleClick={onOpenDocs}>
          <HomepageIcon />
          <span>{t("docs")}</span>
        </button>
      </div>

      <div className="desktop-icons-bottom">
        <button className="desktop-icon" type="button" onDoubleClick={onOpenChangelog}>
          <TrashIcon />
          <span>{t("changelog")}</span>
        </button>
      </div>
    </>
  );
}
