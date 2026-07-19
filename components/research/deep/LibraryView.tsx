"use client";

// 研究库（P17 Track 1）· 报告 + 版本历史 + 筛选 · 复用现有 Report/Version 实体
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppLoading } from "@/components/ui";
import { COLORS } from "@/lib/decision/ds";
import ResearchSubNav from "./ResearchSubNav";
import VersionDetail from "./VersionDetail";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ST: Record<string, string> = { PUBLISHED: COLORS.success, AI_RESEARCHED: COLORS.warning, REJECTED: COLORS.danger, DRAFT: COLORS.textMuted };

export default function LibraryView() {
  const { t, lang } = useI18n();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [verId, setVerId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const p = new URLSearchParams(); if (status) p.set("status", status); if (q) p.set("q", q);
    fetch(`/api/research/library?${p}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { setD(j); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5" style={{ color: COLORS.text }}>
      <ResearchSubNav />
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>📚 {t("dr.lib.title")}</h1>

      {/* 筛选 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ fontSize: 12, padding: "7px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.card }}>
          <option value="">{t("dr.lib.all")}</option>
          {["PUBLISHED", "AI_RESEARCHED", "DRAFT", "REJECTED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder={t("dr.lib.search")} style={{ flex: 1, minWidth: 160, fontSize: 12, padding: "7px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.card }} />
        <button onClick={load} style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: COLORS.primary, border: "none", borderRadius: 8, padding: "7px 16px", cursor: "pointer" }}>↻</button>
      </div>

      {loading ? <AppLoading label="library" /> : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16 }}>
          {/* 报告 */}
          <section style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "13px 15px" }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>{t("dr.lib.reports")} <span style={{ fontSize: 11, color: COLORS.textFaint }}>{d?.reports?.length ?? 0}</span></div>
            {!d?.reports?.length ? <div style={{ fontSize: 12, color: COLORS.textFaint, padding: "12px 0" }}>{t("dr.lib.empty")}</div> : (
              <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><tbody>
                {d.reports.map((r: any) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                    <td style={{ padding: "7px 8px", fontWeight: 600 }}>{r.title}</td>
                    <td style={{ padding: "7px 8px", color: COLORS.textMuted, fontSize: 11 }}>{r.scope} · {r.refKey}</td>
                    <td style={{ padding: "7px 8px", fontSize: 11 }}>{r.version}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}><span style={{ fontSize: 10, fontWeight: 700, color: ST[r.status] ?? COLORS.textMuted }}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody></table></div>
            )}
          </section>

          {/* 版本历史 */}
          <section style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "13px 15px" }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>{t("dr.lib.versions")} <span style={{ fontSize: 11, color: COLORS.textFaint }}>{d?.versions?.length ?? 0}</span></div>
            {!d?.versions?.length ? <div style={{ fontSize: 12, color: COLORS.textFaint, padding: "12px 0" }}>{t("dr.lib.empty")}</div> : (
              <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ fontSize: 10.5, color: COLORS.textFaint }}>{[t("dr.lib.colEntity"), t("dr.lib.colVer"), t("dr.lib.colStatus"), t("dr.lib.colProvider"), t("dr.lib.colEvidence"), "$", ""].map((h, i) => <th key={i} style={{ textAlign: i > 3 ? "right" : "left", padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {d.versions.map((v: any) => (
                    <tr key={v.id} onClick={() => setVerId(v.id)} style={{ borderTop: `1px solid ${COLORS.borderSoft}`, cursor: "pointer" }}>
                      <td style={{ padding: "7px 8px" }}>{(lang === "ja-JP" ? v.entityNameJa : v.entityName) ?? v.entityKey ?? `${v.entityType}`}</td>
                      <td style={{ padding: "7px 8px", fontSize: 11 }}>{v.version}</td>
                      <td style={{ padding: "7px 8px" }}><span style={{ fontSize: 10, fontWeight: 700, color: ST[v.status] ?? COLORS.textMuted }}>{v.status}</span></td>
                      <td style={{ padding: "7px 8px", fontSize: 11, color: COLORS.textMuted }}>{v.provider ?? "—"}{v.model ? `·${v.model}` : ""}</td>
                      <td className="tabular-nums" style={{ padding: "7px 8px", textAlign: "right" }}>{v.evidenceCount}</td>
                      <td className="tabular-nums" style={{ padding: "7px 8px", textAlign: "right", color: COLORS.textMuted }}>{v.estimatedCost != null ? `$${v.estimatedCost}` : "—"}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", color: COLORS.primary }}>→</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </section>
        </div>
      )}

      <VersionDetail versionId={verId} onClose={() => setVerId(null)} />
    </div>
  );
}
