"use client";

// 深度研究子导航（P17 Track 1）· 首页/研究库/审核中心/看板/日历
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/lib/decision/ds";

export default function ResearchSubNav() {
  const { t } = useI18n();
  const path = usePathname();
  const items: { href: string; label: string; soon?: boolean }[] = [
    { href: "/deep-research", label: t("dr.nav.home") },
    { href: "/deep-research/library", label: t("dr.nav.library") },
    { href: "/deep-research/review", label: t("dr.nav.review") },
    { href: "/deep-research/dashboard", label: t("dr.nav.dashboard") },
    { href: "/deep-research/calendar", label: t("dr.nav.calendar") },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
      {items.map((it) => {
        const active = path === it.href;
        if (it.soon) return <span key={it.href} title={t("dr.soon")} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, color: COLORS.textFaint, background: COLORS.tile, opacity: 0.6, cursor: "not-allowed" }}>{it.label}·{t("dr.soon")}</span>;
        return <Link key={it.href} href={it.href} style={{ fontSize: 12, fontWeight: active ? 700 : 500, padding: "5px 12px", borderRadius: 8, textDecoration: "none", color: active ? "#fff" : COLORS.text, background: active ? COLORS.primary : COLORS.tile }}>{it.label}</Link>;
      })}
    </div>
  );
}
