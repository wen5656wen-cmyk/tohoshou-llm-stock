"use client";

import { useRef, useCallback, useState } from "react";

export type PricePoint = {
  date: string | Date;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
};

type Props = {
  data: PricePoint[];
  height?: number;
  showVolume?: boolean;
  showMA?: boolean;
};

function calcMA(prices: number[], period: number): (number | null)[] {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    const slice = prices.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

type Tooltip = {
  x: number;
  y: number;
  point: PricePoint;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
};

export default function PriceChart({
  data,
  height = 200,
  showVolume = false,
  showMA = true,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 rounded-lg text-slate-400 text-sm"
        style={{ height }}
      >
        価格データなし
      </div>
    );
  }

  // Layout constants
  const W = 900;
  const volH = showVolume ? 50 : 0;
  const H = height;
  const chartH = H - volH;
  const PAD = { top: 12, right: 12, bottom: 24, left: 60 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = chartH - PAD.top - PAD.bottom;

  const closes = data.map((d) => d.close);
  const highs = data.map((d) => d.high ?? d.close);
  const lows = data.map((d) => d.low ?? d.close);
  const volumes = data.map((d) => d.volume ?? 0);

  const minP = Math.min(...lows);
  const maxP = Math.max(...highs);
  const priceRange = maxP - minP || 1;
  const maxVol = Math.max(...volumes) || 1;

  const n = data.length;
  const candleW = Math.max(1, (innerW / n) * 0.6);

  const px = (i: number) => PAD.left + (i + 0.5) * (innerW / n);
  const py = (v: number) => PAD.top + innerH - ((v - minP) / priceRange) * innerH;

  // Moving averages
  const ma5s  = calcMA(closes, 5);
  const ma20s = calcMA(closes, 20);
  const ma60s = calcMA(closes, 60);

  function maPath(mas: (number | null)[]): string {
    const pts: string[] = [];
    let open = false;
    mas.forEach((v, i) => {
      if (v === null) { open = false; return; }
      if (!open) { pts.push(`M ${px(i)},${py(v)}`); open = true; }
      else pts.push(`L ${px(i)},${py(v)}`);
    });
    return pts.join(" ");
  }

  // Y-axis ticks
  const yTicks = 5;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = minP + (priceRange / yTicks) * i;
    return { val, yv: py(val) };
  });

  // X-axis labels (show ~6 labels)
  const xStep = Math.max(1, Math.floor(n / 6));
  const xLabels = data
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i % xStep === 0 || i === n - 1)
    .map(({ d, i }) => {
      const dt = new Date(d.date);
      const label = `${dt.getMonth() + 1}/${dt.getDate()}`;
      return { label, xv: px(i) };
    });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const relX = (e.clientX - rect.left) * scaleX;
      const i = Math.round((relX - PAD.left) / (innerW / n) - 0.5);
      const clamped = Math.max(0, Math.min(n - 1, i));
      setTooltip({
        x: px(clamped),
        y: py(data[clamped].close),
        point: data[clamped],
        ma5: ma5s[clamped],
        ma20: ma20s[clamped],
        ma60: ma60s[clamped],
      });
    },
    [data, n, ma5s, ma20s, ma60s]
  );

  const isUpOverall = closes[closes.length - 1] >= closes[0];

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid */}
        {yLabels.map(({ val, yv }, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={yv} x2={W - PAD.right} y2={yv}
              stroke="#e2e8f0" strokeWidth="0.8" strokeDasharray="3,3" />
            <text x={PAD.left - 4} y={yv + 3.5} textAnchor="end" fontSize="9" fill="#94a3b8">
              ¥{Math.round(val).toLocaleString()}
            </text>
          </g>
        ))}

        {/* Candles */}
        {data.map((d, i) => {
          const o = d.open ?? d.close;
          const h = d.high ?? d.close;
          const l = d.low ?? d.close;
          const c = d.close;
          const up = c >= o;
          const color = up ? "#e74c3c" : "#2980b9";
          const bodyTop = py(Math.max(o, c));
          const bodyH = Math.max(1, Math.abs(py(o) - py(c)));
          return (
            <g key={i}>
              <line x1={px(i)} y1={py(h)} x2={px(i)} y2={py(l)}
                stroke={color} strokeWidth="1" />
              <rect
                x={px(i) - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyH}
                fill={up ? color : color}
                fillOpacity={up ? 0.9 : 0.7}
                stroke={color}
                strokeWidth="0.5"
              />
            </g>
          );
        })}

        {/* MA lines */}
        {showMA && (
          <>
            <path d={maPath(ma5s)}  fill="none" stroke="#f59e0b" strokeWidth="1.2" opacity="0.9" />
            <path d={maPath(ma20s)} fill="none" stroke="#3b82f6" strokeWidth="1.2" opacity="0.9" />
            <path d={maPath(ma60s)} fill="none" stroke="#8b5cf6" strokeWidth="1.2" opacity="0.9" />
          </>
        )}

        {/* X labels */}
        {xLabels.map(({ label, xv }, i) => (
          <text key={i} x={xv} y={chartH - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
            {label}
          </text>
        ))}

        {/* Volume bars */}
        {showVolume && (
          <>
            <line x1={PAD.left} y1={chartH} x2={W - PAD.right} y2={chartH}
              stroke="#e2e8f0" strokeWidth="0.8" />
            {data.map((d, i) => {
              const vol = d.volume ?? 0;
              const barH = (vol / maxVol) * (volH - 8);
              const up = (d.close ?? 0) >= (d.open ?? d.close);
              return (
                <rect
                  key={i}
                  x={px(i) - candleW / 2}
                  y={H - 4 - barH}
                  width={candleW}
                  height={barH}
                  fill={up ? "#e74c3c" : "#2980b9"}
                  fillOpacity="0.4"
                />
              );
            })}
          </>
        )}

        {/* Tooltip crosshair */}
        {tooltip && (
          <>
            <line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={chartH - PAD.bottom}
              stroke="#64748b" strokeWidth="0.8" strokeDasharray="4,3" />
            <circle cx={tooltip.x} cy={tooltip.y} r="3" fill="#64748b" />
          </>
        )}
      </svg>

      {/* Tooltip card */}
      {tooltip && (() => {
        const d = tooltip.point;
        const dt = new Date(d.date);
        const dateStr = `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
        const up = d.close >= (d.open ?? d.close);
        return (
          <div
            className="absolute top-2 pointer-events-none z-10 bg-slate-900/90 text-white rounded-lg px-3 py-2 text-xs shadow-lg min-w-40"
            style={{ left: tooltip.x > W * 0.55 ? "8px" : "auto", right: tooltip.x > W * 0.55 ? "auto" : "8px" }}
          >
            <div className="font-medium text-slate-300 mb-1">{dateStr}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <span className="text-slate-400">開</span>
              <span className="tabular-nums">{d.open != null ? `¥${d.open.toLocaleString()}` : "—"}</span>
              <span className="text-slate-400">高</span>
              <span className="tabular-nums text-[#e74c3c]">{d.high != null ? `¥${d.high.toLocaleString()}` : "—"}</span>
              <span className="text-slate-400">安</span>
              <span className="tabular-nums text-[#2980b9]">{d.low != null ? `¥${d.low.toLocaleString()}` : "—"}</span>
              <span className="text-slate-400">終</span>
              <span className={`tabular-nums font-bold ${up ? "text-[#e74c3c]" : "text-[#2980b9]"}`}>
                ¥{d.close.toLocaleString()}
              </span>
              {d.volume != null && (
                <>
                  <span className="text-slate-400">出来高</span>
                  <span className="tabular-nums">{(d.volume / 1000).toFixed(0)}千</span>
                </>
              )}
              {tooltip.ma5 != null && (
                <>
                  <span className="text-amber-400">MA5</span>
                  <span className="tabular-nums">¥{tooltip.ma5.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </>
              )}
              {tooltip.ma20 != null && (
                <>
                  <span className="text-blue-400">MA20</span>
                  <span className="tabular-nums">¥{tooltip.ma20.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* MA legend */}
      {showMA && (
        <div className="absolute bottom-6 left-16 flex items-center gap-3 pointer-events-none">
          <span className="flex items-center gap-1 text-[10px]">
            <span className="inline-block w-4 h-0.5 bg-amber-400" />
            <span className="text-slate-500">MA5</span>
          </span>
          <span className="flex items-center gap-1 text-[10px]">
            <span className="inline-block w-4 h-0.5 bg-blue-500" />
            <span className="text-slate-500">MA20</span>
          </span>
          <span className="flex items-center gap-1 text-[10px]">
            <span className="inline-block w-4 h-0.5 bg-violet-500" />
            <span className="text-slate-500">MA60</span>
          </span>
        </div>
      )}
    </div>
  );
}
