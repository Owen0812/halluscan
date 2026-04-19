"use client";

import { useAppStore, FixChange } from "@/lib/store";

const VERDICT_CONFIG: Record<string, {
  color: string; bg: string; border: string; label: string; icon: React.ReactElement;
}> = {
  违规: {
    color: "var(--ember)", bg: "var(--ember-dim)", border: "var(--ember-border)", label: "违规",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
  },
  存疑: {
    color: "var(--amber)", bg: "var(--amber-dim)", border: "var(--amber-border)", label: "存疑",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  },
  合规: {
    color: "var(--green)", bg: "var(--green-dim)", border: "var(--green-border)", label: "合规",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  },
};

const RISK_LABEL: Record<string, string> = { high: "高风险", medium: "中风险", low: "低风险" };
const RISK_COLOR: Record<string, string> = { high: "var(--ember)", medium: "var(--amber)", low: "var(--green)" };

export default function VerdictReport() {
  const { phase, verdict, fix, inputText } = useAppStore();
  if (phase !== "done" || !verdict) return null;

  const cfg = VERDICT_CONFIG[verdict.verdict] ?? VERDICT_CONFIG["存疑"];

  return (
    <div className="flex flex-col gap-4 animate-fadeIn">
      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
          审核报告
        </span>
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
      </div>

      {/* Verdict banner */}
      <div
        className="rounded-2xl p-5"
        style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.60)", border: `1px solid ${cfg.border}`, color: cfg.color }}
            >
              {cfg.icon}
            </div>
            <div>
              <div className="text-xl font-bold" style={{ color: cfg.color }}>{cfg.label}</div>
              {verdict.summary && (
                <p className="text-xs mt-0.5 leading-relaxed max-w-xs" style={{ color: "var(--text-2)" }}>
                  {verdict.summary}
                </p>
              )}
            </div>
          </div>
          <span
            className="shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold"
            style={{
              background: "rgba(255,255,255,0.55)",
              color: RISK_COLOR[verdict.overall_risk] ?? "var(--text-2)",
              border: `1px solid ${cfg.border}`,
            }}
          >
            {RISK_LABEL[verdict.overall_risk] ?? verdict.overall_risk}
          </span>
        </div>
      </div>

      {/* Diff */}
      {fix?.fixed_text && (
        <div className="flex flex-col gap-3">
          <div className="card p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>原文</div>
            <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-2)" }}>{inputText}</p>
          </div>

          <div className="rounded-xl p-4" style={{ background: "var(--green-dim)", border: "1px solid var(--green-border)" }}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--green)" }}>合规版本</div>
            <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>{fix.fixed_text}</p>
          </div>

          {fix.changes.length > 0 && (
            <div className="card p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>修改说明</div>
              <ul className="flex flex-col gap-3">
                {fix.changes.map((c: FixChange, i: number) => (
                  <li key={i} className="text-xs pl-3" style={{ borderLeft: "2px solid var(--teal-border)" }}>
                    <div className="flex flex-wrap items-baseline gap-1 mb-0.5">
                      <span className="line-through" style={{ color: "var(--ember)" }}>{c.original}</span>
                      <span style={{ color: "var(--text-3)" }}>→</span>
                      <span className="font-medium" style={{ color: "var(--green)" }}>{c.fixed}</span>
                    </div>
                    <div style={{ color: "var(--text-2)" }}>{c.reason}</div>
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
