"use client";

import { useI18n } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

const OPTIONS: { value: Lang; short: string; full: string }[] = [
  { value: "zh-CN", short: "中", full: "中文" },
  { value: "ja-JP", short: "日", full: "日本語" },
  { value: "en-US", short: "EN", full: "英文" },
];

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();

  return (
    <div className="flex items-center gap-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setLang(opt.value)}
          title={opt.full}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            lang === opt.value
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
          }`}
        >
          {compact ? opt.short : opt.full}
        </button>
      ))}
    </div>
  );
}
