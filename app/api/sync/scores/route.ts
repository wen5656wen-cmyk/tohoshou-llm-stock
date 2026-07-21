export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 150;

import { NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/admin-auth";
import { spawn } from "child_process";
import { join } from "path";

export async function GET(req: Request) {
  // P21-S2 纵深防御：middleware 之外的第二道闸门，必须先于任何副作用。
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  return NextResponse.json({ endpoint: "POST /api/sync/scores — 触发 compute-scores.ts" });
}

export async function POST(req: Request) {
  // P21-S2 纵深防御：middleware 之外的第二道闸门，必须先于任何副作用。
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  const startMs = Date.now();

  return new Promise<NextResponse>((resolve) => {
    const cwd = process.cwd();
    const scriptPath = join(cwd, "scripts", "compute-scores.ts");

    const child = spawn("npx", ["tsx", scriptPath], {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let output = "";
    child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { output += d.toString(); });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(
        NextResponse.json(
          { success: false, error: "compute-scores 超时（120s）", output: output.slice(-500) },
          { status: 408 }
        )
      );
    }, 120_000);

    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startMs;
      if (code === 0) {
        // Extract final summary line from output
        const lines = output.split("\n").filter(Boolean);
        const summary = lines.slice(-5).join(" | ");
        resolve(
          NextResponse.json({
            success: true,
            status: "SUCCESS",
            message: `AI评分计算完成`,
            durationMs,
            count: 0,
            synced: 0,
            summary,
            log: lines.slice(-20),
          })
        );
      } else {
        resolve(
          NextResponse.json(
            {
              success: false,
              error: `compute-scores 退出码 ${code ?? "killed"}`,
              output: output.slice(-800),
              durationMs,
            },
            { status: 500 }
          )
        );
      }
    });

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve(
        NextResponse.json(
          { success: false, error: `spawn 失败: ${err.message}` },
          { status: 500 }
        )
      );
    });
  });
}
