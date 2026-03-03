// 像素编辑器弹窗：支持绘制、缩放与撤销重做。/ Pixel editor modal: supports paint, zoom, undo, and redo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PixelGrid } from "../types";

type EditorTool = "pen" | "eraser" | "fill" | "line" | "rect";
type SymmetryMode = "none" | "vertical" | "horizontal" | "quad";

const ZOOM_STEPS = [1, 2, 4, 8, 16, 24, 32] as const;

/**
 * 限制数值区间。/ Clamp a value into range.
 * @param value 输入值 / Input value.
 * @param min 最小值 / Lower bound.
 * @param max 最大值 / Upper bound.
 * @returns 限制后的值 / Clamped result.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 复制索引数组。/ Clone pixel index buffer.
 * @param indices 源索引 / Source indices.
 * @returns 新副本 / New copy.
 */
function copyIndices(indices: Uint16Array): Uint16Array {
  return new Uint16Array(indices);
}

/**
 * 在索引网格上画线。/ Draw a line on the index grid.
 * @param data 索引数据 / Index buffer.
 * @param width 网格宽度 / Grid width.
 * @param height 网格高度 / Grid height.
 * @param x0 起点 X / Start X.
 * @param y0 起点 Y / Start Y.
 * @param x1 终点 X / End X.
 * @param y1 终点 Y / End Y.
 * @param colorIndex 颜色索引 / Color index.
 * @returns 无返回值 / No return value.
 */
