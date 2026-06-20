import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { join } from "path";

export async function POST() {
  try {
    execSync(`npx tsx ${join(process.cwd(), "scripts", "check-alerts.ts")}`, {
      stdio: "pipe",
      env: { ...process.env },
      timeout: 60000,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
