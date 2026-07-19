"use client";

// 公司深度卡（P17 Phase 4b）· 抽屉 · Research Snapshot + 固定 15 段 + 日股实时 + 闭环
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { COLORS, fmtJpy, fmtPct, upDownColor } from "@/lib/decision/ds";

type Live = { price: number | null; changePct: number | null; marketCap: number | null; aiScore: number | null; recommendation: string | null; sector: string | null; marketRank: number | null } | null;
type Resp = {
  company: { companyKey: string; symbol: string | null; name: string; nameZh: string | null; country: string; market: string | null; listed: boolean; entityType: string; coreProduct: string | null; coreTech: string | null; globalSharePct: number | null; altDifficulty: string | null; moat: string | null; customers: string | null; suppliers: string | null; competitors: string | null; growthDriver: string | null; futureRisk: string | null; whyMatters: string | null; chainImpact: string | null; roadmap: { year: string; milestone: string; status: string }[] | null; investmentValue: { tech: number; pos: number; growth: number; val: number; risk: number; rating: string; conclusion?: string } | null; isHiddenChampion: boolean; industries: { nameZh: string; role: string | null; segment: string | null }[]; technologies: { name: string; role: string | null }[] };
  hiddenChampion: { score: number; verdict: string; reasons: string | null; mainRisk: string | null } | null;
  live: Live;
  claims: { statement: string; confidence: string; claimType: string | null; evidence: { sourceTitle: string; sourceType: string; publisher: string | null; confidence: string; evidenceSummary: string | null }[] }[];
  version: { version: string; status: string; reviewStatus: string } | null;
};

const CONF: Record<string, string> = { HIGH: COLORS.success, MID: COLORS.warning, LOW: COLORS.danger };
const stars = (n: number) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);
const capYi = (v: number | null) => (v == null ? "—" : v >= 10000 ? `${(v / 10000).toFixed(2)}万亿` : `${Math.round(v).toLocaleString()}亿`); // 億円→兆/亿

