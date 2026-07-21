"use client";

// ── P21-S1 · 管理登录页 ──────────────────────────────────────────────────────
// 用户手工输入 ADMIN_TOKEN → POST /api/admin/session → 服务端校验后写 httpOnly Cookie。
//
// ⚠️ 安全约束：
//   · token 只存在于本组件的临时 state，提交后即丢弃
//   · **绝不**写入 localStorage / sessionStorage / URL / NEXT_PUBLIC_* / 页面 HTML
//   · **绝不**打包进 bundle —— 这里只有输入框，没有任何密钥字面量
//   · 会话凭证由服务端以 httpOnly Cookie 下发，前端 JS 读不到

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNext } from "@/lib/navigation/safe-next";

export default function AdminLoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  // ⚠️ 开放重定向防护：next 完全来自 URL，属不可信输入。只允许**站内相对路径**。
  //    "//evil.com" 与 "/\\evil.com" 在浏览器里都会被解析成站外地址，故第二个字符
  //    不得是 / 或 \；同时排除带协议的绝对 URL。任何不合规输入一律回退到默认页，
  //    不报错、不跳转 —— 攻击者拿不到跳转，用户也不会卡住。
  const next = safeNext(params.get("next"));
  const [token, setToken] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "error" | "unconfigured">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setToken(""); // 立即从内存清除
      if (res.status === 503) return setState("unconfigured");
      if (!res.ok) return setState("error");
      router.replace(next);
    } catch {
      setState("error");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F5F5F7" }}>
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        <h1 className="text-[15px] font-semibold mb-1" style={{ color: "#1d1d1f" }}>管理访问验证</h1>
        <p className="text-[12px] mb-4" style={{ color: "#6e6e73" }}>此区域包含系统管理与数据同步功能，需要管理密钥。</p>

        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          placeholder="ADMIN_TOKEN"
          className="w-full h-10 px-3 rounded-lg text-[13px] outline-none"
          style={{ border: "1px solid #d2d2d7" }}
        />

        <button
          type="submit"
          disabled={state === "busy" || !token}
          className="w-full h-10 mt-3 rounded-lg text-[13px] font-semibold disabled:opacity-50"
          style={{ background: "#007AFF", color: "#fff" }}
        >
          {state === "busy" ? "验证中…" : "验证"}
        </button>

        {state === "error" && (
          <p className="text-[12px] mt-3" style={{ color: "#d70015" }}>密钥不正确。</p>
        )}
        {state === "unconfigured" && (
          <p className="text-[12px] mt-3" style={{ color: "#d70015" }}>
            服务器未配置管理密钥（ADMIN_TOKEN），管理面已按 fail-closed 关闭。请联系运维配置后重试。
          </p>
        )}
      </form>
    </div>
  );
}
