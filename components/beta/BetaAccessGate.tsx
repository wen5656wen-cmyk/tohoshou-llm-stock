"use client";

// ── P22-S3 · Beta 访问闸门（与 Admin 完全独立）──────────────────────────────
//
// 用于开放给 Beta 内部测试的只读研究页面。流程：
//   进入页面 → GET /api/beta/session 查是否已有 Beta/Admin 访问权
//     · 有   → 直接渲染 children
//     · 没有 → 弹密码框，输入 BETA_ACCESS_PASSWORD → POST 写 30 天 httpOnly Cookie → 进入
//
// ⚠️ 边界：
//   · 本闸门只控制**页面是否显示**；页面内数据仍由服务端 middleware + route guard
//     按白名单严格鉴权（Beta 只能读白名单只读接口，写/Shadow/Calibration 仍 401）。
//   · Beta ≠ Admin：admin 会话（超集）也能通过本闸门，但不显示「退出 Beta」按钮。
//   · 密码只在提交瞬间存在于内存，POST 后即丢弃；绝不写 localStorage / URL / bundle。

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { AppLoading, COLORS } from "@/components/ui";

export default function BetaAccessGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const [phase, setPhase] = useState<"checking" | "gated" | "open">("checking");
  const [via, setVia] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"idle" | "wrong" | "unconfigured">("idle");

  const check = () =>
    fetch("/api/beta/session", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { setVia(j?.via ?? null); setPhase(j?.authenticated ? "open" : "gated"); })
      .catch(() => setPhase("gated"));
  useEffect(() => { check(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("idle");
    try {
      const res = await fetch("/api/beta/session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      setPw(""); // 立即从内存清除
      if (res.status === 503) { setError("unconfigured"); return; }
      if (!res.ok) { setError("wrong"); return; }
      setVia("beta"); setPhase("open");
    } catch { setError("wrong"); } finally { setBusy(false); }
  }

  async function logout() {
    await fetch("/api/beta/session", { method: "DELETE", credentials: "same-origin" }).catch(() => {});
    setPhase("gated"); setVia(null);
  }

  if (phase === "checking") return <AppLoading />;

  if (phase === "gated") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: COLORS.background }}>
        <form onSubmit={submit} className="w-full max-w-sm rounded-2xl p-6" style={{ background: COLORS.card, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <div className="inline-flex items-center gap-1.5 mb-2 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: COLORS.tile, color: COLORS.primary }}>BETA</div>
          <h1 className="text-[15px] font-semibold mb-1" style={{ color: COLORS.text }}>{tx("beta.title")}</h1>
          <p className="text-[12px] mb-4" style={{ color: COLORS.textSecondary }}>{tx("beta.desc")}</p>
          <input
            type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off"
            placeholder={tx("beta.placeholder")}
            className="w-full h-10 px-3 rounded-lg text-[13px] outline-none"
            style={{ border: `1px solid ${COLORS.border}`, background: COLORS.background, color: COLORS.text }}
          />
          <button type="submit" disabled={busy || !pw}
            className="w-full h-10 mt-3 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ background: COLORS.primary, color: "#fff" }}>
            {busy ? tx("beta.verifying") : tx("beta.enter")}
          </button>
          {error === "wrong" && <p className="text-[12px] mt-3" style={{ color: COLORS.danger }}>{tx("beta.wrong")}</p>}
          {error === "unconfigured" && <p className="text-[12px] mt-3" style={{ color: COLORS.danger }}>{tx("beta.unconfigured")}</p>}
        </form>
      </div>
    );
  }

  return (
    <>
      {children}
      {/* 退出 Beta：仅 Beta 会话显示（admin 超集不显示，避免误退管理会话） */}
      {via === "beta" && (
        <button onClick={logout}
          className="fixed bottom-4 right-4 z-50 h-8 px-3 rounded-full text-[11px] font-medium shadow"
          style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.textSecondary }}>
          {tx("beta.exit")}
        </button>
      )}
    </>
  );
}
