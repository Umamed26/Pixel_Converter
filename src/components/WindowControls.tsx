// 窗口控制装饰组件：统一最小化/最大化/关闭外观。/ Window control chrome: shared min/max/close visuals.
/**
 * 渲染统一窗口控制按钮组。/ Render shared window control button group.
 * @returns 窗口控制节点 / Window control JSX.
 */
export function WindowControls() {
  return (
    <span className="win-controls" aria-hidden="true">
      <span className="win-btn win-btn-min">_</span>
      <span className="win-btn win-btn-max">□</span>
      <span className="win-btn win-btn-close">×</span>
    </span>
  );
}
