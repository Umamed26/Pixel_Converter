declare module "gifenc" {
  export interface GifWriteFrameOptions {
    palette: number[][];
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface GifEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, options: GifWriteFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GifEncoder;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: "rgb565" | "rgb444" | "rgba4444" },
  ): number[][];
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: "rgb565" | "rgb444" | "rgba4444",
  ): Uint8Array;
}

declare module "upng-js" {
  interface UpngModule {
    encode(
      imgs: ArrayBuffer[],
      width: number,
      height: number,
      colorCount: number,
      delays?: number[],
    ): ArrayBuffer;
  }
  const UPNG: UpngModule;
  export default UPNG;
}

