"use client";

import { AgentNode, useAppStore } from "@/lib/store";

function NodeIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactElement> = {
    guardian: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    orchestrator: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="3" r="1.5" /><circle cx="12" cy="21" r="1.5" />
        <circle cx="3" cy="12" r="1.5" /><circle cx="21" cy="12" r="1.5" />
        <line x1="12" y1="6" x2="12" y2="9" /><line x1="12" y1="15" x2="12" y2="18" />
        <line x1="6" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="18" y2="12" />
      </svg>
    ),
    memory_retrieve: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
        <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
      </svg>
    ),
    compliance: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    factcheck: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
    ),
    tone: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    ),
    verdict: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
      </svg>
    ),
    fix: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    memory_save: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
    ),
  };
  return icons[name] ?? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

const RISK_STYLE: Record<string, { color: string; bg: string }> = {
  high:   { color: "var(--ember)", bg: "var(--ember-dim)" },
  medium: { color: "var(--amber)", bg: "var(--amber-dim)" },
  low:    { color: "var(--teal)",  bg: "var(--teal-dim)" },
};

function DataSummary({ node, data }: { node: string; data: Record<string, unknown> }) {
  if (node === "guardian")
    return <span style={{ color: data.is_safe ? "var(--green)" : "var(--ember)" }}>{data.is_safe ? "通过安全检测" : "已拦截"}</span>;
  if (node === "orchestrator")
    return <span style={{ color: "var(--teal)" }}>{String(data.content_type ?? "")}</span>;
  if (node === "memory_retrieve")
    return <span style={{ color: "var(--text-2)" }}>检索到 {String(data.memory_count ?? 0)} 条历史案例</span>;

  if (node === "compliance" || node === "factcheck" || node === "tone") {
    const risk = String(data.risk_level ?? "low");
    const s = RISK_STYLE[risk] ?? RISK_STYLE.low;
    const label =
      node === "compliance" ? `${data.violation_count ?? 0} 处违规` :
      node === "factcheck"  ? `${data.claim_count ?? 0} 条声明` :
                              `${data.exaggeration_count ?? 0} 处夸大`;
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: s.bg, color: s.color }}>{label}</span>
    );
  }

  if (node === "verdict") {
    const v = String(data.verdict ?? "");
    const map: Record<string, { color: string; bg: string }> = {
      "违规": { color: "var(--ember)", bg: "var(--ember-dim)" },
      "存疑": { color: "var(--amber)", bg: "var(--amber-dim)" },
      "合规": { color: "var(--green)", bg: "var(--green-dim)" },
    };
    const s = map[v] ?? map["存疑"];
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{ background: s.bg, color: s.color }}>{v}</span>
    );
  }

  if (node === "fix")
    return <span style={{ color: "var(--green)" }}>已生成合规版本（{(data.changes as string[])?.length ?? 0} 处修改）</span>;
  if (node === "memory_save")
    return <span style={{ color: "var(--text-2)" }}>{data.saved ? "已保存至记忆库" : "已跳过"}</span>;

  return null;
}

export default function AgentCard({ node }: { node: AgentNode }) {
  const { phase } = useAppStore();
  const label    = node.label || node.node;
  const isDone   = node.status === "done";
  const isWait   = node.status === "pending";
  const isActive = isWait && phase === "scanning";

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 transition-all duration-300"
      style={{
        background: isDone ? "rgba(15,139,141,0.05)" : isActive ? "rgba(15,139,141,0.03)" : "rgba(0,0,0,0.015)",
        border: isDone
          ? "1px solid var(--teal-border)"
          : isActive
          ? "1px solid rgba(15,139,141,0.35)"
          : "1px dashed var(--border)",
        borderRadius: "10px",
        opacity: isWait && !isActive ? 0.42 : 1,
        animation: isActive ? "pulse-ring 1.8s ease-in-out infinite" : "none",
      }}
    >
      {/* Icon */}
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
        style={{
          background: isDone || isActive ? "var(--teal-dim)" : "rgba(0,0,0,0.04)",
          border: `1px solid ${isDone || isActive ? "var(--teal-border)" : "var(--border)"}`,
          color: isDone || isActive ? "var(--teal)" : "var(--text-3)",
        }}
      >
        <NodeIcon name={node.node} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium truncate"
                style={{ color: isDone || isActive ? "var(--text)" : "var(--text-3)" }}>
            {label}
          </span>
          {isActive && (
            <span className="shrink-0 w-3 h-3 rounded-full border-2 animate-spin"
                  style={{ borderColor: "rgba(15,139,141,0.20)", borderTopColor: "var(--teal)" }} />
          )}
          {isDone && (
            <svg className="shrink-0" width="11" height="11" viewBox="0 0 24 24" fill="none"
                 stroke="var(--green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        {isDone && Object.keys(node.data).length > 0 && (
          <div className="text-xs mt-0.5">
            <DataSummary node={node.node} data={node.data} />
          </div>
        )}
      </div>
    </div>
  );
}
