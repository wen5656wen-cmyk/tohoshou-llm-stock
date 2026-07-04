"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/routes";
import { Sparkles, ArrowRight } from "./icons";

const FEATURE_LABEL: Record<string, string> = {
  test: "测试模块",
  market_detail: "市场指数详情",
  notifications: "通知中心",
  account: "账户中心",
};

export function ComingSoonView({ feature }: { feature: string | null }) {
  const router = useRouter();
  const label = feature ? FEATURE_LABEL[feature] ?? feature : null;

  return (
    <div className="min-h-screen dash-font flex items-center justify-center px-6" style={{ background: "#FAFAFA" }}>
      <div className="dash-in dash-card w-full max-w-[440px] p-10 text-center">
        <span className="inline-flex items-center justify-center w-16 h-16 rounded-3xl mb-6" style={{ background: "#007AFF12", color: "#007AFF" }}>
          <Sparkles size={30} />
        </span>
        <h1 className="text-[24px] font-semibold tracking-[-0.01em]" style={{ color: "#1D1D1F" }}>功能建设中</h1>
        <p className="text-[14px] leading-relaxed mt-3" style={{ color: "#6E6E73" }}>
          {label ? <>「{label}」</> : "该模块"}已规划，当前版本暂未开放。<br />我们正在打磨，敬请期待。
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          <Link href={ROUTES.DASHBOARD}
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full text-[15px] font-semibold text-white dash-int w-full sm:w-auto"
            style={{ background: "#007AFF" }}>
            返回总览 <ArrowRight size={16} />
          </Link>
          <button type="button" onClick={() => router.back()}
            className="inline-flex items-center justify-center h-11 px-6 rounded-full text-[15px] font-semibold dash-card dash-int w-full sm:w-auto"
            style={{ color: "#1D1D1F" }}>
            返回上一页
          </button>
        </div>
      </div>
    </div>
  );
}
