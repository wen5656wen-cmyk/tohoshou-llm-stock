import type { Lang } from "./types";

type StockNames = {
  name: string;        // Japanese from J-Quants
  nameZh?: string | null;
  nameEn?: string | null;
};

export function getPrimaryName(s: StockNames, lang: Lang): string {
  if (lang === "zh-CN") return s.nameZh || s.name;
  return s.name; // ja-JP
}

export function getSecondaryName(s: StockNames, lang: Lang): string | null {
  if (lang === "zh-CN") return s.name !== getPrimaryName(s, lang) ? s.name : null;
  return null; // ja-JP shows only Japanese
}

export function getNameLines(s: StockNames, lang: Lang): string[] {
  const lines: string[] = [];
  if (lang === "zh-CN") {
    if (s.nameZh) lines.push(s.nameZh);
    if (s.name && s.name !== s.nameZh) lines.push(s.name);
    if (s.nameEn && lines.length < 3) lines.push(s.nameEn);
    if (lines.length === 0) lines.push(s.name);
  } else { // ja-JP
    lines.push(s.name);
    if (s.nameEn) lines.push(s.nameEn);
  }
  return lines;
}
