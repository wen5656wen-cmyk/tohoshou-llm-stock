"use client";

// ── 持仓操作弹窗（P16-01 · 加入/加仓/卖出/编辑）─────────────────────────────
// 纯 UI 表单 → 调用新增的 /api/holdings/* Portfolio API（真实用户持仓）。
// 表单以 key 重挂载重置（避免 effect 内同步 setState）。
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/components/ui";
import { SP } from "@/lib/decision/terminal";

export type HoldingDialog =
  | { mode: "buy"; symbol: string; name: string; price?: number | null }
  | { mode: "sell"; symbol: string; name: string; shares: number; price?: number | null }
  | { mode: "edit"; symbol: string; name: string; avgCost: number; shares: number; note?: string | null }
  | null;

const SELL_REASONS = ["TAKE_PROFIT", "STOP_LOSS", "MANUAL", "REBALANCE", "OTHER"] as const;
function jstToday(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

export default function HoldingDialogs({ dialog, onClose, onDone }: { dialog: HoldingDialog; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog.Root open={!!dialog} onOpenChange={(o) => { if (!o) onClose(); }}>
      {dialog && <DialogForm key={`${dialog.mode}:${dialog.symbol}`} dialog={dialog} onClose={onClose} onDone={onDone} />}
    </Dialog.Root>
  );
}

function DialogForm({ dialog, onClose, onDone }: { dialog: NonNullable<HoldingDialog>; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [price, setPrice] = useState(dialog.mode !== "edit" && dialog.price != null ? String(dialog.price) : "");
  const [shares, setShares] = useState(dialog.mode === "sell" || dialog.mode === "edit" ? String(dialog.shares) : "");
  const [avgCost, setAvgCost] = useState(dialog.mode === "edit" ? String(dialog.avgCost) : "");
  const [date, setDate] = useState(jstToday());
  const [fee, setFee] = useState("");
  const [note, setNote] = useState(dialog.mode === "edit" ? (dialog.note ?? "") : "");
  const [reason, setReason] = useState<string>("MANUAL");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const title = dialog.mode === "buy" ? t("dv.pf.addTitle") : dialog.mode === "sell" ? t("dv.pf.sellTitle") : t("dv.pf.editTitle");

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      let r: Response;
      if (dialog.mode === "buy") r = await fetch("/api/holdings/buy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: dialog.symbol, name: dialog.name, price: Number(price), shares: Number(shares), tradeDate: date, fee: fee ? Number(fee) : 0, note: note || undefined }) });
      else if (dialog.mode === "sell") r = await fetch("/api/holdings/sell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: dialog.symbol, price: Number(price), shares: Number(shares), tradeDate: date, fee: fee ? Number(fee) : 0, reason, note: note || undefined }) });
      else r = await fetch(`/api/holdings/${encodeURIComponent(dialog.symbol)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avgCost: avgCost ? Number(avgCost) : undefined, shares: shares ? Number(shares) : undefined, note }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.error ?? t("dv.pf.failed")); setBusy(false); return; }
      onDone();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  const field = (label: string, node: React.ReactNode) => (
    <label style={{ display: "block", marginBottom: SP.sm + 2 }}>
      <span style={{ fontSize: 11, color: COLORS.textFaint }}>{label}</span>
      <div style={{ marginTop: 3 }}>{node}</div>
    </label>
  );
  const inputStyle: React.CSSProperties = { width: "100%", height: 34, padding: "0 10px", fontSize: 13, border: `1px solid ${COLORS.border}`, borderRadius: 8, background: "#fff", color: COLORS.text };

  return (
    <Dialog.Portal>
      <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 90 }} />
      <Dialog.Content aria-describedby={undefined} style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(400px,94vw)", background: COLORS.card, borderRadius: 14, zIndex: 91, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", padding: SP.lg }}>
        <Dialog.Title asChild><b style={{ fontSize: 16, color: COLORS.text }}>{title}</b></Dialog.Title>
        <div style={{ fontSize: 12, color: COLORS.textFaint, marginBottom: SP.md }}>{dialog.name} · {dialog.symbol}</div>

        {dialog.mode !== "edit" && field(t("dv.pf.price"), <input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle} />)}
        {field(t("dv.pf.shares"), <input type="number" inputMode="numeric" value={shares} onChange={(e) => setShares(e.target.value)} style={inputStyle} />)}
        {dialog.mode === "edit" && field(t("dv.pf.avgCost"), <input type="number" inputMode="decimal" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} style={inputStyle} />)}
        {dialog.mode !== "edit" && field(t("dv.pf.date"), <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />)}
        {dialog.mode !== "edit" && field(t("dv.pf.fee"), <input type="number" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" style={inputStyle} />)}
        {dialog.mode === "sell" && field(t("dv.pf.reason"), (
          <div className="flex flex-wrap gap-1.5">
            {SELL_REASONS.map((rk) => (
              <button key={rk} onClick={() => setReason(rk)} style={{ fontSize: 11.5, padding: "4px 9px", borderRadius: 7, border: `1px solid ${reason === rk ? COLORS.primary : COLORS.border}`, color: reason === rk ? COLORS.primary : COLORS.textSecondary, background: reason === rk ? `${COLORS.primary}12` : "#fff" }}>{t(`dv.pf.r.${rk}` as Parameters<typeof t>[0])}</button>
            ))}
          </div>
        ))}
        {field(t("dv.pf.note"), <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />)}

        {err && <div style={{ fontSize: 12, color: COLORS.danger, marginBottom: SP.sm }}>{err}</div>}
        <div className="flex items-center justify-end gap-2" style={{ marginTop: SP.sm }}>
          <button onClick={onClose} style={{ fontSize: 13, padding: "7px 14px", borderRadius: 8, color: COLORS.textSecondary, background: "#F0F0F3" }}>{t("dv.pf.cancel")}</button>
          <button onClick={submit} disabled={busy} style={{ fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 8, color: "#fff", background: dialog.mode === "sell" ? COLORS.danger : COLORS.primary, opacity: busy ? 0.6 : 1 }}>{busy ? "…" : t("dv.pf.confirm")}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
