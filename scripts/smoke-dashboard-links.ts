// ─────────────────────────────────────────────────────────────────────────────
// Smoke test for every Dashboard-reachable route (P3-T7).
// Read-only: issues HEAD/GET requests and asserts each resolves (2xx or 3xx).
//   BASE=https://aitohoshou.com npm run smoke:links   (default base = production)
//   BASE=http://localhost:3000  npm run smoke:links
// 2xx or 3xx (redirect) → PASS · 4xx/5xx → FAIL
// ─────────────────────────────────────────────────────────────────────────────
import { ROUTES, stockDetail, comingSoon } from "../lib/routes";

const BASE = (process.env.BASE || "https://aitohoshou.com").replace(/\/$/, "");

// Canonical routes (from the central registry) + dynamic + fallbacks +
// the friendly aliases the task's smoke list references directly.
const TARGETS: string[] = Array.from(new Set([
  ...Object.values(ROUTES),
  stockDetail("4318.T"),
  comingSoon("test"),
  // Friendly aliases (thin redirect pages)
  "/research",
  "/learning-report",
  "/data-center",
  "/control-center",
  "/settings",
  "/coming-soon?feature=test",
]));

type Row = { route: string; status: number | string; result: "PASS" | "FAIL" };

async function check(path: string): Promise<Row> {
  const url = BASE + path;
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "smoke-links" } });
    const s = res.status;
    // undici returns 0 for opaqueredirect in some modes — treat as redirect PASS.
    const ok = s === 0 || (s >= 200 && s < 400);
    return { route: path, status: s === 0 ? "3xx" : s, result: ok ? "PASS" : "FAIL" };
  } catch (e) {
    return { route: path, status: `ERR ${(e as Error).message}`, result: "FAIL" };
  }
}

async function main() {
  console.log(`\n🔗 Smoke test — Dashboard links\n   base = ${BASE}\n`);
  const rows: Row[] = [];
  for (const t of TARGETS) rows.push(await check(t));

  const width = Math.max(...rows.map((r) => r.route.length), 8);
  console.log(`${"ROUTE".padEnd(width)}  STATUS   RESULT`);
  console.log("─".repeat(width + 18));
  for (const r of rows) {
    const mark = r.result === "PASS" ? "✅" : "❌";
    console.log(`${r.route.padEnd(width)}  ${String(r.status).padEnd(7)}  ${mark} ${r.result}`);
  }

  const failed = rows.filter((r) => r.result === "FAIL");
  console.log("─".repeat(width + 18));
  console.log(`\n${rows.length - failed.length}/${rows.length} PASS` + (failed.length ? `  ·  ${failed.length} FAIL` : "  ·  all green ✅") + "\n");
  process.exit(failed.length ? 1 : 0);
}

main();
