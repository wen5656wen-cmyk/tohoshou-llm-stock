"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  text: string;
  intent?: string;
  ts: number;
}

const QUICK_PROMPTS = [
  { label: "今日TOP5", text: "今天买什么？" },
  { label: "TOP10推荐", text: "推荐十只股票" },
  { label: "市场概况", text: "今天市场如何？" },
  { label: "科技股", text: "科技股谁最强？" },
  { label: "半导体", text: "半导体还能买吗？" },
  { label: "汽车股", text: "汽车股前景如何？" },
];

const INTENT_BADGE: Record<string, { label: string; cls: string }> = {
  // Stock intents (v7.9.2)
  top_picks:       { label: "AI推荐",   cls: "bg-orange-100 text-orange-700" },
  recommend_more:  { label: "更多推荐", cls: "bg-amber-100 text-amber-700" },
  recommend_ten:   { label: "TOP10",    cls: "bg-red-100 text-red-700" },
  stock_analysis:  { label: "个股分析", cls: "bg-blue-100 text-blue-700" },
  stock_compare:   { label: "对比分析", cls: "bg-cyan-100 text-cyan-700" },
  theme_rank:      { label: "主题排名", cls: "bg-violet-100 text-violet-700" },
  theme_best:      { label: "板块分析", cls: "bg-violet-100 text-violet-700" },
  sector_outlook:  { label: "板块展望", cls: "bg-purple-100 text-purple-700" },
  theme_outlook:   { label: "板块展望", cls: "bg-purple-100 text-purple-700" },
  market_overview: { label: "市场概况", cls: "bg-green-100 text-green-700" },
  risk_analysis:   { label: "风险分析", cls: "bg-rose-100 text-rose-700" },
  reason_explain:  { label: "逻辑解析", cls: "bg-indigo-100 text-indigo-700" },
  data_source:     { label: "数据来源", cls: "bg-teal-100 text-teal-700" },
  help:            { label: "帮助",     cls: "bg-slate-100 text-slate-500" },
  unknown:         { label: "帮助",     cls: "bg-slate-100 text-slate-500" },
  // System commands (v7.9.3)
  system_start:    { label: "▶ 启动",  cls: "bg-green-100 text-green-700" },
  system_stop:     { label: "■ 停止",  cls: "bg-red-100 text-red-700" },
  system_reset:    { label: "↺ 重置",  cls: "bg-yellow-100 text-yellow-700" },
  system_status:   { label: "● 状态",  cls: "bg-slate-100 text-slate-600" },
  system_paused:   { label: "■ 已暂停", cls: "bg-red-50 text-red-500" },
};

function formatReply(text: string) {
  // Convert plain text with line breaks to paragraphs
  return text.split("\n\n").map((block, bi) => {
    const lines = block.split("\n");
    if (lines.length === 1) {
      return <p key={bi} className="mb-2 last:mb-0 leading-relaxed">{lines[0]}</p>;
    }
    return (
      <div key={bi} className="mb-3 last:mb-0">
        {lines.map((line, li) => (
          <div key={li} className="leading-relaxed">
            {line === "" ? <br /> : line}
          </div>
        ))}
      </div>
    );
  });
}

function MsgBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const badge = msg.intent ? INTENT_BADGE[msg.intent] : null;

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%]">
          <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
            {msg.text}
          </div>
          <div className="text-right text-[10px] text-slate-400 mt-1 mr-1">
            {new Date(msg.ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold ml-2 mt-0.5 shrink-0">
          我
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="w-8 h-8 rounded-full bg-[#0f1629] border border-slate-700 flex items-center justify-center text-blue-400 text-sm mr-2 mt-0.5 shrink-0">
        ✦
      </div>
      <div className="max-w-[80%]">
        {badge && (
          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1 ${badge.cls}`}>
            {badge.label}
          </span>
        )}
        <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-800 shadow-sm">
          <div className="font-mono text-[13px] whitespace-pre-wrap">{msg.text}</div>
        </div>
        <div className="text-[10px] text-slate-400 mt-1 ml-1">
          TOHOSHOU AI · {new Date(msg.ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="w-8 h-8 rounded-full bg-[#0f1629] border border-slate-700 flex items-center justify-center text-blue-400 text-sm mr-2 mt-0.5 shrink-0">
        ✦
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center h-5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: [
        "👋 你好！我是 TOHOSHOU AI 助手。",
        "",
        "我可以帮你：",
        "📊 推荐今日 AI 选股（TOP5 / TOP10）",
        "🔍 分析个股（输入4位股票代码，如「分析7203」）",
        "⚡ 板块分析（科技股、半导体、汽车等）",
        "🌐 市场概况（日经、NASDAQ、VIX、外资动向）",
        "",
        "所有数据 100% 来自真实数据库，不编造任何数字。",
      ].join("\n"),
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>("web_anon");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Stable per-browser session ID for context tracking (not auth)
  useEffect(() => {
    const key = "tohoshou_session_id";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = `web_${crypto.randomUUID()}`;
      sessionStorage.setItem(key, id);
    }
    setSessionId(id);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, userId: sessionId }),
      });
      const data = await res.json();
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: data.reply ?? "服务暂时不可用，请稍后再试。",
        intent: data.intent,
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          text: "❌ 请求失败，请检查网络后重试。",
          ts: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-136px)] md:h-screen">
      {/* LINE migration notice */}
      <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center gap-3 shrink-0">
        <span className="text-amber-500 text-base">📱</span>
        <span className="text-sm text-amber-800">{t("chat.movedToLine")}</span>
      </div>
      {/* Header — hidden on mobile since MobileHeader shows the page title */}
      <div className="hidden md:flex bg-white border-b border-slate-200 px-6 py-4 items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0f1629] flex items-center justify-center text-blue-400">
            ✦
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-sm leading-tight">{t("chat.title")}</h1>
            <p className="text-xs text-slate-500">GPT Phase 2 · 严格真实数据模式</p>
          </div>
          <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
            REAL DATA
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/ai-picks"
            className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg hover:border-slate-300 transition-colors"
          >
            AI推荐榜 →
          </Link>
          <button
            onClick={() =>
              setMessages([
                {
                  id: `welcome-${Date.now()}`,
                  role: "assistant",
                  text: "对话已清空。有什么我可以帮你？",
                  ts: Date.now(),
                },
              ])
            }
            className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:border-slate-300 transition-colors"
          >
            清空对话
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 md:px-6 py-4 md:py-5">
        <div className="max-w-3xl mx-auto">
          {messages.map((msg) => (
            <MsgBubble key={msg.id} msg={msg} />
          ))}
          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Quick prompts */}
      <div className="bg-white border-t border-slate-100 px-3 md:px-6 py-3 shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2 overflow-x-auto pb-1 mb-2 md:flex-wrap md:pb-0 md:mb-3 scrollbar-none">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.text}
                onClick={() => sendMessage(q.text)}
                disabled={loading}
                className="text-xs bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                placeholder={t("chat.placeholder")}
                rows={1}
                className="w-full resize-none border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:cursor-not-allowed transition-all"
                style={{ maxHeight: "120px", overflowY: "auto" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 120) + "px";
                }}
              />
            </div>
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors shrink-0 h-[46px] flex items-center gap-1.5"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>{t("chat.send")} ↑</>
              )}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 text-center">
            数据来源：J-Quants · Yahoo Finance · TDnet · Kabutan　严格真实数据模式，不生成任何虚构数字
          </p>
        </div>
      </div>
    </div>
  );
}
