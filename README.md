# Pixel Workshop

一个独立实现的 `React + TypeScript + Vite` 像素风图像处理工具，支持本地处理与多种导出能力。

## 目录

- `src/config/constants.ts`: 多语言文案、调色板、对话框与状态文案
- `src/config/brand.ts`: 品牌与合规文案配置
- `src/lib/pixelEngine.ts`: 像素化和调色板映射
- `src/lib/renderFrame.ts`: Canvas 渲染、特效、对话框叠加
- `src/hooks/usePixelConverter.ts`: 状态与交互逻辑（上传、拖拽、粘贴、PNG/视频下载、动画）
- `src/App.tsx`: 主界面结构（控制区/预览区/任务栏/图标）
- `src/styles/studio.css`: `Studio` 主题样式与响应式布局

## 运行

```bash
npm install
npm run dev
```

可选环境变量：

```bash
VITE_FLIPBOOK_URL=https://你的-flipbook-地址.example
```

## 合规检查

```bash
npm run compliance:check
```

## 说明

- 本项目为独立实现，不隶属于任何第三方站点或作者。
- 图片和参数处理在浏览器本地完成，不上传到服务器。
