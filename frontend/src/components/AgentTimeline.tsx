"use client";

import { useAppStore } from "@/lib/store";
import AgentCard from "./AgentCard";

const PARALLEL_NODES = new Set(["compliance", "factcheck", "tone"]);

export default function AgentTimeline() {
  const { nodes, phase, blockedReason } = useAppStore();

  if (phase === "idle") return null;

  const before   = nodes.filter((n) => ["guardian", "orchestrator", "memory_retrieve"].includes(n.node));
  const parallel = nodes.filter((n) => PARALLEL_NODES.has(n.node));
  const after    = nodes.filter((n) => ["verdict", "fix", "memory_save"].includes(n.node));

  return (
    <div className="flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
          Agent 执行流程
        </span>
        {phase === "scanning" && (
          <span
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ background: "var(--teal-dim)", border: "1px solid var(--teal-border)", color: "var(--teal)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ background: "var(--teal)" }} />
            运行中
          </span>
        )}
        {(phase === "done" || phase === "blocked") && (
          <span
            className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{
              background: phase === "done" ? "var(--teal-dim)" : "var(--ember-dim)",
              border: `1px solid ${phase === "done" ? "var(--teal-border)" : "var(--ember-border)"}`,
              color: phase === "done" ? "var(--teal)" : "var(--ember)",
            }}
          >
            {phase === "done" ? "完成" : "已拦截"}
          </span>
        )}
      </div>

      {before.map((n) => <AgentCard key={n.node} node={n} />)}

      {parallel.length > 0 && (
        <>
          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1" style={{ background: "var(--border)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>并行检测</span>
            <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {parallel.map((n) => <AgentCard key={n.node} node={n} />)}
          </div>
          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1" style={{ background: "var(--border)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>汇总</span>
            <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          </div>
        </>
      )}

      {after.map((n) => <AgentCard key={n.node} node={n} />)}

      {phase === "blocked" && (
        <div
          className="rounded-xl p-3.5 mt-1"
          style={{ background: "var(--ember-dim)", border: "1px solid var(--ember-border)", color: "var(--ember)" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            <span className="text-xs font-semibold">已拦截</span>
          </div>
          <p className="text-xs leading-relaxed opacity-80">{blockedReason}</p>
        </div>
      )}
    </div>
  );
}
