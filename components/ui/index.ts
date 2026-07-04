// ── TOHOSHOU AI · UI Kit 统一入口 ── P4-T2 ───────────────────────────────────
// 新页面统一从这里导入组件与设计 token：
//   import { AppCard, AppKpiCard, COLORS } from "@/components/ui";
// 禁止在页面内自定义 Card / Badge / Button / Shadow / 颜色。

export * from "./primitives";
export * from "./data";
// 设计 token 转出，一处导入即可拿到组件 + token
export {
  COLORS, STATUS_COLORS, RADIUS, SHADOW, SPACING, FONT, FONT_FAMILY,
  TRANSITION, Z, BORDER, toneColor, retColor,
} from "@/lib/design-tokens";
export type { Tone, StatusKind } from "@/lib/design-tokens";
