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
    ];
  },
};

export default nextConfig;
