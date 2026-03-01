// Project file helpers: parse/create `.pxc`, plus mask snapshot and batch progress utilities.
import type {
  BatchProgress,
  MaskSnapshot,
  PaletteColor,
  ProjectFileV1,
  ProjectStateV1,
} from "../types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPaletteColor(value: unknown): value is PaletteColor {
  return Array.isArray(value)
    && value.length === 3
    && isFiniteNumber(value[0])
    && isFiniteNumber(value[1])
    && isFiniteNumber(value[2]);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const view = bytes.subarray(i, Math.min(bytes.length, i + chunk));
    binary += String.fromCharCode(...view);
  }
  return btoa(binary);
}

function decodeBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return bytes;
  } catch {
    return null;
  }
}

export function createMaskSnapshot(data: Uint8Array, width: number, height: number): MaskSnapshot {
  return {
    width,
    height,
    dataBase64: encodeBase64(data),
  };
}

export function decodeMaskSnapshot(snapshot: MaskSnapshot): Uint8Array | null {
  if (!snapshot || !isFiniteNumber(snapshot.width) || !isFiniteNumber(snapshot.height) || typeof snapshot.dataBase64 !== "string") {
    return null;
  }
  const width = Math.max(0, Math.floor(snapshot.width));
  const height = Math.max(0, Math.floor(snapshot.height));
  const bytes = decodeBase64(snapshot.dataBase64);
  if (!bytes || bytes.length !== width * height) {
    return null;
  }
  return bytes;
}

export function createProjectFile(state: ProjectStateV1): ProjectFileV1 {
  return {
    kind: "pixel-converter-project",
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  };
}

function parsePaletteOverrides(value: unknown): Partial<Record<string, PaletteColor[]>> {
  if (!isObject(value)) {
    return {};
  }
  const next: Partial<Record<string, PaletteColor[]>> = {};
  for (const [key, row] of Object.entries(value)) {
    if (!Array.isArray(row)) {
      continue;
    }
    const colors = row.filter(isPaletteColor).map((color) => [color[0], color[1], color[2]] as PaletteColor);
    if (colors.length > 0) {
      next[key] = colors;
    }
  }
  return next;
}

export function parseProjectFileText(text: string): ProjectFileV1 | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isObject(parsed) || parsed.kind !== "pixel-converter-project" || parsed.version !== 1 || !isObject(parsed.state)) {
      return null;
    }
    const stateRaw = parsed.state;
    if (!isFiniteNumber(stateRaw.pixelSize) || typeof stateRaw.palette !== "string") {
      return null;
    }
    const state = {
      ...stateRaw,
      pixelSize: stateRaw.pixelSize,
      palette: stateRaw.palette,
      paletteOverrides: parsePaletteOverrides(stateRaw.paletteOverrides),
    } as ProjectStateV1;
    return {
      kind: "pixel-converter-project",
      version: 1,
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
      state,
    };
  } catch {
    return null;
  }
}

export function createEmptyBatchProgress(): BatchProgress {
  return {
    total: 0,
    completed: 0,
    failed: 0,
    retries: 0,
    currentFile: "",
    zipProgress: 0,
  };
}
