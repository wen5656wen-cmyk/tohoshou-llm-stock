"use client";

// ── SystemStatusFooter · 老板视角系统状态条（P14-DEV-02）───────────────────────
// 只显示 正常/延迟/异常 + 最近任务时间；技术细节走 Management（不把 Mission Control 搬回）。
// 数据来自 useDecision().market(=decision-center 响应).system + closing。真实派生，无噪音。
import { useI18n } from "@/lib/i18n";
import { COLORS, fmtJstClock } from "@/lib/decision/ds";
import { useDecision } from "@/lib/decision/provider";

type Sev = "normal" | "delay" | "error";
const SEV_COLOR: Record<Sev, string> = { normal: COLORS.success, delay: COLORS.warning, error: COLORS.danger };

export default function SystemStatusFooter() {
  const { t } = useI18n();
  const { market, closing } = useDecision();
  const dc = market as unknown as {
    market?: { asOf?: string | null } | null;
    decision?: { strongBuy?: number; buy?: number } | null;
    system?: { health?: { critical?: number; warning?: number; status?: string | null } | null; cron?: { success?: number; total?: number; allSuccess?: boolean } | null; deployment?: { deployedAt?: string } | null } | null;
  } | null;
  const sys = dc?.system ?? null;

  const sevLabel = (s: Sev) => t(s === "normal" ? "dv.foot.normal" : s === "delay" ? "dv.foot.delay" : "dv.foot.error");
  const quote: Sev = dc?.market?.asOf ? "normal" : "delay";
  const score: Sev = ((dc?.decision?.strongBuy ?? 0) + (dc?.decision?.buy ?? 0)) > 0 ? "normal" : "delay";
  const engine: Sev = closing && !closing.empty && closing.top1 ? "normal" : "delay";
  const health: Sev = (sys?.health?.critical ?? 0) > 0 ? "error" : (sys?.health?.warning ?? 0) > 0 ? "delay" : "normal";
  const lastTask = sys?.deployment?.deployedAt ? fmtJstClock(sys.deployment.deployedAt) : (sys?.cron?.total ? `${sys.cron.success}/${sys.cron.total}` : "—");

  const Item = ({ label, sev }: { label: string; sev: Sev }) => (
    <span className="flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: SEV_COLOR[sev] }} />
      <span style={{ color: COLORS.textFaint }}>{label}</span>
      <span style={{ color: SEV_COLOR[sev] }}>{sevLabel(sev)}</span>
    </span>
  );

  return (
    <div className="sticky bottom-0 z-20" style={{ background: COLORS.card, borderTop: `1px solid ${COLORS.border}` }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-8 flex items-center gap-4 text-[11px] overflow-x-auto">
        <Item label={t("dv.foot.quote")} sev={quote} />
        <Item label={t("dv.foot.score")} sev={score} />
        <Item label={t("dv.foot.engine")} sev={engine} />
        <Item label={t("dv.footer.health")} sev={health} />
        <span className="shrink-0" style={{ color: COLORS.textFaint }}>{t("dv.foot.lastTask")} {lastTask}</span>
        <span className="ml-auto shrink-0" style={{ color: COLORS.textFaint }}>/decision-v2 · preview</span>
      </div>
    </div>
  );
}
