"use client";

// 产业详情（P17 Phase 4b）· 多区域布局 · 真实数据 · 专业投研风格
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { AppLoading } from "@/components/ui";
import { COLORS, fmtJpy, fmtPct, upDownColor } from "@/lib/decision/ds";
import CompanyDeepCard from "./CompanyDeepCard";
import dynamic from "next/dynamic";

const KnowledgeGraph = dynamic(() => import("./KnowledgeGraph"), { ssr: false, loading: () => <div style={{ height: 480, borderRadius: 12, background: COLORS.tile }} /> });

/* eslint-disable @typescript-eslint/no-explicit-any */
const LV: Record<string, string> = { CRITICAL: COLORS.danger, HIGH: COLORS.warning, MEDIUM: COLORS.primary, LOW: COLORS.textMuted };
const CONF: Record<string, string> = { HIGH: COLORS.success, MID: COLORS.warning, LOW: COLORS.danger };
const TLK: Record<string, { c: string; bg: string }> = {
  HISTORICAL: { c: COLORS.textSecondary, bg: COLORS.tile },
  PLANNED: { c: COLORS.primary, bg: `${COLORS.primary}14` },
  FORECAST: { c: COLORS.purple, bg: `${COLORS.purple}18` },
};
const recTone = (r: string | null) => (r === "STRONG_BUY" ? COLORS.danger : r === "BUY" ? COLORS.warning : r === "HOLD" ? COLORS.warning : r === "WATCH" ? COLORS.primary : COLORS.textMuted);

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, boxShadow: "0 1px 2px rgba(17,24,39,.04)", padding: "13px 15px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>{title}</span>
        {hint && <span style={{ fontSize: 10.5, color: COLORS.textFaint }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function IndustryDetail() {
  const { t, lang } = useI18n();
  const params = useParams();
  const key = String(params.industryKey ?? "");
  const [d, setD] = useState<any>(null);
  const [graph, setGraph] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [coKey, setCoKey] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/research/industry/${encodeURIComponent(key)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/research/graph/${encodeURIComponent(key)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([di, g]) => { setD(di); setGraph(g); setLoading(false); }).catch(() => setLoading(false));
  }, [key]);

  if (loading) return <div className="max-w-[1400px] mx-auto px-6 py-12"><AppLoading label={key} /></div>;
  if (!d || d.error) return <div className="max-w-[1400px] mx-auto px-6 py-12 text-center text-[13px]" style={{ color: COLORS.textFaint }}>Not found</div>;

  const ind = d.industry;
  const nm = lang === "ja-JP" ? ind.nameJa : ind.nameZh;
  const notReady = ind.status !== "PUBLISHED";
  const metrics: Record<string, number> = ind.metrics ?? {};
  const kpi = d.kpi ?? {};
  const disp = (c: any) => (lang === "ja-JP" ? c.name : c.nameZh ?? c.name);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5" style={{ color: COLORS.text }}>
      <Link href="/deep-research" style={{ fontSize: 12, color: COLORS.primary, textDecoration: "none" }}>{t("dr.d.back")}</Link>
      {/* Header + update bar */}
      <div style={{ marginTop: 8, marginBottom: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{nm}</h1>
        <p style={{ fontSize: 12.5, color: COLORS.textMuted, marginTop: 3 }}>{ind.oneLiner}</p>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "10px 14px", borderRadius: 12, background: COLORS.tile, border: `1px solid ${COLORS.border}`, fontSize: 11, marginBottom: 14 }}>
        {[["Last Deep", ind.lastDeepAt?.slice(0, 10) ?? "—"], ["Version", ind.version ?? "—"], ["Evidence", String(d.evidenceCount)], ["Review", d.version?.reviewStatus ?? "—"], [t("dr.d.nextReview"), ind.nextReviewAt?.slice(0, 10) ?? "—"], ["Freshness", String(ind.freshness ?? "—")]].map(([k, v], i) => (
          <div key={i}><div style={{ color: COLORS.textFaint, fontSize: 9.5 }}>{k}</div><div style={{ fontWeight: 700, fontSize: 11.5, color: k === "Version" ? COLORS.purple : COLORS.text }}>{v}</div></div>
        ))}
      </div>

      {notReady ? (
        <Card title={t("dr.d.notReady")}><div style={{ fontSize: 12, color: COLORS.textFaint, padding: "20px 0", textAlign: "center" }}>{t("dr.st.DRAFT")}</div></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 16, alignItems: "start" }} className="dr-grid">
          {/* 左列 */}
          <div>
            {/* AI Summary */}
            <div style={{ background: `${COLORS.purple}10`, border: `1px solid ${COLORS.border}`, borderLeft: `3px solid ${COLORS.purple}`, borderRadius: 14, padding: "13px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".05em", color: COLORS.purple }}>✦ {t("dr.d.summary")}</div>
              <div style={{ fontSize: 13, lineHeight: 1.65, marginTop: 5 }}>{ind.summary}</div>
            </div>

            {/* Research KPI（含 Claims/Evidence） */}
            <Card title={t("dr.d.kpi")}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(90px,1fr))", gap: 10 }}>
                {[[t("dr.kpi.companies"), kpi.companies], [t("dr.kpi.jp"), kpi.jpListed], [t("dr.kpi.bottleneck"), kpi.bottlenecks, COLORS.danger], [t("dr.kpi.tech"), kpi.technologies], [t("dr.kpi.claims"), kpi.claims, COLORS.primary], [t("dr.kpi.evidence"), kpi.evidence, COLORS.success], [t("dr.kpi.hc"), kpi.hiddenChampions, COLORS.warning], [t("dr.kpi.edges"), kpi.edges]].map(([l, v, c]: any, i) => (
                  <div key={i}><div className="tabular-nums" style={{ fontSize: 19, fontWeight: 800, color: c ?? COLORS.text }}>{v ?? 0}</div><div style={{ fontSize: 9.5, color: COLORS.textFaint }}>{l}</div></div>
                ))}
              </div>
              {/* 9 维指标条 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "7px 14px", marginTop: 13, paddingTop: 11, borderTop: `1px solid ${COLORS.borderSoft}` }}>
                {Object.entries(metrics).map(([k, v]) => (
                  <div key={k}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: COLORS.textMuted }}><span>{k}</span><span className="tabular-nums" style={{ fontWeight: 700 }}>{v}</span></div><div style={{ height: 4, borderRadius: 2, background: COLORS.track, marginTop: 3 }}><div style={{ height: "100%", width: `${v}%`, borderRadius: 2, background: v >= 80 ? COLORS.danger : v >= 60 ? COLORS.warning : COLORS.primary }} /></div></div>
                ))}
              </div>
            </Card>

            {/* Knowledge Graph — 专业可视化（Phase 6 · React Flow） */}
            <Card title={`🧬 ${t("dr.d.kg")}`} hint={graph?.stats ? `${graph.stats.nodes} nodes · ${graph.stats.edges} edges` : undefined}>
              {/* 图例 */}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 10.5, marginBottom: 8, color: COLORS.textMuted }}>
                {[[t("dr.kpi.companies"), COLORS.primary], [t("dr.kg.segment"), COLORS.purple], [t("dr.kpi.tech"), COLORS.success]].map(([l, c]: any, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />{l}</span>
                ))}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 3, border: `1.5px solid ${COLORS.danger}` }} />{t("dr.kg.choke")}</span>
                <span>💎 {t("dr.kg.hc")}</span>
              </div>
              {graph && <KnowledgeGraph graph={graph} onNodeClick={(_, meta) => { if (meta?.companyKey) setCoKey(meta.companyKey); }} />}
            </Card>

            {/* Bottlenecks */}
            <Card title={`🔺 ${t("dr.d.bottleneck")}`}>
              {(d.bottlenecks ?? []).map((b: any) => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderTop: `1px solid ${COLORS.borderSoft}` }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: LV[b.level], borderRadius: 5, padding: "2px 7px" }}>{b.level}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{b.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: COLORS.textMuted }}>{t("dr.d.chokeCtrl")}: {b.controlledBy ?? "—"}</span>
                </div>
              ))}
            </Card>

            {/* JP Companies（实时） */}
            <Card title={`🇯🇵 ${t("dr.d.jpco")}`} hint="实时读 StockScore/Yahoo · 不复制评分">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ fontSize: 10, color: COLORS.textFaint }}>
                    {[t("dr.kpi.companies"), t("dr.co.live.price"), t("dr.co.live.ai"), t("dr.co.live.rec"), t("dr.col.benefit"), ""].map((h, i) => <th key={i} style={{ textAlign: i === 0 ? "left" : "right", padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {(d.companies ?? []).filter((c: any) => c.listed).map((c: any) => (
                      <tr key={c.companyKey} onClick={() => setCoKey(c.companyKey)} style={{ cursor: "pointer", borderTop: `1px solid ${COLORS.borderSoft}` }}>
                        <td style={{ padding: "7px 8px" }}>{disp(c)} <span style={{ fontSize: 10, fontFamily: "ui-monospace,monospace", color: COLORS.textFaint }}>{c.symbol}</span>{c.isHiddenChampion && <span style={{ marginLeft: 4 }}>💎</span>}</td>
                        <td className="tabular-nums" style={{ textAlign: "right", padding: "7px 8px" }}>{fmtJpy(c.live?.price)} <span style={{ color: upDownColor(c.live?.changePct), fontSize: 11 }}>{fmtPct(c.live?.changePct)}</span></td>
                        <td className="tabular-nums" style={{ textAlign: "right", padding: "7px 8px", fontWeight: 700 }}>{c.live?.aiScore ?? "—"}</td>
                        <td style={{ textAlign: "right", padding: "7px 8px" }}><span style={{ fontSize: 10.5, fontWeight: 700, color: recTone(c.live?.recommendation) }}>{c.live?.recommendation ?? "—"}</span></td>
                        <td className="tabular-nums" style={{ textAlign: "right", padding: "7px 8px", color: COLORS.textSecondary }}>{c.benefitScore ?? "—"}</td>
                        <td style={{ textAlign: "right", padding: "7px 8px", color: COLORS.primary }}>→</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Evidence */}
            <Card title={`🧾 ${t("dr.d.evidence")}`} hint={`${d.evidenceCount}`}>
              {Object.values(d.claimsByEntity ?? {}).flat().slice(0, 12).map((cl: any, i) => (
                <div key={i} style={{ padding: "6px 0", borderTop: i ? `1px solid ${COLORS.borderSoft}` : "none" }}>
                  <div style={{ fontSize: 11.5, display: "flex", gap: 6, alignItems: "baseline" }}><span style={{ fontSize: 8.5, fontWeight: 800, color: "#fff", background: CONF[cl.confidence] ?? COLORS.textMuted, borderRadius: 4, padding: "1px 5px" }}>{cl.confidence}</span>{cl.statement}</div>
                  {cl.evidence.slice(0, 2).map((e: any, j: number) => <div key={j} style={{ fontSize: 10, color: COLORS.textMuted, paddingLeft: 10, marginTop: 1 }}>· {e.sourceTitle}（{e.publisher ?? e.sourceType}）</div>)}
                </div>
              ))}
            </Card>
          </div>

          {/* 右列 */}
          <div>
            {/* Today Changed */}
            <Card title={`🆕 ${t("dr.d.today")}`}>
              <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                {[[t("dr.d.newClaim"), d.todayChanged?.newClaims ?? 0], [t("dr.d.newEvidence"), d.todayChanged?.newEvidence ?? 0], [t("dr.d.reviewSt"), d.todayChanged?.reviewStatus ?? "—"]].map(([l, v]: any, i) => (
                  <div key={i}><div className="tabular-nums" style={{ fontSize: 17, fontWeight: 800, color: COLORS.warning }}>{v}</div><div style={{ fontSize: 9.5, color: COLORS.textFaint }}>{l}</div></div>
                ))}
              </div>
              {(d.dailyUpdates ?? []).slice(0, 4).map((u: any) => (
                <div key={u.id} style={{ fontSize: 11, color: COLORS.textSecondary, padding: "4px 0", borderTop: `1px solid ${COLORS.borderSoft}` }}>· {u.title}</div>
              ))}
            </Card>

            {/* Timeline（Historical/Planned/Forecast 视觉区分） */}
            <Card title={`🕒 ${t("dr.d.timeline")}`}>
              {(d.timeline ?? []).slice(0, 10).map((e: any, i: number) => {
                const k = TLK[e.kind] ?? TLK.HISTORICAL;
                return (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: i ? `1px solid ${COLORS.borderSoft}` : "none" }}>
                    <span style={{ fontSize: 8.5, fontWeight: 800, padding: "2px 6px", borderRadius: 5, color: k.c, background: k.bg, whiteSpace: "nowrap", height: "fit-content", ...(e.kind === "FORECAST" ? { border: `1px dashed ${COLORS.purple}` } : {}) }}>{t(`dr.tl.${e.kind}` as Parameters<typeof t>[0])}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11.5, color: e.kind === "FORECAST" ? COLORS.purple : COLORS.text, fontStyle: e.kind === "FORECAST" ? "italic" : "normal" }}>{e.title}</div>
                      <div style={{ fontSize: 9.5, color: COLORS.textFaint }}>{String(e.at).slice(0, 10)}</div>
                    </div>
                  </div>
                );
              })}
            </Card>

            {/* Hidden Champions */}
            <Card title={`💎 ${t("dr.d.hc")}`}>
              {(d.companies ?? []).filter((c: any) => c.hc).map((c: any) => (
                <div key={c.companyKey} onClick={() => setCoKey(c.companyKey)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: `1px solid ${COLORS.borderSoft}`, cursor: "pointer" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{disp(c)}</span>
                  <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 800, color: "#fff", background: COLORS.success, borderRadius: 5, padding: "2px 7px" }}>HC {c.hc.score}</span>
                </div>
              ))}
            </Card>

            {/* Technologies */}
            <Card title={`🔧 ${t("dr.d.tech")}`}>
              {(d.technologies ?? []).map((tc: any) => (
                <div key={tc.id} style={{ padding: "5px 0", borderTop: `1px solid ${COLORS.borderSoft}`, fontSize: 11.5 }}>
                  <span style={{ fontWeight: 700 }}>{tc.name}</span> <span style={{ color: COLORS.textMuted }}>· {tc.leaderCompany ?? tc.leaderCountry ?? ""}</span>
                </div>
              ))}
            </Card>

            {/* Research Report + Version */}
            <Card title={`📄 ${t("dr.d.report")} / ${t("dr.d.version")}`}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{d.report?.title ?? "—"}</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>{d.version ? `${d.version.version} · ${d.version.status} · ${d.version.reviewStatus}` : "—"}</div>
              {(d.version?.reviews ?? []).map((r: any, i: number) => <div key={i} style={{ fontSize: 10.5, color: COLORS.textFaint, marginTop: 3 }}>{t("dr.d.reviewedBy")}: {r.reviewer} · {r.action}</div>)}
              <div style={{ fontSize: 10, color: COLORS.textFaint, marginTop: 5 }}>永久保留·不静默覆盖</div>
            </Card>
          </div>
        </div>
      )}

      <CompanyDeepCard companyKey={coKey} onClose={() => setCoKey(null)} />
      <style>{`@media(max-width:980px){.dr-grid{grid-template-columns:1fr!important;}}`}</style>
    </div>
  );
}