function applySymmetricPixel(
  data: Uint16Array,
  width: number,
  height: number,
  x: number,
  y: number,
  colorIndex: number,
  symmetry: SymmetryMode,
): void {
  const points: Array<[number, number]> = [[x, y]];
  if (symmetry === "vertical" || symmetry === "quad") {
    points.push([width - 1 - x, y]);
  }
  if (symmetry === "horizontal" || symmetry === "quad") {
    points.push([x, height - 1 - y]);
  }
  if (symmetry === "quad") {
    points.push([width - 1 - x, height - 1 - y]);
  }

  const seen = new Set<string>();
  for (const [px, py] of points) {
    if (px < 0 || px >= width || py < 0 || py >= height) {
      continue;
    }
    const key = `${px},${py}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    data[py * width + px] = colorIndex;
  }
}

/**
 * 在索引网格上画线。/ Draw a line on the index grid.
 * @param data 索引数据 / Index buffer.
 * @param width 网格宽度 / Grid width.
 * @param height 网格高度 / Grid height.
 * @param x0 起点 X / Start X.
 * @param y0 起点 Y / Start Y.
 * @param x1 终点 X / End X.
 * @param y1 终点 Y / End Y.
 * @param colorIndex 颜色索引 / Color index.
 * @param symmetry 对称模式 / Symmetry mode.
 * @returns 无返回值 / No return value.
 */
function drawLine(
  data: Uint16Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  colorIndex: number,
  symmetry: SymmetryMode,
): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (true) {
    applySymmetricPixel(data, width, height, x, y, colorIndex, symmetry);
    if (x === x1 && y === y1) {
      break;
    }
    const e2 = err * 2;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * 在索引网格上绘制矩形边框。/ Draw a rectangle outline on index grid.
 * @param data 索引数据 / Index buffer.
 * @param width 网格宽度 / Grid width.
 * @param height 网格高度 / Grid height.
 * @param x0 起点 X / Start X.
 * @param y0 起点 Y / Start Y.
 * @param x1 终点 X / End X.
 * @param y1 终点 Y / End Y.
 * @param colorIndex 颜色索引 / Color index.
 * @param symmetry 对称模式 / Symmetry mode.
 * @returns 无返回值 / No return value.
 */
function drawRectOutline(
  data: Uint16Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  colorIndex: number,
  symmetry: SymmetryMode,
): void {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  for (let x = minX; x <= maxX; x += 1) {
    applySymmetricPixel(data, width, height, x, minY, colorIndex, symmetry);
    applySymmetricPixel(data, width, height, x, maxY, colorIndex, symmetry);
  }
  for (let y = minY; y <= maxY; y += 1) {
    applySymmetricPixel(data, width, height, minX, y, colorIndex, symmetry);
    applySymmetricPixel(data, width, height, maxX, y, colorIndex, symmetry);
  }
}

/**
 * 从起点执行连通域填充。/ Flood-fill connected area from a start cell.
 * @param data 索引数据 / Index buffer.
 * @param width 网格宽度 / Grid width.
 * @param height 网格高度 / Grid height.
 * @param startX 起点 X / Start X.
 * @param startY 起点 Y / Start Y.
 * @param colorIndex 填充颜色索引 / Fill color index.
 * @returns 无返回值 / No return value.
 */
function floodFill(
  data: Uint16Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  colorIndex: number,
): void {
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return;
  }
  const startPos = startY * width + startX;
  const targetColor = data[startPos];
  if (targetColor === colorIndex) {
    return;
  }

  const stack: Array<[number, number]> = [[startX, startY]];
  const visited = new Uint8Array(width * height);
  visited[startPos] = 1;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      break;
    }
    const [x, y] = current;
    const idx = y * width + x;
    data[idx] = colorIndex;

    const neighbors: Array<[number, number]> = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
        continue;
      }
      const nIdx = ny * width + nx;
      if (!visited[nIdx] && data[nIdx] === targetColor) {
        visited[nIdx] = 1;
        stack.push([nx, ny]);
      }
    }
  }
}

interface PixelEditorModalProps {
  grid: PixelGrid;
  onSave: (indices: Uint16Array) => void;
  onClose: () => void;
  t: (key: string) => string;
}

/**
 * 像素编辑器弹窗主组件。/ Main pixel editor modal component.
 * @param props 网格数据、保存与关闭回调、翻译函数 / Grid data, callbacks, and i18n accessor.
 * @returns 编辑器弹窗 JSX / Editor modal JSX.
 */
export function PixelEditorModal({ grid, onSave, onClose, t }: PixelEditorModalProps) {
  const [indices, setIndices] = useState(() => copyIndices(grid.indices));
  const [tool, setTool] = useState<EditorTool>("pen");
  const [symmetry, setSymmetry] = useState<SymmetryMode>("none");
  const [showGrid, setShowGrid] = useState(true);
  const [colorIndex, setColorIndex] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(3);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState(false);
  const [shapePreview, setShapePreview] = useState<{
    tool: "line" | "rect";
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastCellRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const drawingRef = useRef(false);
  const undoRef = useRef<Uint16Array[]>([]);
  const redoRef = useRef<Uint16Array[]>([]);
  const zoomIndexRef = useRef(zoomIndex);
  const offsetRef = useRef(offset);

  zoomIndexRef.current = zoomIndex;
  offsetRef.current = offset;

  const zoom = ZOOM_STEPS[zoomIndex];
  const canUndo = undoRef.current.length > 0;
  const canRedo = redoRef.current.length > 0;

  useEffect(() => {
    setIndices(copyIndices(grid.indices));
    setColorIndex(0);
    setShapePreview(null);
    undoRef.current = [];
    redoRef.current = [];
  }, [grid]);

  useEffect(() => {
    const view = viewportRef.current;
    if (!view) {
      return;
    }
    const rect = view.getBoundingClientRect();
    const unit = ZOOM_STEPS[zoomIndexRef.current];
    setOffset({
      x: (rect.width - grid.width * unit) / 2,
      y: (rect.height - grid.height * unit) / 2,
    });
  }, [grid.width, grid.height]);

  const pushUndo = useCallback(() => {
    undoRef.current.push(copyIndices(indices));
    if (undoRef.current.length > 40) {
      undoRef.current.shift();
    }
    redoRef.current = [];
  }, [indices]);

  const undo = useCallback(() => {
    if (undoRef.current.length === 0) {
      return;
    }
    const previous = undoRef.current.pop();
    if (!previous) {
      return;
    }
    redoRef.current.push(copyIndices(indices));
    setIndices(previous);
  }, [indices]);

  const redo = useCallback(() => {
    if (redoRef.current.length === 0) {
      return;
    }
    const next = redoRef.current.pop();
    if (!next) {
      return;
    }
    undoRef.current.push(copyIndices(indices));
    setIndices(next);
  }, [indices]);

  const locateCell = useCallback((clientX: number, clientY: number) => {
    const view = viewportRef.current;
    if (!view) {
      return null;
    }
    const rect = view.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left - offsetRef.current.x) / ZOOM_STEPS[zoomIndexRef.current]);
    const y = Math.floor((clientY - rect.top - offsetRef.current.y) / ZOOM_STEPS[zoomIndexRef.current]);
    return { x, y };
  }, []);

  const setPixelLine = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const nextColor = tool === "eraser" ? 0 : colorIndex;
    setIndices((previous) => {
      const next = copyIndices(previous);
      drawLine(next, grid.width, grid.height, from.x, from.y, to.x, to.y, nextColor, symmetry);
      return next;
    });
  }, [colorIndex, grid.height, grid.width, symmetry, tool]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button === 1 || (event.button === 0 && spacePressed)) {
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        offsetX: offsetRef.current.x,
        offsetY: offsetRef.current.y,
      };
      return;
    }

    const cell = locateCell(event.clientX, event.clientY);
    if (!cell) {
      return;
    }

    if (event.button === 2) {
      if (cell.x >= 0 && cell.x < grid.width && cell.y >= 0 && cell.y < grid.height) {
        const picked = indices[cell.y * grid.width + cell.x] ?? 0;
        setColorIndex(picked);
        setTool("pen");
      }
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (tool === "fill") {
      if (cell.x < 0 || cell.x >= grid.width || cell.y < 0 || cell.y >= grid.height) {
        return;
      }
      pushUndo();
      const next = copyIndices(indices);
      floodFill(next, grid.width, grid.height, cell.x, cell.y, colorIndex);
      setIndices(next);
      return;
    }

    if (tool === "line" || tool === "rect") {
      if (cell.x < 0 || cell.x >= grid.width || cell.y < 0 || cell.y >= grid.height) {
        return;
      }
      const anchor = { x: cell.x, y: cell.y };
      pushUndo();
      drawingRef.current = true;
      lastCellRef.current = anchor;
      setShapePreview({
        tool,
        start: anchor,
        end: anchor,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    pushUndo();
    drawingRef.current = true;
    lastCellRef.current = cell;
    setPixelLine(cell, cell);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [spacePressed, locateCell, grid.width, grid.height, indices, tool, pushUndo, colorIndex, setPixelLine]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (panStartRef.current) {
      const dx = event.clientX - panStartRef.current.x;
      const dy = event.clientY - panStartRef.current.y;
      setOffset({
        x: panStartRef.current.offsetX + dx,
        y: panStartRef.current.offsetY + dy,
      });
      return;
    }

    if (!drawingRef.current) {
      return;
    }

    const cell = locateCell(event.clientX, event.clientY);
    if (!cell) {
      return;
    }

    if (shapePreview) {
      const clampedCell = {
        x: clamp(cell.x, 0, grid.width - 1),
        y: clamp(cell.y, 0, grid.height - 1),
      };
      setShapePreview((previous) => {
        if (!previous) {
          return previous;
        }
        if (previous.end.x === clampedCell.x && previous.end.y === clampedCell.y) {
          return previous;
        }
        return {
          ...previous,
          end: clampedCell,
        };
      });
      return;
    }

    if (cell.x < 0 || cell.x >= grid.width || cell.y < 0 || cell.y >= grid.height) {
      return;
    }
    const previous = lastCellRef.current;
    if (!previous) {
      lastCellRef.current = cell;
      return;
    }
    if (previous.x === cell.x && previous.y === cell.y) {
      return;
    }
    setPixelLine(previous, cell);
    lastCellRef.current = cell;
  }, [grid.height, grid.width, locateCell, setPixelLine, shapePreview]);

  const endPointer = useCallback(() => {
    if (shapePreview) {
      const nextColor = colorIndex;
      setIndices((previous) => {
        const next = copyIndices(previous);
        if (shapePreview.tool === "line") {
          drawLine(
            next,
            grid.width,
            grid.height,
            shapePreview.start.x,
            shapePreview.start.y,
            shapePreview.end.x,
            shapePreview.end.y,
            nextColor,
            symmetry,
          );
        } else {
          drawRectOutline(
            next,
            grid.width,
            grid.height,
            shapePreview.start.x,
            shapePreview.start.y,
            shapePreview.end.x,
            shapePreview.end.y,
            nextColor,
            symmetry,
          );
        }
        return next;
      });
      setShapePreview(null);
    }
    panStartRef.current = null;
    drawingRef.current = false;
    lastCellRef.current = null;
  }, [colorIndex, grid.height, grid.width, shapePreview, symmetry]);

  const onWheel = useCallback((event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const view = viewportRef.current;
    if (!view) {
      return;
    }

    const currentIndex = zoomIndexRef.current;
    const nextIndex = clamp(currentIndex + (event.deltaY < 0 ? 1 : -1), 0, ZOOM_STEPS.length - 1);
    if (nextIndex === currentIndex) {
      return;
    }

    const rect = view.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const currentZoom = ZOOM_STEPS[currentIndex];
    const nextZoom = ZOOM_STEPS[nextIndex];

    const nextOffset = {
      x: pointerX - ((pointerX - offsetRef.current.x) / currentZoom) * nextZoom,
      y: pointerY - ((pointerY - offsetRef.current.y) / currentZoom) * nextZoom,
    };

    setZoomIndex(nextIndex);
    setOffset(nextOffset);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        setSpacePressed(true);
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "b") {
          setTool("pen");
          return;
        }
        if (key === "e") {
          setTool("eraser");
          return;
        }
        if (key === "f") {
          setTool("fill");
          return;
        }
        if (key === "l") {
          setTool("line");
          return;
        }
        if (key === "r") {
          setTool("rect");
          return;
        }
        if (key === "g") {
          setShowGrid((previous) => !previous);
          return;
        }
      }
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))) {
        event.preventDefault();
        redo();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") {
        setSpacePressed(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [onClose, redo, undo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, rect.width, rect.height);

    const unit = zoom;
    const left = offset.x;
    const top = offset.y;

    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const px = left + x * unit;
        const py = top + y * unit;
        if (px + unit < 0 || py + unit < 0 || px > rect.width || py > rect.height) {
          continue;
        }

        const isEven = (x + y) % 2 === 0;
        ctx.fillStyle = isEven ? "#c0c0c0" : "#a0a0a0";
        ctx.fillRect(px, py, unit, unit);

        const color = grid.colors[indices[y * grid.width + x]];
        if (color) {
          ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
          ctx.fillRect(px, py, unit, unit);
        }
      }
    }

    if (showGrid && unit >= 4) {
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= grid.width; x += 1) {
        const gx = Math.round(left + x * unit) + 0.5;
        ctx.moveTo(gx, top);
        ctx.lineTo(gx, top + grid.height * unit);
      }
      for (let y = 0; y <= grid.height; y += 1) {
        const gy = Math.round(top + y * unit) + 0.5;
        ctx.moveTo(left, gy);
        ctx.lineTo(left + grid.width * unit, gy);
      }
      ctx.stroke();
    }

    if (shapePreview) {
      const transforms: Array<(x: number, y: number) => { x: number; y: number }> = [
        (x, y) => ({ x, y }),
      ];
      if (symmetry === "vertical" || symmetry === "quad") {
        transforms.push((x, y) => ({ x: grid.width - 1 - x, y }));
      }
      if (symmetry === "horizontal" || symmetry === "quad") {
        transforms.push((x, y) => ({ x, y: grid.height - 1 - y }));
      }
      if (symmetry === "quad") {
        transforms.push((x, y) => ({ x: grid.width - 1 - x, y: grid.height - 1 - y }));
      }

      const unique = new Set<string>();
      ctx.strokeStyle = "rgba(0, 255, 255, 0.9)";
      ctx.lineWidth = Math.max(1, Math.round(unit / 8));
      for (const transform of transforms) {
        const start = transform(shapePreview.start.x, shapePreview.start.y);
        const end = transform(shapePreview.end.x, shapePreview.end.y);
        const key = `${start.x},${start.y}|${end.x},${end.y}|${shapePreview.tool}`;
        if (unique.has(key)) {
          continue;
        }
        unique.add(key);
        if (shapePreview.tool === "line") {
          ctx.beginPath();
          ctx.moveTo(left + (start.x + 0.5) * unit, top + (start.y + 0.5) * unit);
          ctx.lineTo(left + (end.x + 0.5) * unit, top + (end.y + 0.5) * unit);
          ctx.stroke();
        } else {
          const minX = Math.min(start.x, end.x);
          const minY = Math.min(start.y, end.y);
          const maxX = Math.max(start.x, end.x);
          const maxY = Math.max(start.y, end.y);
          ctx.strokeRect(
            left + minX * unit + 0.5,
            top + minY * unit + 0.5,
            (maxX - minX + 1) * unit - 1,
            (maxY - minY + 1) * unit - 1,
          );
        }
      }
    }

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.round(left) - 0.5,
      Math.round(top) - 0.5,
      grid.width * unit + 1,
      grid.height * unit + 1,
    );
  }, [grid.colors, grid.height, grid.width, indices, offset.x, offset.y, shapePreview, showGrid, symmetry, zoom]);

  const toolButtons = useMemo(() => {
    const items: Array<{ id: EditorTool; label: string }> = [
      { id: "pen", label: t("pen") },
      { id: "eraser", label: t("eraser") },
      { id: "fill", label: t("fill") },
      { id: "line", label: t("line") },
      { id: "rect", label: t("rect") },
    ];
    return items.map((item) => (
      <button
        key={item.id}
        type="button"
        className={`retro-btn btn-mini ${tool === item.id ? "is-active" : ""}`}
        onClick={() => setTool(item.id)}
      >
        {item.label}
      </button>
    ));
  }, [t, tool]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="editor-overlay"
      onClick={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <section className="window editor-window">
        <header className="main-title">
          <span className="main-title__text">{t("edit")}</span>
          <button type="button" className="retro-btn btn-mini" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="editor-toolbar">
          <div className="editor-tools">{toolButtons}</div>
          <button type="button" className="retro-btn btn-mini" onClick={undo} disabled={!canUndo}>
            {t("editorUndo")}
          </button>
          <button type="button" className="retro-btn btn-mini" onClick={redo} disabled={!canRedo}>
            {t("editorRedo")}
          </button>
          <button
            type="button"
            className="retro-btn btn-mini"
            onClick={() => setZoomIndex((current) => clamp(current - 1, 0, ZOOM_STEPS.length - 1))}
            disabled={zoomIndex <= 0}
          >
            -
          </button>
          <button
            type="button"
            className="retro-btn btn-mini"
            onClick={() => setZoomIndex((current) => clamp(current + 1, 0, ZOOM_STEPS.length - 1))}
            disabled={zoomIndex >= ZOOM_STEPS.length - 1}
          >
            +
          </button>
          <button
            type="button"
            className={`retro-btn btn-mini ${showGrid ? "is-active" : ""}`}
            onClick={() => setShowGrid((previous) => !previous)}
          >
            {t("editorGrid")}
          </button>
          <label className="editor-symmetry">
            <span>{t("editorSymmetry")}</span>
            <select
              value={symmetry}
              onChange={(event) => setSymmetry(event.target.value as SymmetryMode)}
            >
              <option value="none">{t("symNone")}</option>
              <option value="vertical">{t("symVertical")}</option>
              <option value="horizontal">{t("symHorizontal")}</option>
              <option value="quad">{t("symQuad")}</option>
            </select>
          </label>
          <span className="editor-zoom">{grid.width}x{grid.height} | x{zoom}</span>
        </div>

        <div ref={viewportRef} className="editor-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="editor-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onContextMenu={(event) => event.preventDefault()}
            onWheel={onWheel}
          />
        </div>

        <div className="editor-palette">
          {grid.colors.map((color, index) => (
            <button
              key={`${color[0]}-${color[1]}-${color[2]}-${index}`}
              type="button"
              className={`editor-color ${colorIndex === index ? "is-active" : ""}`}
              style={{ background: `rgb(${color[0]},${color[1]},${color[2]})` }}
              onClick={() => {
                setColorIndex(index);
                setTool("pen");
              }}
            />
          ))}
        </div>

        <footer className="editor-footer">
          <span>{t("editorHintPc")}</span>
          <div className="editor-actions">
            <button
              type="button"
              className="retro-btn btn-mini"
              onClick={() => onSave(copyIndices(indices))}
            >
              {t("editorSave")}
            </button>
            <button type="button" className="retro-btn btn-mini" onClick={onClose}>
              {t("editorCancel")}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
