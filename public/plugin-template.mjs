/**
 * Pixel Workshop external plugin template.
 * 像素工坊外部插件模板。
 *
 * Usage:
 * 1) Save this file locally.
 * 2) Open Pixel Workshop -> Advanced Mode -> Plugins -> Import Plugin.
 * 3) Choose this `.mjs` file.
 */

/**
 * Example plugin definition.
 * 示例插件定义。
 */
const pulseTintPlugin = {
  id: "template.pulse-tint",
  name: "Template Pulse Tint",
  version: "1.0.0",
  author: "You",
  description: "Applies a gentle animated tint on top of current frame.",
  defaultEnabled: true,
  defaultStrength: 100,
  requiresContinuousRender: true,
  /**
   * Called each frame after built-in FX rendering.
   * 在内置特效渲染后每帧调用。
   */
  apply(ctx, canvas, context) {
    const width = canvas.width;
    const height = canvas.height;
    if (width <= 0 || height <= 0) {
      return;
    }
    const strength = Math.max(0, Math.min(200, Number(context.strength ?? 100))) / 100;
    if (strength <= 0) {
      return;
    }
    const phase = (context.timeMs ?? 0) / 700;
    const alpha = 0.04 * strength + 0.03 * Math.sin(phase);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(90, 170, 255, ${Math.max(0, Math.min(0.2, alpha)).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
};

/**
 * Default entry function used by the host importer.
 * 主程序导入时默认调用的入口函数。
 */
export default function setupPlugin(host) {
  if (!host || typeof host.registerPlugin !== "function") {
    throw new Error("PixelWorkshop host API unavailable.");
  }
  host.registerPlugin(pulseTintPlugin);
}

/**
 * Optional named export for direct registration.
 * 可选命名导出，宿主也会尝试读取。
 */
export const plugin = pulseTintPlugin;
