"use client";

// ── 研究区统一页面骨架（P21-T5-3）────────────────────────────────────────────
//
// 已批准的四段式：① 口径条(As Of) → ② 结论卡(Summary) → ③ 主内容 → ④ 边界声明。
//
// 为什么需要它：改造前研究区 16 个组件各写各的页头，共存 5 种时间口径
//   （浏览器 UTC 切片 / toLocaleString("zh-CN") 浏览器时区 / 手动 +9h /
//    API 原始字符串 / 正确的 Intl Asia/Tokyo），且全部零 i18n。
//   本组件把「时间怎么显示」「结论放哪」「边界怎么写」收敛到一处。
//
// ⚠️ 时间一律走 common.asOf.*，禁止组件自拼「更新 / 数据锚点 / last update」。
// ⚠️ 影子模型 / 回测类页面必须给 scope，声明「不参与实盘决策」，避免被当成操作建议。

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/lib/decision/ds";

/** 统一 JST 时间显示。无效值返回 null（由调用方回退），绝不抛错。 */
export function fmtAsOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d).replace(",", "");
}

/** ① 口径条：数据截至 + 来源 + 可选刷新。研究区所有页面统一用它显示时间。 */
export function AsOfBar({ asOf, source, onRefresh, refreshing }: {
  asOf?: string | null;
  source?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const { t } = useI18n();
  const shown = fmtAsOf(asOf);
  return (
    <div className="flex items-center gap-2 flex-wrap text-[11px] mb-3 px-3 py-1.5 rounded-lg"
      style={{ background: COLORS.tile, color: COLORS.textFaint }}>
      <span>ⓘ {t("common.asOf.data")}</span>
      <b className="tabular-nums" style={{ color: COLORS.textSecondary }}>
        {shown ? `${shown} JST` : t("common.no_data")}
      </b>
      {source ? <span>· {source}</span> : null}
      {onRefresh ? (
        <button onClick={onRefresh} disabled={refreshing} className="ml-auto disabled:opacity-50"
          style={{ color: COLORS.primary, background: "none", border: "none", cursor: "pointer" }}>
          {refreshing ? t("common.loading") : t("common.refresh")}
        </button>
      ) : null}
    </div>
  );
}

/** ② 结论卡：先给判断，再给数据。研究页最忌一上来就是 3000 行表格。 */
export function SummaryCard({ headline, items, tone = "neutral" }: {
  headline: string;
  items?: { label: string; value: ReactNode }[];
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const bar = tone === "green" ? COLORS.success : tone === "amber" ? COLORS.warning : tone === "red" ? COLORS.danger : COLORS.primary;
  return (
    <div className="rounded-xl mb-3 px-4 py-3" style={{ background: COLORS.card, borderLeft: `3px solid ${bar}`, border: `1px solid ${COLORS.border}`, borderLeftWidth: 3, borderLeftColor: bar }}>
      <div className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{headline}</div>
      {items?.length ? (
        <div className="flex items-center gap-x-5 gap-y-1 flex-wrap mt-1.5">
          {items.map((it, i) => (
            <span key={i} className="text-[11px]" style={{ color: COLORS.textFaint }}>
              {it.label} <b className="tabular-nums" style={{ color: COLORS.textSecondary }}>{it.value}</b>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** ④ 边界声明：说明这页的作用域与不适用范围。 */
export function ScopeNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] mt-3 leading-relaxed" style={{ color: COLORS.textFaint }}>
      ⓘ {children}
    </p>
  );
}

/** 四段式外壳。title 走 i18n 由调用方传入。 */
export function PanelFrame({ title, asOf, source, onRefresh, refreshing, summary, scope, children }: {
  title: string;
  asOf?: string | null;
  source?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  summary?: ReactNode;
  scope?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold mb-2.5" style={{ color: COLORS.text }}>{title}</h2>
      <AsOfBar asOf={asOf} source={source} onRefresh={onRefresh} refreshing={refreshing} />
      {summary}
      {children}
      {scope ? <ScopeNote>{scope}</ScopeNote> : null}
    </div>
  );
}
