"use client";

import { useAppStore, FixChange } from "@/lib/store";

const VERDICT_CONFIG: Record<string, { emoji: string; color: string; bg: string; border: string }> = {
  违规: { emoji: "🔴", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  存疑: { emoji: "⚠️", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
  合规: { emoji: "✅", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
};

export default function VerdictReport() {
  const { phase, verdict, fix, inputText } = useAppStore();

  if (phase !== "done" || !verdict) return null;

  const cfg = VERDICT_CONFIG[verdict.verdict] ?? VERDICT_CONFIG["存疑"];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">审核报告</h2>

      {/* Verdict badge */}
      <div className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
        <div className={`text-2xl font-bold ${cfg.color}`}>
          {cfg.emoji} {verdict.verdict}
        </div>
        <div className="mt-1 text-sm text-gray-600">风险等级：{verdict.overall_risk}</div>
        {verdict.summary && (
          <p className="mt-2 text-sm text-gray-700 leading-relaxed">{verdict.summary}</p>
        )}
      </div>

      {/* Text diff: original vs fixed */}
      {fix?.fixed_text && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">原文</div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{inputText}</p>
          </div>

          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="mb-2 text-xs font-semibold text-green-600 uppercase tracking-wide">合规版本</div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{fix.fixed_text}</p>
          </div>

          {fix.changes.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <div className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">修改说明</div>
              <ul className="flex flex-col gap-2">
                {fix.changes.map((c: FixChange, i: number) => (
                  <li key={i} className="text-sm text-gray-600 border-l-2 border-indigo-200 pl-3">
                    <div><span className="line-through text-red-400">{c.original}</span> → <span className="text-green-600">{c.fixed}</span></div>
                    <div className="text-xs text-gray-400 mt-0.5">{c.reason}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
