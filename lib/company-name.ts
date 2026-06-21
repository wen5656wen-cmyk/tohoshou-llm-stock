import type { Lang } from "@/lib/i18n/types";

export type StockNames = {
  name: string;       // Japanese (from J-Quants — always present)
  nameZh?: string | null;
  nameEn?: string | null;
};

/**
 * Locale-aware primary display name.
 * zh-CN: nameZh → name   (never bare English)
 * ja-JP: name            (never nameZh — avoids mixed strings like "Nikkato精细陶瓷")
 * en-US: nameEn → name   (never nameZh)
 */
export function getPrimaryName(s: StockNames, lang: Lang): string {
  if (lang === "zh-CN") return s.nameZh || s.name;
  if (lang === "en-US") return s.nameEn || s.name;
  return s.name; // ja-JP
}

/**
 * Secondary line shown below the primary name, or null if nothing to add.
 * zh-CN: Japanese name (if different from primary)
 * ja-JP: English name (if available and different)
 * en-US: null — one line is enough; never show Chinese/Japanese secondary
 */
export function getSecondaryName(s: StockNames, lang: Lang): string | null {
  if (lang === "zh-CN") {
    return s.name && s.name !== getPrimaryName(s, lang) ? s.name : null;
  }
  if (lang === "en-US") return null;
  // ja-JP: show English if available
  return s.nameEn && s.nameEn !== s.name ? s.nameEn : null;
}

/**
 * Tertiary line (3rd row), or null.
 * Only used in zh-CN expanded views where both Japanese and English secondary names exist.
 */
export function getTertiaryName(s: StockNames, lang: Lang): string | null {
  if (lang !== "zh-CN") return null;
  const primary = getPrimaryName(s, lang);
  const secondary = getSecondaryName(s, lang);
  if (s.nameEn && s.nameEn !== primary && s.nameEn !== secondary) return s.nameEn;
  return null;
}
