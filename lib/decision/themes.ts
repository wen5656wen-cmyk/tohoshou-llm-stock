// ── 主题动能 SSOT（P13-DECISION-08 治理）─────────────────────────────────────
// 「热点主题 / 主题动能」= 成分股 5日/20日涨幅均值（真实价格，非资金流）的唯一派生来源。
// 取代 Today / Dashboard / Cockpit 各自复制的 momentum/hotThemes 计算。
import { getThemeLabel } from "../i18n/theme-labels";
import type { Lang } from "../i18n/types";

export interface ThemeStock { symbol: string; theme: string; return5d: number | null; return20d?: number | null; scored: boolean }
export interface ThemeSummary { theme: string }
export interface ThemeMomentum { theme: string; label: string; count: number; r5: number | null; r20: number | null }

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** 全部主题按 5 日动能降序；仅计入已评分且有 r5 的成分股。调用方按需 slice。 */
export function themeMomentum(stocks: ThemeStock[], themes: ThemeSummary[], lang: Lang): ThemeMomentum[] {
  return themes
    .map((x) => {
      const g = stocks.filter((s) => s.theme === x.theme && s.scored);
      return {
        theme: x.theme,
        label: getThemeLabel(x.theme, lang),
        count: g.length,
        r5: avg(g.map((s) => s.return5d).filter((v): v is number => v != null)),
        r20: avg(g.map((s) => s.return20d).filter((v): v is number => v != null)),
      };
    })
    .filter((x) => x.count > 0 && x.r5 != null)
    .sort((a, b) => (b.r5 ?? 0) - (a.r5 ?? 0));
}
