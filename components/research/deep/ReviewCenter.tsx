"use client";

// 审核中心（P17 Track 1）· 待审版本 → Claim/Evidence 对照 + Diff + Approve/Reject/Request Changes
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppLoading } from "@/components/ui";
import { COLORS } from "@/lib/decision/ds";
import ResearchSubNav from "./ResearchSubNav";
import VersionDetail from "./VersionDetail";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function ReviewCenter() {
  const { t, lang } = useI18n();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verId, setVerId] = useState<string | null>(null);

  const load = () => { setLoading(true); fetch("/api/research/review", { cache: "no-store" }).then((r) => r.json()).then((j) => { setD(j); setLoading(false); }).catch(() => setLoading(false)); };
  useEffect(load, []);

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-5" style={{ color: COLORS.text }}>
      <ResearchSubNav />
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>✅ {t("dr.rev.title")}</h1>
      <p style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 14 }}>{t("dr.rev.pending")}: <b>{d?.pending?.length ?? 0}</b> · AI_RESEARCHED → APPROVE → PUBLISHED</p>

      {loading ? <AppLoading label="review" /> : !d?.pending?.length ? (
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "40px 0", textAlign: "center", fontSize: 13, color: COLORS.textFaint }}>{t("dr.rev.none")}</div>
      ) : (
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: "hidden" }}>
          {d.pending.map((v: any, i: number) => (
            <div key={v.id} onClick={() => setVerId(v.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 15px", borderTop: i ? `1px solid ${COLORS.borderSoft}` : "none", cursor: "pointer" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{(lang === "ja-JP" ? v.entityNameJa : v.entityName) ?? v.entityKey ?? v.entityType} <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 400 }}>· {v.version}</span></div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{v.provider ?? "—"}{v.model ? `·${v.model}` : ""} · {v.evidenceCount} evidence · {v.estimatedCost != null ? `$${v.estimatedCost}` : ""} · {String(v.generatedAt).slice(0, 10)}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: v.status === "AI_RESEARCHED" ? COLORS.warning : COLORS.textMuted, borderRadius: 5, padding: "2px 8px" }}>{v.status}</span>
              <span style={{ color: COLORS.primary }}>→</span>
            </div>
          ))}
        </div>
      )}

      <VersionDetail versionId={verId} review onClose={() => setVerId(null)} onActed={load} />
    </div>
  );
}
