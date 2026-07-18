"use client";

// ── Decision 工作流子导航（P14-DEV-01）─────────────────────────────────────────
// 五页线性工作流：值得吗 → 怎么做 → 买哪些 → 持有 → 复盘（非并列 Dashboard）。
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/lib/decision/ds";

export const DECISION_TABS = [
  { key: "overview", labelKey: "dv.nav.overview" },
  { key: "strategy", labelKey: "dv.nav.strategy" },
  { key: "picks", labelKey: "dv.nav.picks" },
  { key: "portfolio", labelKey: "dv.nav.portfolio" },
  { key: "history", labelKey: "dv.nav.history" },
] as const;

export function SubNav({ active }: { active: string }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-4">
      <div className="flex gap-1.5 overflow-x-auto">
        {DECISION_TABS.map((tab) => {
          const on = tab.key === active;
          return (
            <button key={tab.key} onClick={() => router.replace(`/decision-v2?tab=${tab.key}`, { scroll: false })}
              className="px-3.5 py-2 rounded-xl text-[13px] whitespace-nowrap transition-colors active:scale-[0.99]"
              style={{ background: on ? COLORS.text : COLORS.card, color: on ? "#fff" : COLORS.textSecondary, fontWeight: on ? 600 : 500, border: `1px solid ${on ? COLORS.text : COLORS.border}` }}>
              {t(tab.labelKey as Parameters<typeof t>[0])}
            </button>
          );
        })}
      </div>
    </div>
  );
}
