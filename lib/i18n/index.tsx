"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Lang, MessageKey, Messages } from "./types";
import zhCN from "./messages/zh-CN";
import jaJP from "./messages/ja-JP";

// TOHOSHOU 只支持 日本語（默认）/ 中文（辅助）。English 已于 P17-00 正式移除。
const MESSAGES: Record<Lang, Messages> = {
  "zh-CN": zhCN,
  "ja-JP": jaJP,
};

const LS_KEY = "preferred_language";
const DEFAULT_LANG: Lang = "ja-JP";
const SUPPORTED: Lang[] = ["zh-CN", "ja-JP"];
// 历史英文存储值（含旧 en / en-US / en_US / English）——统一安全迁移为默认日本語。
const LEGACY_EN = new Set(["en", "en-us", "en_us", "en-US", "en_US", "english", "English"]);

function isSupported(v: string | null): v is Lang {
  return v != null && (SUPPORTED as string[]).includes(v);
}

// 解析存储值 + 浏览器语言 → 有效 Lang。
// 优先级：合法存储值 > 历史英文值(→日本語) > 浏览器(ja/zh) > 默认日本語(英文/其它浏览器)。
function resolveLang(saved: string | null, browser: string | null): Lang {
  if (isSupported(saved)) return saved;
  if (saved && LEGACY_EN.has(saved)) return DEFAULT_LANG;
  const b = (browser ?? "").toLowerCase();
  if (b.startsWith("ja")) return "ja-JP";
  if (b.startsWith("zh")) return "zh-CN";
  return DEFAULT_LANG;
}

type I18nContext = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey) => string;
  messages: Messages;
};

const Ctx = createContext<I18nContext>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key) => jaJP[key],
  messages: jaJP,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // SSR 与首帧一致使用默认日本語，避免 Hydration 闪烁。
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    const resolved = resolveLang(saved, navigator.language);
    // 历史英文/非法存储值 → 一次性迁移为有效值（不再保留失效英文状态）。
    if (saved !== resolved) localStorage.setItem(LS_KEY, resolved);
    const id = requestAnimationFrame(() => setLangState(resolved));
    return () => cancelAnimationFrame(id);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem(LS_KEY, next);
  }, []);

  const messages = MESSAGES[lang];
  const t = useCallback((key: MessageKey) => messages[key] ?? key, [messages]);

  return (
    <Ctx.Provider value={{ lang, setLang, t, messages }}>
      {children}
    </Ctx.Provider>
  );
}

export function useI18n() {
  return useContext(Ctx);
}

export type { Lang, MessageKey };
