"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Lang, MessageKey, Messages } from "./types";
import zhCN from "./messages/zh-CN";
import jaJP from "./messages/ja-JP";
import enUS from "./messages/en-US";

const MESSAGES: Record<Lang, Messages> = {
  "zh-CN": zhCN,
  "ja-JP": jaJP,
  "en-US": enUS,
};

const LS_KEY = "preferred_language";
const SUPPORTED: Lang[] = ["zh-CN", "ja-JP", "en-US"];

function detectLang(): Lang {
  if (typeof window === "undefined") return "zh-CN";
  const saved = localStorage.getItem(LS_KEY) as Lang | null;
  if (saved && SUPPORTED.includes(saved)) return saved;
  const browser = navigator.language;
  if (browser.startsWith("ja")) return "ja-JP";
  if (browser.startsWith("zh")) return "zh-CN";
  return "en-US";
}

type I18nContext = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey) => string;
  messages: Messages;
};

const Ctx = createContext<I18nContext>({
  lang: "zh-CN",
  setLang: () => {},
  t: (key) => zhCN[key],
  messages: zhCN,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("zh-CN");

  useEffect(() => {
    setLangState(detectLang());
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
