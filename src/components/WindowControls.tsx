// Decorative window chrome controls used by multiple panels.
export function WindowControls() {
  return (
    <span className="win-controls" aria-hidden="true">
      <span className="win-btn win-btn-min">_</span>
      <span className="win-btn win-btn-max">□</span>
      <span className="win-btn win-btn-close">×</span>
    </span>
  );
}
