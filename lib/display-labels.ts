// lib/display-labels.ts — Re-export hub for all display label utilities
// All pages/components: import from here, never define local label maps
export {
  getRec,
  getRecommendationLabel,
  returnColorClass,
  fmtPct,
  fmtJpy,
  type RecKey,
} from "./rec-config";

export {
  getThemeLabel,
  getLayerLabel,
  getLayerDesc,
} from "./i18n/theme-labels";
