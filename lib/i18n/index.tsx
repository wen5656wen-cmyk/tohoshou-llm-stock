"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Lang, MessageKey, Messages } from "./types";
import zhCN from "./messages/zh-CN";

// TOHOSHOU 界面语言：仅 中文（zh-CN）。
// - English 已于 P17-00 移除。
// - 日本語（ja-JP）界面已下线：不再提供切换入口，历史存储值一律迁移为 zh-CN。
//   ja-JP 的消息包文件仍保留在 messages/ja-JP.ts（未被引用，便于随时恢复），
//   此处刻意映射到 zhCN —— 即使有任何残留的 ja-JP 状态，也只会渲染中文，杜绝日文界面漏出。
const MESSAGES: Record<Lang, Messages> = {
  "zh-CN": zhCN,
  "ja-JP": zhCN,
};

const LS_KEY = "preferred_language";
const DEFAULT_LANG: Lang = "zh-CN";
// 当前唯一受支持的界面语言。
const SUPPORTED: Lang[] = ["zh-CN"];

function isSupported(v: string | null): v is Lang {
  return v != null && (SUPPORTED as string[]).includes(v);
}

// 解析存储值 → 有效 Lang。
// 界面语言已单一化：任何历史值（ja-JP / en / en-US / 非法值）与浏览器语言
// 一律归一为 zh-CN，并在 Provider 中一次性写回存储，清除失效状态。
function resolveLang(saved: string | null): Lang {
  if (isSupported(saved)) return saved;
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
  t: (key) => zhCN[key],
  messages: zhCN,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    const resolved = resolveLang(saved);
    // 历史 ja-JP / 英文 / 非法存储值 → 一次性迁移为 zh-CN（清除失效状态）。
    if (saved !== resolved) localStorage.setItem(LS_KEY, resolved);
    // 语言已单一化：resolved 恒为 DEFAULT_LANG，与 SSR 首帧及初始 state 完全一致，
    // 故此处无需 setState（无语言切换 → 无 Hydration 闪烁），effect 只负责清理存储。
  }, []);

  // 界面语言单一化后不再对外提供切换能力；保留签名以兼容调用方，
  // 任何入参都会被归一为受支持语言（当前恒为 zh-CN）。
  const setLang = useCallback((next: Lang) => {
    const resolved = isSupported(next) ? next : DEFAULT_LANG;
    setLangState(resolved);
    localStorage.setItem(LS_KEY, resolved);
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
