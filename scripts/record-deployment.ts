/**
 * record-deployment.ts
 * Records a production deployment into DeploymentLog table.
 *
 * Usage:
 *   npm run record:deployment -- \
 *     --commit=61453cf \
 *     --summary="Some change" \
 *     --productionReady=true \
 *     --build=PASS \
 *     --health=PASS \
 *     --api=PASS \
 *     --page=PASS \
 *     --database=PASS \
 *     --pm2=PASS \
 *     --files="app/foo.tsx,lib/bar.ts" \
 *     --warnings="w1,w2" \
 *     --blockingIssues="" \
 *     --operator="Claude" \
 *     --deployedAt="2026-06-23T06:00:00Z"
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

// ── CLI arg parser ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function get(key: string, fallback = ""): string {
  const flag = argv.find((a) => a.startsWith(`--${key}=`));
  return flag ? flag.slice(key.length + 3) : fallback;
}
function getList(key: string): string[] {
  const raw = get(key, "");
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}
function getBool(key: string, fallback = false): boolean {
  const v = get(key, "").toLowerCase();
  if (v === "true" || v === "yes" || v === "1") return true;
  if (v === "false" || v === "no" || v === "0") return false;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const commitHash      = get("commit") || get("commitHash", "unknown");
  const summary         = get("summary", "(no summary)");
  const modifiedFiles   = getList("files").length > 0 ? getList("files") : getList("modifiedFiles");
  const buildStatus     = get("build",    "SKIP").toUpperCase();
  const healthStatus    = get("health",   "SKIP").toUpperCase();
  const apiStatus       = get("api",      "SKIP").toUpperCase();
  const pageStatus      = get("page",     "SKIP").toUpperCase();
  const databaseStatus  = get("database", "SKIP").toUpperCase();
  const pm2Status       = get("pm2",      "SKIP").toUpperCase();
  const productionReady = getBool("productionReady", false);
  const warnings        = getList("warnings");
  const blockingIssues  = getList("blockingIssues");
  const operator        = get("operator", "Claude");
  const deployedAtStr   = get("deployedAt", "");
  const deployedAt      = deployedAtStr ? new Date(deployedAtStr) : new Date();

  if (!commitHash || commitHash === "unknown") {
    console.error("❌  --commit is required");
    process.exit(1);
  }

  const record = await prisma.deploymentLog.create({
    data: {
      commitHash,
      summary,
      modifiedFiles: modifiedFiles as unknown as import("@prisma/client").Prisma.JsonArray,
      buildStatus,
      healthStatus,
      apiStatus,
      pageStatus,
      databaseStatus,
      pm2Status,
      productionReady,
      warnings: warnings as unknown as import("@prisma/client").Prisma.JsonArray,
      blockingIssues: blockingIssues as unknown as import("@prisma/client").Prisma.JsonArray,
      operator,
      deployedAt,
    },
  });

  const jst = new Date(record.deployedAt.getTime() + 9 * 3600 * 1000);
  console.log(`\n✅  Deployment logged — id=${record.id}`);
  console.log(`   Commit:      ${record.commitHash}`);
  console.log(`   Summary:     ${record.summary}`);
  console.log(`   Deployed at: ${jst.toISOString().slice(0, 16).replace("T", " ")} JST`);
  console.log(`   BUILD=${buildStatus} | HEALTH=${healthStatus} | API=${apiStatus} | PAGE=${pageStatus} | DB=${databaseStatus} | PM2=${pm2Status}`);
  console.log(`   Production Ready: ${productionReady ? "YES ✓" : "NO ✗"}`);
  if (warnings.length)       console.log(`   Warnings: ${warnings.join(", ")}`);
  if (blockingIssues.length) console.log(`   Blocking Issues: ${blockingIssues.join(", ")}`);
  console.log();
}

main().catch((e) => {
  console.error("❌  Failed:", e.message);
  process.exit(1);
}).finally(() => prisma.$disconnect());
