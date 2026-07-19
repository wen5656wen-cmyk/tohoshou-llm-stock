"use client";

// 版本详情弹窗（P17 Track 1）· Claim/Evidence 对照 + 版本 Diff + 审阅记录 + 可选审核动作
// 复用于 Research Library（只读）与 Review Center（带 Approve/Reject/Request Changes）。
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/lib/decision/ds";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CONF: Record<string, string> = { HIGH: COLORS.success, MID: COLORS.warning, LOW: COLORS.danger };
const ST: Record<string, string> = { PUBLISHED: COLORS.success, AI_RESEARCHED: COLORS.warning, REJECTED: COLORS.danger, DRAFT: COLORS.textMuted, APPROVED: COLORS.success, PENDING: COLORS.warning };

export default function VersionDetail({ versionId, review, onClose, onActed }: { versionId: string | null; review?: boolean; onClose: () => void; onActed?: () => void }) {
  const { t, lang } = useI18n();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!versionId) { setD(null); return; }
    setLoading(true);
    fetch(`/api/research/version/${versionId}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { setD(j); setLoading(false); }).catch(() => setLoading(false));
  }, [versionId]);

  const act = async (action: string) => {
    if (!versionId || !reviewer.trim()) { alert(t("dr.rev.reviewer")); return; }
    setBusy(action);
    const r = await fetch("/api/research/review", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": localStorage.getItem("llmstock_admin_token") ?? "" }, body: JSON.stringify({ versionId, reviewer: reviewer.trim(), action, comment }) });
    setBusy(null);
    if (r.ok) { onActed?.(); onClose(); } else alert((await r.json().catch(() => ({})))?.error ?? "failed");
  };

  const open = !!versionId;
  const v = d?.version;
  const nm = (x: any) => (lang === "ja-JP" ? (x?.entityNameJa ?? x?.entityName) : x?.entityName) ?? x?.entityKey ?? x?.entityId;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 65, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity .2s" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(720px,95vw)", maxHeight: "90vh", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, overflowY: "auto", boxShadow: "0 24px 68px rgba(0,0,0,.32)", color: COLORS.text, transform: open ? "scale(1)" : "scale(.96)", transition: "transform .22s cubic-bezier(.32,.72,0,1)" }}>
        {loading || !v ? (
          <div style={{ padding: 44, textAlign: "center", color: COLORS.textFaint, fontSize: 13 }}>{loading ? "…" : ""}</div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: "15px 18px", borderBottom: `1px solid ${COLORS.borderSoft}`, position: "sticky", top: 0, background: COLORS.card, zIndex: 2 }}>
              <button onClick={onClose} style={{ position: "absolute", top: 12, right: 16, fontSize: 18, color: COLORS.textFaint, background: "none", border: "none", cursor: "pointer" }}>✕</button>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{nm(v)} <span style={{ fontSize: 12, color: COLORS.textMuted }}>· {v.version}</span></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, fontSize: 10.5 }}>
                <span style={{ fontWeight: 800, color: "#fff", background: ST[v.status] ?? COLORS.textMuted, borderRadius: 5, padding: "2px 7px" }}>{v.status}</span>
                <span style={{ fontWeight: 700, color: ST[v.reviewStatus] ?? COLORS.textMuted }}>Review: {v.reviewStatus}</span>
                {v.provider && <span style={{ color: COLORS.textMuted }}>{v.provider}{v.model ? ` · ${v.model}` : ""}</span>}
                {v.estimatedCost != null && <span style={{ color: COLORS.textMuted }}>${v.estimatedCost}</span>}
                {v.tokenUsage?.total != null && <span style={{ color: COLORS.textMuted }}>{v.tokenUsage.total} tok</span>}
                {v.durationMs != null && <span style={{ color: COLORS.textMuted }}>{(v.durationMs / 1000).toFixed(1)}s</span>}
              </div>
            </div>

            <div style={{ padding: "12px 18px" }}>
              {/* Version Diff */}
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>🔀 {t("dr.ver.diff")}</div>
              <div style={{ overflowX: "auto", marginBottom: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                  <thead><tr style={{ color: COLORS.textFaint, fontSize: 10 }}>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}></th>
                    {["segments", "technologies", "companies", "bottlenecks", "edges"].map((k) => <th key={k} style={{ textAlign: "right", padding: "4px 6px" }}>{k}</th>)}
                  </tr></thead>
                  <tbody>
                    {d.previous && <tr style={{ color: COLORS.textMuted }}><td style={{ padding: "4px 6px" }}>{t("dr.ver.prev")} {d.previous.version}</td>{["segments", "technologies", "companies", "bottlenecks", "edges"].map((k) => <td key={k} className="tabular-nums" style={{ textAlign: "right", padding: "4px 6px" }}>{d.previous.counts?.[k] ?? "—"}</td>)}</tr>}
                    <tr style={{ borderTop: `1px solid ${COLORS.borderSoft}`, fontWeight: 700 }}><td style={{ padding: "4px 6px" }}>{v.version}</td>{["segments", "technologies", "companies", "bottlenecks", "edges"].map((k) => { const c = d.diff?.[k]?.delta; return <td key={k} className="tabular-nums" style={{ textAlign: "right", padding: "4px 6px" }}>{v.counts?.[k] ?? 0}{c ? <span style={{ color: c > 0 ? COLORS.success : COLORS.danger, fontSize: 9 }}> {c > 0 ? "+" : ""}{c}</span> : null}</td>; })}</tr>
                  </tbody>
                </table>
              </div>

              {/* Claim / Evidence 对照 */}
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>🧾 {t("dr.ver.claimEvidence")} <span style={{ fontSize: 10.5, color: COLORS.textFaint, fontWeight: 400 }}>({d.stats.claims} claims · {d.stats.evidence} evidence · {d.stats.noEvidence} {t("dr.ver.noEvidence")})</span></div>
              <div style={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10 }}>
                {d.claims.map((c: any, i: number) => (
                  <div key={c.id} style={{ padding: "8px 11px", borderTop: i ? `1px solid ${COLORS.borderSoft}` : "none" }}>
                    <div style={{ fontSize: 11.5, display: "flex", gap: 6, alignItems: "baseline" }}>
                      <span style={{ fontSize: 8.5, fontWeight: 800, color: "#fff", background: CONF[c.confidence] ?? COLORS.textMuted, borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" }}>{c.confidence}</span>
                      {c.claimType && <span style={{ fontSize: 8.5, color: COLORS.textFaint }}>{c.claimType}</span>}
                      <span>{c.statement}</span>
                    </div>
                    {c.evidence.length === 0
                      ? <div style={{ fontSize: 10, color: COLORS.danger, paddingLeft: 10, marginTop: 2 }}>· {t("dr.ver.noEvidence")}</div>
                      : c.evidence.map((e: any, j: number) => (
                        <div key={j} style={{ fontSize: 10, color: COLORS.textMuted, paddingLeft: 10, marginTop: 2 }}>· {e.url ? <a href={e.url} target="_blank" rel="noreferrer" style={{ color: COLORS.primary }}>{e.sourceTitle}</a> : e.sourceTitle}（{e.publisher ?? e.sourceType}）</div>
                      ))}
                  </div>
                ))}
              </div>

              {/* 审阅记录 */}
              <div style={{ fontSize: 12, fontWeight: 800, margin: "14px 0 6px" }}>👥 {t("dr.ver.reviews")}</div>
              {d.reviews.length === 0 ? <div style={{ fontSize: 11, color: COLORS.textFaint }}>{t("dr.ver.noReview")}</div>
                : d.reviews.map((r: any, i: number) => <div key={i} style={{ fontSize: 11, padding: "4px 0", borderTop: i ? `1px solid ${COLORS.borderSoft}` : "none" }}><b>{r.reviewer}</b> · <span style={{ color: r.action === "APPROVE" ? COLORS.success : r.action === "REJECT" ? COLORS.danger : COLORS.warning }}>{r.action}</span>{r.comment ? ` · ${r.comment}` : ""} <span style={{ color: COLORS.textFaint }}>{String(r.reviewedAt).slice(0, 10)}</span></div>)}

              {/* 审核动作 */}
              {review && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder={t("dr.rev.reviewer")} style={{ flex: "0 0 140px", fontSize: 12, padding: "7px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.tile }} />
                    <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("dr.rev.comment")} style={{ flex: 1, minWidth: 160, fontSize: 12, padding: "7px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.tile }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button disabled={!!busy} onClick={() => act("APPROVE")} style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: COLORS.success, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy === "APPROVE" ? "…" : "✓ " + t("dr.rev.approve")}</button>
                    <button disabled={!!busy} onClick={() => act("REQUEST_CHANGES")} style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, background: COLORS.tile, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy === "REQUEST_CHANGES" ? "…" : "✎ " + t("dr.rev.requestChanges")}</button>
                    <button disabled={!!busy} onClick={() => act("REJECT")} style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: COLORS.danger, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy === "REJECT" ? "…" : "✕ " + t("dr.rev.reject")}</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
