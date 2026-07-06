"use client";

/**
 * LightweightStockChart (P6-T6)
 * ────────────────────────────────────────────────────────────────────────────
 * Generic TradingView Lightweight Charts wrapper for the TOHOSHOU AI stock
 * detail page. Pure PRESENTATION layer — it never fetches data, never touches
 * scoring / recommendation / DB / any AI decision path. The parent passes a
 * ready `ChartBar[]` (unified format); this component only renders it.
 *
 * Features: candlestick · volume histogram · MA5/MA20/MA60 lines · responsive
 * resize · light/dark theming (default light, matching the Apple dashboard) ·
 * loading / empty / error states (never blank).
 */
import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type Time,
} from "lightweight-charts";

// ── Unified input format (spec) ─────────────────────────────────────────────
export type ChartBar = {
  time: string; // "YYYY-MM-DD"
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  ma5?: number | null;
  ma20?: number | null;
  ma60?: number | null;
};

type RawPoint = { date: string; open?: number; high?: number; low?: number; close: number; volume?: number };

function rollingMA(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Adaptation helper (display layer only): convert the existing OHLCV price
 * series into the unified ChartBar[] and derive MA5/MA20/MA60 from CLOSE.
 *
 * MAs are computed over the FULL series first, THEN sliced to the visible
 * window, so MA lines carry the correct value at the left edge of a zoomed
 * window (professional behaviour) instead of showing warm-up nulls.
 */
export function buildChartBars(points: RawPoint[], sliceLast?: number): ChartBar[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  // ensure ascending + unique by date (lightweight-charts requirement)
  const sorted = [...points]
    .filter((p) => p && p.date != null && Number.isFinite(Number(p.close)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const dedup: RawPoint[] = [];
  for (const p of sorted) {
    if (dedup.length && dedup[dedup.length - 1].date === p.date) dedup[dedup.length - 1] = p;
    else dedup.push(p);
  }
  const closes = dedup.map((p) => Number(p.close));
  const ma5 = rollingMA(closes, 5);
  const ma20 = rollingMA(closes, 20);
  const ma60 = rollingMA(closes, 60);
  const bars: ChartBar[] = dedup.map((p, i) => {
    const close = Number(p.close);
    return {
      time: p.date,
      open: p.open != null ? Number(p.open) : close,
      high: p.high != null ? Number(p.high) : close,
      low: p.low != null ? Number(p.low) : close,
      close,
      volume: p.volume != null ? Number(p.volume) : undefined,
      ma5: ma5[i],
      ma20: ma20[i],
      ma60: ma60[i],
    };
  });
  return sliceLast && sliceLast < bars.length ? bars.slice(-sliceLast) : bars;
}

type Theme = "light" | "dark" | "auto";

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "auto") return theme;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

const PALETTE = {
  light: {
    text: "#6E6E73", grid: "#F0F0F3", border: "#ECECEC", bg: "transparent" as const,
  },
  dark: {
    text: "#9DA3AE", grid: "#23272E", border: "#2A3038", bg: "#15181D" as const,
  },
};
// Western convention (matches the app): up = green, down = red.
const UP = "#34C759";
const DOWN = "#FF3B30";
const MA_COLORS = { ma5: "#FF9F0A", ma20: "#007AFF", ma60: "#5856D6" };

export default function LightweightStockChart({
  data,
  height = 320,
  symbol,
  loading = false,
  error = null,
  theme = "light",
  showVolume = true,
  showMA = true,
}: {
  data: ChartBar[];
  height?: number;
  symbol?: string;
  loading?: boolean;
  error?: string | null;
  theme?: Theme;
  showVolume?: boolean;
  showMA?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || loading || error || !data || data.length === 0) return;

    const mode = resolveTheme(theme);
    const pal = PALETTE[mode];

    const chart = createChart(el, {
      width: el.clientWidth || 600,
      height,
      layout: {
        background: { type: ColorType.Solid, color: pal.bg },
        textColor: pal.text,
        fontSize: 11,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: pal.grid },
        horzLines: { color: pal.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: pal.border },
      timeScale: { borderColor: pal.border, timeVisible: false, secondsVisible: false },
      handleScale: { axisPressedMouseMove: true },
    });
    chartRef.current = chart;

    // ── Candlestick ──────────────────────────────────────────────────────────
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN,
      wickUpColor: UP, wickDownColor: DOWN,
      borderVisible: false,
      priceLineVisible: false,
    });
    candle.setData(
      data.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })),
    );

    // ── Volume histogram (bottom overlay) ─────────────────────────────────────
    if (showVolume && data.some((b) => b.volume != null)) {
      const vol = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(
        data
          .filter((b) => b.volume != null)
          .map((b) => ({
            time: b.time as Time,
            value: b.volume as number,
            color: b.close >= b.open ? "rgba(52,199,89,0.35)" : "rgba(255,59,48,0.35)",
          })),
      );
    }

    // ── Moving-average lines ──────────────────────────────────────────────────
    if (showMA) {
      const addMA = (key: "ma5" | "ma20" | "ma60", color: string) => {
        const pts = data
          .filter((b) => b[key] != null)
          .map((b) => ({ time: b.time as Time, value: b[key] as number }));
        if (pts.length === 0) return;
        const line = chart.addSeries(LineSeries, {
          color, lineWidth: 2,
          priceLineVisible: false, lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        line.setData(pts);
      };
      addMA("ma5", MA_COLORS.ma5);
      addMA("ma20", MA_COLORS.ma20);
      addMA("ma60", MA_COLORS.ma60);
    }

    chart.timeScale().fitContent();

    // ── Responsive resize ─────────────────────────────────────────────────────
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && chartRef.current) chartRef.current.applyOptions({ width: Math.floor(w) });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, height, theme, showVolume, showMA, loading, error]);

  // ── States (never blank) ───────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center text-[13px]" style={{ height, color: "#86868B" }}>
        图表加载失败
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center text-[13px]" style={{ height, color: "#86868B" }}>
        <span className="animate-pulse">加载中…</span>
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-[13px]" style={{ height, color: "#86868B" }}>
        暂无行情数据
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={containerRef} className="w-full" style={{ height }} data-symbol={symbol} />
    </div>
  );
}
