"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AIScoreBadge from "@/components/AIScoreBadge";

type PortfolioItem = {
  id: number;
  symbol: string;
  name: string;
  shares: number;
  avgPrice: number;
  note: string | null;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlRate: number;
  stock: { price: number; changeRate: number | null; aiScore: number | null; nameZh: string | null } | null;
};

type PortfolioData = {
  items: PortfolioItem[];
  totalValue: number;
  totalCost: number;
  totalPnl: number;
};

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ symbol: "", name: "", shares: "", avgPrice: "", note: "" });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch("/api/portfolio");
    const d = await res.json();
    setData(d);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ symbol: "", name: "", shares: "", avgPrice: "", note: "" });
    fetchData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除该持仓记录吗？")) return;
    await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
    fetchData();
  };

  const totalPnlRate =
    data && data.totalCost > 0 ? (data.totalPnl / data.totalCost) * 100 : 0;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">持仓管理</h1>
          <p className="text-sm text-slate-500 mt-0.5">持有股票・盈亏追踪</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + 添加持仓
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
          <h3 className="font-semibold text-slate-900 mb-4">添加持仓记录</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">股票代码 *</label>
              <input
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                placeholder="7203.T"
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">股票名称 *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="トヨタ自動車"
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">持仓股数 *</label>
              <input
                type="number"
                value={form.shares}
                onChange={(e) => setForm({ ...form, shares: e.target.value })}
                placeholder="100"
                required
                min="0"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">买入均价 (¥) *</label>
              <input
                type="number"
                value={form.avgPrice}
                onChange={(e) => setForm({ ...form, avgPrice: e.target.value })}
                placeholder="2650"
                required
                min="0"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-500 mb-1 block">备注</label>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="选填备注"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm px-4 py-2 rounded-lg font-medium"
              >
                {saving ? "保存中..." : "添加"}
              </button>
            </div>
          </form>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">持仓总市值</div>
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              ¥{Math.round(data.totalValue).toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">买入总成本</div>
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              ¥{Math.round(data.totalCost).toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">浮动盈亏</div>
            <div className={`text-xl font-bold tabular-nums ${data.totalPnl >= 0 ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
              {data.totalPnl >= 0 ? "+" : ""}¥{Math.round(data.totalPnl).toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs text-slate-500 mb-1">盈亏比例</div>
            <div className={`text-xl font-bold tabular-nums ${totalPnlRate >= 0 ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
              {totalPnlRate >= 0 ? "+" : ""}{totalPnlRate.toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">持仓明细</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm animate-pulse">加载中...</div>
        ) : data?.items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            暂无持仓记录，点击「添加持仓」开始记录。
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 font-medium">股票</th>
                <th className="px-3 py-3 font-medium text-right">持仓股数</th>
                <th className="px-3 py-3 font-medium text-right">买入均价</th>
                <th className="px-3 py-3 font-medium text-right">当前价格</th>
                <th className="px-3 py-3 font-medium text-right">持仓市值</th>
                <th className="px-3 py-3 font-medium text-right">浮动盈亏</th>
                <th className="px-3 py-3 font-medium text-right">AI评分</th>
                <th className="px-3 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data?.items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={`/stocks/${encodeURIComponent(item.symbol)}`} className="block group">
                      <div className="text-[15px] font-bold text-slate-900 group-hover:text-blue-600 leading-tight">
                        {item.stock?.nameZh || item.name}
                      </div>
                      {item.stock?.nameZh && item.stock.nameZh !== item.name && (
                        <div className="text-[12px] text-[#94a3b8]">{item.name}</div>
                      )}
                      <div className="text-[12px] text-[#64748b] font-mono">{item.symbol}</div>
                    </Link>
                    {item.note && <div className="text-xs text-slate-400 mt-0.5">{item.note}</div>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-slate-700">
                    {item.shares.toLocaleString()}股
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-slate-700">
                    ¥{item.avgPrice.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm">
                    <div className="font-medium text-slate-900">¥{item.currentPrice.toLocaleString()}</div>
                    {item.stock?.changeRate != null && (
                      <div className={`text-xs ${item.stock.changeRate >= 0 ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
                        {item.stock.changeRate >= 0 ? "▲" : "▼"}{Math.abs(item.stock.changeRate).toFixed(2)}%
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm font-medium text-slate-900">
                    ¥{Math.round(item.value).toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm">
                    <div className={`font-medium ${item.pnl >= 0 ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
                      {item.pnl >= 0 ? "+" : ""}¥{Math.round(item.pnl).toLocaleString()}
                    </div>
                    <div className={`text-xs ${item.pnlRate >= 0 ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
                      {item.pnlRate >= 0 ? "+" : ""}{item.pnlRate.toFixed(2)}%
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <AIScoreBadge score={item.stock?.aiScore} size="sm" />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
