import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // P3-T7: friendly route aliases → canonical pages (server-level 308, no flash).
  async redirects() {
    return [
      { source: "/control-center", destination: "/admin/mission-control", permanent: true },
      { source: "/data-center", destination: "/sync", permanent: true },
      { source: "/settings", destination: "/admin/mission-control", permanent: true },
      { source: "/research", destination: "/admin/research", permanent: true },
      { source: "/learning-report", destination: "/admin/learning-report", permanent: true },
      // ── P4-T4: Legacy 路由收敛 → AI 研究中心（307 临时，观察 2 周后改 308）──────
      // 功能已被 /admin/research?tab=* 与 AI 指挥中心覆盖。目标用研究中心真实 tab key
      // （页面读 ?tab=<key>；审计文档中的 group/tab-别名 对应下列真实 key）。不删除旧页面文件。
      { source: "/alpha", destination: "/admin/research?tab=factors", permanent: false },
      { source: "/alpha/score", destination: "/admin/research?tab=score", permanent: false },
      { source: "/alpha/backtest", destination: "/admin/research?tab=backtest", permanent: false },
      { source: "/alpha/report", destination: "/admin/research?tab=analytics", permanent: false },
      { source: "/fusion/paper", destination: "/admin/research?tab=fusion", permanent: false },
      { source: "/fusion/report", destination: "/admin/research?tab=fusion", permanent: false },
      { source: "/ai-picks", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
