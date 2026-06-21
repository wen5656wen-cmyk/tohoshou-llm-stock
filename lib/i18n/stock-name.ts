import type { Lang } from "./types";

type StockNames = {
  name: string;        // Japanese from J-Quants
  nameZh?: string | null;
  nameEn?: string | null;
};

export function getPrimaryName(s: StockNames, lang: Lang): string {
  if (lang === "zh-CN") return s.nameZh || s.name;
  if (lang === "en-US") return s.nameEn || s.name;
  return s.name; // ja-JP
}

export function getSecondaryName(s: StockNames, lang: Lang): string | null {
  if (lang === "zh-CN") return s.name !== getPrimaryName(s, lang) ? s.name : null;
  if (lang === "en-US") return null; // en shows nothing extra usually
  return null; // ja-JP shows only Japanese
}

export function getNameLines(s: StockNames, lang: Lang): string[] {
  const lines: string[] = [];
  if (lang === "zh-CN") {
    if (s.nameZh) lines.push(s.nameZh);
    if (s.name && s.name !== s.nameZh) lines.push(s.name);
    if (s.nameEn && lines.length < 3) lines.push(s.nameEn);
    if (lines.length === 0) lines.push(s.name);
  } else if (lang === "ja-JP") {
    lines.push(s.name);
    if (s.nameEn) lines.push(s.nameEn);
  } else { // en-US
    if (s.nameEn) {
      lines.push(s.nameEn);
    } else {
      lines.push(s.name);
    }
  }
  return lines;
}
