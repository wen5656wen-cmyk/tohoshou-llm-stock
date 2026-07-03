/**
 * Alpha factor — volume ratios (latest vs trailing average) + consecutive expansion days.
 * Independent: consumes a price-bar array only.
 *   volumeRatio5/20   = latest volume / mean(prev 5 / 20 bars, excluding today)
 *   volumeExpansionDays = consecutive most-recent bars with volume > trailing 20d avg
 */
import type { Bar } from "./index";

export type VolumeFactors = {
  volumeRatio5: number | null;
  volumeRatio20: number | null;
  volumeExpansionDays: number | null;
};

function meanPrevVolume(barsDesc: Bar[], n: number): number | null {
  if (barsDesc.length <= n) return null;
  let sum = 0;
  let count = 0;
  for (let i = 1; i <= n; i++) {
    const v = barsDesc[i].volume;
    if (v != null && v >= 0) {
      sum += v;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

export function computeVolume(barsDesc: Bar[]): VolumeFactors {
  const out: VolumeFactors = {
    volumeRatio5: null,
    volumeRatio20: null,
    volumeExpansionDays: null,
  };
  if (barsDesc.length < 2) return out;

  const v0 = barsDesc[0].volume;
  if (v0 != null && v0 >= 0) {
    const a5 = meanPrevVolume(barsDesc, 5);
    if (a5 != null && a5 > 0) out.volumeRatio5 = Math.round((v0 / a5) * 100) / 100;
    const a20 = meanPrevVolume(barsDesc, 20);
    if (a20 != null && a20 > 0) out.volumeRatio20 = Math.round((v0 / a20) * 100) / 100;
  }

  // Consecutive expansion days: newest bars whose volume exceeds the trailing 20-day avg.
  const win = barsDesc
    .slice(0, Math.min(20, barsDesc.length))
    .map((b) => b.volume)
    .filter((v): v is number => v != null && v >= 0);
  if (win.length >= 5) {
    const avg20 = win.reduce((a, b) => a + b, 0) / win.length;
    let days = 0;
    for (let i = 0; i < barsDesc.length; i++) {
      const v = barsDesc[i].volume;
      if (v != null && v > avg20) days++;
      else break;
    }
    out.volumeExpansionDays = days;
  }
  return out;
}