export default function CompanyDeepCard({ companyKey, onClose }: { companyKey: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const [d, setD] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!companyKey) { setD(null); return; }
    setLoading(true);
    fetch(`/api/research/company/${encodeURIComponent(companyKey)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { setD(j); setLoading(false); }).catch(() => setLoading(false));
  }, [companyKey]);

  const open = !!companyKey;
  const c = d?.company;
  const iv = c?.investmentValue;
  const claims = d?.claims ?? [];
  const evTotal = claims.reduce((n, x) => n + x.evidence.length, 0);
  const minConf = claims.length ? (claims.some((x) => x.confidence === "LOW") ? "LOW" : claims.every((x) => x.confidence === "HIGH") ? "HIGH" : "MID") : "—";

  const Fld = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div style={{ padding: "10px 18px", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".03em", color: COLORS.textMuted }}>{k}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 4, color: COLORS.text }}>{children}</div>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 65, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity .2s" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px,94vw)", maxHeight: "88vh", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 18, overflowY: "auto", boxShadow: "0 24px 68px rgba(0,0,0,.32)", color: COLORS.text, transform: open ? "scale(1)" : "scale(0.96)", transition: "transform .22s cubic-bezier(.32,.72,0,1)" }}>
        {loading || !c ? (
          <div style={{ padding: 40, textAlign: "center", color: COLORS.textFaint, fontSize: 13 }}>{loading ? "…" : ""}</div>
        ) : (
          <>
            <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${COLORS.borderSoft}`, position: "sticky", top: 0, background: COLORS.card, zIndex: 2 }}>
              <button onClick={onClose} style={{ position: "absolute", top: 14, right: 16, fontSize: 18, color: COLORS.textFaint, background: "none", border: "none", cursor: "pointer" }}>✕</button>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{c.name}</div>
              <div style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontFamily: "ui-monospace,monospace", color: COLORS.textFaint }}>{c.listed && c.symbol ? c.symbol : c.entityType === "FOREIGN" ? "海外" : "未上市"}</span>
                <span>{c.market ?? c.country}</span>
                {c.isHiddenChampion && d?.hiddenChampion && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: COLORS.success, borderRadius: 5, padding: "2px 6px" }}>💎 {d.hiddenChampion.score}</span>}
                <span style={{ fontSize: 9.5, fontWeight: 700, color: COLORS.purple, background: `${COLORS.purple}1a`, borderRadius: 5, padding: "2px 7px" }}>✦ LLM 深研 · 已人审</span>
              </div>
              {/* Research Snapshot */}
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "6px 10px", padding: "9px 11px", background: COLORS.tile, borderRadius: 10 }}>
                {[
                  { k: t("dr.co.snapVer"), v: d?.version?.version ?? "—" },
                  { k: t("dr.co.snapClaims"), v: String(claims.length) },
                  { k: t("dr.co.snapEvidence"), v: String(evTotal) },
                  { k: t("dr.co.snapConf"), v: minConf, col: CONF[minConf] },
                  { k: t("dr.co.snapReviewed"), v: d?.version?.reviewStatus ?? "—" },
                  { k: t("dr.co.snapFresh"), v: "100" },
                ].map((s, i) => (
                  <div key={i}><div style={{ fontSize: 9, color: COLORS.textFaint }}>{s.k}</div><div className="tabular-nums" style={{ fontSize: 12.5, fontWeight: 700, color: s.col ?? COLORS.text }}>{s.v}</div></div>
                ))}
              </div>
              {/* 日股实时 */}
              {c.listed && d?.live && (
                <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span className="tabular-nums" style={{ fontSize: 20, fontWeight: 800 }}>{fmtJpy(d.live.price)}</span>
                  <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: upDownColor(d.live.changePct) }}>{fmtPct(d.live.changePct)}</span>
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>{t("dr.co.live.cap")} {capYi(d.live.marketCap)}円 · {t("dr.co.live.ai")} {d.live.aiScore ?? "—"} · {d.live.recommendation ?? "—"}</span>
                </div>
              )}
            </div>

            <Fld k={`1 · ${t("dr.co.overview")}`}>{c.industries.map((i) => `${i.nameZh}${i.segment ? " · " + i.segment : ""}${i.role ? " · " + i.role : ""}`).join(" / ")}</Fld>
            <Fld k={`2 · ${t("dr.co.tech")}`}>{c.coreTech ?? "—"}</Fld>
            <Fld k={`3 · ${t("dr.co.role")}`}>{c.chainImpact ?? "—"}{c.globalSharePct != null && <span style={{ color: COLORS.textMuted }}> · 市占 {c.globalSharePct}%</span>}</Fld>
            <Fld k={`4 · ${t("dr.co.why")}`}>{c.whyMatters ?? "—"}</Fld>
            <Fld k={`5 · ${t("dr.co.moat")}`}>{c.moat ?? "—"}</Fld>
            <Fld k={`6 · ${t("dr.co.customers")}`}>{c.customers ?? "—"}</Fld>
            <Fld k={`7 · ${t("dr.co.suppliers")}`}>{c.suppliers ?? "—"}</Fld>
            <Fld k={`8 · ${t("dr.co.competitors")}`}>{c.competitors ?? "—"}</Fld>
            <Fld k={`9 · ${t("dr.co.growth")}`}>{c.growthDriver ?? "—"}</Fld>
            <Fld k={`10 · ${t("dr.co.risk")}`}><span style={{ color: COLORS.danger }}>{c.futureRisk ?? "—"}</span></Fld>
            <Fld k={`11 · ${t("dr.co.roadmap")}`}>{c.roadmap?.length ? c.roadmap.map((r) => `${r.year} ${r.milestone}`).join(" · ") : "—"}</Fld>
            {/* 12 Investment Value */}
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: COLORS.textMuted }}>{`12 · ${t("dr.co.invValue")}`}</div>
              {iv ? (
                <div style={{ marginTop: 6 }}>
                  {[["dr.co.iv.tech", iv.tech], ["dr.co.iv.pos", iv.pos], ["dr.co.iv.growth", iv.growth], ["dr.co.iv.val", iv.val], ["dr.co.iv.risk", iv.risk]].map(([k, n]) => (
                    <div key={k as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "2px 0" }}><span>{t(k as Parameters<typeof t>[0])}</span><span style={{ color: COLORS.warning, letterSpacing: 1 }}>{stars(n as number)}</span></div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5, paddingTop: 6, borderTop: `1px solid ${COLORS.borderSoft}` }}>
                    <span style={{ fontWeight: 700, fontSize: 12 }}>{t("dr.co.iv.rating")}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: iv.rating === "BUY" ? COLORS.danger : iv.rating === "WATCH" ? COLORS.primary : COLORS.warning, background: COLORS.tile, borderRadius: 6, padding: "2px 9px" }}>{iv.rating}</span>
                  </div>
                  <div style={{ fontSize: 9.5, color: COLORS.textFaint, marginTop: 6 }}>⚠️ {t("dr.co.iv.disc")}</div>
                </div>
              ) : <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 4 }}>—</div>}
            </div>
            {/* 13 Evidence */}
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: COLORS.textMuted }}>{`13 · ${t("dr.co.evidence")}`}</div>
              {claims.length ? claims.map((cl, i) => (
                <div key={i} style={{ marginTop: 7 }}>
                  <div style={{ fontSize: 11.5, color: COLORS.text, display: "flex", gap: 6, alignItems: "baseline" }}><span style={{ fontSize: 8.5, fontWeight: 800, color: "#fff", background: CONF[cl.confidence] ?? COLORS.textMuted, borderRadius: 4, padding: "1px 5px" }}>{cl.confidence}</span>{cl.statement}</div>
                  {cl.evidence.map((e, j) => <div key={j} style={{ fontSize: 10.5, color: COLORS.textMuted, marginTop: 2, paddingLeft: 10 }}>· {e.sourceTitle}（{e.publisher ?? e.sourceType}）</div>)}
                </div>
              )) : <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 4 }}>—</div>}
            </div>
            {/* 14 JP Stock Link（闭环）+ 15 Version History */}
            <div style={{ padding: "12px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: COLORS.textMuted, marginBottom: 8 }}>{`14 · ${t("dr.co.jpLink")}`}</div>
              {c.listed && c.symbol ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  <a href={`/decision-v2?tab=picks`} style={{ gridColumn: "1/3", textAlign: "center", fontSize: 12.5, fontWeight: 600, padding: "9px 0", borderRadius: 9, background: COLORS.primary, color: "#fff", textDecoration: "none" }}>{t("dr.co.linkStock")} →</a>
                  {[t("dr.co.linkReport"), t("dr.co.linkDecision"), t("dr.co.linkWatch"), t("dr.co.linkMission")].map((l, i) => (
                    <span key={i} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 600, padding: "8px 0", borderRadius: 9, background: COLORS.tile, color: COLORS.text, border: `1px solid ${COLORS.border}`, cursor: "pointer" }}>{l}</span>
                  ))}
                </div>
              ) : <div style={{ fontSize: 12, color: COLORS.textFaint }}>{t("dr.co.notListed")}</div>}
              <div style={{ fontSize: 10, fontWeight: 800, color: COLORS.textMuted, margin: "14px 0 4px" }}>{`15 · ${t("dr.co.verHist")}`}</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted }}>{d?.version ? `${d.version.version} ${d.version.status}` : "—"}（永久保留·不静默覆盖）</div>
            </div>
            <div style={{ height: 20 }} />
          </>
        )}
      </div>
    </div>
  );
}
