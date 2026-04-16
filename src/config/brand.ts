// 品牌配置：集中管理产品命名与合规文案。/ Brand config: centralized naming and legal/inspiration copy.
export interface BrandConfig {
  appName: string;
  versionLabel: string;
  mascotName: string;
  inspirationNote: string;
  affiliationDisclaimer: string;
}

export const BRAND: BrandConfig = {
  appName: "Pixel Workshop",
  versionLabel: "v2.0",
  mascotName: "Pixel Bot",
  inspirationNote: "Inspired by public pixel-art tools.",
  affiliationDisclaimer: "This project is independently implemented and not affiliated with any original website or author.",
};
