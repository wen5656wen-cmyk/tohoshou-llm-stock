"use client";

// Deep Research 首页（P17 Phase 4）· 专业投研平台风格 · 九大产业主题卡 · 真实数据
import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { AppLoading } from "@/components/ui";
import { COLORS } from "@/lib/decision/ds";
import ResearchSubNav from "./ResearchSubNav";

type IndustryCard = {
  industryKey: string; nameZh: string; nameEn: string; nameJa: string; oneLiner: string | null;
  status: string; version: string | null; freshness: number | null; lastDeepAt: string | null;
  counts: { jpListed: number; globalCore: number; bottlenecks: number; hiddenChampions: number; todayChanges: number };
};
type Resp = { industries: IndustryCard[]; total: number };

const IC: Record<string, string> = { AI_SEMICONDUCTOR: "🔬", AI_DATACENTER: "🏢", AI_POWER: "⚡", AI_OPTICAL: "💡", AI_HBM: "🧠", AI_ROBOTICS: "🤖", AI_AUTONOMOUS: "🚗", AI_AGENT: "✨", AI_MEDICAL: "🩺" };
const ST: Record<string, { key: string; c: string; bg: string }> = {
  PUBLISHED: { key: "dr.st.PUBLISHED", c: COLORS.success, bg: `${COLORS.success}1f` },
  AI_RESEARCHED: { key: "dr.st.AI_RESEARCHED", c: COLORS.warning, bg: `${COLORS.warning}22` },
  STALE: { key: "dr.st.STALE", c: COLORS.textMuted, bg: COLORS.tile },
  DRAFT: { key: "dr.st.DRAFT", c: COLORS.textMuted, bg: COLORS.tile },
};

export default function DeepResearchHome() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/research/industries", { cache: "no-store" }).then((r) => r.json()).then((j) => { setData(j); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const nm = (c: IndustryCard) => (lang === "ja-JP" ? c.nameJa : c.nameZh);

  if (loading) return <div className="max-w-[1400px] mx-auto px-6 py-12"><AppLoading label={t("dr.title")} /></div>;
  const inds = data?.industries ?? [];
  const published = inds.filter((i) => i.status === "PUBLISHED").length;
  const jpTotal = inds.reduce((n, i) => n + i.counts.jpListed, 0);
  const botTotal = inds.reduce((n, i) => n + i.counts.bottlenecks, 0);
  const hcTotal = inds.reduce((n, i) => n + i.counts.hiddenChampions, 0);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5" style={{ color: COLORS.text }}>
      <ResearchSubNav />
      {/* 标题 */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-2">
        <div>
          <h1 className="flex items-center gap-2" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {t("dr.title")}
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".06em", color: "#fff", background: "linear-gradient(135deg,#5E5CE6,#007AFF)", borderRadius: 6, padding: "2px 7px", boxShadow: "0 1px 4px rgba(94,92,230,.35)" }}>{t("dv.nav.badge.core")}</span>
          </h1>
          <p style={{ fontSize: 12.5, color: COLORS.textMuted, marginTop: 3 }}>{t("dr.sub")}</p>
        </div>
      </div>

      {/* 第一屏速览 */}
      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {[
          { k: t("dr.fs.pub"), v: `${published} / 9`, tone: COLORS.success },
          { k: t("dr.fs.jp"), v: String(jpTotal), tone: COLORS.primary },
          { k: t("dr.fs.bottleneck"), v: String(botTotal), tone: COLORS.danger },
          { k: t("dr.fs.hc"), v: String(hcTotal), tone: COLORS.warning },
        ].map((s, i) => (
          <div key={i} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "13px 15px", background: COLORS.card, boxShadow: "0 1px 2px rgba(17,24,39,.04)" }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>{s.k}</div>
            <div className="tabular-nums" style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: s.tone }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* 九大产业卡 */}
      <div className="flex items-center gap-2 mb-3">
        <span style={{ fontSize: 13, fontWeight: 800 }}>🧩 {t("dr.home.rank")}</span>
        <span style={{ fontSize: 11, color: COLORS.textFaint }}>{t("dr.home.rankHint")}</span>
      </div>
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))" }}>
        {inds.map((c) => {
          const st = ST[c.status] ?? ST.DRAFT;
          const done = c.status === "PUBLISHED";
          return (
            <Link key={c.industryKey} href={`/deep-research/${c.industryKey}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 15, background: COLORS.card, padding: "14px 15px", boxShadow: "0 1px 2px rgba(17,24,39,.04)", height: "100%", opacity: done ? 1 : 0.82 }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.primary)} onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}>
                <div className="flex items-center gap-2.5">
                  <div style={{ width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", fontSize: 16, background: COLORS.tile }}>{IC[c.industryKey] ?? "◈"}</div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{nm(c)}</div>
                  <span className="ml-auto" style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 5, color: st.c, background: st.bg }}>{t(st.key as Parameters<typeof t>[0])}</span>
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 8, lineHeight: 1.5, minHeight: 34 }}>{c.oneLiner}</div>
                <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 10px", marginTop: 10 }}>
                  {[
                    { n: c.counts.jpListed, l: t("dr.c.jp"), col: COLORS.text },
                    { n: c.counts.globalCore, l: t("dr.c.global"), col: COLORS.text },
                    { n: c.counts.bottlenecks, l: t("dr.c.bottleneck"), col: COLORS.danger },
                    { n: c.counts.hiddenChampions, l: t("dr.c.hc"), col: COLORS.success },
                    { n: c.counts.todayChanges, l: t("dr.c.today"), col: COLORS.warning },
                  ].map((s, i) => (
                    <div key={i}><div className="tabular-nums" style={{ fontSize: 15, fontWeight: 800, color: s.col }}>{s.n}</div><div style={{ fontSize: 9.5, color: COLORS.textFaint }}>{s.l}</div></div>
                  ))}
                  <div><div style={{ fontSize: 14, fontWeight: 800, color: COLORS.purple }}>{c.version ?? "—"}</div><div style={{ fontSize: 9.5, color: COLORS.textFaint }}>{t("dr.c.ver")}</div></div>
                </div>
                <div className="flex items-center justify-between" style={{ marginTop: 11, paddingTop: 9, borderTop: `1px solid ${COLORS.borderSoft}`, fontSize: 10.5, color: COLORS.textMuted }}>
                  <span>{done && c.lastDeepAt ? `${t("dr.lastDeep")} ${c.lastDeepAt.slice(0, 10)}` : t("dr.notReady")}</span>
                  <span style={{ color: COLORS.primary, fontWeight: 600 }}>{t("dr.enter")}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
