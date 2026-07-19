"use client";

// 版本详情弹窗（P17 Track 1 / V2）· Claim/Evidence 对照 + 版本 Diff + 审阅记录 + 可选审核动作
// 复用于 Research Library（只读）与 Review Center（带 Approve/Reject/Request Changes）。
// 布局：头部固定 + 中部可完整滚动 + 动作栏固定底部（始终可见）。
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/lib/decision/ds";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CONF: Record<string, string> = { HIGH: COLORS.success, MID: COLORS.warning, LOW: COLORS.danger };
const ST: Record<string, string> = { PUBLISHED: COLORS.success, AI_RESEARCHED: COLORS.warning, REJECTED: COLORS.danger, DRAFT: COLORS.textMuted, APPROVED: COLORS.success, PENDING: COLORS.warning };
const COLS = ["segments", "technologies", "companies", "bottlenecks", "edges"];

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
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(760px,96vw)", height: "86vh", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 68px rgba(0,0,0,.32)", color: COLORS.text, transform: open ? "scale(1)" : "scale(.96)", transition: "transform .22s cubic-bezier(.32,.72,0,1)" }}>
        {loading || !v ? (
          <div style={{ padding: 48, textAlign: "center", color: COLORS.textFaint, fontSize: 13 }}>{loading ? "…" : ""}</div>
        ) : (
          <>
            {/* 头部（固定） */}
            <div style={{ padding: "15px 18px", borderBottom: `1px solid ${COLORS.borderSoft}`, background: COLORS.card, flexShrink: 0, position: "relative" }}>
              <button onClick={onClose} style={{ position: "absolute", top: 12, right: 16, fontSize: 19, color: COLORS.textFaint, background: "none", border: "none", cursor: "pointer" }}>✕</button>
              <div style={{ fontSize: 17, fontWeight: 800, paddingRight: 24 }}>{nm(v)} <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>· {v.version}</span>{d.isCandidate && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: "#fff", background: COLORS.warning, borderRadius: 5, padding: "2px 7px" }}>{t("dr.ver.candidate")}</span>}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7, fontSize: 11 }}>
                <span style={{ fontWeight: 800, color: "#fff", background: ST[v.status] ?? COLORS.textMuted, borderRadius: 5, padding: "2px 8px" }}>{v.status}</span>
                <span style={{ fontWeight: 700, color: ST[v.reviewStatus] ?? COLORS.textMuted }}>{t("dr.rev.title")}: {v.reviewStatus}</span>
                {v.provider && <span style={{ color: COLORS.textMuted }}>{v.provider}{v.model ? ` · ${v.model}` : ""}</span>}
                {v.estimatedCost != null && <span style={{ color: COLORS.textMuted }}>${v.estimatedCost}</span>}
                {v.tokenUsage?.total != null && <span style={{ color: COLORS.textMuted }}>{v.tokenUsage.total} tok</span>}
                {v.durationMs != null && <span style={{ color: COLORS.textMuted }}>{(v.durationMs / 1000).toFixed(1)}s</span>}
              </div>
            </div>

            {/* 中部（唯一滚动区域：固定高父容器 + flex:1 + min-height:0 + overflow-y:auto，填满并滚动，不留空白） */}
            <div style={{ padding: "13px 18px", flex: 1, minHeight: 0, overflowY: "auto" }}>
              {/* 版本 Diff */}
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 7 }}>🔀 {t("dr.ver.diff")}</div>
              <div style={{ overflowX: "auto", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ color: COLORS.textFaint, fontSize: 10.5 }}>
                    <th style={{ textAlign: "left", padding: "5px 6px" }}></th>
                    {COLS.map((k) => <th key={k} style={{ textAlign: "right", padding: "5px 6px" }}>{k}</th>)}
                  </tr></thead>
                  <tbody>
                    {d.previous && <tr style={{ color: COLORS.textMuted }}><td style={{ padding: "5px 6px" }}>{t("dr.ver.prev")} {d.previous.version}</td>{COLS.map((k) => <td key={k} className="tabular-nums" style={{ textAlign: "right", padding: "5px 6px" }}>{d.previous.counts?.[k] ?? "—"}</td>)}</tr>}
                    <tr style={{ borderTop: `1px solid ${COLORS.borderSoft}`, fontWeight: 700 }}><td style={{ padding: "5px 6px" }}>{v.version}</td>{COLS.map((k) => { const c = d.diff?.[k]?.delta; return <td key={k} className="tabular-nums" style={{ textAlign: "right", padding: "5px 6px" }}>{v.counts?.[k] ?? 0}{c ? <span style={{ color: c > 0 ? COLORS.success : COLORS.danger, fontSize: 9.5 }}> {c > 0 ? "+" : ""}{c}</span> : null}</td>; })}</tr>
                  </tbody>
                </table>
              </div>

              {/* Claim / Evidence 对照（自然流，随弹窗整体滚动） */}
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 7 }}>🧾 {t("dr.ver.claimEvidence")} <span style={{ fontSize: 11, color: COLORS.textFaint, fontWeight: 400 }}>({d.stats.claims} claims · {d.stats.evidence} evidence · {d.stats.noEvidence} {t("dr.ver.noEvidence")})</span></div>
              <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10 }}>
                {d.claims.length === 0 ? <div style={{ padding: "14px", fontSize: 12, color: COLORS.textFaint, textAlign: "center" }}>—</div> : d.claims.map((c: any, i: number) => (
                  <div key={c.id} style={{ padding: "9px 12px", borderTop: i ? `1px solid ${COLORS.borderSoft}` : "none" }}>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5, display: "flex", gap: 6, alignItems: "baseline" }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: CONF[c.confidence] ?? COLORS.textMuted, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{c.confidence}</span>
                      {c.claimType && <span style={{ fontSize: 9, color: COLORS.textFaint, whiteSpace: "nowrap" }}>{c.claimType}</span>}
                      <span>{c.statement}</span>
                    </div>
                    {c.evidence.length === 0
                      ? <div style={{ fontSize: 10.5, color: COLORS.danger, paddingLeft: 12, marginTop: 3 }}>· {t("dr.ver.noEvidence")}</div>
                      : c.evidence.map((e: any, j: number) => (
                        <div key={j} style={{ fontSize: 10.5, lineHeight: 1.5, color: COLORS.textMuted, paddingLeft: 12, marginTop: 3 }}>· {e.url ? <a href={e.url} target="_blank" rel="noreferrer" style={{ color: COLORS.primary }}>{e.sourceTitle}</a> : e.sourceTitle}（{e.publisher ?? e.sourceType}）</div>
                      ))}
                  </div>
                ))}
              </div>

              {/* 审阅记录 */}
              <div style={{ fontSize: 12.5, fontWeight: 800, margin: "16px 0 7px" }}>👥 {t("dr.ver.reviews")}</div>
              {d.reviews.length === 0 ? <div style={{ fontSize: 11.5, color: COLORS.textFaint }}>{t("dr.ver.noReview")}</div>
                : d.reviews.map((r: any, i: number) => <div key={i} style={{ fontSize: 11.5, padding: "5px 0", borderTop: i ? `1px solid ${COLORS.borderSoft}` : "none" }}><b>{r.reviewer}</b> · <span style={{ color: r.action === "APPROVE" ? COLORS.success : r.action === "REJECT" ? COLORS.danger : COLORS.warning }}>{r.action}</span>{r.comment ? ` · ${r.comment}` : ""} <span style={{ color: COLORS.textFaint }}>{String(r.reviewedAt).slice(0, 10)}</span></div>)}
            </div>

            {/* 动作栏（固定底部，始终可见） */}
            {review && (
              <div style={{ flexShrink: 0, padding: "12px 18px", borderTop: `1px solid ${COLORS.border}`, background: COLORS.card }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 9 }}>
                  <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder={t("dr.rev.reviewer")} style={{ flex: "0 0 150px", fontSize: 12.5, padding: "8px 11px", border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.tile, color: COLORS.text }} />
                  <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("dr.rev.comment")} style={{ flex: 1, minWidth: 160, fontSize: 12.5, padding: "8px 11px", border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.tile, color: COLORS.text }} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button disabled={!!busy} onClick={() => act("APPROVE")} style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", background: COLORS.success, border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy === "APPROVE" ? "…" : "✓ " + t("dr.rev.approve")}</button>
                  <button disabled={!!busy} onClick={() => act("REQUEST_CHANGES")} style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.text, background: COLORS.tile, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "9px 18px", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy === "REQUEST_CHANGES" ? "…" : "✎ " + t("dr.rev.requestChanges")}</button>
                  <button disabled={!!busy} onClick={() => act("REJECT")} style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", background: COLORS.danger, border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy === "REJECT" ? "…" : "✕ " + t("dr.rev.reject")}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
